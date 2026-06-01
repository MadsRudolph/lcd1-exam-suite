import { test } from "node:test";
import assert from "node:assert/strict";
import { combineTf, tfSymbols, matlabForPlot } from "../../lcd-tf-helpers.js";

test("combineTf leaves a single-atom numerator and denominator bare", () => {
  assert.equal(combineTf("K", "s"), "K/s");
  assert.equal(combineTf("12", "s"), "12/s");
});

test("combineTf parenthesizes a denominator that has any top-level operator", () => {
  assert.equal(combineTf("K", "s*(s+a)"), "K/(s*(s+a))");
  assert.equal(combineTf("12", "(s+2)*(s+3)"), "12/((s+2)*(s+3))");
  assert.equal(combineTf("1", "s^2+2*s+10"), "1/(s^2+2*s+10)");
});

test("combineTf parenthesizes an additive numerator but not a product", () => {
  assert.equal(combineTf("s+1", "s+2"), "(s+1)/(s+2)");
  assert.equal(combineTf("2*s", "s+1"), "2*s/(s+1)");
});

test("combineTf does not double-wrap an already-grouped denominator", () => {
  assert.equal(combineTf("K", "(s^2+a*s+K)"), "K/(s^2+a*s+K)");
});

test("combineTf treats a leading unary minus as a sign, not an additive split", () => {
  assert.equal(combineTf("-K", "s"), "-K/s");
});

test("tfSymbols lists parameters but never s", () => {
  assert.deepEqual(tfSymbols("K/(s*(s+a))").sort(), ["K", "a"]);
  assert.deepEqual(tfSymbols("12/((s+2)*(s+3))"), []);
});

test("matlabForPlot builds a numeric Bode snippet with the right command", () => {
  const code = matlabForPlot("12/((s+2)*(s+3))", "Bode");
  assert.match(code, /s = tf\('s'\);/);
  assert.match(code, /G = 12\/\(\(s\+2\)\*\(s\+3\)\);/);
  assert.match(code, /bode\(G\);/);
  assert.match(code, /grid on;/);
});

test("matlabForPlot converts ** to ^ and maps each tab to its command", () => {
  assert.match(matlabForPlot("1/(s**2+2*s+10)", "Step"), /G = 1\/\(s\^2\+2\*s\+10\);/);
  assert.match(matlabForPlot("1/s", "Step"), /step\(G\);/);
  assert.match(matlabForPlot("1/s", "Nyquist"), /nyquist\(G\);/);
  assert.match(matlabForPlot("1/s", "Pole-Zero"), /pzmap\(G\);/);
});

test("matlabForPlot inserts explicit * where the app allows juxtaposition (MATLAB needs it)", () => {
  // coefficient * s
  assert.match(matlabForPlot("12/(s^2+5s+6)", "Bode"), /G = 12\/\(s\^2\+5\*s\+6\);/);
  // back-to-back factors and number*paren, with spaces preserved around
  assert.match(matlabForPlot("(10)/(s^2 + 2s + 20)", "Bode"), /G = \(10\)\/\(s\^2 \+ 2\*s \+ 20\);/);
  // identifier immediately before a paren, and factor)(factor
  assert.match(matlabForPlot("s(s+2.1)", "Step"), /G = s\*\(s\+2\.1\);/);
  assert.match(matlabForPlot("12/((s+2)(s+3))", "Bode"), /G = 12\/\(\(s\+2\)\*\(s\+3\)\);/);
});

test("matlabForPlot leaves already-explicit multiplication untouched", () => {
  assert.match(matlabForPlot("12/((s+2)*(s+3))", "Bode"), /G = 12\/\(\(s\+2\)\*\(s\+3\)\);/);
  assert.match(matlabForPlot("K/(s*(s+a))", "Bode"), /G = K\/\(s\*\(s\+a\)\);/);
});

test("matlabForPlot emits a commented parameter block for symbolic TFs", () => {
  const code = matlabForPlot("K/(s*(s+a))", "Bode");
  assert.match(code, /% set your parameter values/);
  assert.match(code, /K = 1;/);
  assert.match(code, /a = 1;/);
  assert.match(code, /G = K\/\(s\*\(s\+a\)\);/);
});
