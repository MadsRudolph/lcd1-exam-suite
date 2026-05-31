import { test } from "node:test";
import assert from "node:assert/strict";
import { invertX, projectX, projectY, nearestByX, nearest2D, parsePlotbox } from "../../plot-interact.js";

const box = { x: 50, y: 10, w: 400, h: 200 };

test("invertX/projectX round-trip on a linear axis", () => {
  const dx = invertX(250, box, [0, 100], false);
  assert.ok(Math.abs(dx - 50) < 1e-9, `dx ${dx}`);
  assert.ok(Math.abs(projectX(50, box, [0, 100], false) - 250) < 1e-9);
});

test("invertX/projectX round-trip on a log axis", () => {
  const dx = invertX(250, box, [0, 2], true); // mid -> 10^1 = 10
  assert.ok(Math.abs(dx - 10) < 1e-6, `dx ${dx}`);
  assert.ok(Math.abs(projectX(10, box, [0, 2], true) - 250) < 1e-6);
});

test("projectY inverts the axis (min at bottom, max at top)", () => {
  assert.ok(Math.abs(projectY(0, box, [0, 10]) - (box.y + box.h)) < 1e-9);
  assert.ok(Math.abs(projectY(10, box, [0, 10]) - box.y) < 1e-9);
});

test("nearestByX picks the closest sample", () => {
  assert.equal(nearestByX([1, 10, 100, 1000], 80), 2);
});

test("nearest2D picks the closest point", () => {
  assert.equal(nearest2D([0, 1, 2], [0, 0, 0], 1.9, 0.1), 2);
});

test("parsePlotbox parses the data-plotbox string", () => {
  assert.deepEqual(parsePlotbox("50,10,400,200"), { x: 50, y: 10, w: 400, h: 200 });
});
