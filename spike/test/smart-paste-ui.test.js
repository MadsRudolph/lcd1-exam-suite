// Smart Paste (assist mode): the engine orchestrator that fills the dashboard
// from a pasted exam question. It extracts a G(s) + options + an intent hint,
// and — crucially — never commits to a multiple-choice answer, so a mis-read
// can't surface as a confident wrong letter (the B4 failure mode).
import { test } from "node:test";
import assert from "node:assert/strict";
import { smartPaste, runSolver, analyzeNumeric } from "../../lcd-engine.js";

test("reads a numeric loop TF and the options straight from the question", () => {
  const r = smartPaste(
    "Determine the gain margin GM and phase margin PM of the open loop " +
    "G(s) = 1/((s+1)*(s+1)*(s+1)).\na) 8\nb) 2\nc) 4\nd) 1");
  assert.equal(r.source, "tf");
  assert.equal(r.tfKind, "numeric");
  assert.equal(r.tf, "1/((s+1)*(s+1)*(s+1))");
  assert.equal(r.intent.fn, "solve_margins");
  assert.equal(r.options, "8\n2\n4\n1");
  assert.equal(r.note, null);
});

test("reads a flattened loop gain with a written-out design gain K (F22 Q6)", () => {
  // PDF copy flattens the fraction bar and writes the gain out: "G(s) = K s(s+21)".
  // The plant 1/(s*(s+21)) must land in the system box (K normalised to 1).
  const r = smartPaste(
    "loop transfer function G(s) = K s(s + 21) and the Bode plot in Fig.3. " +
    "What is the gain K so that the phase margin is PM=40?\n" +
    "1. K = 0.1\n2. K = 8.4\n3. K = 77.5\n4. K = 18.5\n5. K = 40");
  assert.equal(r.source, "loop");
  assert.equal(r.tfKind, "numeric");
  assert.equal(r.tf, "1/(s*(s+21))");
  assert.equal(r.intent.fn, "solve_P_for_PM");
  assert.equal(r.options, "0.1\n8.4\n77.5\n18.5\n40");
  assert.equal(r.note, null); // not a figure-only dead end anymore
});

test("normalises common design-gain notations (K, Kp, K_P)", () => {
  for (const g of ["K", "Kp", "K_P"]) {
    const r = smartPaste(`The loop gain is G(s) = ${g} s(s+2)(s+3). Find the margins.`);
    assert.equal(r.tf, "1/(s*(s+2)*(s+3))", `gain "${g}"`);
    assert.equal(r.source, "loop");
  }
});

test("builds G(s) from a differential equation when no TF is written", () => {
  const r = smartPaste("Given the differential equation 5y'' + y' + 0.5y = 3u, find the transfer function.");
  assert.equal(r.source, "ode");
  assert.equal(r.tfKind, "numeric");
  assert.equal(r.tf, "3 / (5s**2 + s + 0.5)");
  assert.equal(r.intent.fn, "solve_ode_to_tf");
});

test("keeps a closed-loop TF symbolic so the equivalence checker can use it", () => {
  const r = smartPaste("The closed loop transfer function K\ns2 + 4s + K. Choose K so the overshoot is 5%.\na) 4\nb) 9\nc) 16");
  assert.equal(r.source, "closed-loop");
  assert.equal(r.tfKind, "symbolic");
  assert.equal(r.tf, "K/(s**2+4*s+K)");
  assert.equal(r.options, "4\n9\n16");
});

test("figure-only question fails safe with guidance instead of crashing (B2)", () => {
  const r = smartPaste("A P-controller is designed such that a phase margin of 60 degrees is obtained. Determine the gain Kp.");
  assert.equal(r.tf, null);
  assert.equal(r.intent.fn, "solve_P_for_PM");
  assert.ok(r.note && r.note.includes("no transfer function"), "explains why nothing computed");
});

test("never selects a multiple-choice answer — no confident-wrong letter (B4)", () => {
  const r = smartPaste(
    "Fd is an unfiltered dynamic feed-forward controller. The sensitivity function " +
    "related to the disturbance d(s) is:\na) Gyd = 0\nb) Gyd = 1");
  // The return shape has no answer/selection field at all — assist mode only
  // ever offers a hint, so it is structurally impossible to flag a wrong option.
  assert.deepEqual(Object.keys(r).sort(), ["intent", "note", "options", "source", "tf", "tfKind"]);
  assert.equal(r.tf, null);
  assert.ok(r.note, "tells the student to use the calculator rather than guessing");
});

test("a design goal flags which pasted option its answer matches (P for PM)", () => {
  // The full F22 Q6 (corrected) flow: plant 1/(s(s+2.1)), target PM 40° -> K_P≈8.18,
  // which must be matched against the pasted options and flag 8.4.
  const res = runSolver("solve_P_for_PM", { G: "1/(s*(s+2.1))", target_PM_deg: "40" },
    "0.1\n8.4\n77.5\n18.5\n40", "K_P");
  const matched = res.options.filter((o) => o.flag === "match");
  assert.equal(matched.length, 1);
  assert.equal(matched[0].raw_text, "8.4");
});

test("extracts the plant across the common analysis question types", () => {
  const cases = [
    ["The open loop transfer function is G(s) = 1/(s+1)^3. Determine GM and PM at the gain crossover.", "1/(s+1)^3", "solve_margins"],
    ["For which values of K is the closed loop stable? The plant is G(s) = 1/(s+1)^3.", "1/(s+1)^3", "solve_stable_K_range"],
    ["Determine the system type and steady-state error for a unit ramp. G(s) = 5(s+4)/(s^2(s+1)(s+20)).", "5(s+4)/(s^2(s+1)(s+20))", "solve_ess_table"],
    ["G(s) = 12/((s+2)(s+3)). What is the DC gain in dB?", "12/((s+2)(s+3))", "solve_margins"],
  ];
  for (const [text, tf, fn] of cases) {
    const r = smartPaste(text);
    assert.equal(r.tf, tf, text);
    assert.equal(r.intent.fn, fn, text);
  }
});

test("dashboard read-outs expose ζ and ωₙ for a 2nd-order TF", () => {
  const a = analyzeNumeric("2/(s^2+2*s+2)");   // closed loop of L=K/(s(s+√(2K))) at K=2
  assert.ok(Math.abs(a.zeta - 0.70710678) < 1e-4, `ζ ≈ 0.707, got ${a.zeta}`);
  assert.ok(Math.abs(a.omega_n - Math.SQRT2) < 1e-4, `ωₙ ≈ 1.414, got ${a.omega_n}`);
  const b = analyzeNumeric("1/(s+1)");          // first order -> no ζ/ωₙ
  assert.equal(b.zeta, null);
});

test("Smart Paste extracts a TF written with a unicode superscript (s²)", () => {
  const r = smartPaste("What is the DC gain in dB of G(s) = 12/(s²+5s+6)?\n1. 2\n2. 12\n3. 6");
  assert.ok(r.tf, "should extract a TF from s²+5s+6");
  const a = analyzeNumeric(r.tf);
  assert.ok(Math.abs(a.dcGain - 2) < 1e-6, `DC gain 2, got ${a.dcGain}`);
  assert.ok(Math.abs(a.dcGain_dB - 6.0206) < 1e-2, `DC gain ≈ 6 dB, got ${a.dcGain_dB}`);
});

test("phase margin is reported in (-180, 180] (a type-2 plant reads negative)", () => {
  const a = analyzeNumeric("5*(s+4)/(s**2*(s+1)*(s+20))");
  assert.ok(a.margins.PM_deg > -180 && a.margins.PM_deg <= 180, `PM in range, got ${a.margins.PM_deg}`);
  assert.ok(Math.abs(a.margins.PM_deg - -31.4) < 0.5, `PM ≈ -31.4, got ${a.margins.PM_deg}`);
});

test("'choose K so Mp ≤ …' points at the K-for-transient-spec goal", () => {
  const r = smartPaste("Choose the gain K so that the overshoot is 12%. The loop gain is G(s) = K/(s(s+5)).");
  assert.equal(r.intent.fn, "solve_K_for_spec");
});

test("empty input yields an all-null result, no throw", () => {
  const r = smartPaste("");
  assert.deepEqual(r, { tf: null, tfKind: null, source: null, options: null, intent: null, note: null });
});

test("garbage text does not throw and computes nothing", () => {
  const r = smartPaste("the quick brown fox jumps over the lazy dog");
  assert.equal(r.tf, null);
  assert.equal(r.source, null);
});
