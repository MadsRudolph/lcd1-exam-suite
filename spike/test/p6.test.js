// Parity port of lcd1-solver/tests/test_p6.py.
// Oracle facit from oracle_data.py: F22_Q17, REEXAM_F21_Q17, REEXAM_F21_Q15,
// F22_Q19, S21_Q6, S20_Q9.
import { test } from "node:test";
import { approxRel } from "../lib/assert.js";
import { NumericTF } from "../numeric/tf.js";
import { solvePiLead, solvePForPM } from "../solvers/p6.js";

// F22_Q17 alpha mode: facit 0.5 (rel 2e-2; exact phase-budget ~0.5073)
test("F22 Q17 alpha mode", () => {
  const a = solvePiLead({
    unknown: "alpha",
    omega_c: 6.4,
    gamma_M_deg: 75,
    phi_G_deg: -112.77,
    N_i: 5,
  });
  approxRel(a, 0.5, 2e-2, "alpha");
});

// REEXAM_F21_Q17 Ni mode: facit 1.57 (rel 1e-2)
test("REExam F21 Q17 Ni mode", () => {
  const n = solvePiLead({
    unknown: "Ni",
    omega_c: 25.04,
    gamma_M_deg: 75,
    phi_G_deg: -151.064,
    alpha: 0.01,
  });
  approxRel(n, 1.57, 1e-2, "Ni");
});

// REEXAM_F21_Q15 alpha mode: M_D = 1/sqrt(alpha) ~= 3.3 (rel 2e-2)
test("REExam F21 Q15 alpha-from-MD", () => {
  const a = solvePiLead({
    unknown: "alpha",
    omega_c: 15.0,
    gamma_M_deg: 50,
    phi_G_deg: -167.842,
    N_i: 3,
  });
  approxRel(1 / Math.sqrt(a), 3.3, 2e-2, "M_D");
});

// F22_Q19 KP mode: G=900/((0.25s+1)(s^2+50s+3000)) → facit 3.4154 (rel 2e-2)
test("F22 Q19 KP mode", () => {
  const G = new NumericTF([900], [0.25, 13.5, 800, 3000]);
  const KP = solvePiLead({
    unknown: "KP",
    G,
    gamma_M_deg: 75,
    alpha: 0.01,
    N_i: 3,
  });
  approxRel(KP, 3.4154, 2e-2, "KP");
});

// S21_Q6 P-for-PM: G=1/(s(s+2.1)), PM=40 → facit 8.4 (rel 5e-2)
test("S21 Q6 P-for-PM 40deg", () => {
  const G = new NumericTF([1], [1, 2.1, 0]);
  const out = solvePForPM(G, 40);
  approxRel(out.K_P, 8.4, 5e-2, "K_P");
});

// S20_Q9 P-for-PM: G=20833/(s(s+43.3)), PM=60 → facit ~0.06 (rel 0.5)
test("S20 Q9 P-for-PM 60deg approximate", () => {
  const G = new NumericTF([20833], [1, 43.3, 0]);
  const out = solvePForPM(G, 60);
  approxRel(out.K_P, 0.06, 0.5, "K_P");
});
