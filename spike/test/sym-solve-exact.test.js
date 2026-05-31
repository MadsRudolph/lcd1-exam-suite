import { test } from "node:test";
import assert from "node:assert/strict";
import { solveExact } from "../../symbolic/solve-exact.js";

const str = (tf) => `${tf.num.map(m => m.toString()).join(",")} | ${tf.den.map(m => m.toString()).join(",")}`;

test("K/(s+1) with feedback H=2 -> K/(s+1+2K)", () => {
  const nodes = [
    { id: "R", type: "input",  value: "1",       label: "R" },
    { id: "S", type: "sum",    value: "",        label: "S" },
    { id: "G", type: "block",  value: "K/(s+1)", label: "G" },
    { id: "H", type: "block",  value: "2",       label: "H", direction: "left" },
    { id: "Y", type: "output", value: "1",       label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "c5", fromNode: "H", toNode: "S", sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  assert.equal(str(r), "K | 2K + 1,1");          // K / (s + (1+2K))
});

test("the spec example -> K/(s^2+(a+1)s+a+2K)", () => {
  const nodes = [
    { id: "R",  type: "input",  value: "1",       label: "R" },
    { id: "S",  type: "sum",    value: "",        label: "S" },
    { id: "A",  type: "block",  value: "1/s",     label: "A" },
    { id: "B",  type: "block",  value: "K/(s+1)", label: "B" },
    { id: "M2", type: "block",  value: "2",       label: "M2", direction: "left" },
    { id: "Ma", type: "block",  value: "a",       label: "Ma", direction: "left" },
    { id: "Y",  type: "output", value: "1",       label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R",  toNode: "S",  sign: "+" },
    { id: "c2", fromNode: "S",  toNode: "A",  sign: "" },
    { id: "c3", fromNode: "A",  toNode: "B",  sign: "" },
    { id: "c4", fromNode: "B",  toNode: "Y",  sign: "" },
    { id: "c5", fromNode: "B",  toNode: "M2", sign: "" },
    { id: "c6", fromNode: "M2", toNode: "S",  sign: "-" },
    { id: "c7", fromNode: "A",  toNode: "Ma", sign: "" },
    { id: "c8", fromNode: "Ma", toNode: "S",  sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  assert.equal(str(r), "K | 2K + a,a + 1,1");    // K / (s^2 + (a+1)s + (a+2K))
});

test("opaque blocks G,H -> G/(GH+1)", () => {
  const nodes = [
    { id: "R", type: "input",  value: "1", label: "R" },
    { id: "S", type: "sum",    value: "",  label: "S" },
    { id: "G", type: "block",  value: "G", label: "G" },
    { id: "H", type: "block",  value: "H", label: "H", direction: "left" },
    { id: "Y", type: "output", value: "1", label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "c5", fromNode: "H", toNode: "S", sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  // G / (GH + 1) — den is degree 0 in s (single MPoly element)
  assert.equal(r.num.map(m => m.toString()).join(","), "G");
  assert.equal(r.den.map(m => m.toString()).join(","), "GH + 1");
});

test("rejects a source node as the sink", () => {
  const nodes = [
    { id: "R", type: "input",  value: "1", label: "R" },
    { id: "G", type: "block",  value: "G", label: "G" },
    { id: "Y", type: "output", value: "1", label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "G", sign: "" },
    { id: "c2", fromNode: "G", toNode: "Y", sign: "" },
  ];
  assert.throws(() => solveExact(nodes, conns, "R", "R"), /Sink must be an output/);
});
