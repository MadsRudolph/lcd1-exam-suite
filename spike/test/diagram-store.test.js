import { test } from "node:test";
import assert from "node:assert/strict";
import { createDiagramStore, STORE_KEY } from "../../diagram-store.js";

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _raw: m,
  };
}
const st = (label) => ({ version: 1, nodes: [{ type: "block", x: 0, y: 0, value: "G", label }], connections: [] });

test("save a new diagram and read it back", () => {
  const store = createDiagramStore(memStorage());
  const id = store.save("My loop", st("G"), 1000);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "My loop");
  assert.equal(store.get(id).state.nodes[0].label, "G");
});

test("saving the same name overwrites in place (no duplicate)", () => {
  const store = createDiagramStore(memStorage());
  const id1 = store.save("Loop", st("G1"), 1000);
  const id2 = store.save("Loop", st("G2"), 2000);
  assert.equal(id1, id2);
  assert.equal(store.list().length, 1);
  assert.equal(store.get(id1).state.nodes[0].label, "G2");
  assert.equal(store.get(id1).savedAt, 2000);
});

test("different names accumulate; list is newest-first", () => {
  const store = createDiagramStore(memStorage());
  store.save("A", st("a"), 1000);
  store.save("B", st("b"), 3000);
  store.save("C", st("c"), 2000);
  assert.deepEqual(store.list().map((d) => d.name), ["B", "C", "A"]);
});

test("blank name falls back to 'Untitled'", () => {
  const store = createDiagramStore(memStorage());
  const id = store.save("   ", st("x"), 1000);
  assert.equal(store.get(id).name, "Untitled");
});

test("rename and remove", () => {
  const store = createDiagramStore(memStorage());
  const id = store.save("old", st("x"), 1000);
  assert.equal(store.rename(id, "new"), true);
  assert.equal(store.get(id).name, "new");
  assert.equal(store.remove(id), true);
  assert.equal(store.get(id), null);
  assert.equal(store.list().length, 0);
  assert.equal(store.rename("nope", "x"), false);
  assert.equal(store.remove("nope"), false);
});

test("corrupt storage value is tolerated (returns empty list)", () => {
  const storage = memStorage();
  storage.setItem(STORE_KEY, "{not json");
  const store = createDiagramStore(storage);
  assert.deepEqual(store.list(), []);
  const id = store.save("fresh", st("x"), 1000);
  assert.equal(store.get(id).name, "fresh");
});
