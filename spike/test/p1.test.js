// Parity port of lcd1-solver/tests/test_p1.py (ODE + state-space; block-reduce
// is dropped — BDR's graphical reducer supersedes it). Oracle: oracle_data.py.
import { test } from "node:test";
import { approxAbs, approxRel } from "../lib/assert.js";
import { solveOdeToTf, solveStateSpaceToTf } from "../solvers/p1.js";

function polesClose(G, expected, atol = 1e-3) {
  const key = (p) => [Math.round(p.re * 1e6) / 1e6, Math.round(p.im * 1e6) / 1e6];
  const a = G.poles().sort((x, y) => key(x)[0] - key(y)[0] || key(x)[1] - key(y)[1]);
  const e = [...expected].sort((x, y) => x.re - y.re || x.im - y.im);
  if (a.length !== e.length) throw new Error(`pole count ${a.length} != ${e.length}`);
  a.forEach((p, i) => {
    approxAbs(p.re, e[i].re, atol, `pole${i}.re`);
    approxAbs(p.im, e[i].im, atol, `pole${i}.im`);
  });
}

// F22_Q8: 5y'' + y' + 0.5y = 3u -> poles -0.1 ± 0.3j
test("F22 Q8 ODE to poles", () => {
  const G = solveOdeToTf([5, 1, 0.5], [3]);
  polesClose(G, [{ re: -0.1, im: 0.3 }, { re: -0.1, im: -0.3 }]);
});

// S21_Q8: y'' + 2y' + y = u -> double pole -1
test("S21 Q8 ODE to poles", () => {
  const G = solveOdeToTf([1, 2, 1], [1]);
  polesClose(G, [{ re: -1, im: 0 }, { re: -1, im: 0 }]);
});

// THEORY_Q4: y(4)+9y(3)+20y'' = 71u -> poles 0,0,-4,-5
test("Theory Q4 ODE to poles", () => {
  const G = solveOdeToTf([1, 9, 20, 0, 0], [71]);
  polesClose(G, [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: -4, im: 0 }, { re: -5, im: 0 }]);
});

// REEXAM_F21_Q6: A=diag(-1,-1), B=[1;9], C=[1,1], D=0 -> G=10/(s+1)
test("REExam F21 Q6 state-space to TF", () => {
  const G = solveStateSpaceToTf([[-1, 0], [0, -1]], [[1], [9]], [[1, 1]], [[0]]);
  approxRel(G.dcGain(), 10.0, 1e-6, "dc gain");
  G.poles().forEach((p) => approxAbs(p.re, -1.0, 1e-9, "pole.re"));
});
