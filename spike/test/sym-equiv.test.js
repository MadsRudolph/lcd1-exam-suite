import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolicEquivTest, stripOptionLabel } from "../../symbolic/equiv.js";

const flags = (res) => res.options.map((o) => o.flag);

test("self-equal: reference matches itself", () => {
  const res = symbolicEquivTest("K/(s^2 + (a+1)*s + 2*K + a)", ["K/(s^2 + (a+1)*s + 2*K + a)"]);
  assert.equal(res.ok, true);
  assert.deepEqual(flags(res), ["match"]);
});

test("matched options carry no redundant note; mismatches read 'not equivalent'", () => {
  const res = symbolicEquivTest("K/(s+1)", ["K/(s+1)", "1/(s+1)"]);
  assert.equal(res.options[0].note, "");
  assert.equal(res.options[1].note, "not equivalent");
});

test("expanded / reordered denominator is judged equal", () => {
  const ref = "K/(s^2 + (a+1)*s + 2*K + a)";
  const res = symbolicEquivTest(ref, ["K/(s^2 + a*s + s + a + 2*K)"]);
  assert.deepEqual(flags(res), ["match"]);
});

test("numerator and denominator scaled by the same constant is equal", () => {
  const res = symbolicEquivTest("K/(s^2+(a+1)*s+2*K+a)", ["2*K/(2*s^2+2*(a+1)*s+4*K+2*a)"]);
  assert.deepEqual(flags(res), ["match"]);
});

test("genuinely different answer is not equivalent", () => {
  const ref = "K/(s^2 + (a+1)*s + 2*K + a)";
  const res = symbolicEquivTest(ref, ["K/(s^2 + (a+1)*s + a)"]);
  assert.deepEqual(flags(res), ["no_match"]);
});

test("'**' power syntax is tolerated", () => {
  const res = symbolicEquivTest("1/(s**2+1)", ["1/(s^2+1)", "1/(s**2 + 1)"]);
  assert.deepEqual(flags(res), ["match", "match"]);
});

test("middle-dot multiplication is tolerated", () => {
  const res = symbolicEquivTest("2·K/(s+1)", ["2*K/(s+1)"]);
  assert.deepEqual(flags(res), ["match"]);
});

test("option labels and result-name prefixes are stripped", () => {
  const ref = "K/(s+1)";
  const res = symbolicEquivTest(ref, ["a) K/(s+1)", "b) T(s) = K/(s+1)", "(c) 1/(s+1)"]);
  assert.deepEqual(flags(res), ["match", "match", "no_match"]);
});

test("unparseable option is flagged, not crashing", () => {
  const res = symbolicEquivTest("K/(s+1)", ["K/(s+1)", "1/(s+))"]);
  assert.deepEqual(flags(res), ["match", "unparseable"]);
});

test("blank option lines are ignored", () => {
  const res = symbolicEquivTest("K/(s+1)", ["", "K/(s+1)", "   "]);
  assert.equal(res.options.length, 1);
  assert.deepEqual(flags(res), ["match"]);
});

test("bad reference returns ok:false with an error", () => {
  const res = symbolicEquivTest("K/(s+", ["K/(s+1)"]);
  assert.equal(res.ok, false);
  assert.match(res.error, /reference/i);
});

test("canonical form is reported for the reference", () => {
  const res = symbolicEquivTest("K/(s+1)", []);
  assert.equal(res.ok, true);
  assert.equal(res.canonicalFormula.replace(/\s+/g, ""), "K/(s+1)");
  assert.ok(res.canonicalLatex.includes("frac"));
});

// Regression for docs/archive/equiv-stress-findings.md: comparing the keyed reference
// against a *different* multi-symbol distractor must terminate (no multivariate-GCD
// blow-up) and verdict no_match. These hung >90s before the GCD-free equality fix.
test("termination: E21 Q2 reference vs distractor (shared denominator) → no_match, fast", () => {
  const res = symbolicEquivTest("gamma/(s^2+alpha*s+beta)*(b*s+c)/(a*s)",
    ["(gamma*s+1)/(s^2+alpha*s+beta)*(b*s+c)/(a*s)"]);
  assert.deepEqual(flags(res), ["no_match"]);
});

test("termination: E22 Q18 reference vs distractor → no_match", () => {
  const res = symbolicEquivTest("a/(b*s^2+s+a*c)", ["a*s/(b*s+1+a*c)"]);
  assert.deepEqual(flags(res), ["no_match"]);
});

test("termination: E25 Q9 reference vs distractor → no_match", () => {
  const res = symbolicEquivTest("(C1+C2)*s/((s+a)*s+(C1+C2)*(1+b*s))", ["C1*s/((s+a)*s+C1+C2)"]);
  assert.deepEqual(flags(res), ["no_match"]);
});

test("termination: E15 Q9 reference vs distractor → no_match", () => {
  const res = symbolicEquivTest(
    "b*d*(gamma*s+1)/((alpha*s+beta)*(s+a)*(s+c)+b*d*(gamma*s+1))",
    ["b*d*(gamma*s+1)/((alpha*s+beta)*(alpha*s+1)*(c*s+1)+b*d*(gamma*s+1))"]);
  assert.deepEqual(flags(res), ["no_match"]);
});

test("E22 Q18 full option set: crowns exactly the keyed answer among real distractors", () => {
  const res = symbolicEquivTest("a/(b*s^2+s+a*c)", [
    "a*s/(b*s+1+a*c)",        // wrong
    "a*c/(b*s+1)*1/s",        // wrong
    "a/(b*s^2+a*c)",          // wrong (dropped s term)
    "a/(s^2+b*s+a*c)",        // wrong (b on wrong term)
    "a/(b*s^2+s+a*c)",        // correct
  ]);
  assert.deepEqual(flags(res), ["no_match", "no_match", "no_match", "no_match", "match"]);
});

test("stripOptionLabel keeps plain expressions intact", () => {
  assert.equal(stripOptionLabel("K/(s+1)"), "K/(s+1)");
  assert.equal(stripOptionLabel("(s+1)/(s+2)"), "(s+1)/(s+2)");
  assert.equal(stripOptionLabel("a) 1/s"), "1/s");
});
