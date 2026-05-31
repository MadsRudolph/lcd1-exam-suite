import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSymTF } from "../../symbolic/render.js";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const K = MPoly.variable("K"), a = MPoly.variable("a");

test("spec example renders collected with grouped s coefficient", () => {
  // K / (s^2 + (a+1)s + (a+2K)). MPoly.toString uses the algebraic (ASCII) monomial
  // order — uppercase K before lowercase a — so the constant coefficient renders
  // "2K + a" (mathematically identical to a+2K) and the s^1 coefficient "a + 1".
  const num = [K];
  const den = [a.add(c(2).mul(K)), a.add(c(1)), c(1)];
  const r = renderSymTF(new SymTF(num, den));
  assert.equal(r.toFormulaString(), "K / (s^2 + (a + 1)s + 2K + a)");
  assert.equal(r.toKaTeX(), "\\frac{K}{s^2 + (a + 1)s + 2K + a}");
});

test("constant denominator renders as bare numerator", () => {
  const r = renderSymTF(new SymTF([c(2), c(1)], [c(1)]));   // s + 2
  assert.equal(r.toFormulaString(), "s + 2");
  assert.equal(r.toKaTeX(), "s + 2");
});

test("unit leading coefficient on s is omitted; constant shown", () => {
  const r = renderSymTF(new SymTF([c(2), c(3), c(1)], [c(1)])); // s^2 + 3s + 2
  assert.equal(r.toFormulaString(), "s^2 + 3s + 2");
});

test("negative multi-term coefficient keeps its internal signs inside parens", () => {
  const negA1 = a.neg().add(c(1));                       // -a + 1
  const r = renderSymTF(new SymTF([K], [c(1), negA1]));  // K / ((-a+1)s + 1)
  assert.equal(r.toFormulaString(), "K / ((-a + 1)s + 1)");
  assert.equal(r.toKaTeX(), "\\frac{K}{(-a + 1)s + 1}");
});

test("negative single coefficients render -s and -3", () => {
  assert.equal(renderSymTF(new SymTF([MPoly.ZERO, c(-1)], [c(1)])).toFormulaString(), "-s");
  assert.equal(renderSymTF(new SymTF([c(-3)], [c(1)])).toFormulaString(), "-3");
});

test("third polynomial also renders in KaTeX", () => {
  const r = renderSymTF(new SymTF([c(2), c(3), c(1)], [c(1)])); // s^2 + 3s + 2
  assert.equal(r.toKaTeX(), "s^2 + 3s + 2");
});

test("multi-term numerator over a real denominator is parenthesized in formula text", () => {
  // (s+1)/(s+2) — numerator is a sum, must be wrapped in toFormulaString
  const r = renderSymTF(new SymTF([c(1), c(1)], [c(2), c(1)]));
  assert.equal(r.toFormulaString(), "(s + 1) / (s + 2)");
  assert.equal(r.toKaTeX(), "\\frac{s + 1}{s + 2}");  // KaTeX needs no parens
});

test("single-term numerator is NOT parenthesized", () => {
  const r = renderSymTF(new SymTF([K], [c(1), c(2), c(1)]));  // K/(s^2+2s+1)
  assert.equal(r.toFormulaString(), "K / (s^2 + 2s + 1)");
});

test("multi-term-MPoly single-power numerator is parenthesized", () => {
  // (2K + a)/(s+1) — numerator is one s-power but a multi-term coefficient
  const r = renderSymTF(new SymTF([c(2).mul(K).add(a)], [c(1), c(1)]));
  assert.equal(r.toFormulaString(), "(2K + a) / (s + 1)");
});
