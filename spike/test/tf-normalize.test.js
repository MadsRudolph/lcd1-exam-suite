// The System box should forgive how a TF is actually typed/pasted: a leading
// "G(s) =" label, unicode minus / ×, superscripts (s²) and a ^ for power, so it
// compiles instead of throwing "unexpected character".
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTfInput, analyzeNumeric } from "../../lcd-engine.js";

test("normalizeTfInput cleans the common ways a TF gets typed", () => {
  assert.equal(normalizeTfInput("G(s) = 12/((s+2)(s+3))"), "12/((s+2)(s+3))");
  assert.equal(normalizeTfInput("1/(s−1)"), "1/(s-1)"); // unicode minus
  assert.equal(normalizeTfInput("12/(s²+5s+6)"), "12/(s**2+5s+6)"); // superscript
  assert.equal(normalizeTfInput("(s+2)×(s+3)"), "(s+2)*(s+3)"); // unicode ×
  assert.equal(normalizeTfInput("12/（s+2）"), "12/(s+2)"); // fullwidth parens
  assert.equal(normalizeTfInput("12/((s+2)*(s+3))"), "12/((s+2)*(s+3))"); // clean input untouched
});

test("previously-failing inputs now parse to the same G(s)", () => {
  const want = "12 / (s^2 + 5s + 6)";
  for (const src of ["G(s) = 12/((s+2)(s+3))", "12/(s²+5s+6)", "12/（(s+2)×(s+3)）"]) {
    const a = analyzeNumeric(src);
    assert.ok(!a.error, `${src} should not error`);
    assert.equal(a.interpreted, want, src);
  }
});

test("a caret power and unicode minus both compile", () => {
  assert.equal(analyzeNumeric("1/(s+1)^3").interpreted, "1 / (s^3 + 3s^2 + 3s + 1)");
  assert.ok(!analyzeNumeric("1/(s−1)").error);
});
