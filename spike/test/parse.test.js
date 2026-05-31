// Tests for parse_tf: string expression in s -> NumericTF (num/den float coeffs).
// Mirrors lcd_solver/tf_input.parse_tf. Coefficients are highest-degree-first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxAbs } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";

function coeffsClose(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg} length`);
  actual.forEach((c, i) => approxAbs(c, expected[i], 1e-9, `${msg}[${i}]`));
}

test("simple proper TF 12/((s+2)*(s+3))", () => {
  const G = parseTf("12/((s+2)*(s+3))");
  coeffsClose(G.num, [12], "num");
  coeffsClose(G.den, [1, 5, 6], "den"); // s^2+5s+6
});

test("(s+1)**3 expands", () => {
  const G = parseTf("1/(s+1)**3");
  coeffsClose(G.den, [1, 3, 3, 1], "den");
});

test("decimal coefficients 900/((0.25*s+1)*(s**2+50*s+3000))", () => {
  const G = parseTf("900/((0.25*s+1)*(s**2+50*s+3000))");
  coeffsClose(G.num, [900], "num");
  coeffsClose(G.den, [0.25, 13.5, 800, 3000], "den");
});

test("RHP and integrator: 1/(s*(s+2.1))", () => {
  const G = parseTf("1 / (s*(s+2.1))");
  coeffsClose(G.den, [1, 2.1, 0], "den");
});

test("numerator polynomial 5*(s+4)", () => {
  const G = parseTf("5*(s+4) / (s**2 * (s+1) * (s+20))");
  coeffsClose(G.num, [5, 20], "num");
  coeffsClose(G.den, [1, 21, 20, 0, 0], "den"); // s^2(s+1)(s+20)
});

test("unary minus and subtraction (s-2)/(1+s)**2", () => {
  const G = parseTf("(s-2)/(1+s)**2");
  coeffsClose(G.num, [1, -2], "num");
  coeffsClose(G.den, [1, 2, 1], "den");
});

test("rejects unknown symbols", () => {
  assert.throws(() => parseTf("K/(s+1)"));
});
