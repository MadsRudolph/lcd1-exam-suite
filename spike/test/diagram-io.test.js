import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeDiagram, instantiateDiagram, DIAGRAM_VERSION } from "../../diagram-io.js";

const counter = () => { let k = 0; return (p) => `${p}_${k++}`; };

test("instantiate then serialize round-trips a state", () => {
  const state = {
    version: 1,
    nodes: [
      { type: "input", x: 80, y: 200, value: "1", label: "R" },
      { type: "block", x: 350, y: 200, value: "10/(s^2+2s)", label: "G" },
      { type: "block", x: 350, y: 320, value: "2", label: "H", direction: "left" },
      { type: "output", x: 580, y: 200, value: "1", label: "Y" },
    ],
    connections: [
      { from: 0, to: 1, sign: "+" },
      { from: 1, to: 3, sign: "" },
      { from: 1, to: 2, sign: "" },
      { from: 2, to: 0, sign: "-" },
    ],
  };
  const { nodes, connections } = instantiateDiagram(state, counter());
  const back = serializeDiagram(nodes, connections);
  assert.equal(back.version, DIAGRAM_VERSION);
  assert.deepEqual(back.nodes, state.nodes);
  assert.deepEqual(back.connections, state.connections);
});

test("instantiate maps connection indices to fresh node ids", () => {
  const state = { nodes: [{ type: "input", x: 0, y: 0, value: "1", label: "R" },
                          { type: "output", x: 1, y: 0, value: "1", label: "Y" }],
                  connections: [{ from: 0, to: 1, sign: "" }] };
  const { nodes, connections } = instantiateDiagram(state, counter());
  assert.equal(connections[0].fromNode, nodes[0].id);
  assert.equal(connections[0].toNode, nodes[1].id);
  assert.notEqual(nodes[0].id, nodes[1].id);
});

test("direction 'right' / absent is not serialized; 'left' is", () => {
  const nodes = [
    { id: "a", type: "block", x: 1, y: 2, value: "G", label: "G" },               // no direction
    { id: "b", type: "block", x: 3, y: 4, value: "H", label: "H", direction: "right" },
    { id: "c", type: "block", x: 5, y: 6, value: "K", label: "K", direction: "left" },
  ];
  const s = serializeDiagram(nodes, []);
  assert.ok(!("direction" in s.nodes[0]));
  assert.ok(!("direction" in s.nodes[1]));
  assert.equal(s.nodes[2].direction, "left");
});

test("dangling connections (bad index) are dropped on instantiate", () => {
  const state = { nodes: [{ type: "block", x: 0, y: 0, value: "G", label: "G" }],
                  connections: [{ from: 0, to: 9, sign: "" }, { from: 0, to: 0, sign: "" }] };
  const { connections } = instantiateDiagram(state, counter());
  // to:9 dropped; the self-loop to:0 survives index validity (topology guard is the canvas's job)
  assert.equal(connections.length, 1);
});

test("invalid state throws a clear error", () => {
  assert.throws(() => instantiateDiagram(null, counter()), /invalid diagram state/);
  assert.throws(() => instantiateDiagram({}, counter()), /invalid diagram state/);
});

test("x/y are rounded on serialize", () => {
  const s = serializeDiagram([{ id: "a", type: "block", x: 80.6, y: 199.4, value: "G", label: "G" }], []);
  assert.equal(s.nodes[0].x, 81);
  assert.equal(s.nodes[0].y, 199);
});
