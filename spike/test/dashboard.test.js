import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel } from "../lib/assert.js";
import { analyzeNumeric, formatTf } from "../../lcd-engine.js";

test("formatTf expands a factored TF to a polynomial ratio", () => {
  assert.equal(formatTf([12], [1, 5, 6]).replace(/\s+/g, ""), "12/(s^2+5s+6)");
});

test("analyzeNumeric of 12/((s+2)(s+3)): DC gain 2 / 6.02 dB, type 0, order 2", () => {
  const a = analyzeNumeric("12/((s+2)*(s+3))");
  approxRel(a.dcGain, 2, 1e-9, "dc");
  approxRel(a.dcGain_dB, 6.0206, 1e-3, "dc dB");
  assert.equal(a.type, 0);
  assert.equal(a.order, 2);
  assert.equal(a.poles, "-3, -2");
  assert.equal(a.stable, true);
});

test("analyzeNumeric margins of 1/(s*(s+2.1)) at unit gain are finite PM", () => {
  const a = analyzeNumeric("1/(s*(s+2.1))");
  assert.equal(a.type, 1);
  assert.ok(a.margins && Number.isFinite(a.margins.PM_deg), "PM finite");
});

test("analyzeNumeric is null-safe field-by-field (improper TF doesn't throw)", () => {
  const a = analyzeNumeric("s^3/(s+1)");
  assert.ok(a.error == null, "no top-level error");
  assert.equal(typeof a, "object");
});

test("formatTf parenthesizes a multi-term numerator", () => {
  assert.equal(formatTf([1, -1], [1, 0, -4]).replace(/\s+/g, ""), "(s-1)/(s^2-4)");
});

test("formatTf leaves a single-term numerator/denominator bare", () => {
  assert.equal(formatTf([1], [1, 0]).replace(/\s+/g, ""), "1/s");
});

test("analyzeNumeric of an integrator 1/s: DC gain and final value are Infinity", () => {
  const a = analyzeNumeric("1/s");
  assert.equal(a.dcGain, Infinity);
  assert.equal(a.finalValue, Infinity);
  assert.equal(a.type, 1);
});
