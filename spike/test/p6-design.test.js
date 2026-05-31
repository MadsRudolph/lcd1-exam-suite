// Parity for the P6 full-design and lag-beta modes (lcd1-solver form_builder
// _solve_pi_lead_design / _solve_lag_beta; oracle = test_smart_paste.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxAbs, approxRel } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";
import { solvePiLeadDesign, solveLagBeta } from "../solvers/p6.js";

// Q18 full design: phi_G from G(j*omega_c) -> alpha ~= 0.08, KP ~= 200, tau_i ~= 0.8
test("full PI-Lead design (Q18)", () => {
  const G = parseTf("(0.7*s + 0.35)/((0.01*s + 1)*(5*s + 1)*(s**2 + 0.2*s + 0.6))");
  const out = solvePiLeadDesign({ G, omega_c: 10, gamma_M_deg: 45, N_i: 8 });
  approxAbs(out.alpha, 0.08, 0.01, "alpha");
  approxRel(out.K_P, 200, 0.05, "K_P");
  approxAbs(out.tau_i, 0.8, 0.01, "tau_i");
});

// S21Q17: phi_G=-142.891, alpha=0.2, Ni=3, gamma_M=70 -> beta ~= 2
test("lag-beta from phase budget (S21Q17)", () => {
  const out = solveLagBeta({ gamma_M_deg: 70, phi_G_deg: -142.891, alpha: 0.2, N_i: 3 });
  approxAbs(out.beta, 2.0, 0.02, "beta");
});

test("lag-beta requires phi_G", () => {
  assert.throws(() => solveLagBeta({ gamma_M_deg: 70, alpha: 0.2, N_i: 3 }), /phi_G/);
});
