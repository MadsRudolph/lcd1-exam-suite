import { test } from "node:test";
import assert from "node:assert/strict";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K");
const a = MPoly.variable("a");
const two = MPoly.constant(Rational.of(2));

test("constant / variable / zero", () => {
  assert.equal(MPoly.ZERO.isZero(), true);
  assert.equal(two.isConstant(), true);
  assert.equal(K.isConstant(), false);
  assert.equal(two.constantValue().toString(), "2");
});

test("add / sub / mul / neg, with collection", () => {
  assert.equal(K.add(K).toString(), "2K");
  assert.equal(a.add(MPoly.ONE).toString(), "a + 1");          // a + 1
  assert.equal(two.mul(K).toString(), "2K");
  assert.equal(K.mul(a).toString(), "Ka");                      // K^1 a^1
  assert.equal(K.mul(K).toString(), "K^2");
  assert.equal(a.sub(a).isZero(), true);
  assert.equal(K.neg().toString(), "-K");
});

test("equality ignores term order", () => {
  assert.equal(K.add(a).equals(a.add(K)), true);
});

test("exact division: divisible returns quotient", () => {
  // (K*a + 2K) / K = a + 2
  const num = K.mul(a).add(two.mul(K));
  const q = num.divideExact(K);
  assert.equal(q.toString(), "a + 2");
});

test("exact division: not divisible returns null", () => {
  assert.equal(a.add(MPoly.ONE).divideExact(K), null);
});
