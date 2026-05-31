// P6 — Controller design: PI-Lead three-way solver, P-for-PM.
// JS port of lcd1-solver/lcd_solver/solvers/p6_control.py.
import { Complex } from "../numeric/complex.js";
import { logspace, Gjw } from "../numeric/margins.js";

const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

const phiPI = (N_i) => -deg(Math.atan(1 / N_i)); // PI phase lag at crossover (deg)
const phiLead = (alpha) => deg(Math.asin((1 - alpha) / (1 + alpha))); // lead phase max (deg)

/** Unwrapped plant phase in degrees over a frequency grid (numpy.unwrap on radians). */
function plantPhaseDeg(tf, omegas) {
  const phases = new Array(omegas.length);
  let prev = 0;
  let offset = 0;
  for (let i = 0; i < omegas.length; i++) {
    let ang = Gjw(tf, omegas[i]).arg(); // radians in (-pi, pi]
    if (i > 0) {
      let d = ang + offset - prev;
      while (d > Math.PI) {
        offset -= 2 * Math.PI;
        d = ang + offset - prev;
      }
      while (d < -Math.PI) {
        offset += 2 * Math.PI;
        d = ang + offset - prev;
      }
    }
    const unwrapped = ang + offset;
    phases[i] = deg(unwrapped);
    prev = unwrapped;
  }
  return phases;
}

/** numpy.interp: linear interpolation with endpoint clamping; xp must be ascending. */
function interp(x, xp, yp) {
  if (x <= xp[0]) return yp[0];
  if (x >= xp[xp.length - 1]) return yp[yp.length - 1];
  // Binary search for the bracketing interval.
  let lo = 0;
  let hi = xp.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xp[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xp[lo]) / (xp[hi] - xp[lo]);
  return yp[lo] + t * (yp[hi] - yp[lo]);
}

/** Find omega where plant phase (deg) equals target, via sort-by-phase + interp. */
function omegaAtPhase(tf, target, omegas) {
  const phases = plantPhaseDeg(tf, omegas);
  const idx = phases.map((_, i) => i).sort((a, b) => phases[a] - phases[b]);
  const xp = idx.map((i) => phases[i]);
  const yp = idx.map((i) => omegas[i]);
  return interp(target, xp, yp);
}

/**
 * Three modes via the phase-budget equation:
 *   -180 + gamma_M = phi_G + phi_Lead + phi_PI
 */
export function solvePiLead({
  unknown,
  omega_c = null,
  gamma_M_deg = null,
  phi_G_deg = null,
  N_i = null,
  alpha = null,
  G = null,
} = {}) {
  if (unknown === "alpha") {
    const phi_pi = phiPI(N_i);
    const phi_lead_required = -180 + gamma_M_deg - phi_G_deg - phi_pi;
    const s = Math.sin(rad(phi_lead_required));
    return (1 - s) / (1 + s);
  }

  if (unknown === "Ni") {
    const phi_lead = phiLead(alpha);
    const atan_deg = 180 - gamma_M_deg + phi_G_deg + phi_lead;
    return 1.0 / Math.tan(rad(atan_deg));
  }

  if (unknown === "KP") {
    if (!G) throw new Error("KP mode requires plant G");
    const phi_pi = phiPI(N_i);
    const phi_lead = phiLead(alpha);
    const phi_G_required = -180 + gamma_M_deg - phi_lead - phi_pi;
    const omegas = logspace(-2, 4, 200_000);
    const wc = omegaAtPhase(G, phi_G_required, omegas);

    const tau_i = N_i / wc;
    const tau_d = 1.0 / (wc * Math.sqrt(alpha));
    const jw = new Complex(0, wc);
    // C_PI(s) = (tau_i*s + 1)/(tau_i*s)
    const C_PI = jw
      .scale(tau_i)
      .add(new Complex(1, 0))
      .div(jw.scale(tau_i));
    // C_d(s) = (tau_d*s + 1)/(alpha*tau_d*s + 1)
    const C_d = jw
      .scale(tau_d)
      .add(new Complex(1, 0))
      .div(jw.scale(alpha * tau_d).add(new Complex(1, 0)));
    const L = Gjw(G, wc).mul(C_PI).mul(C_d);
    return 1.0 / L.abs();
  }

  throw new Error(`unknown must be 'alpha', 'Ni', or 'KP', got ${unknown}`);
}

/** P-controller achieving a target phase margin: K_P = 1/|G(jw_c)| at phase = -180+PM. */
export function solvePForPM(tf, target_PM_deg) {
  const omegas = logspace(-3, 4, 500_000);
  const target_phase = -180 + target_PM_deg;
  const omega_c = omegaAtPhase(tf, target_phase, omegas);
  const K_P = 1.0 / Gjw(tf, omega_c).abs();
  return { K_P, omega_c };
}

export { plantPhaseDeg, interp };
