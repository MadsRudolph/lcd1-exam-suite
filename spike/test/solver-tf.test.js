import { test } from "node:test";
import assert from "node:assert/strict";
import { transferFunction, solveBlockDiagram } from "../../solver.js";

// Coefficient arrays are ascending power: [c0, c1, c2] == c0 + c1*s + c2*s^2.
function approxCoeffs(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg}: length ${actual} vs ${expected}`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9, `${msg}: coeff[${i}] ${actual[i]} vs ${expected[i]}`);
  }
}

// Standard single loop: R -> S1(+) -> G -> S2(+) -> Y, feedback H from S2 back to S1(-),
// disturbance D injected at S2(+). G = 10/(s^2+2s), H = 2.
function standardLoopWithDisturbance() {
  const nodes = [
    { id: "R",  type: "input",       value: "1",            label: "R", x: 0, y: 0 },
    { id: "D",  type: "disturbance", value: "1",            label: "D", x: 0, y: 0 },
    { id: "S1", type: "sum",         value: "",             label: "S1", x: 0, y: 0 },
    { id: "G",  type: "block",       value: "10/(s^2+2s)",  label: "G", x: 0, y: 0 },
    { id: "S2", type: "sum",         value: "",             label: "S2", x: 0, y: 0 },
    { id: "H",  type: "block",       value: "2",            label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y",  type: "output",      value: "1",            label: "Y", x: 0, y: 0 },
  ];
  const connections = [
    { id: "c1", fromNode: "R",  toNode: "S1", sign: "+" },
    { id: "c2", fromNode: "S1", toNode: "G",  sign: "" },
    { id: "c3", fromNode: "G",  toNode: "S2", sign: "+" },
    { id: "c4", fromNode: "S2", toNode: "Y",  sign: "" },
    { id: "c5", fromNode: "D",  toNode: "S2", sign: "+" },
    { id: "c6", fromNode: "S2", toNode: "H",  sign: "" },
    { id: "c7", fromNode: "H",  toNode: "S1", sign: "-" },
  ];
  return { nodes, connections };
}

test("R -> Y is the closed loop G/(1+GH) = 10/(s^2+2s+20)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = transferFunction(nodes, connections, "R", "Y");
  approxCoeffs(r.tf.num.coeffs, [10], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});

test("D -> Y is 1/(1+GH) scaled = (s^2+2s)/(s^2+2s+20)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = transferFunction(nodes, connections, "D", "Y");
  approxCoeffs(r.tf.num.coeffs, [0, 2, 1], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});

test("a disturbance with no path to the sink gives TF = 0", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  nodes.push({ id: "D2", type: "disturbance", value: "1", label: "D2", x: 0, y: 0 });
  const r = transferFunction(nodes, connections, "D2", "Y");
  approxCoeffs(r.tf.num.coeffs, [0], "num");
});

test("solveBlockDiagram defaults to first input -> first output (regression)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = solveBlockDiagram(nodes, connections);
  approxCoeffs(r.tf.num.coeffs, [10], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});
