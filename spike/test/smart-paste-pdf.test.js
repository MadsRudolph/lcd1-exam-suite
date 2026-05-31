// Regression tests for PDF-copy extraction: pasting straight from an exam PDF
// splits transfer-function fractions across lines, sticks the gain to adjacent
// words, and renders derivatives as Unicode diacritics. These cases reproduce
// the exact garbled text and assert correct extraction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTf } from "../numeric/parse.js";
import { extractTf, extractClosedLoopTf, extractOde, parseQuestion } from "../smart-paste.js";

function tfEqual(a, b, msg = "") {
  const A = parseTf(a), B = parseTf(b);
  const scale = (tf) => { const d0 = tf.den[0]; return { num: tf.num.map((c) => c / d0), den: tf.den.map((c) => c / d0) }; };
  const sa = scale(A), sb = scale(B);
  assert.equal(sa.num.length, sb.num.length, `${msg} num degree`);
  assert.equal(sa.den.length, sb.den.length, `${msg} den degree`);
  sa.num.forEach((c, i) => assert.ok(Math.abs(c - sb.num[i]) < 1e-6, `${msg} num`));
  sa.den.forEach((c, i) => assert.ok(Math.abs(c - sb.den[i]) < 1e-6, `${msg} den`));
}

test("split fraction: numerator on label line, denominator on next (Q11)", () => {
  const text = "open-loop transfer function G(s) =20\ns(s+ 2)( s+ 5)\nis driven by a unit ramp input.";
  tfEqual(extractTf(text), "20/(s*(s+2)*(s+5))", "Q11");
});

test("split fraction: denominator line has trailing prose (Q14)", () => {
  const text = "For the loop transfer function L(s) =1\ns(s+ 21), find the proportional gain KP";
  tfEqual(extractTf(text), "1/(s*(s+21))", "Q14");
});

test("symbolic gain numerator K/den is normalised to 1/den (Q9)", () => {
  const text = "The plant G(s) =K\n(s+ 1)( s+ 2)( s+ 4)is placed in a unity feedback loop.";
  tfEqual(extractTf(text), "1/((s+1)*(s+2)*(s+4))", "Q9");
});

test("closed-loop TF keeps symbolic K with the right coefficient (Q12)", () => {
  const text = "has the closed-loop transfer functionK\ns2+ 4s+K. Choose K so that the overshoot is 10%.";
  const cl = extractClosedLoopTf(text);
  assert.ok(cl, "extracted a closed-loop string");
  // den must be s^2 + 4s + K, not the old default s^2 + 2s + K
  const den1 = parseTf(cl.replace(/\bK\b/g, "1")).den; // K -> 1
  assert.deepEqual(den1, [1, 4, 1], `den with K=1 -> [1,4,1], got ${den1}`);
});

test("ODE with Unicode diacritics extracts coefficients (Q2)", () => {
  const text = "differential equation ¨y+ 4 ˙y+ 13y= 2u. What are the poles?";
  assert.deepEqual(extractOde(text), { y_coeffs: "1,4,13", u_coeffs: "2" });
});

test("ODE with prime / \\ddot notation also works", () => {
  assert.deepEqual(extractOde("y'' + 4 y' + 13 y = 2 u"), { y_coeffs: "1,4,13", u_coeffs: "2" });
  assert.deepEqual(extractOde("\\ddot{y} + 5\\dot{y} + 6 y = 3 u"), { y_coeffs: "1,5,6", u_coeffs: "3" });
});

test("ess question routes with the input-specific match key", () => {
  const ramp = parseQuestion("G(s) = 20/(s*(s+2)*(s+5)) driven by a unit ramp. steady-state error?");
  assert.equal(ramp.solver_function, "solve_ess_table");
  assert.equal(ramp.match_key, "ess_ramp");
});

test("closed-loop 'choose K' matches on K, not the spec metric (Q12)", () => {
  const r = parseQuestion("closed-loop transfer function K/(s**2+4*s+K). Choose K so that the overshoot is 10%.\n1. 11.4\n2. 16");
  assert.equal(r.solver_function, "solve_closed_loop_2nd_order");
  assert.equal(r.match_key, "K");
});
