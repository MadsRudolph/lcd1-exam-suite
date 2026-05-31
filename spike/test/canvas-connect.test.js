import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPortConnection } from "../../canvas.js";

// The wiring rule that governs both port-to-port wires and take-off branches
// dragged off an existing wire (a branch always carries an output signal).

test("output -> input is accepted (both drag directions)", () => {
  assert.equal(isValidPortConnection("A", "out", "B", "in"), true);
  assert.equal(isValidPortConnection("A", "in", "B", "out"), true);
});

test("output -> output is rejected", () => {
  assert.equal(isValidPortConnection("A", "out", "B", "out"), false);
});

test("input -> input is rejected", () => {
  assert.equal(isValidPortConnection("A", "in", "B", "in"), false);
});

test("a port cannot connect to its own node", () => {
  assert.equal(isValidPortConnection("A", "out", "A", "in"), false);
});

test("a missing target node is rejected", () => {
  assert.equal(isValidPortConnection("A", "out", null, "in"), false);
  assert.equal(isValidPortConnection("A", "out", undefined, "in"), false);
});

// A branch dragged off a wire carries an output signal, so it follows the same
// rule: only valid when dropped on an input port of a different node.
test("take-off branch (output signal) only lands on an input", () => {
  assert.equal(isValidPortConnection("src", "out", "block", "in"), true);
  assert.equal(isValidPortConnection("src", "out", "otherBlock", "out"), false);
});
