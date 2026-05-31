import { test } from "node:test";
import assert from "node:assert/strict";
import { screenToWorld, zoomAroundPoint, fitBox } from "../../canvas.js";

test("screenToWorld maps a screen pixel into the viewBox world", () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const vb = { x: 100, y: 50, w: 400, h: 300 };
  const c = screenToWorld(400, 300, rect, vb);
  assert.ok(Math.abs(c.x - 300) < 1e-9, `x ${c.x}`);
  assert.ok(Math.abs(c.y - 200) < 1e-9, `y ${c.y}`);
});

test("zoomAroundPoint keeps the world point under the cursor fixed", () => {
  const vb = { x: 0, y: 0, w: 800, h: 600 };
  const pt = { x: 200, y: 150 };
  const out = zoomAroundPoint(vb, pt, 0.5, {});
  const fx = (pt.x - out.x) / out.w, fy = (pt.y - out.y) / out.h;
  assert.ok(Math.abs(fx - 200 / 800) < 1e-9, `fx ${fx}`);
  assert.ok(Math.abs(fy - 150 / 600) < 1e-9, `fy ${fy}`);
  assert.ok(Math.abs(out.w - 400) < 1e-9, "width halved");
  assert.ok(Math.abs(out.h / out.w - 600 / 800) < 1e-9, "aspect preserved");
});

test("zoomAroundPoint respects the width clamp", () => {
  const vb = { x: 0, y: 0, w: 800, h: 600 };
  const out = zoomAroundPoint(vb, { x: 0, y: 0 }, 0.01, { minW: 100, maxW: 8000 });
  assert.equal(out.w, 100, "clamped to minW");
});

test("fitBox encloses all nodes with padding; null when empty", () => {
  assert.equal(fitBox([], 50), null);
  const b = fitBox([{ x: 100, y: 100 }, { x: 300, y: 200 }], 50);
  assert.deepEqual(b, { x: 50, y: 50, w: 300, h: 200 });
});
