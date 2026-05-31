// Parity port of lcd1-solver/tests/test_p2.py (figure output omitted).
// Oracle facit: F22_Q5, REEXAM_F21_Q5.
import { test } from "node:test";
import { approxAbs, approxRel } from "../lib/assert.js";
import { composeTfFromBode } from "../solvers/p2.js";

const sortedReal = (xs) => xs.map((x) => x.re ?? x).sort((a, b) => a - b);

function checkClose(actual, expected, msg) {
  const a = sortedReal(actual);
  const e = [...expected].sort((x, y) => x - y);
  if (a.length !== e.length) throw new Error(`${msg}: length ${a.length} != ${e.length}`);
  a.forEach((v, i) => approxAbs(v, e[i], 1e-6, `${msg}[${i}]`));
}

// F22_Q5: G(s) = (s-2)/(1+s)^2 -> RHP zero +2, double LHP pole -1, |G(0)|=2
test("F22 Q5 Bode composition", () => {
  const G = composeTfFromBode({
    dc_gain_dB: 20 * Math.log10(2),
    corners: [[1, -20], [1, -20], [2, +20]],
    phase_events: [[1, -90], [1, -90], [2, -90]],
  });
  checkClose(G.poles, [-1, -1], "poles");
  checkClose(G.zeros, [2], "zeros");
  approxRel(Math.abs(G.dc_gain_linear), 2.0, 1e-3, "dc_gain");
});

// REEXAM_F21_Q5: G(s)=100*(s+10)/(s-1) -> LHP zero -10, RHP pole +1, |G(0)|=1000
test("REExam F21 Q5 Bode composition", () => {
  const G = composeTfFromBode({
    dc_gain_dB: 60,
    corners: [[1, -20], [10, +20]],
    phase_events: [[1, +90], [10, +90]],
  });
  checkClose(G.poles, [1], "poles");
  checkClose(G.zeros, [-10], "zeros");
  approxRel(Math.abs(G.dc_gain_linear), 1000.0, 1e-3, "dc_gain");
});
