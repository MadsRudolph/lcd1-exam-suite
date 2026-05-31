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
