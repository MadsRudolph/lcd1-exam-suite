// Parity port of lcd1-solver/tests/test_p3.py.
// Oracle facit from oracle_data.py: S21_Q4, REEXAM_F21_Q14, F22_Q11.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { NumericTF } from "../numeric/tf.js";
import { solveStableKRange, solveMargins } from "../solvers/p3.js";

// S21_Q4 = dict(G="1/(s+1)**3", facit_low=0.0, facit_high=8.0)
test("S21 Q4 stable plant -> (0, 8)", () => {
  const G = new NumericTF([1], [1, 3, 3, 1]);
  const { low, high } = solveStableKRange(G);
  approxAbs(low, 0.0, 1e-9, "low");
  approxRel(high, 8.0, 1e-3, "high");
});

// REEXAM_F21_Q14 = dict(G="25/(s**3+s**2+10*s)", facit_low=0.0, facit_high=0.398)
test("REExam Q14 stable plant low GM -> (0, 0.398)", () => {
  const G = new NumericTF([25], [1, 1, 10, 0]);
  const { low, high } = solveStableKRange(G);
  assert.equal(low, 0.0);
  approxRel(high, 0.398, 1e-2, "high");
});

// (s+10)/((s-1)(s+5)) — RHP pole at +1 → K_high = inf, K_low > 0
test("unstable plant inverts range", () => {
  const G = new NumericTF([1, 10], [1, 4, -5]);
  const { low, high } = solveStableKRange(G);
  assert.ok(!Number.isFinite(high), "unstable plant must yield K_high = inf");
  assert.ok(low > 0, `K_min must be positive, got ${low}`);
});

test("solve_margins returns full dict; 1/(s+1)^3 has GM 8", () => {
  const G = new NumericTF([1], [1, 3, 3, 1]);
  const m = solveMargins(G);
  assert.deepEqual(
    Object.keys(m).sort(),
    ["GM", "GM_dB", "PM_deg", "omega_gc", "omega_pc"],
  );
  approxRel(m.GM, 8.0, 1e-3, "GM");
  approxRel(m.GM_dB, 20 * Math.log10(8.0), 1e-3, "GM_dB");
});
