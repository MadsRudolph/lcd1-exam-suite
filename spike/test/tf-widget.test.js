import { test } from "node:test";
import assert from "node:assert/strict";
import { combineTf, tfSymbols, matlabForPlot, matlabTimeResponse, matlabLinearize, matlabParamStability } from "../../lcd-tf-helpers.js";

test("matlabTimeResponse builds Y=G*U with ilaplace and value theorems", () => {
  const code = matlabTimeResponse("5/(s+1)", "custom", "2/(s+3)");
  assert.match(code, /G = 5\/\(s\+1\);/);
  assert.match(code, /U = 2\/\(s\+3\);/);
  assert.match(code, /ilaplace\(Y, s, t\)/);
  assert.match(code, /limit\(s\*Y, s, 0\)/);
});

test("matlabLinearize preserves function calls (sqrt not corrupted) and substitutes the point", () => {
  const code = matlabLinearize("(a*0.056*sqrt(300000-1600*w) - 0.12*w)/0.23", "w", "a", "w=62.83, a=0.3");
  assert.match(code, /sqrt\(300000-1600\*w\)/);   // sqrt( not turned into sqrt*(
  assert.doesNotMatch(code, /sqrt\*\(/);
  assert.match(code, /diff\(f, w\)/);
  assert.match(code, /\[w a\], \[62\.83 0\.3\]/);
});

test("matlabParamStability emits charpoly + eig stability region for a state matrix", () => {
  const code = matlabParamStability("[-1 1; 2 -w]", "w");
  assert.match(code, /A = \[-1 1; 2 -w\];/);
  assert.match(code, /charpoly\(A, s\)/);
  assert.match(code, /real\(eig\(A\)\) < 0, w/);
});

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

test("matlabForPlot Bode: margins to the terminal, legend explains the dashed lines", () => {
  const code = matlabForPlot("12/((s+2)*(s+3))", "Bode");
  assert.match(code, /s = tf\('s'\);/);
  assert.match(code, /G = 12\/\(\(s\+2\)\*\(s\+3\)\);/);
  assert.match(code, /bode\(G\);/);
  assert.match(code, /\[Gm, Pm, Wpc, Wgc\] = margin\(G\);/);
  assert.match(code, /bandwidth\(G\)/);
  assert.match(code, /grid on;/);
  assert.match(code, /fprintf\(/);                       // numbers printed to the terminal
  assert.match(code, /legend\(\[h1 h2\]/);               // legend built from the dashed-line handles
  assert.match(code, /gain crossover/);                  // legend explains what a line is
});

test("matlabForPlot opens a fresh figure per tab so pasted plots don't overwrite each other", () => {
  for (const tab of ["Step", "Bode", "Nyquist", "Pole-Zero"]) {
    const code = matlabForPlot("1/s", tab);
    assert.match(code, /figure;/, `${tab} opens a figure`);
    // figure must come before the plotting command
    assert.ok(code.indexOf("figure;") < code.search(/step\(G\)|bode\(G\)|nyquist\(G\)|pzmap\(G\)/), `${tab} figure precedes the plot`);
  }
});

test("matlabForPlot prints the read-outs to the terminal on every tab", () => {
  assert.match(matlabForPlot("1/s", "Step"), /fprintf\(/);
  assert.match(matlabForPlot("1/s", "Bode"), /fprintf\(/);
  assert.match(matlabForPlot("1/s", "Nyquist"), /fprintf\(/);
  assert.match(matlabForPlot("1/s", "Pole-Zero"), /disp\(/);
});

test("matlabForPlot gives every tab a legend that explains its reference line/marker", () => {
  assert.match(matlabForPlot("1/s", "Step"), /legend\(.*\n?.*'final value'|legend\(\[h1 h2\]/);
  assert.match(matlabForPlot("1/s", "Nyquist"), /-1 critical point/);
  assert.match(matlabForPlot("1/s", "Pole-Zero"), /stability boundary/);
  for (const tab of ["Step", "Bode", "Nyquist", "Pole-Zero"]) {
    assert.match(matlabForPlot("1/s", tab), /legend\(/, `${tab} has a legend`);
  }
});

test("matlabForPlot converts ** to ^ and maps each tab to its analysis block", () => {
  assert.match(matlabForPlot("1/(s**2+2*s+10)", "Step"), /G = 1\/\(s\^2\+2\*s\+10\);/);
  // Step → response + transient metrics
  const step = matlabForPlot("1/s", "Step");
  assert.match(step, /step\(G\);/);
  assert.match(step, /stepinfo\(G\)/);
  // Nyquist → plot + margins
  const nyq = matlabForPlot("1/s", "Nyquist");
  assert.match(nyq, /nyquist\(G\);/);
  assert.match(nyq, /margin\(G\)/);
  // Pole-Zero → pzmap with the s-plane grid
  const pz = matlabForPlot("1/s", "Pole-Zero");
  assert.match(pz, /pzmap\(G\);/);
  assert.match(pz, /sgrid;/);
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
