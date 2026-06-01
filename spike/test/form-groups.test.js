import { test } from "node:test";
import assert from "node:assert/strict";
import { formsInGroup, formByFn } from "../../lcd-forms.js";

test("design group is the G-reusing goals (incl. the G(jω) evaluator)", () => {
  const fns = formsInGroup("design").map((f) => f.fn).sort();
  assert.deepEqual(fns, ["evaluate_gjw", "solve_K_for_spec", "solve_P_for_PM", "solve_pi_lead", "solve_stable_K_range"]);
});

test("source group is the four TF producers", () => {
  const fns = formsInGroup("source").map((f) => f.fn).sort();
  assert.deepEqual(fns, ["bode_readoff", "compose_tf_from_bode", "solve_ode_to_tf", "solve_state_space_to_tf"]);
});

test("calc group includes the non-G calculators", () => {
  const fns = formsInGroup("calc").map((f) => f.fn);
  for (const fn of ["solve_2nd_order", "solve_KP_from_ess", "solve_nested_ess", "linearize_tf"]) {
    assert.ok(fns.includes(fn), `calc should include ${fn}`);
  }
});

test("board-handled analysis forms stay untagged", () => {
  for (const fn of ["solve_margins", "characterize", "symbolic_equiv"]) {
    assert.equal(formByFn(fn).group, undefined, `${fn} must not be grouped`);
  }
});
