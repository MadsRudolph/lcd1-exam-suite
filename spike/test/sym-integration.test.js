import { test } from "node:test";
import assert from "node:assert/strict";
import { transferFunction, loopGain } from "../../solver.js";

function loop() {
  const nodes = [
    { id: "R", type: "input",  value: "1",       label: "R", x: 0, y: 0 },
    { id: "S", type: "sum",    value: "",        label: "S", x: 0, y: 0 },
    { id: "G", type: "block",  value: "K/(s+1)", label: "G", x: 0, y: 0 },
    { id: "H", type: "block",  value: "2",       label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y", type: "output", value: "1",       label: "Y", x: 0, y: 0 },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "fb", fromNode: "H", toNode: "S", sign: "-" },
  ];
  return { nodes, conns };
}

test("symbolic closed loop renders the collected simplified TF", () => {
  const { nodes, conns } = loop();
  const r = transferFunction(nodes, conns, "R", "Y");
  assert.equal(r.finalTransferFunction.toKaTeX(), "\\frac{K}{s + 2K + 1}");
  assert.equal(r.finalTransferFunction.toFormulaString(), "K / (s + 2K + 1)");
  assert.ok(r.symtf, "exposes the SymTF for loopGain");
});

test("symbolic open-loop L(s) = GH = 2K/(s+1), simplified", () => {
  const { nodes, conns } = loop();
  const r = loopGain(nodes, conns, "fb");
  assert.equal(r.finalTransferFunction.toFormulaString(), "2K / (s + 1)");
});

test("symbolic disturbance Y/D is simplified with a parenthesized numerator", () => {
  // R -> S1(+) -> G -> S2(+) -> Y ; D -> S2(+) ; feedback S2 -> H -> S1(-)
  // G = K/(s+1), H = 1.  Y/D should be a proper fraction with a multi-term numerator.
  const nodes = [
    { id: "R",  type: "input",       value: "1",       label: "R", x:0,y:0 },
    { id: "D",  type: "disturbance", value: "1",       label: "D", x:0,y:0 },
    { id: "S1", type: "sum",         value: "",        label: "S1", x:0,y:0 },
    { id: "G",  type: "block",       value: "K/(s+1)", label: "G", x:0,y:0 },
    { id: "S2", type: "sum",         value: "",        label: "S2", x:0,y:0 },
    { id: "H",  type: "block",       value: "1",       label: "H", direction:"left", x:0,y:0 },
    { id: "Y",  type: "output",      value: "1",       label: "Y", x:0,y:0 },
  ];
  const conns = [
    { id:"c1", fromNode:"R",  toNode:"S1", sign:"+" },
    { id:"c2", fromNode:"S1", toNode:"G",  sign:"" },
    { id:"c3", fromNode:"G",  toNode:"S2", sign:"+" },
    { id:"c4", fromNode:"S2", toNode:"Y",  sign:"" },
    { id:"c5", fromNode:"D",  toNode:"S2", sign:"+" },
    { id:"c6", fromNode:"S2", toNode:"H",  sign:"" },
    { id:"c7", fromNode:"H",  toNode:"S1", sign:"-" },
  ];
  const r = transferFunction(nodes, conns, "D", "Y");
  const f = r.finalTransferFunction.toFormulaString();
  // must be a single proper fraction, numerator parenthesized (multi-term), not "s + ... / (...)"
  assert.ok(/^\(.*\) \/ \(.*\)$/.test(f), `expected parenthesized proper fraction, got: ${f}`);
  // and it must NOT start with a bare s-term before the slash
  assert.ok(!/^s [+-] /.test(f), `numerator not grouped: ${f}`);
});
