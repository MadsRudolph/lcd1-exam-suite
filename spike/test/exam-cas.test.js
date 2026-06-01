// Acceptance tests derived from real LCD1 past-exam questions
// (docs/archive/cas-engine-requirements.md §3). Each row that can be faithfully
// reconstructed from its "Given" column is asserted two ways:
//   1. symbolic — the CAS result is algebraically equal to the exam answer key
//      (N1·D2 − N2·D1 ≡ 0, via SymTF.sub().simplify().isZero());
//   2. oracle  — with integers substituted for every symbol, the CAS result and
//      the keyed answer agree through the INDEPENDENT numeric engine
//      (spike/numeric/parse.js), guarding against a systematic CAS bug.
// Rows whose wiring is not determinable from the one-line spec are listed in
// exam-cas-gaps and skipped (they need the figure / PDF).
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseExprToTF } from "../../symbolic/parse-expr.js";
import { series, parallel, feedback, loopGain } from "../../symbolic/combinators.js";
import { order, systemType, staticGain } from "../../symbolic/analysis.js";
import { essStep, essRamp, essDisturbanceStep, limitAtZero } from "../../symbolic/ess.js";
import { solveForSymbol } from "../../symbolic/solve-symbol.js";
import { linearizeFirstOrder } from "../../symbolic/linearize.js";
import { RatFunc } from "../../symbolic/ratfunc.js";
import { parseTf } from "../numeric/parse.js";

// ---- helpers ----------------------------------------------------------------
const tf = (s) => parseExprToTF(s);
const ratOf = (s) => { const t = tf(s); return new RatFunc(t.num[0], t.den[0]); };

// symbolic equality of a SymTF result against an expected key string
function symEqual(result, expected) {
  return result.sub(tf(expected)).simplify().isZero();
}
const assertSym = (result, expected, msg) =>
  assert.ok(symEqual(result, expected), `${msg || "symbolic"}: ${render(result)} ≠ ${expected}`);

function render(symtf) {
  return `[${symtf.num.map((m) => m.toString())}]/[${symtf.den.map((m) => m.toString())}]`;
}

// numeric oracle: substitute integers, compare CAS result vs keyed string via
// the independent spike parser (cross-multiply equality a/b == c/d ⟺ ad == bc)
function evalCoeffs(arr, subst) {
  return arr.map((m) => { const r = m.evalAt(subst); return Number(r.num) / Number(r.den); }).reverse();
}
function evalSymTF(symtf, subst) {
  const g = symtf.simplify();
  return { num: evalCoeffs(g.num, subst), den: evalCoeffs(g.den, subst) };
}
function substInto(str, subst) {
  let out = str;
  for (const name of Object.keys(subst).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${name}\\b`, "g"), `(${subst[name]})`);
  }
  return out;
}
function polyMulF(a, b) {
  const o = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) o[i + j] += a[i] * b[j];
  return o;
}
function polyEqualF(L, R) {
  const n = Math.max(L.length, R.length);
  let scale = 1;
  for (let i = 0; i < n; i++) { const v = Math.abs(L[n - 1 - i] || 0); if (v > 1e-9) { scale = v; break; } }
  for (let i = 0; i < n; i++) {
    const a = L[L.length - 1 - i] || 0, b = R[R.length - 1 - i] || 0;
    if (Math.abs(a - b) > 1e-6 * (1 + scale)) return false;
  }
  return true;
}
function assertOracle(result, expected, subst, msg) {
  const A = evalSymTF(result, subst);
  const B = parseTf(substInto(expected, subst));
  const L = polyMulF(A.num, B.den), R = polyMulF(B.num, A.den);
  assert.ok(polyEqualF(L, R), `${msg || "oracle"}: substituted CAS result disagrees with numeric engine`);
}

// ============================================================================
// A. Symbolic block-diagram reduction
// ============================================================================
test("A · E22 Q5 — series K/(s+1)·2/(s+a) = 2K/((s+1)(s+a))", () => {
  const G = series(tf("K/(s+1)"), tf("2/(s+a)"));
  assertSym(G, "2*K/((s+1)*(s+a))");
  assertOracle(G, "2*K/((s+1)*(s+a))", { K: 3, a: 5 });
});

test("A · E23 Q1 — open loop C1(1+C2)·G·H (series)", () => {
  const Gopen = series(series(tf("C1*(1+C2)"), tf("G")), tf("H"));
  assertSym(Gopen, "C1*(1+C2)*G*H");
  assertOracle(Gopen, "C1*(1+C2)*G*H", { C1: 2, C2: 3, G: 5, H: 7 });
});

test("A · E23 Q2 — closed loop C1(1+C2)G/(1+C1(1+C2)GH)", () => {
  const F = series(tf("C1*(1+C2)"), tf("G"));
  const T = feedback(F, tf("H"));
  assertSym(T, "C1*(1+C2)*G/(1+C1*(1+C2)*G*H)");
  assertOracle(T, "C1*(1+C2)*G/(1+C1*(1+C2)*G*H)", { C1: 2, C2: 3, G: 5, H: 7 });
});

test("A · E25 Q7 — open loop (C1+C2)·1/(s+a)·1/s·(1+bs) (series)", () => {
  const Gopen = series(series(series(tf("C1+C2"), tf("1/(s+a)")), tf("1/s")), tf("1+b*s"));
  assertSym(Gopen, "(C1+C2)*(1+b*s)/((s+a)*s)");
  assertOracle(Gopen, "(C1+C2)*(1+b*s)/((s+a)*s)", { C1: 2, C2: 3, a: 5, b: 7 });
});

test("A · E22 Q18 — Fig-6 loop a/(b s²+s), unity feedback c → a/(b s²+s+a c)", () => {
  const T = feedback(tf("a/(b*s^2+s)"), tf("c"));
  assertSym(T, "a/(b*s^2+s+a*c)");
  assertOracle(T, "a/(b*s^2+s+a*c)", { a: 3, b: 5, c: 7 });
});

test("A · E15 Q7 — open loop b·d·(γs+δ)·1/(αs+β)·1/(s+a)·1/(s+c) (series)", () => {
  const Gopen = series(
    series(series(tf("b*d"), tf("gamma*s+delta")), tf("1/(alpha*s+beta)")),
    series(tf("1/(s+a)"), tf("1/(s+c)")),
  );
  assertSym(Gopen, "b*d*(gamma*s+delta)/((alpha*s+beta)*(s+a)*(s+c))");
  assertOracle(Gopen, "b*d*(gamma*s+delta)/((alpha*s+beta)*(s+a)*(s+c))",
    { b: 2, d: 3, gamma: 5, delta: 7, alpha: 11, beta: 13, a: 17, c: 19 });
});

test("A · E15 Q9 — same, closed, δ=1: bd(γs+1)/((αs+β)(s+a)(s+c)+bd(γs+1))", () => {
  const open = series(
    series(series(tf("b*d"), tf("gamma*s+1")), tf("1/(alpha*s+beta)")),
    series(tf("1/(s+a)"), tf("1/(s+c)")),
  );
  const T = feedback(open); // unity feedback
  assertSym(T, "b*d*(gamma*s+1)/((alpha*s+beta)*(s+a)*(s+c)+b*d*(gamma*s+1))");
  assertOracle(T, "b*d*(gamma*s+1)/((alpha*s+beta)*(s+a)*(s+c)+b*d*(gamma*s+1))",
    { b: 2, d: 3, gamma: 5, alpha: 11, beta: 13, a: 17, c: 19 });
});

// ============================================================================
// B. Type / order / static loop gain
// ============================================================================
test("B · E20 Q4 — K3/(s+K3)·(K1 s+K2)/s : order 2, type 1", () => {
  const G = series(tf("K3/(s+K3)"), tf("(K1*s+K2)/s"));
  assert.equal(order(G), 2);
  assert.equal(systemType(G), 1);
});

test("B · E21 Q14 — Kp·b·c/(s(τs+1)) : K0 = Kp·b·c, type 1", () => {
  const L = tf("Kp*b*c/(s*(tau*s+1))");
  assert.equal(systemType(L), 1);
  assert.ok(staticGain(L).equals(ratOf("Kp*b*c")), `K0 = ${staticGain(L).num.toString()}/${staticGain(L).den.toString()}`);
});

test("B · E25-Test Q1 — (s+5)/(s²+2s+10)·(2K/s)·0.1 : K0 = 0.1K, type 1", () => {
  const L = series(series(tf("(s+5)/(s^2+2*s+10)"), tf("2*K/s")), tf("0.1"));
  assert.equal(systemType(L), 1);
  assert.ok(staticGain(L).equals(ratOf("K/10")), `K0 = ${staticGain(L).num.toString()}/${staticGain(L).den.toString()}`);
});

// ============================================================================
// C. Symbolic steady-state error (reference and disturbance)
// ============================================================================
test("C · E25 Q10 — G=k(s+b)/(s²+cs+1), fb a, step at r : e_rss = 1/(1+kab)", () => {
  const L = tf("a*k*(s+b)/(s^2+c*s+1)"); // loop gain with feedback gain a
  assert.ok(essStep(L).equals(ratOf("1/(1+k*a*b)")), `e_rss = ${essStep(L).num}/${essStep(L).den}`);
});

test("C · E23 Q18 — type-0, loop gain a, step at r : e_rss = 1/(1+a)", () => {
  const L = tf("a");
  assert.ok(essStep(L).equals(ratOf("1/(1+a)")));
});

test("C · E23 Q19 — disturbance sensitivity 1/(1+L) at DC = 1/(1+a)", () => {
  const S0 = limitAtZero(tf("1").div(tf("1").add(tf("a"))));
  assert.ok(S0.equals(ratOf("1/(1+a)")));
});

test("C · E25 Q11 — step at d (Gd=a) : e_dss = −a/(1+kab)", () => {
  const L = tf("a*k*(s+b)/(s^2+c*s+1)");
  const e = essDisturbanceStep({ Gd: tf("a"), L });
  assert.ok(e.equals(ratOf("-a/(1+k*a*b)")), `e_dss = ${e.num}/${e.den}`);
});

test("C · E15 Q17 — step at d with an integrator in the loop : e_dss = 0", () => {
  const L = tf("a/s");          // type-1 loop → disturbance rejected at DC
  const e = essDisturbanceStep({ Gd: tf("1"), L });
  assert.ok(e.isZero ? e.isZero() : (e !== Infinity && e.isZero()), `e_dss = ${e}`);
});

test("C · ramp ess on a type-1 loop : 1/Kv (Kv = K0)", () => {
  const L = tf("Kp*b*c/(s*(tau*s+1))");
  assert.ok(essRamp(L).equals(ratOf("1/(Kp*b*c)")), `e_ramp = ${essRamp(L).num}/${essRamp(L).den}`);
});

// ============================================================================
// D. Solve-for-a-symbol
// ============================================================================
test("D · E23 Q20 — a/(1+a) = 2/3 → a = 2", () => {
  const { value } = solveForSymbol("a/(1+a) = 2/3", "a");
  assert.ok(value.equals(ratOf("2")), `a = ${value.num}/${value.den}`);
});

test("D · S21P2 Q19 — 1/(1+0.4 K1)=0.4 → K1=3.75 ; 1/(1+0.24 K2)=0.05 → K2≈79.17", () => {
  const k1 = solveForSymbol("1/(1+0.4*K1) = 0.4", "K1");
  assert.ok(k1.value.equals(ratOf("3.75")), `K1 = ${k1.exact}`);
  const k2 = solveForSymbol("1/(1+0.6*K2*0.4) = 0.05", "K2");
  assert.equal(Number(k2.exact), 79.1667); // 79.1666… ; exposes nested-ess bug B6 (12.67)
});

// ============================================================================
// E. Linearization → TF  (mechanism; the exact exam ODEs are not in the doc)
// ============================================================================
test("E · linearize ẋ = c·b·u − a·x → G = c·b/(s+a)  (E22 Q1 form)", () => {
  const G = linearizeFirstOrder({ f: "c*b*u - a*x", stateVar: "x", inputVar: "u", point: { x: 0, u: 0 } });
  assertSym(G, "c*b/(s+a)");
  assertOracle(G, "c*b/(s+a)", { c: 3, b: 5, a: 7 });
});

test("E · linearize a nonlinear plant ẋ = b·u² − a·x at ū=2 → G = 4b/(s+a)", () => {
  const G = linearizeFirstOrder({ f: "b*u^2 - a*x", stateVar: "x", inputVar: "u", point: { x: 0, u: 2 } });
  assertSym(G, "4*b/(s+a)"); // ∂f/∂u = 2bu → 4b at ū=2
  assertOracle(G, "4*b/(s+a)", { a: 7, b: 5 });
});
