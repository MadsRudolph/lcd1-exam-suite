// P5 — Steady-state error. JS port of lcd1-solver/lcd_solver/solvers/p5_ess.py.
import { polyTrim, trailingZeros } from "../numeric/poly.js";

/** Step input on type-0 plant: ess = 1/(1 + K_P G(0)) -> K_P = (1/ess - 1)/G(0). */
export function solveKPFromEss(G0, G0_unit, ess_target) {
  let G0_lin;
  if (G0_unit === "dB") G0_lin = 10 ** (G0 / 20);
  else if (G0_unit === "linear") G0_lin = G0;
  else throw new Error(`G0_unit must be 'linear' or 'dB', got '${G0_unit}'`);
  if (G0_lin === 0) {
    throw new Error("G(0) = 0 — cannot achieve any non-trivial ess with finite K_P");
  }
  return (1 / ess_target - 1) / G0_lin;
}

/**
 * System type + ess for step/ramp/parabola under unity feedback.
 * The error constants are limits at s->0:
 *   K_p = lim G,  K_v = lim s*G,  K_a = lim s^2*G.
 * After cancelling common origin factors, the denominator carries exactly `type`
 * trailing-zero coefficients (poles at the origin); the constants read straight
 * off the reduced coefficients without forming s^k*G (which would be 0/0).
 */
export function solveEssTable(tf) {
  let num = polyTrim(tf.num.slice());
  let den = polyTrim(tf.den.slice());

  // Cancel common s^min factors shared by numerator and denominator.
  const common = Math.min(trailingZeros(num), trailingZeros(den));
  if (common > 0) {
    num = num.slice(0, num.length - common);
    den = den.slice(0, den.length - common);
  }

  const type = trailingZeros(den); // poles at the origin
  const numAt = (poly, k) => poly[poly.length - 1 - k]; // coeff of s^k

  const n0 = num[num.length - 1];
  let K_p, K_v, K_a;
  K_p = type === 0 ? n0 / den[den.length - 1] : Infinity;
  K_v = type === 1 ? n0 / numAt(den, 1) : type > 1 ? Infinity : 0.0;
  K_a = type === 2 ? n0 / numAt(den, 2) : type > 2 ? Infinity : 0.0;

  const ess_step = type >= 1 ? 0.0 : 1 / (1 + K_p);
  const ess_ramp = type >= 2 ? 0.0 : type === 1 ? 1 / K_v : Infinity;
  const ess_parabola = type >= 3 ? 0.0 : type === 2 ? 1 / K_a : Infinity;

  return {
    type,
    K_p,
    K_v,
    K_a,
    ess_step,
    ess_ramp,
    ess_parabola,
  };
}
