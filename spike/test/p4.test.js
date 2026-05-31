// Parity port of lcd1-solver/tests/test_p4.py for solve_2nd_order.
// Oracle facit values copied from lcd1-solver/tests/oracle_data.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { solve2ndOrder } from "../solvers/p4.js";

// REEXAM_F21_Q10 = dict(zeta=sqrt(2)/2, facit_Mp_pct=4.32)
test("zeta -> Mp percent (REExam F21 Q10)", () => {
  const out = solve2ndOrder({ zeta: Math.SQRT2 / 2 });
  approxRel(out.Mp_pct, 4.32, 1e-2, "Mp_pct");
});

// S20_Q5 = dict(y_peak=2.9, y_ss=2.0, facit_zeta_approx=0.2)
test("Mp -> zeta (S20 Q5)", () => {
  const Mp = (2.9 - 2.0) / 2.0;
  const out = solve2ndOrder({ Mp });
  approxAbs(out.zeta, 0.2, 0.05, "zeta");
});

// test_t_p_with_omega_n: zeta=0.5, omega_n=10
test("t_p and t_s_2pct from zeta + omega_n", () => {
  const out = solve2ndOrder({ zeta: 0.5, omega_n: 10.0 });
  approxRel(out.t_p, Math.PI / (10.0 * Math.sqrt(1 - 0.25)), 1e-6, "t_p");
  approxRel(out.t_s_2pct, 4.0 / (0.5 * 10.0), 1e-6, "t_s_2pct");
});

// test_inconsistent_inputs_raise: Mp=0.5 implies zeta ~= 0.215, not 0.7
test("inconsistent Mp + zeta raises", () => {
  assert.throws(() => solve2ndOrder({ Mp: 0.5, zeta: 0.7 }));
});
