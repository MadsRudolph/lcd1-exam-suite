// Parity port of lcd1-solver/tests/test_p7.py.
// Oracle facit: THEORY_Q8, THEORY_Q9, THEORY_Q6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel } from "../lib/assert.js";
import { pickFeedforwardForm, solveNestedEss } from "../solvers/p7.js";

test("Theory Q8 picks option d", () => {
  const out = pickFeedforwardForm({ n_lags: 3, D_order: 2 });
  assert.equal(out.option_label, "d");
  assert.ok(out.tau_f_bound.includes("min"));
  assert.ok(out.tau_f_bound.includes("tau_f"));
  assert.equal(out.filter_order, 3 - 2);
});

test("Theory Q9 nested two_KP_same", () => {
  const KP = solveNestedEss({ architecture: "two_KP_same", G0: 0.75, ess_target: 0.25 });
  approxRel(KP, 4.0, 1e-3, "KP");
});

test("Theory Q6 nested_K1_K2", () => {
  const K2 = solveNestedEss({ architecture: "nested_K1_K2", eps1: 0.4, eps2: 0.05, G2_0: 0.4 });
  approxRel(K2, 79.17, 1e-3, "K2");
});
