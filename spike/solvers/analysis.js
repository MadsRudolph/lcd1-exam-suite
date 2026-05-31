// General transfer-function analysis used across the exam gap-fixes and the
// Block Diagram -> LCD1 bridge: closed-loop bandwidth, dominant-pole settling,
// Nyquist/closed-loop stability, and characterizeTf (poles + 2nd-order specs).
import { Gjw, logspace, bisect } from "../numeric/margins.js";
import { polyAdd, polyTrim } from "../numeric/poly.js";
import { roots } from "../numeric/roots.js";
import { solve2ndOrder } from "./p4.js";

const TOL = 1e-9;

/** Closed-loop bandwidth: smallest ω where |G(jω)| drops to |G(0)|/√2 (−3 dB). */
export function bandwidth(tf) {
  const dc = Math.abs(tf.dcGain());
  if (!Number.isFinite(dc) || dc === 0) {
    throw new Error("bandwidth needs a finite, non-zero DC gain (use a closed-loop TF)");
  }
  const level = dc / Math.SQRT2;
  const mag = (w) => Gjw(tf, w).abs();
  const grid = logspace(-4, 6, 4000);
  let prev = mag(grid[0]) - level;
  for (let i = 1; i < grid.length; i++) {
    const cur = mag(grid[i]) - level;
    if (prev >= 0 && cur < 0) {
      return bisect((w) => mag(w) - level, grid[i - 1], grid[i]);
    }
    prev = cur;
  }
  throw new Error("no −3 dB crossing found");
}

/** Dominant-pole settling time of a stable TF. */
export function dominantSettling(tf) {
  const poles = tf.poles();
  if (poles.some((p) => p.re > TOL)) {
    throw new Error("system is unstable (RHP pole) — no settling time");
  }
  // Dominant pole = closest to the imaginary axis (largest real part).
  const dominant = poles.reduce((a, b) => (b.re > a.re ? b : a));
  const sigma = Math.abs(dominant.re);
  if (sigma < TOL) throw new Error("marginally stable (pole on imaginary axis)");
  return {
    dominant_pole: dominant,
    sigma,
    t_s_2pct: 4 / sigma,
    t_s_5pct: 3 / sigma,
  };
}

/** Closed-loop stability of 1 + K·G via exact RHP-root counting of the char. poly. */
export function analyzeStability(tf, K = 1) {
  const P = tf.poles().filter((p) => p.re > TOL).length; // open-loop RHP poles
  const char = polyAdd(tf.den, tf.num.map((c) => c * K)); // den + K·num
  const Z = roots(char).filter((p) => p.re > TOL).length; // closed-loop RHP poles
  return {
    K,
    openLoopRhpPoles: P,
    closedLoopRhpPoles: Z,
    stable: Z === 0,
    encirclements: P - Z, // net CCW encirclements of −1 the Nyquist plot must make
  };
}

/** Characterize a numeric TF: poles/zeros/DC gain, plus 2nd-order specs if applicable. */
// Initial value of the step response, y(0⁺) = lim_{s→∞} G(s) (initial-value
// theorem applied to Y = G/s). 0 when strictly proper, the leading-coefficient
// ratio when bi-proper, ∞ when improper.
export function initialValue(tf) {
  const num = polyTrim(tf.num.slice());
  const den = polyTrim(tf.den.slice());
  const nd = num.length - 1, dd = den.length - 1;
  if (nd < dd) return 0;
  if (nd > dd) return Infinity;
  return num[0] / den[0];
}

export function characterizeTf(tf) {
  const poles = tf.poles();
  const zeros = tf.zeros();
  const integrator = poles.some((p) => p.abs() < TOL);
  const dc_gain = integrator ? NaN : tf.dcGain();
  const initial_value = initialValue(tf);
  const den = polyTrim(tf.den.slice());

  if (den.length === 3) {
    const [a2, a1, a0] = den;
    const omega_n = Math.sqrt(a0 / a2);
    const zeta = a1 / a2 / (2 * omega_n);
    const metrics = zeta > 0 && zeta < 1 ? solve2ndOrder({ zeta, omega_n }) : null;
    return { is_second_order: true, zeta, omega_n, poles, zeros, dc_gain, initial_value, metrics };
  }
  return { is_second_order: false, poles, zeros, dc_gain, initial_value };
}
