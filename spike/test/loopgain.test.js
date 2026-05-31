import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEndpoints, loopGain } from "../../solver.js";

function approxCoeffs(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg}: length ${actual} vs ${expected}`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9, `${msg}: coeff[${i}] ${actual[i]} vs ${expected[i]}`);
  }
}

// Simple negative-feedback loop: R -> S(+) -> G -> Y, feedback H from G back to S(-).
// G = 10/(s^2+2s), H = 2.  Feedback wire (H -> S) has id "fb".
function simpleLoop() {
  const nodes = [
    { id: "R", type: "input",  value: "1",           label: "R", x: 0, y: 0 },
    { id: "S", type: "sum",    value: "",            label: "S", x: 0, y: 0 },
    { id: "G", type: "block",  value: "10/(s^2+2s)", label: "G", x: 0, y: 0 },
    { id: "H", type: "block",  value: "2",           label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y", type: "output", value: "1",           label: "Y", x: 0, y: 0 },
  ];
  const connections = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "fb", fromNode: "H", toNode: "S", sign: "-" },
  ];
  return { nodes, connections };
}

test("collectEndpoints lists input+disturbance as sources, output as sinks", () => {
  const nodes = [
    { id: "R",  type: "input",       label: "R" },
    { id: "D",  type: "disturbance", label: "D" },
    { id: "G",  type: "block",       label: "G" },
    { id: "Y1", type: "output",      label: "Y1" },
    { id: "Y2", type: "output",      label: "Y2" },
  ];
  const { sources, sinks } = collectEndpoints(nodes);
  assert.deepEqual(sources.map(s => s.id), ["R", "D"]);
  assert.deepEqual(sinks.map(s => s.id), ["Y1", "Y2"]);
});

test("breaking the feedback wire gives the loop gain L = GH = 20/(s^2+2s)", () => {
  const { nodes, connections } = simpleLoop();
  const r = loopGain(nodes, connections, "fb");
  approxCoeffs(r.tf.num.coeffs, [20], "num");
  approxCoeffs(r.tf.den.coeffs, [0, 2, 1], "den");
});

test("breaking a non-loop forward wire gives L = 0", () => {
  const { nodes, connections } = simpleLoop();
  const r = loopGain(nodes, connections, "c3"); // G -> Y is not part of a loop
  approxCoeffs(r.tf.num.coeffs, [0], "num");
});

// Symbolic loop: blocks carry letters (G, H) so the solver stays symbolic (tf === null).
function symbolicLoop() {
  const nodes = [
    { id: "R", type: "input",  value: "1", label: "R", x: 0, y: 0 },
    { id: "S", type: "sum",    value: "",  label: "S", x: 0, y: 0 },
    { id: "G", type: "block",  value: "G", label: "G", x: 0, y: 0 },
    { id: "H", type: "block",  value: "H", label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y", type: "output", value: "1", label: "Y", x: 0, y: 0 },
  ];
  const connections = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "fb", fromNode: "H", toNode: "S", sign: "-" },
  ];
  return { nodes, connections };
}

test("symbolic loop gain has no double-negative", () => {
  const { nodes, connections } = symbolicLoop();
  const r = loopGain(nodes, connections, "fb");
  assert.equal(r.tf, null);
  const f = r.finalTransferFunction.toFormulaString();
  assert.ok(!f.includes("-(-"), `unexpected double negative: ${f}`);
  assert.ok(!/^-\(?0\)?$/.test(f.trim()), `unexpected -(0): ${f}`);
});

test("symbolic non-loop forward wire renders L = 0 without a leading minus", () => {
  const { nodes, connections } = symbolicLoop();
  const r = loopGain(nodes, connections, "c3"); // G -> Y is not part of a loop
  assert.equal(r.tf, null);
  const f = r.finalTransferFunction.toFormulaString();
  const k = r.finalTransferFunction.toKaTeX();
  assert.equal(f.trim(), "0");
  assert.equal(k.trim(), "0");
});
