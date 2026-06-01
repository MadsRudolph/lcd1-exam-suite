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
