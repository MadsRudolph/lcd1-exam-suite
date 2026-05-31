// Parity port of lcd1-solver/tests/test_p5.py.
// Oracle facit: F22_Q16, REEXAM_F21_Q4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";
import { solveKPFromEss, solveEssTable } from "../solvers/p5.js";

// F22_Q16: G0=-7.9588 dB (=0.4 linear), ess_target=5/9 -> KP=2
test("F22 Q16 KP from ess (dB)", () => {
  const KP = solveKPFromEss(-7.9588, "dB", 5.0 / 9.0);
  approxRel(KP, 2.0, 1e-3, "KP");
});

test("linear input passes through", () => {
  const KP = solveKPFromEss(0.4, "linear", 5.0 / 9.0);
  approxRel(KP, 2.0, 1e-3, "KP");
});

test("invalid unit raises", () => {
  assert.throws(() => solveKPFromEss(0.4, "bogus", 0.5));
});

// REEXAM_F21_Q4: 5*(s+4)/(s^2*(s+1)*(s+20)) -> type 2, ess_para = 1.0
test("REExam F21 Q4 type-2 ess table", () => {
  const G = parseTf("5*(s+4) / (s**2 * (s+1) * (s+20))");
  const t = solveEssTable(G);
  assert.equal(t.type, 2);
  approxAbs(t.ess_step, 0.0, 1e-9, "ess_step");
  approxAbs(t.ess_ramp, 0.0, 1e-9, "ess_ramp");
  approxRel(t.ess_parabola, 1.0, 1e-3, "ess_parabola");
});
