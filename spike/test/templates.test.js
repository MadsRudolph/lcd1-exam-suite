import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, TEMPLATE_GROUPS } from "../../templates.js";
import { instantiateDiagram } from "../../diagram-io.js";

const counter = () => { let k = 0; return (p) => `${p}_${k++}`; };

test("there is a healthy library (more than the original 4)", () => {
  assert.ok(TEMPLATES.length >= 12, `only ${TEMPLATES.length} templates`);
});

test("template ids are unique", () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const t of TEMPLATES) {
  test(`template '${t.id}' is well-formed`, () => {
    assert.ok(t.name && t.group, "name and group required");
    assert.ok(TEMPLATE_GROUPS.includes(t.group), `unknown group '${t.group}'`);
    const { nodes, connections } = t.state;
    assert.ok(Array.isArray(nodes) && nodes.length >= 1, "needs >=1 node");
    // every connection index is in range
    for (const c of connections) {
      assert.ok(c.from >= 0 && c.from < nodes.length, `${t.id}: bad from ${c.from}`);
      assert.ok(c.to >= 0 && c.to < nodes.length, `${t.id}: bad to ${c.to}`);
      assert.ok(["+", "-", ""].includes(c.sign), `${t.id}: bad sign '${c.sign}'`);
    }
    // exactly one input and one output is the common shape; at least one of each
    assert.ok(nodes.some((n) => n.type === "input"), `${t.id}: no input`);
    assert.ok(nodes.some((n) => n.type === "output"), `${t.id}: no output`);
  });

  test(`template '${t.id}' instantiates with unique ids`, () => {
    const { nodes, connections } = instantiateDiagram(t.state, counter());
    assert.equal(nodes.length, t.state.nodes.length);
    assert.equal(connections.length, t.state.connections.length); // no dropped (valid) conns
    const ids = [...nodes.map((n) => n.id), ...connections.map((c) => c.id)];
    assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  });
}
