// Steady-state error computed straight from a drawn block diagram
// (analyzeDiagram -> ess). Covers unity/non-unity feedback, Types 0/1/2,
// step/ramp/parabola references and step disturbances, numeric and symbolic,
// plus the LCD1 lecture's exact worked disturbance example.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDiagram } from "../../analysis.js";

const N = (id, type, value, label, extra = {}) => ({ id, type, value, label, x: 0, y: 0, ...extra });
const C = (id, from, to, sign = "") => ({ id, fromNode: from, toNode: to, sign });
const ess = (nodes, conns) => analyzeDiagram(nodes, conns).ess;

// Assert a steady-state-error value against an expectation.
//   expect: {type:"zero"} | {type:"infinite"} | {value:Number} | {formula:String}
function expectEss(got, expect, label) {
  if ("type" in expect && expect.type === "infinite") {
    assert.equal(got.type, "infinite", `${label}: expected infinite, got ${got.formula}`);
  } else if ("type" in expect && expect.type === "zero") {
    const ok = got.type === "zero" || (got.type === "finite" && Math.abs(parseFloat(got.formula)) < 1e-9);
    assert.ok(ok, `${label}: expected 0, got ${got.formula} (${got.type})`);
  } else if ("value" in expect) {
    assert.equal(got.type, "finite", `${label}: expected finite ${expect.value}, got ${got.type}`);
    assert.ok(Math.abs(parseFloat(got.formula) - expect.value) < 1e-4, `${label}: got ${got.formula}, want ${expect.value}`);
  } else {
    assert.equal(got.type, "finite", `${label}: expected ${expect.formula}, got ${got.type}`);
    assert.equal(got.formula.replace(/\s/g, ""), expect.formula.replace(/\s/g, ""), label);
  }
}

// ---- diagram builders ----
const unityFb = (gExpr) => ({
  nodes: [N("R", "input", "1", "R"), N("s1", "sum", "", "E"), N("G", "block", gExpr, "G"), N("Y", "output", "1", "Y")],
  conns: [C("c1", "R", "s1", "+"), C("c2", "s1", "G"), C("c3", "G", "Y"), C("c4", "Y", "s1", "-")],
});
const nonUnityFb = (gExpr, hExpr) => ({
  nodes: [N("R", "input", "1", "R"), N("s1", "sum", "", "E"), N("G", "block", gExpr, "G"),
          N("H", "block", hExpr, "H", { direction: "left" }), N("Y", "output", "1", "Y")],
  conns: [C("c1", "R", "s1", "+"), C("c2", "s1", "G"), C("c3", "G", "Y"), C("c4", "Y", "H"), C("c5", "H", "s1", "-")],
});
const distPlantInput = (cExpr, gExpr) => ({
  nodes: [N("R", "input", "1", "R"), N("s1", "sum", "", "E"), N("C", "block", cExpr, "C"),
          N("s2", "sum", "", "S2"), N("G", "block", gExpr, "G"),
          N("D", "disturbance", "1", "D"), N("Y", "output", "1", "Y")],
  conns: [C("c1", "R", "s1", "+"), C("c2", "s1", "C"), C("c3", "C", "s2", "+"),
          C("c4", "D", "s2", "+"), C("c5", "s2", "G"), C("c6", "G", "Y"), C("c7", "Y", "s1", "-")],
});
const figure1 = (g1, g2, aExpr, hExpr) => ({
  nodes: [N("R", "input", "1", "R"), N("s1", "sum", "", "E"), N("g1", "block", g1, "G1"),
          N("s2", "sum", "", "S2"), N("g2", "block", g2, "G2"),
          N("a", "block", aExpr, "a", { direction: "left" }), N("two", "block", hExpr, "2", { direction: "left" }),
          N("D", "disturbance", "1", "D"), N("Y", "output", "1", "Y")],
  conns: [C("c1", "R", "s1", "+"), C("c2", "two", "s1", "-"), C("c3", "s1", "g1"), C("c4", "g1", "s2", "+"),
          C("c5", "D", "s2", "+"), C("c6", "a", "s2", "-"), C("c7", "s2", "g2"), C("c8", "g2", "Y"),
          C("c9", "g2", "a"), C("c10", "g2", "two")],
});

// ---- numeric ----
test("unity fb Type 0  G=5/(s+2): step=1/(1+Kp), ramp=inf", () => {
  const d = unityFb("5/(s+2)"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { value: 1 / 3.5 }, "step");
  expectEss(e.reference.ramp, { type: "infinite" }, "ramp");
});

test("unity fb Type 1  G=10/(s^2+3s): step=0, ramp=3/10, parabola=inf", () => {
  const d = unityFb("10/(s^2+3s)"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { type: "zero" }, "step");
  expectEss(e.reference.ramp, { value: 0.3 }, "ramp");
  expectEss(e.reference.parabola, { type: "infinite" }, "parabola");
});

test("unity fb Type 2  G=8/s^2: step=0, ramp=0, parabola=1/8", () => {
  const d = unityFb("8/(s^2)"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { type: "zero" }, "step");
  expectEss(e.reference.ramp, { type: "zero" }, "ramp");
  expectEss(e.reference.parabola, { value: 0.125 }, "parabola");
});

test("non-unity fb  G=4/(s+1), H=2: step=1/(1+Kp)=1/9", () => {
  const d = nonUnityFb("4/(s+1)", "2"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { value: 1 / 9 }, "step");
});

test("disturbance at plant input  C=4, G=1/(s+1): e_d=-1/(1+4)", () => {
  const d = distPlantInput("4", "1/(s+1)"), e = ess(d.nodes, d.conns);
  expectEss(e.disturbances[0].step, { value: -0.2 }, "e_d step");
});

test("numeric Figure 1 (K=10,a=3): step=3/23, ramp=inf, e_d=-2/23", () => {
  const d = figure1("10/(s+1)", "1/s", "3", "2"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { value: 3 / 23 }, "ref step");
  expectEss(e.reference.ramp, { type: "infinite" }, "ref ramp");
  expectEss(e.disturbances[0].step, { value: -2 / 23 }, "e_d step");
});

// ---- symbolic ----
test("symbolic unity fb  G=K/(s(s+a)): step=0, ramp=a/K", () => {
  const d = unityFb("K/(s*(s+a))"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { type: "zero" }, "step");
  expectEss(e.reference.ramp, { formula: "a / (K)" }, "ramp");
});

test("symbolic unity fb Type 0  G=K/((s+1)(s+b)): step=b/(K+b)", () => {
  const d = unityFb("K/((s+1)*(s+b))"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { formula: "b / (K + b)" }, "step");
});

test("symbolic disturbance at plant input  C=Kp, G=1/(s+1): e_d=-1/(Kp+1)", () => {
  const d = distPlantInput("Kp", "1/(s+1)"), e = ess(d.nodes, d.conns);
  expectEss(e.disturbances[0].step, { formula: "-1 / (Kp + 1)" }, "e_d step");
});

test("symbolic Figure 1 (E22): ref step=a/(2K+a), ramp=inf, e_d=-2/(2K+a)", () => {
  const d = figure1("K/(s+1)", "1/s", "a", "2"), e = ess(d.nodes, d.conns);
  expectEss(e.reference.step, { formula: "a / (2K + a)" }, "ref step");
  expectEss(e.reference.ramp, { type: "infinite" }, "ref ramp");
  expectEss(e.disturbances[0].step, { formula: "-2 / (2K + a)" }, "e_d step");
});

// ---- the LCD1 lecture's worked disturbance example ----
// Forward: Kp -> (+d1) -> K1/(t1 s+1) -> (+d2) -> K2/s -> (+d3) -> Y
// Sensor:  Y -> 1/(tm s+1) -> (+dm) -> comparator(-)
// Slide answers: e_r=0, e_d1=-1/Kp, e_d2=-1/(Kp K1), e_d3=0, e_dm=0
test("LCD1 lecture disturbance example reproduces all slide answers", () => {
  const nodes = [
    N("R", "input", "1", "R"), N("s1", "sum", "", "E"), N("Kp", "block", "Kp", "Kp"),
    N("sd1", "sum", "", "Sd1"), N("P1", "block", "K1/(t1*s+1)", "P1"),
    N("sd2", "sum", "", "Sd2"), N("P2", "block", "K2/s", "P2"),
    N("sd3", "sum", "", "Sd3"), N("Y", "output", "1", "Y"),
    N("H", "block", "1/(tm*s+1)", "H", { direction: "left" }), N("sdm", "sum", "", "Sdm"),
    N("d1", "disturbance", "1", "d1"), N("d2", "disturbance", "1", "d2"),
    N("d3", "disturbance", "1", "d3"), N("dm", "disturbance", "1", "dm"),
  ];
  const conns = [
    C("r", "R", "s1", "+"), C("e", "s1", "Kp"), C("a", "Kp", "sd1", "+"), C("d1c", "d1", "sd1", "+"),
    C("b", "sd1", "P1"), C("c", "P1", "sd2", "+"), C("d2c", "d2", "sd2", "+"), C("d", "sd2", "P2"),
    C("e2", "P2", "sd3", "+"), C("d3c", "d3", "sd3", "+"), C("f", "sd3", "Y"),
    C("g", "Y", "H"), C("h", "H", "sdm", "+"), C("dmc", "dm", "sdm", "+"), C("i", "sdm", "s1", "-"),
  ];
  const e = ess(nodes, conns);
  const byLabel = Object.fromEntries(e.disturbances.map((d) => [d.label, d.step]));
  expectEss(e.reference.step, { type: "zero" }, "e_r,ss");
  expectEss(byLabel.d1, { formula: "-1 / (Kp)" }, "e_d1,ss");
  expectEss(byLabel.d2, { formula: "-1 / (K1 Kp)" }, "e_d2,ss");
  expectEss(byLabel.d3, { type: "zero" }, "e_d3,ss");
  expectEss(byLabel.dm, { type: "zero" }, "e_dm,ss");
});
