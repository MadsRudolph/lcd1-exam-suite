import { test } from "node:test";
import assert from "node:assert/strict";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K"), a = MPoly.variable("a"), b = MPoly.variable("b");
const c = (n) => MPoly.constant(Rational.of(n));

test("gcd of constants is 1", () => {
  assert.equal(MPoly.gcd(c(4), c(6)).toString(), "1");
});

test("monomial content: gcd(K*a + 2K, K) = K", () => {
  const A = K.mul(a).add(c(2).mul(K));
  assert.equal(MPoly.gcd(A, K).toString(), "K");
});

test("common linear factor: gcd(K(a+b), a+b) = a+b", () => {
  const ab = a.add(b);
  const A = K.mul(ab);
  // normalised monic (lex-leading coeff 1); a+b already has leading coeff 1
  assert.equal(MPoly.gcd(A, ab).equals(ab), true);
});

test("coprime: gcd(a+1, a+2) = 1", () => {
  assert.equal(MPoly.gcd(a.add(c(1)), a.add(c(2))).toString(), "1");
});

test("shared factor across two vars: gcd((a+b)(a+1), (a+b)(a+2)) = a+b", () => {
  const ab = a.add(b);
  const A = ab.mul(a.add(c(1)));
  const B = ab.mul(a.add(c(2)));
  assert.equal(MPoly.gcd(A, B).equals(ab), true);
});

test("gcd with zero returns the other (normalised)", () => {
  assert.equal(MPoly.gcd(MPoly.ZERO, K).toString(), "K");
});
