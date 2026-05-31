// solve_closed_loop_2nd_order: parametric closed-loop TF in (s,K) + 1 metric -> K + table.
import { test } from "node:test";
import { approxRel, approxAbs } from "../lib/assert.js";
import { solveClosedLoop2ndOrder } from "../solvers/p4.js";

// K/(s^2+2s+K), K=4 -> wn=2, zeta=0.5
test("given K directly", () => {
  const out = solveClosedLoop2ndOrder("K / (s**2 + 2*s + K)", "K", 4);
  approxRel(out.K, 4, 1e-9, "K");
  approxRel(out.omega_n, 2, 1e-6, "omega_n");
  approxRel(out.zeta, 0.5, 1e-6, "zeta");
});

// same loop, give zeta=0.5 -> K should come back as 4
test("solve K from zeta", () => {
  const out = solveClosedLoop2ndOrder("K / (s**2 + 2*s + K)", "zeta", 0.5);
  approxRel(out.K, 4, 1e-4, "K");
});

// give Mp ~ 0.163 (the Mp at zeta=0.5) -> K ~ 4
test("solve K from Mp", () => {
  const out = solveClosedLoop2ndOrder("K / (s**2 + 2*s + K)", "Mp", 0.163);
  approxAbs(out.K, 4, 0.1, "K");
});
