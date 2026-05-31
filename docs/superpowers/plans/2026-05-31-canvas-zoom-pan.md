# Infinite Zoom/Pan Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Block Diagram canvas an effectively infinite, zoomable surface — wheel zoom toward the cursor, drag empty space to pan, and +/−/Reset/Fit controls.

**Architecture:** Introduce a `viewBox` over world space on the existing `<svg id="diagram-svg">`. `getMouseCoords` converts screen→world through it, so every existing handler keeps working in world coordinates. Pure view math (`screenToWorld`/`zoomAroundPoint`/`fitBox`) is extracted from `canvas.js` and unit-tested; the DOM/gesture wiring uses it.

**Tech Stack:** Pure ES modules, zero new deps. `node --test` (run from `spike/`). esbuild bundle (`npm run build`). Electron app — gesture wiring verified in-app.

**Conventions:** Windows-first, `PAGER=cat`. Commits read like a human wrote them — NO AI attribution. `bundle.js` is gitignored; rebuild with `npm run build`.

---

## File structure

| File | Responsibility |
|---|---|
| `canvas.js` (modify) | viewBox state + render + world coords + wheel/pan gestures + zoom methods; export pure helpers |
| `spike/test/canvas-view.test.js` (create) | unit tests for the pure view helpers |
| `index.html` (modify) | the +/−/Reset/Fit controls strip over the canvas |
| `app.js` (modify) | wire the controls to the canvas methods |

---

## Task 1: Pure view helpers

**Files:**
- Modify: `canvas.js` (add three exported functions near the top, beside `isValidPortConnection`)
- Test: `spike/test/canvas-view.test.js`

- [ ] **Step 1: Write the failing test**

```js
// spike/test/canvas-view.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenToWorld, zoomAroundPoint, fitBox } from "../../canvas.js";

test("screenToWorld maps a screen pixel into the viewBox world", () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };
  const vb = { x: 100, y: 50, w: 400, h: 300 }; // zoomed/panned
  // centre of the element -> centre of the viewBox
  const c = screenToWorld(400, 300, rect, vb);
  assert.ok(Math.abs(c.x - 300) < 1e-9, `x ${c.x}`);
  assert.ok(Math.abs(c.y - 200) < 1e-9, `y ${c.y}`);
});

test("zoomAroundPoint keeps the world point under the cursor fixed", () => {
  const vb = { x: 0, y: 0, w: 800, h: 600 };
  const pt = { x: 200, y: 150 };
  const out = zoomAroundPoint(vb, pt, 0.5, {}); // zoom in (smaller viewBox)
  // pt must still sit at the same fractional position
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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/canvas-view.test.js`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement the helpers** in `canvas.js`, immediately after the existing `export function isValidPortConnection(...) { ... }` block:

```js
/** Convert a screen pixel (relative to the svg's bounding rect) into world coords. */
export function screenToWorld(clientX, clientY, rect, vb) {
  return {
    x: vb.x + (clientX - rect.left) / rect.width * vb.w,
    y: vb.y + (clientY - rect.top) / rect.height * vb.h,
  };
}

/** New viewBox after scaling by `factor` while keeping world point `pt` fixed.
 *  factor < 1 zooms in (smaller viewBox), > 1 zooms out. Aspect ratio preserved.
 *  clamp = { minW, maxW } bounds the viewBox width. */
export function zoomAroundPoint(vb, pt, factor, clamp = {}) {
  const aspect = vb.h / vb.w;
  let w = vb.w * factor;
  if (clamp.minW != null) w = Math.max(clamp.minW, w);
  if (clamp.maxW != null) w = Math.min(clamp.maxW, w);
  const h = w * aspect;
  const rx = (pt.x - vb.x) / vb.w;
  const ry = (pt.y - vb.y) / vb.h;
  return { x: pt.x - rx * w, y: pt.y - ry * h, w, h };
}

/** Smallest viewBox enclosing all node centres plus `padding`; null if no nodes. */
export function fitBox(nodes, padding = 60) {
  if (!nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  return { x: minX - padding, y: minY - padding, w: (maxX - minX) + 2 * padding, h: (maxY - minY) + 2 * padding };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/canvas-view.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add canvas.js spike/test/canvas-view.test.js
git commit -m "Add pure view-transform helpers for the canvas (screen<->world, zoom, fit)"
```

---

## Task 2: viewBox state, world coordinates, infinite surface

**Files:**
- Modify: `canvas.js` — constructor (~line 14), `getMouseCoords` (~line 194), `render` (~line 740-756), node-drag clamp (~line 318-319)

> No DOM test harness for canvas — verify by building and reading the change against the surrounding code. The math is covered by Task 1.

- [ ] **Step 1: Add viewBox state + lazy init.** In the constructor (next to `this.wireTapCandidate = null;`), add:

```js
        this.viewBox = null; // {x,y,w,h} in world units; lazily initialised from the svg size
```

Add this method near `getMouseCoords`:

```js
    ensureViewBox() {
        if (this.viewBox) return;
        const r = this.svg.getBoundingClientRect();
        this.viewBox = { x: 0, y: 0, w: r.width || 800, h: r.height || 600 };
    }
```

- [ ] **Step 2: Convert `getMouseCoords` to world coords.** Replace the body of `getMouseCoords`:

```js
    getMouseCoords(e) {
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        return screenToWorld(e.clientX, e.clientY, rect, this.viewBox);
    }
```

- [ ] **Step 3: Apply the viewBox in `render` and size the grid/blueprint to it.** In `render()`, right after `this.svg.innerHTML = '';`, add:

```js
        this.ensureViewBox();
        const vb = this.viewBox;
        this.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
```

Then change the grid rect so it fills the viewBox. Find:

```js
        const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        gridRect.setAttribute('width', '100%');
        gridRect.setAttribute('height', '100%');
        gridRect.setAttribute('fill', 'url(#grid)');
        this.svg.appendChild(gridRect);
```

and replace the two `setAttribute` size lines plus add x/y so it reads:

```js
        const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        gridRect.setAttribute('x', vb.x);
        gridRect.setAttribute('y', vb.y);
        gridRect.setAttribute('width', vb.w);
        gridRect.setAttribute('height', vb.h);
        gridRect.setAttribute('fill', 'url(#grid)');
        this.svg.appendChild(gridRect);
```

If the blueprint image block sets `width/height = '100%'`, change it the same way (set `x=vb.x`, `y=vb.y`, `width=vb.w`, `height=vb.h`) so the watermark also fills the visible window.

- [ ] **Step 4: Remove the node-drag clamp so nodes can live anywhere.** Replace the two clamp lines:

```js
            this.draggedNode.x = Math.max(20, Math.min(this.svg.clientWidth - 20, coords.x - this.dragOffset.x));
            this.draggedNode.y = Math.max(20, Math.min(this.svg.clientHeight - 20, coords.y - this.dragOffset.y));
```

with (clamp only to a large world bound so a node can't be lost entirely):

```js
            this.draggedNode.x = Math.max(-100000, Math.min(100000, coords.x - this.dragOffset.x));
            this.draggedNode.y = Math.max(-100000, Math.min(100000, coords.y - this.dragOffset.y));
```

- [ ] **Step 5: Build and sanity-check**

Run: `npm run build` → expect success.
Read your edits once more: confirm `screenToWorld` is imported/available (it's a top-level export in the same module, so it's in scope), the viewBox is applied before nodes are drawn, and the grid rect uses `vb.*`.

- [ ] **Step 6: Commit**

```bash
git add canvas.js
git commit -m "Render the canvas through a world-space viewBox; unbound node positions"
```

---

## Task 3: Wheel zoom + drag-to-pan gestures

**Files:**
- Modify: `canvas.js` — `initEvents` (~line 114), `onMouseDown` blank-canvas branch (~line 306), `onMouseMove` (~line 311), `onMouseUp` (end), and a new `onWheel`

- [ ] **Step 1: Register the wheel listener.** In `initEvents()`, after the `dblclick` listener, add:

```js
        this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
```

- [ ] **Step 2: Implement `onWheel`** (add as a method on the class). Zoom toward the cursor, clamped to 0.1×–8× of the base size:

```js
    onWheel(e) {
        e.preventDefault();
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        const pt = screenToWorld(e.clientX, e.clientY, rect, this.viewBox);
        const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1; // down = zoom out
        const baseW = rect.width || 800;
        this.viewBox = zoomAroundPoint(this.viewBox, pt, factor, { minW: baseW / 8, maxW: baseW * 10 });
        this.render();
    }
```

- [ ] **Step 3: Start a pan on empty-background mousedown.** In `onMouseDown`, replace the `// 4. Clicked blank canvas` block:

```js
        // 4. Clicked blank canvas
        this.selectedElement = null;
        this.render();
        this.onStateChange();
    }
```

with (record a pan start using the SCREEN position and a copy of the viewBox):

```js
        // 4. Clicked blank canvas — deselect and begin panning
        this.selectedElement = null;
        this.panning = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startVb: { ...this.viewBox },
        };
        this.render();
        this.onStateChange();
    }
```

Also initialise `this.panning = null;` in the constructor (next to `this.viewBox = null;`).

- [ ] **Step 4: Translate the viewBox while panning.** At the TOP of `onMouseMove(e)` (before the `const coords = this.getMouseCoords(e);` line), add:

```js
        if (this.panning) {
            const rect = this.svg.getBoundingClientRect();
            const dxWorld = (e.clientX - this.panning.startClientX) / rect.width * this.panning.startVb.w;
            const dyWorld = (e.clientY - this.panning.startClientY) / rect.height * this.panning.startVb.h;
            this.viewBox = {
                x: this.panning.startVb.x - dxWorld,
                y: this.panning.startVb.y - dyWorld,
                w: this.panning.startVb.w,
                h: this.panning.startVb.h,
            };
            this.render();
            return;
        }
```

- [ ] **Step 5: End the pan on mouseup.** At the START of `onMouseUp(e)`, add:

```js
        if (this.panning) { this.panning = null; return; }
```

- [ ] **Step 6: Build and verify in-app**

Run: `npm run build`, then `npm start`. In Block Diagram mode: scroll to zoom (should zoom toward the cursor), drag empty canvas to pan, confirm dragging a node and Shift+drag-branching a wire still work (pan must NOT trigger on nodes/wires).

- [ ] **Step 7: Commit**

```bash
git add canvas.js
git commit -m "Add wheel-zoom-toward-cursor and drag-to-pan on the canvas"
```

---

## Task 4: Zoom methods + on-screen controls

**Files:**
- Modify: `canvas.js` — add `zoomIn`/`zoomOut`/`resetView`/`fitView`
- Modify: `index.html` — controls strip over the canvas
- Modify: `app.js` — wire the buttons

- [ ] **Step 1: Add the public methods** to `canvas.js`:

```js
    zoomAtCenter(factor) {
        this.ensureViewBox();
        const rect = this.svg.getBoundingClientRect();
        const baseW = rect.width || 800;
        const center = { x: this.viewBox.x + this.viewBox.w / 2, y: this.viewBox.y + this.viewBox.h / 2 };
        this.viewBox = zoomAroundPoint(this.viewBox, center, factor, { minW: baseW / 8, maxW: baseW * 10 });
        this.render();
    }
    zoomIn() { this.zoomAtCenter(1 / 1.2); }
    zoomOut() { this.zoomAtCenter(1.2); }
    resetView() {
        const r = this.svg.getBoundingClientRect();
        this.viewBox = { x: 0, y: 0, w: r.width || 800, h: r.height || 600 };
        this.render();
    }
    fitView() {
        const box = fitBox(this.nodes, 80);
        if (!box) { this.resetView(); return; }
        // match the svg's aspect ratio so nothing is distorted
        const r = this.svg.getBoundingClientRect();
        const aspect = (r.height || 600) / (r.width || 800);
        let w = box.w, h = box.h;
        if (h / w < aspect) h = w * aspect; else w = h / aspect;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        this.viewBox = { x: cx - w / 2, y: cy - h / 2, w, h };
        this.render();
    }
```

- [ ] **Step 2: Add the controls strip** in `index.html`. Make the canvas container positioned and add the buttons just after the `<svg id="diagram-svg">…</svg>` element. First, ensure the parent `<main>` establishes a positioning context — add `style="position:relative"` to the `<main>` tag that contains `#diagram-svg`. Then, right after the closing `</svg>` of `#diagram-svg`, insert:

```html
            <div id="canvas-zoom-controls" style="position:absolute; right:14px; bottom:14px; display:flex; gap:6px; z-index:5;">
              <button class="btn-action" id="zoom-out-btn" title="Zoom out" style="width:30px; padding:4px 0;">−</button>
              <button class="btn-action" id="zoom-in-btn" title="Zoom in" style="width:30px; padding:4px 0;">+</button>
              <button class="btn-action" id="zoom-reset-btn" title="Reset to 100%" style="padding:4px 10px;">Reset</button>
              <button class="btn-action" id="zoom-fit-btn" title="Fit diagram" style="padding:4px 10px;">Fit</button>
            </div>
```

- [ ] **Step 3: Wire the buttons** in `app.js`, after the `const canvas = new BlockDiagramCanvas(...)` block:

```js
    document.getElementById('zoom-in-btn').addEventListener('click', () => canvas.zoomIn());
    document.getElementById('zoom-out-btn').addEventListener('click', () => canvas.zoomOut());
    document.getElementById('zoom-reset-btn').addEventListener('click', () => canvas.resetView());
    document.getElementById('zoom-fit-btn').addEventListener('click', () => canvas.fitView());
```

- [ ] **Step 4: Build and verify in-app**

Run: `npm run build`, then `npm start`. Confirm the four buttons appear bottom-right of the canvas and that +, −, Reset (back to 100% at origin) and Fit (frames the whole diagram) all work. Add a couple of nodes far apart, then Fit — they should all come into view.

- [ ] **Step 5: Commit**

```bash
git add canvas.js index.html app.js
git commit -m "Add zoom in/out/reset/fit controls to the Block Diagram canvas"
```

---

## Task 5: Full verification + docs

- [ ] **Step 1: Full suite + build**

Run: `npm test` → all green (prior count + 4 new view tests). `npm run build` → success.

- [ ] **Step 2: Regression pass in-app** — confirm a previously-saved diagram still loads and renders at the initial view; node drag, wire draw, Shift+drag branch, sign toggle, and delete all still work under zoom/pan.

- [ ] **Step 3: Note the feature** — add to `index.html`'s Keyboard Shortcuts list two rows (matching the existing `<li>`/`<kbd>` markup):

```html
                    <li style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Zoom canvas</span>
                        <kbd style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 6px; font-family: monospace; color: var(--text-primary); font-weight: bold; font-size: 10px; box-shadow: 0 1px 1px rgba(0,0,0,0.5);">Scroll</kbd>
                    </li>
                    <li style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Pan canvas</span>
                        <kbd style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 6px; font-family: monospace; color: var(--text-primary); font-weight: bold; font-size: 10px; box-shadow: 0 1px 1px rgba(0,0,0,0.5);">Drag bg</kbd>
                    </li>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Document canvas zoom/pan in the shortcuts panel"
```

---

## Self-review notes (reconciled)

- **Spec coverage:** viewBox model (Task 2), wheel-toward-cursor + drag-pan (Task 3), +/−/Reset/Fit (Task 4), infinite surface via unbounded node drag (Task 2), pure helpers tested (Task 1), backward-compat verified (Task 5). All spec sections mapped.
- **Type consistency:** `viewBox` is always `{x,y,w,h}`. `screenToWorld(clientX, clientY, rect, vb)`, `zoomAroundPoint(vb, pt, factor, clamp)`, `fitBox(nodes, padding)` — signatures identical in Tasks 1/2/3/4. `this.panning` shape (`startClientX/Y`, `startVb`) is set in Task 3 Step 3 and read in Steps 4-5 unchanged.
- **No placeholders:** every step has concrete code or an exact command.
