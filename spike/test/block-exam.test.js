// Real LCD1 exam block-diagram problems reconstructed and checked against the
// official answers. Transfer-function equality uses the CAS cross-multiplication
// zero-test, so factored vs expanded answers still match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { solveBlockDiagram } from "../../solver.js";
import { analyzeDiagram } from "../../analysis.js";
import { parseExprToTF } from "../../symbolic/parse-expr.js";

const N = (id, type, value, label, extra = {}) => ({ id, type, value, label, x: 0, y: 0, ...extra });
const C = (id, from, to, sign = "") => ({ id, fromNode: from, toNode: to, sign });

// Algebraic equality of a computed SymTF against an expected expression string.
function assertTF(mySymtf, expected, label) {
  assert.ok(mySymtf, `${label}: no symbolic TF produced`);
  const ref = parseExprToTF(expected.replace(/\*\*/g, "^"));
  assert.ok(ref.sub(mySymtf).isZero(), `${label}: not equivalent to ${expected}`);
}

// F22 Q1 — nested inner loop + parallel C+D + two outer feedbacks.
test("F22 Q1: Y/R = ABE^2(C+D)/{...}", () => {
  const nodes = [N("R", "input", "1", "R"), N("s1", "sum", "", "s1"), N("s2", "sum", "", "s2"),
    N("A", "block", "A", "A"), N("B", "block", "B", "B"), N("s3", "sum", "", "s3"),
    N("Cc", "block", "C", "C"), N("Dd", "block", "D", "D"), N("s4", "sum", "", "s4"),
    N("E", "block", "E", "E"), N("Y", "output", "1", "Y"),
    N("H1", "block", "H1", "H1", { direction: "left" }), N("H2", "block", "H2", "H2", { direction: "left" })];
  const conns = [C("r", "R", "s1", "+"), C("a", "s1", "s2", "+"), C("b", "s2", "A"), C("c", "A", "B"),
    C("d", "B", "s2", "-"), C("e", "B", "s3", "+"), C("f", "s3", "Cc"), C("g", "s3", "Dd"),
    C("h", "Cc", "s4", "+"), C("i", "Dd", "s4", "+"), C("j", "s4", "E"), C("k", "E", "Y"),
    C("l", "Y", "H2"), C("m", "H2", "s3", "-"), C("n", "s4", "H1"), C("o", "H1", "s1", "-")];
  assertTF(solveBlockDiagram(nodes, conns).symtf,
    "A*B*E^2*(C+D) / ((1+A*B)*(1+(C+D)*E*H2)*E + A*B*E*(C+D)*H1)", "Y/R");
});

// ReExam F22 Q3 — POSITIVE feedback with parallel G3+G4.
test("ReExam F22 Q3: y/u = G1G2/(1 - G2(G3+G4))", () => {
  const nodes = [N("u", "input", "1", "u"), N("G1", "block", "G1", "G1"), N("s1", "sum", "", "s1"),
    N("G2", "block", "G2", "G2"), N("y", "output", "1", "y"),
    N("G3", "block", "G3", "G3", { direction: "left" }), N("G4", "block", "G4", "G4", { direction: "left" }),
    N("s2", "sum", "", "s2")];
  const conns = [C("a", "u", "G1"), C("b", "G1", "s1", "+"), C("c", "s1", "G2"), C("d", "G2", "y"),
    C("e", "y", "G3"), C("f", "y", "G4"), C("g", "G3", "s2", "+"), C("h", "G4", "s2", "+"),
    C("i", "s2", "s1", "+")];
  assertTF(solveBlockDiagram(nodes, conns).symtf, "G1*G2/(1 - G2*(G3+G4))", "y/u");
});

// E22 Figure 1 — nested loops: open-loop, type and order.
test("E22 Fig 1: G_open=2K/((s+1)(s+a)), Type 0, Order 2", () => {
  const nodes = [N("R", "input", "1", "R"), N("s1", "sum", "", "s1"), N("g1", "block", "K/(s+1)", "G1"),
    N("s2", "sum", "", "s2"), N("g2", "block", "1/s", "G2"), N("a", "block", "a", "a", { direction: "left" }),
    N("two", "block", "2", "2", { direction: "left" }), N("D", "disturbance", "1", "d"), N("Y", "output", "1", "Y")];
  const conns = [C("c1", "R", "s1", "+"), C("c2", "two", "s1", "-"), C("c3", "s1", "g1"), C("c4", "g1", "s2", "+"),
    C("c5", "D", "s2", "+"), C("c6", "a", "s2", "-"), C("c7", "s2", "g2"), C("c8", "g2", "Y"),
    C("c9", "g2", "a"), C("c10", "g2", "two")];
  const a = analyzeDiagram(nodes, conns);
  assertTF(a.openLoop.symtf, "2*K/((s+1)*(s+a))", "G_open");
  assert.equal(a.char.symType, 0, "type");
  assert.equal(a.char.symOrder, 2, "order");
});

// E23 Q1-4 — parallel controller C1(1+C2), sensor H.
test("E23: G_cl, G_open, Type 1, Order 3 (parallel controller)", () => {
  const mk = (c1, c2, g, h) => ({
    nodes: [N("R", "input", "1", "R"), N("s1", "sum", "", "s1"), N("C1", "block", c1, "C1"),
      N("C2", "block", c2, "C2"), N("s2", "sum", "", "s2"), N("G", "block", g, "G"),
      N("Y", "output", "1", "Y"), N("H", "block", h, "H", { direction: "left" })],
    conns: [C("r", "R", "s1", "+"), C("a", "s1", "C1"), C("b", "C1", "s2", "+"), C("c", "C1", "C2"),
      C("d", "C2", "s2", "+"), C("e", "s2", "G"), C("f", "G", "Y"), C("g", "Y", "H"), C("h", "H", "s1", "-")],
  });
  const d = mk("C1", "C2", "G", "H");
  assertTF(solveBlockDiagram(d.nodes, d.conns).symtf, "C1*(1+C2)*G/(1 + C1*(1+C2)*G*H)", "G_cl");
  assertTF(analyzeDiagram(d.nodes, d.conns).openLoop.symtf, "C1*(1+C2)*G*H", "G_open");

  // Concrete defs: C1=K1, C2=K2/s, G=k/(t s+1), H=1/(th s+1) -> Type 1, Order 3.
  const dc = mk("K1", "K2/s", "k/(t*s+1)", "1/(th*s+1)");
  const ac = analyzeDiagram(dc.nodes, dc.conns);
  assert.equal(ac.char.symType, 1, "type");
  assert.equal(ac.char.symOrder, 3, "order");
});

// Test Exam E25 — numeric: type and steady-state error to a step.
test("Test E25: Type 1, e_r,ss(step)=0 (K=1)", () => {
  const nodes = [N("R", "input", "1", "R"), N("s1", "sum", "", "s1"), N("K", "block", "1", "C"),
    N("G1", "block", "(s+5)/(s^2+2s+10)", "G1"), N("s2", "sum", "", "s2"),
    N("G2", "block", "2/s", "G2"), N("D", "disturbance", "1", "d"), N("Y", "output", "1", "Y"),
    N("H", "block", "0.1", "H", { direction: "left" })];
  const conns = [C("r", "R", "s1", "+"), C("a", "s1", "K"), C("b", "K", "G1"), C("c", "G1", "s2", "+"),
    C("d", "D", "s2", "+"), C("e", "s2", "G2"), C("f", "G2", "Y"), C("g", "Y", "H"), C("h", "H", "s1", "-")];
  const a = analyzeDiagram(nodes, conns);
  assert.equal(a.char.type, 1, "type");
  assert.equal(a.ess.reference.step.type, "zero", "e_r,ss step");
});

// Undated — parallel feedforward G1 || (G2 loop), G3 at output.
test("Undated: Y/U = (G1G3+G2G3)/(1+G2G3G4)", () => {
  const nodes = [N("U", "input", "1", "U"), N("G1", "block", "G1", "G1"), N("s1", "sum", "", "s1"),
    N("G2", "block", "G2", "G2"), N("s2", "sum", "", "s2"), N("G3", "block", "G3", "G3"),
    N("Y", "output", "1", "Y"), N("G4", "block", "G4", "G4", { direction: "left" })];
  const conns = [C("a", "U", "G1"), C("b", "G1", "s2", "+"), C("c", "U", "s1", "+"), C("d", "s1", "G2"),
    C("e", "G2", "s2", "+"), C("f", "s2", "G3"), C("g", "G3", "Y"), C("h", "Y", "G4"), C("i", "G4", "s1", "-")];
  assertTF(solveBlockDiagram(nodes, conns).symtf, "(G1*G3 + G2*G3)/(1 + G2*G3*G4)", "Y/U");
});
