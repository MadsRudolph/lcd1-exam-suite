// Parity for P4 solve_K_for_spec (the symbolic-K case, done numerically).
// Oracle: S21_Q9 = dict(G_str="K / (s*(s+5))", spec="Mp <= 0.12", facit_K_max=19.97).
import { test } from "node:test";
import { approxRel } from "../lib/assert.js";
import { solveKForSpec } from "../solvers/p4.js";

test("S21 Q9 K for overshoot spec", () => {
  const K = solveKForSpec("K / (s*(s+5))", "Mp <= 0.12");
  approxRel(K, 19.97, 5e-3, "K_max");
});

test("zeta spec boundary", () => {
  // K/(s(s+5)) -> zeta = 5/(2 sqrt(K)); zeta>=0.5 -> K <= 25
  const K = solveKForSpec("K / (s*(s+5))", "zeta >= 0.5");
  approxRel(K, 25.0, 1e-3, "K");
});
