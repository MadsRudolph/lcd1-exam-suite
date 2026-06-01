// End-to-end exam coverage through the GUI dispatch. runSolver(fn, inp, options)
// is exactly what the LCD1 Solver forms call and what they display, so driving it
// with real exam inputs proves the whole GUI path solves each question type.
// Ground-truth values are oracle-backed (the P1-P7 facit) or independently
// confirmed; MCQ examples also assert the correct option is flagged "match".
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { runSolver } from "../../lcd-engine.js";

const val = (out, key) => {
  const row = out.summary.find(([k]) => k === key);
  return row ? row[1] : undefined;
};
const num = (out, key) => parseFloat(val(out, key));
const matched = (out) => (out.options || []).filter((o) => o.flag === "match" || o.flag === "also_plausible").map((o) => o.raw_text.trim());

// ---------- P1: system identification ----------
test("P1 ODE->TF: 5y''+y'+0.5y=3u -> DC gain 6, poles -0.1±0.3j", () => {
  const out = runSolver("solve_ode_to_tf", { y_coeffs: "5,1,0.5", u_coeffs: "3" });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "DC gain"), 6.0, 1e-3, "DC gain");
  assert.match(val(out, "poles"), /-0\.1/);
});

test("P1 state-space->TF (REEXAM F21 Q6): G=10/(s+1)", () => {
  const out = runSolver("solve_state_space_to_tf", { A: "[[-1,0],[0,-1]]", B: "[[1],[9]]", C: "[[1,1]]", D: "[[0]]" });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "DC gain"), 10.0, 1e-6, "DC gain");
  assert.match(val(out, "poles"), /-1/);
});

// ---------- P3: stability & margins ----------
test("P3 margins (1/(s+1)^3): GM=8, GM_dB=18.06, ω_pc=√3", () => {
  const out = runSolver("solve_margins", { G: "1/((s+1)^3)" });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "GM"), 8.0, 1e-3, "GM");
  approxRel(num(out, "GM_dB"), 18.0618, 1e-3, "GM_dB");
  approxRel(num(out, "omega_pc"), Math.sqrt(3), 1e-3, "ω_pc");
});

test("P3 stable-K range (S21, 1/(s+1)^3): computes 0<K<8", () => {
  // Interval-style MCQ options ("0<K<8") aren't auto-flagged — the matcher tests
  // single K values against the range — but the displayed range is the answer.
  const out = runSolver("solve_stable_K_range", { G: "1/((s+1)^3)" });
  assert.ok(out.ok, out.note);
  approxAbs(num(out, "K_low"), 0.0, 1e-9, "K_low");
  approxRel(num(out, "K_high"), 8.0, 1e-3, "K_high");
});

test("P3 stable-K range, RHP plant (s+1)/(s^2+43s-90): K_low≈90, flags K=100", () => {
  // Value-style MCQ options ARE auto-flagged (options must be bare numbers):
  // K_P=100 is inside (90, ∞).
  const opts = "0.5\n50\n100\n-5";
  const out = runSolver("solve_stable_K_range", { G: "(s+1)/(s^2+43*s-90)" }, opts);
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K_low"), 90.09, 2e-2, "K_low");
  assert.equal(val(out, "K_high"), "∞");
  assert.deepEqual(matched(out), ["100"], "GUI flags K_P=100 as inside the stable range");
});

// ---------- P4: second-order response ----------
test("P4 2nd-order ζ=0.707 -> Mp≈4.3% (ReExam F21)", () => {
  const out = runSolver("solve_2nd_order", { zeta: 0.7071 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "Mp_pct"), 4.32, 2e-2, "Mp%");
});

test("P4 2nd-order Mp=0.5 -> ζ≈0.215 (E20)", () => {
  const out = runSolver("solve_2nd_order", { Mp: 0.5 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "zeta"), 0.2155, 1e-2, "ζ");
});

test("P4 K for spec Mp<=0.12, 1/(s(s+5)) -> K≈20 (S21)", () => {
  const out = runSolver("solve_K_for_spec", { G_str: "K/(s*(s+5))", spec: "Mp <= 0.12" });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K"), 19.97, 1e-2, "K");
});

// ---------- P5: steady-state error ----------
test("P5 K_P from ess (F22 Q16): G0=-7.9588 dB, e=5/9 -> K_P=2", () => {
  const out = runSolver("solve_KP_from_ess", { G0: "-7.9588", G0_unit: "dB", ess_target: 5 / 9 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K_P"), 2.0, 1e-3, "K_P");
});

test("P5 K_P from ess (E20): G0=3, e=0.4 -> K_P=0.5", () => {
  const out = runSolver("solve_KP_from_ess", { G0: "3", G0_unit: "linear", ess_target: 0.4 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K_P"), 0.5, 1e-3, "K_P");
});

test("P5 ess table (ReExam F21 Q4): type 2, ess_parabola=1", () => {
  const out = runSolver("solve_ess_table", { G: "5*(s+4)/(s^2*(s+1)*(s+20))" });
  assert.ok(out.ok, out.note);
  assert.equal(val(out, "type"), "2");
  approxRel(num(out, "ess_parabola"), 1.0, 1e-3, "ess_parabola");
  approxAbs(num(out, "ess_step"), 0.0, 1e-9, "ess_step");
});

// ---------- P6: controller design ----------
test("P6 P-for-PM (S21 Q6): G=1/(s(s+2.1)), PM=40 -> K_P≈8.4", () => {
  const out = runSolver("solve_P_for_PM", { G: "1/(s*(s+2.1))", target_PM_deg: 40 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K_P"), 8.4, 5e-2, "K_P");
});

test("P6 PI-Lead α mode (F22 Q17): γ=75,φ_G=-112.77,Ni=5 -> α≈0.5", () => {
  const out = runSolver("solve_pi_lead", { unknown: "alpha", gamma_M_deg: 75, phi_G_deg: -112.77, N_i: 5 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "alpha"), 0.5, 3e-2, "α");
});

test("P6 PI-Lead K_P mode (F22 Q19): G=900/((0.25s+1)(s^2+50s+3000)), γ=75,α=0.01,Ni=3 -> K_P≈3.4154", () => {
  const out = runSolver("solve_pi_lead", { unknown: "KP", G: "900/((0.25*s+1)*(s^2+50*s+3000))", gamma_M_deg: 75, alpha: 0.01, N_i: 3 });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "K_P"), 3.4154, 2e-2, "K_P");
});

// ---------- Analysis dashboard ----------
test("Analysis characterize (final-value): 4(s+50)/(s^2+30s+200) -> y(∞)=1, y(0+)=0", () => {
  const out = runSolver("characterize", { G: "4*(s+50)/(s^2+30*s+200)" });
  assert.ok(out.ok, out.note);
  approxRel(num(out, "y(∞) step (final value)"), 1.0, 1e-6, "final value");
  approxAbs(num(out, "y(0⁺) step (init. value)"), 0.0, 1e-9, "initial value");
});

test("Analysis symbolic loop L=K/(s(s+a)): type 1, K₀=K/a, e_step=0, e_ramp=a/K", () => {
  const out = runSolver("symbolic_analysis", { L: "K/(s*(s+a))" });
  assert.ok(out.ok, out.note);
  assert.equal(val(out, "type (N)"), "1");
  assert.equal(val(out, "e_ss (unit step)").replace(/\s/g, ""), "0");
  assert.equal(val(out, "e_ss (unit ramp)").replace(/\s/g, ""), "(a)/(K)");
});

test("Analysis symbolic disturbance ess: Gd=1/(s+1), L=K/(s+1) -> -1/(K+1)", () => {
  const out = runSolver("symbolic_disturbance_ess", { Gd: "1/(s+1)", L: "K/(s+1)" });
  assert.ok(out.ok, out.note);
  assert.equal(val(out, "e_dss (unit step)").replace(/\s/g, ""), "(-1)/(K+1)");
});

test("Analysis solve-for-symbol: 1/(1+Kp)=0.4 -> Kp=1.5", () => {
  const out = runSolver("solve_symbol", { equation: "1/(1+Kp) = 0.4", symbol: "Kp" });
  assert.ok(out.ok, out.note);
  approxRel(parseFloat(val(out, "decimal")), 1.5, 1e-6, "Kp");
});
