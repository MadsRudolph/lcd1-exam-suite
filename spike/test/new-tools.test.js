// New exam tools: G(jω) point evaluator, step-plot read-off → 2nd-order, and
// the initial/final value theorems. Facit from the LCD1 past exams.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";
import { evalFreqPoint, findOmegaForMagDb } from "../solvers/freqpoint.js";
import { secondOrderFromReadoff } from "../solvers/plotreadoff.js";
import { valueTheorems } from "../solvers/valuetheorems.js";
import { runSolver } from "../../lcd-engine.js";

test("close the loop: open-loop L -> closed-loop T = L/(1+L) with zeta", () => {
  // L = 2/(s(s+2))  ->  T = 2/(s^2+2s+2): zeta=0.707, wn=1.414, DC gain 1.
  const r = runSolver("close_loop", { G: "2/(s*(s+2))", K: "1" });
  const m = Object.fromEntries(r.summary);
  assert.match(m["closed-loop T(s)"].replace(/\s/g, ""), /2\/\(s\^2\+2s\+2\)/);
  approxAbs(Number(m["ζ"]), 0.70710678, 1e-4, "zeta");
  approxAbs(Number(m["ω_n"]), Math.SQRT2, 1e-4, "omega_n");
  assert.equal(m["stable?"], "yes");
});

test("close the loop with a gain K: T = K·L/(1+K·L)", () => {
  // L = 1/(s(s+1)), K=10 -> T = 10/(s^2+s+10).
  const r = runSolver("close_loop", { G: "1/(s*(s+1))", K: "10" });
  const m = Object.fromEntries(r.summary);
  assert.match(m["closed-loop T(s)"].replace(/\s/g, ""), /10\/\(s\^2\+s\+10\)/);
});

test("ess table with a P-controller in a branch: S21 Q16 -> 0.2", () => {
  // Kp = 2 in the feedback branch; ess_step = 1/(1+Kp·G(0)), G(0)=2 -> 0.2.
  const r = runSolver("solve_ess_table", { G: "1224/(s**3+30*s**2+257*s+612)", K_P: "2" });
  const ess = Object.fromEntries(r.summary);
  approxAbs(Number(ess.ess_step), 0.2, 1e-6, "ess_step with Kp=2");
});

test("ess table without K_P is unchanged (unity feedback)", () => {
  const r = runSolver("solve_ess_table", { G: "1224/(s**3+30*s**2+257*s+612)" });
  const ess = Object.fromEntries(r.summary);
  approxAbs(Number(ess.ess_step), 1 / 3, 1e-6, "ess_step without controller");
});

test("GM from a Nyquist crossing: F22 Q11 (d=0.1639 -> 15.71 dB)", () => {
  const r = runSolver("gm_from_crossing", { d: "0.1639" }, "a. -15.71\nb. 15.71\nc. -6.1\nd. 6.1");
  const s = Object.fromEntries(r.summary);
  approxRel(Number(s["GM (dB)"]), 15.71, 1e-3, "GM in dB");
  approxRel(Number(s["GM (linear)"]), 6.1, 1e-2, "GM linear");
  assert.ok(r.options.some((o) => /15.71/.test(o.raw_text) && o.flag === "match"), "flags the 15.71 dB option");
});

test("overshoot-% options match Mp%, not zeta (ReExam F21 Q10)", () => {
  // L=K/(s(s+√(2K))) -> ζ=0.707 -> Mp ≈ 4.3%. Options are percentages.
  const r = runSolver("solve_2nd_order", { zeta: "0.707" }, "1. 4.3%\n2. 12.0%\n3. 5.1%\n4. 3.2%");
  assert.equal(r.options[0].flag, "match");
});

test("state-space → TF cancels the common factor (ReExam F21 Q6 -> 10/(s+1))", () => {
  const r = runSolver("solve_state_space_to_tf", { A: "[[-1,0],[0,-1]]", B: "[[1],[9]]", C: "[[1,1]]", D: "[[0]]" });
  // Reduced to first order: a single pole at -1 (not a repeated pair).
  const poles = r.summary.find(([k]) => k === "poles")[1];
  assert.equal(poles, "-1");
  assert.ok(/\\dfrac\{10\}\{s\+1\}/.test(r.latex.replace(/\s/g, "")), `reduced to 10/(s+1), got ${r.latex}`);
});

test("G(jω): magnitude/phase at the gain crossover of 1/(s(s+2.1))", () => {
  const G = parseTf("1/(s*(s+2.1))");
  const p = evalFreqPoint(G, 0.4649);
  approxAbs(p.mag_dB, 0, 0.05, "|G| ≈ 0 dB at the gain crossover");
  // PM = 180 + ∠G ⇒ ∠G ≈ -102.5° gives the 77.5° margin seen elsewhere.
  approxAbs(p.phase_deg, -102.48, 0.5, "phase at ω_c");
});

test("G(jω): inverse — find ω where |G| = 0 dB", () => {
  const G = parseTf("1/(s*(s+2.1))");
  approxRel(findOmegaForMagDb(G, 0), 0.4649, 1e-2, "gain crossover frequency");
});

test("step-plot read-off: overshoot → ζ (S20 Q5)", () => {
  const r = secondOrderFromReadoff({ y_steady: "2.0", y_peak: "2.9" });
  approxAbs(r.Mp, 0.45, 1e-9, "Mp");
  approxAbs(r.zeta, 0.246, 1e-3, "ζ from overshoot");
});

test("step-plot read-off: period → ω_n (Test Exam Q3)", () => {
  const r = secondOrderFromReadoff({ period: "0.21" });
  approxRel(r.omega_d, 29.92, 1e-2, "ω_d = 2π/T");
  approxRel(r.omega_n, 29.92, 1e-2, "ω_n ≈ ω_d for light damping");
});

test("final-value theorem: 4(s+50)/(s(s²+30s+200)) → 1 (ReExam F21 Q8)", () => {
  const F = parseTf("(4*s+200)/(s**3+30*s**2+200*s)");
  const r = valueTheorems(F.num, F.den);
  approxAbs(r.final_value, 1, 1e-9, "y(∞)");
  approxAbs(r.initial_value, 0, 1e-9, "y(0⁺)");
});

test("value theorems: FVT of a step on 1/(s+2.1) is G(0)=0.476", () => {
  const G = parseTf("1/(s+2.1)");
  const r = valueTheorems(G.num, G.den, "step");
  approxAbs(r.final_value, 1 / 2.1, 1e-9, "final value of the step response");
});

test("engine wiring: runSolver routes the three new tools", () => {
  const a = runSolver("evaluate_gjw", { G: "1/(s*(s+2.1))", omega: "0.4649" });
  assert.ok(a.ok && a.summary.some(([k]) => k.includes("∠G")), "evaluate_gjw");

  const b = runSolver("second_order_from_plot", { y_steady: "2.0", y_peak: "2.9" });
  assert.ok(b.ok && b.summary.some(([k]) => k === "ζ"), "second_order_from_plot");

  const c = runSolver("value_theorems", { F: "(4*s+200)/(s**3+30*s**2+200*s)", input: "none" });
  assert.ok(c.ok && c.summary.some(([k]) => k.includes("final value")), "value_theorems");
});

test("evaluate_gjw fails safe when no frequency or target is given", () => {
  const r = runSolver("evaluate_gjw", { G: "1/(s*(s+2.1))" });
  assert.equal(r.ok, false);
  assert.ok(r.note.includes("frequency"));
});
