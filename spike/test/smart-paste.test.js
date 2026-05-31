// Routing & extraction parity for the Smart Paste parser.
// Cases mirror lcd1-solver/tests/test_smart_paste.py. Transfer functions are
// compared by COEFFICIENTS (semantic equality), not sympy's canonical string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTf } from "../numeric/parse.js";
import { parseQuestion, extractTf, extractOptions } from "../smart-paste.js";

const norm = (x) => String(x).replace(/\s+/g, "");

/** Compare two TF strings by proportional coefficients (den normalised to monic). */
function tfEqual(a, b, msg = "") {
  const A = parseTf(a);
  const B = parseTf(b);
  const scale = (tf) => {
    const d0 = tf.den[0];
    return { num: tf.num.map((c) => c / d0), den: tf.den.map((c) => c / d0) };
  };
  const sa = scale(A);
  const sb = scale(B);
  assert.equal(sa.num.length, sb.num.length, `${msg} num degree`);
  assert.equal(sa.den.length, sb.den.length, `${msg} den degree`);
  sa.num.forEach((c, i) => assert.ok(Math.abs(c - sb.num[i]) < 1e-6, `${msg} num[${i}] ${c}!=${sb.num[i]}`));
  sa.den.forEach((c, i) => assert.ok(Math.abs(c - sb.den[i]) < 1e-6, `${msg} den[${i}] ${c}!=${sb.den[i]}`));
}

// (id, text, expected_solver, {key: expected}) — G values compared by coefficients.
const CASES = [
  ["S21Q4_stableK",
    "For the closed-loop system where P(s) = 1/(s+1)^3 is the system transfer function and K is a proportional controller. For which values of K is the closed loop stable?\n1. K >= 8\n2. -1 < K < 6\n3. 0 < K < 8\n4. K > -10",
    "solve_stable_K_range", { G: "1/(s+1)**3" }],
  ["S21Q11_stableK_multiline",
    "Consider a system with transfer function\nG(s) =\n120\ns3 + 43s2 + 120s\nA P-controller KP is applied and the loop is closed with unit feedback. The closed-loop system is stable for:\na) KP = -1\nb) KP = 25\nc) KP = 71",
    "solve_stable_K_range", { G: "120/(s**3+43*s**2+120*s)" }],
  ["S21Q6_PforPM",
    "A closed-loop system has a loop transfer function L(s) = K/(s(s+3)(s+10)). What is the gain K so that the phase margin is PM=40 degrees?\n1. K = 19.5\n2. K = 90\n3. K = 44\n4. K = 38.9\n5. K = 88",
    "solve_P_for_PM", { G: "1/(s*(s+3)*(s+10))", target_PM_deg: 40 }],
  ["ReF22Q14_PforPM_multiline",
    "Consider a system with transfer function\nG(s) =\n225\ns3 + 12s2 + 47s + 57\nA P-controller KP that ensures phase margin gamma_M = 50 degrees for the open-loop system is:\na) KP = 7.05\nb) KP = 0.71\nc) KP = -2.92",
    "solve_P_for_PM", { G: "225/(s**3+12*s**2+47*s+57)", target_PM_deg: 50 }],
  ["S21Q9_2ndorder",
    "For the unit feedback system, which is the gain K of the proportional controller so that the output has an overshoot of no more than 12% in response to a unit step?\n1. 0 <= K <= 20\n2. 5 <= K <= 25\n3. K >= 25",
    "solve_closed_loop_2nd_order", { given_kind: "Mp" }],
  ["F22Q18_feedforward",
    "The objective is to attenuate the effect of the disturbance d(s) on the system output y(s) by designing a disturbance feed-forward controller Fd(s). Which design for Fd(s) is the most appropriate?",
    "pick_feedforward_form", {}],
  ["F22Q16_ess",
    "A P-controller with gain KP is applied and the loop is closed with unit feedback. If the steady state error ess = 0.555, the proportional gain KP is approximately:\na) KP = 1\nb) KP = 2\nc) KP = 2.5",
    "solve_KP_from_ess", { ess_target: 0.555 }],
  ["S21Q16_ess_with_Kp",
    "Consider a system with transfer function\nG(s) =\n1224\ns3 + 30s2 + 257s + 612\nA P-controller with KP = 2 is applied to the system but it is placed in the feedback branch. The steady state error e(s) due to a unit step change in the reference signal is:\na) ess = 0\nb) ess = 2\nc) ess = 0.2",
    "solve_ess_table", { G: "2*(1224/(s**3+30*s**2+257*s+612))" }],
  ["S21Q17_leadlag_beta",
    "A P-Lead-Lag controller with alpha = 0.2 needs to be designed. The new crossover frequency wc = 15 rad/s and the Lag phase phi_L = arctan(Ni(1-b)/(1+bNi^2)), where Ni = wc tau_i = 3. If a phase margin gamma_M = 70 degrees is desired, what is the value of the parameter beta of the Lag-part?\na) b = 0\nb) b = 2\nc) b = -1.5",
    "solve_pi_lead", { unknown: "beta", alpha: "0.2", N_i: 3 }],
];

for (const [cid, text, solver, checks] of CASES) {
  test(`route: ${cid}`, () => {
    const r = parseQuestion(text);
    assert.ok(r, `${cid}: parser returned null`);
    assert.equal(r.solver_function, solver, `${cid}: routed to ${r.solver_function}`);
    for (const [key, expected] of Object.entries(checks)) {
      assert.ok(key in r.inputs, `${cid}: missing input ${key} (have ${Object.keys(r.inputs)})`);
      if (key === "G") tfEqual(r.inputs[key], expected, `${cid}.G`);
      else assert.ok(norm(expected).includes(norm(r.inputs[key])) || norm(r.inputs[key]).includes(norm(expected)), `${cid}: ${key}=${r.inputs[key]} vs ${expected}`);
    }
  });
}

test("PDF multi-line TF reconstruction", () => {
  tfEqual(extractTf("G(s) =\n120\ns3 + 43s2 + 120s\nA P-controller ..."), "120/(s**3+43*s**2+120*s)", "multiline");
});

test("flattened fraction is division not product", () => {
  tfEqual(extractTf("G(s) = 120 s3 + 43s2 + 120s and Bode plot as shown"), "120/(s**3+43*s**2+120*s)", "flat-div");
});

test("flattened fraction polynomial numerator", () => {
  tfEqual(extractTf("G(s) = s + 1 s2 + 43s - 90 and Nyquist plot as shown"), "(s+1)/(s**2+43*s-90)", "flat-poly");
});

test("flattened fraction factored both sides", () => {
  tfEqual(
    extractTf("G(s) = 0.7(s + 0.5) (5s + 1)(s2 + 0.2s + 0.6)(0.01s + 1) has the Bode plot"),
    "(0.7*s + 0.35)/((0.01*s + 1)*(5*s + 1)*(s**2 + 0.2*s + 0.6))", "flat-both");
});

test("flattened constant over factored denominator", () => {
  tfEqual(extractTf("G(s) = 600 (s+0.1)(s+20)(s+30) with the Bode plot"), "600/((s+0.1)*(s+20)*(s+30))", "flat-const");
});

test("guard leaves real products alone", () => {
  tfEqual(extractTf("G(s) = 10 (s+1)/((s+0.1)(s2+20s+100))"), "(10*s+10)/((s+0.1)*(s**2+20*s+100))", "guard");
});

test("options drop non-dB units and keep dB", () => {
  const lines = extractOptions("a) MD = 5.5 dB\nb) MD = 11 dB\nc) wd = 1.73 rad/s\nd) 82.29 deg").split("\n");
  assert.ok(lines.includes("5.5 dB") && lines.includes("11 dB"));
  assert.ok(lines.includes("1.73"));
  assert.ok(lines.includes("82.29"));
});

test("unicode minus normalised in options", () => {
  const lines = extractOptions("a) KP = −1\nb) KP = 25\nc) KP = −32").split("\n");
  assert.ok(lines.includes("-1"));
  assert.ok(lines.includes("-32"));
});
