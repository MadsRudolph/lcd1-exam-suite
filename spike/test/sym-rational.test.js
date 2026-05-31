import { test } from "node:test";
import assert from "node:assert/strict";
import { Rational } from "../../symbolic/rational.js";

test("normalises sign and reduces", () => {
  const r = new Rational(2n, -4n);
  assert.equal(r.num, -1n);
  assert.equal(r.den, 2n);
  assert.equal(r.toString(), "-1/2");
});

test("integer prints without denominator", () => {
  assert.equal(new Rational(6n, 3n).toString(), "2");
});

test("arithmetic is exact", () => {
  const a = new Rational(1n, 3n), b = new Rational(1n, 6n);
  assert.equal(a.add(b).toString(), "1/2");
  assert.equal(a.sub(b).toString(), "1/6");
  assert.equal(a.mul(b).toString(), "1/18");
  assert.equal(a.div(b).toString(), "2");
  assert.equal(a.neg().toString(), "-1/3");
});

test("zero/one and equality", () => {
  assert.equal(Rational.ZERO.isZero(), true);
  assert.equal(Rational.ONE.isOne(), true);
  assert.equal(new Rational(0n, 5n).isZero(), true);
  assert.equal(new Rational(3n, 6n).equals(new Rational(1n, 2n)), true);
  assert.throws(() => new Rational(1n, 0n));
  assert.throws(() => Rational.ONE.div(Rational.ZERO));
});

test("parse integers, fractions, decimals", () => {
  assert.equal(Rational.parse("3").toString(), "3");
  assert.equal(Rational.parse("-7").toString(), "-7");
  assert.equal(Rational.parse("0.5").toString(), "1/2");
  assert.equal(Rational.parse("2/8").toString(), "1/4");
});
