import { test } from "node:test";
import assert from "node:assert/strict";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const str = (arr) => arr.map(m => m.toString()).join(",");

test("cancels a common s factor: s(s+1) / s(s+2) -> (s+1)/(s+2)", () => {
  const num = [c(0), c(1), c(1)];   // s^2 + s
  const den = [c(0), c(2), c(1)];   // s^2 + 2s
  const r = new SymTF(num, den).simplify();
  assert.equal(str(r.num), "1,1");  // s + 1
  assert.equal(str(r.den), "2,1");  // s + 2
});

test("cancels common parameter content: 2K / (2K s + 4K) -> 1/(s+2)", () => {
  const K = MPoly.variable("K");
  const num = [c(2).mul(K)];
  const den = [c(4).mul(K), c(2).mul(K)];
  const r = new SymTF(num, den).simplify();
  assert.equal(str(r.num), "1");
  assert.equal(str(r.den), "2,1");
});

test("monic-normalises a constant-denominator result: (2s+4)/2 -> s+2", () => {
  const r = new SymTF([c(4), c(2)], [c(2)]).simplify();
  assert.equal(str(r.num), "2,1");
  assert.equal(str(r.den), "1");
});

test("clears fractional coefficients to integer-primitive: (s/2 + 1)/1 -> (s+2)/2", () => {
  // s/2 + 1 == (s + 2)/2 ; canonical form is integer-primitive (no introduced fractions),
  // so num = s + 2, den = 2 (NOT s+2 over 1 — that would change the value).
  const r = new SymTF([c(1), new MPoly(new Map([["", new Rational(1n, 2n)]]))], [c(1)]).simplify();
  assert.equal(str(r.num), "2,1");
  assert.equal(str(r.den), "2");
});
