// P3 — Stability: stable-K range and Bode margins.
// JS port of lcd1-solver/lcd_solver/solvers/p3_stability.py.
import { negRealCrossings, solveMargins } from "../numeric/margins.js";

/**
 * (K_low, K_high) such that 1 + K*G is stable for K in (K_low, K_high).
 * Stable plant -> (0, GM). Unstable plant -> (1/|x_nearest_origin|, inf).
 */
export function solveStableKRange(tf) {
  if (tf.hasRhpPole()) {
    const crossings = negRealCrossings(tf);
    if (!crossings.length) {
      throw new Error(
        "Could not find Nyquist negative-real-axis crossing for unstable plant",
      );
    }
    const x = crossings[0]; // smallest |x|
    return { low: 1.0 / Math.abs(x), high: Infinity };
  }
  const { GM } = solveMargins(tf);
  return { low: 0.0, high: GM };
}

export { solveMargins };
