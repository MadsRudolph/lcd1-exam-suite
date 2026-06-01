// Evaluate the open-loop transfer function at a single frequency, and the
// inverse (find the frequency for a target magnitude or phase). This is the
// mandatory hand-calculation step in every Bode / controller-design question:
// reading |G(jω)| and ∠G(jω) at ω_c to find K_P, locating crossovers, etc.
import { Complex } from "../numeric/complex.js";
import { logspace, Gjw, bisect } from "../numeric/margins.js";

/** |G(jω)| (linear & dB), ∠G(jω) in degrees, and the rectangular value. */
export function evalFreqPoint(tf, omega) {
  const v = Gjw(tf, omega);
  const mag = v.abs();
  return {
    omega,
    mag,
    mag_dB: 20 * Math.log10(mag),
    phase_deg: (v.arg() * 180) / Math.PI,
    re: v.re,
    im: v.im,
  };
}

// Lowest ω (scanning low→high) where a scalar readout crosses its target.
function firstCrossing(f, omegas, ignoreJump = Infinity) {
  let prev = f(omegas[0]);
  for (let i = 1; i < omegas.length; i++) {
    const cur = f(omegas[i]);
    if (Math.abs(cur - prev) < ignoreJump && ((prev <= 0 && cur >= 0) || (prev >= 0 && cur <= 0))) {
      return bisect(f, omegas[i - 1], omegas[i]);
    }
    prev = cur;
  }
  return NaN;
}

/** Smallest ω where |G(jω)| equals a target in dB (e.g. 0 dB = gain crossover). */
export function findOmegaForMagDb(tf, dbTarget, omegas = logspace(-3, 5, 6000)) {
  return firstCrossing((w) => 20 * Math.log10(Gjw(tf, w).abs()) - dbTarget, omegas);
}

/** Smallest ω where the (principal-value) phase ∠G(jω) crosses a target in degrees. */
export function findOmegaForPhaseDeg(tf, phaseTarget, omegas = logspace(-3, 5, 6000)) {
  // Ignore the ±360° jumps atan2 produces so a wrap isn't read as a crossing.
  return firstCrossing((w) => (Gjw(tf, w).arg() * 180) / Math.PI - phaseTarget, omegas, 180);
}

export { Complex };
