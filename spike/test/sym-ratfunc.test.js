import { test } from "node:test";
import assert from "node:assert/strict";
import { RatFunc } from "../../symbolic/ratfunc.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K"), a = MPoly.variable("a");
const c = (n) => MPoly.constant(Rational.of(n));

test("reduces to lowest terms on construction", () => {
  // (K*a) / K  ->  a / 1
  const r = new RatFunc(K.mul(a), K);
  assert.equal(r.num.toString(), "a");
  assert.equal(r.den.toString(), "1");
  assert.equal(r.isPolynomial(), true);
});

test("add over a common denominator, then reduce", () => {
  // 1/a + 1/K = (K + a)/(aK)
  const r = new RatFunc(c(1), a).add(new RatFunc(c(1), K));
  assert.equal(r.num.toString(), "K + a");
  assert.equal(r.den.toString(), "Ka");
});

test("mul, div, neg, inverse, isZero", () => {
  const half = new RatFunc(c(1), c(2));
  assert.equal(half.mul(new RatFunc(c(4), c(1))).num.toString(), "2");
  assert.equal(new RatFunc(a, c(1)).inverse().num.toString(), "1");
  assert.equal(new RatFunc(a, c(1)).inverse().den.toString(), "a");
  assert.equal(RatFunc.ZERO.isZero(), true);
  assert.equal(new RatFunc(K, c(1)).neg().num.toString(), "-K");
});
