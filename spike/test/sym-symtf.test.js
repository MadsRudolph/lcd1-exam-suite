import { test } from "node:test";
import assert from "node:assert/strict";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const K = MPoly.variable("K");
// helper: build SymTF from coefficient arrays of plain numbers
const tf = (num, den) => new SymTF(num.map(c), den.map(c));

test("add: 1/s + 1/s = 2/s (before simplify)", () => {
  const r = tf([1], [0, 1]).add(tf([1], [0, 1]));
  // (s + s) / (s*s) = 2s / s^2  (raw, unsimplified)
  assert.equal(r.num.map(m => m.toString()).join(","), "0,2");
  assert.equal(r.den.map(m => m.toString()).join(","), "0,0,1");
});

test("mul: (1/s)*(K/(s+1)) numerator/denominator", () => {
  const A = new SymTF([c(1)], [c(0), c(1)]);           // 1/s
  const B = new SymTF([K], [c(1), c(1)]);              // K/(s+1)
  const r = A.mul(B);
  assert.equal(r.num.map(m => m.toString()).join(","), "K");          // K
  assert.equal(r.den.map(m => m.toString()).join(","), "0,1,1");      // s + s^2
});

test("neg and constants", () => {
  const r = tf([3], [1]).neg();
  assert.equal(r.num[0].toString(), "-3");
  assert.equal(SymTF.zero().isZero(), true);
  assert.equal(SymTF.one().num[0].toString(), "1");
});
