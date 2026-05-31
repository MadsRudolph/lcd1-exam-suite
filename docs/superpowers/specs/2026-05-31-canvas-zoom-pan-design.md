# Design — Infinite zoom/pan canvas (Block Diagram)

**Date:** 2026-05-31
**Status:** approved (design), pending implementation plan

## Goal

Make the Block Diagram canvas an **effectively infinite, zoomable** surface: scroll
to zoom toward the cursor, drag empty space to pan, and on-screen buttons for
`+` / `−` / **Reset** / **Fit**. Today the canvas is bounded — `getMouseCoords`
returns raw screen pixels and node dragging is clamped to the visible
`clientWidth`/`clientHeight`.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Interaction | **Wheel zoom (toward cursor) + drag-empty-background pan + controls strip** (`+`, `−`, Reset, Fit). |
| Model | A **viewBox over world space**; all coordinates become world coordinates. |
| Compatibility | Existing/saved diagrams render unchanged at the initial view (zoom 1). |

## Architecture (all in `canvas.js`, plus a controls strip in `index.html`)

### View state

Add `this.viewBox = { x, y, w, h }` in **world units**. Initialize lazily from the
SVG's pixel size on first render, so zoom 1 maps world↔screen 1:1 and existing node
coordinates (absolute pixels) are valid world coordinates — no migration.

### Render

- `this.svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)`.
- Draw the grid `<rect>` and the blueprint `<image>` at `(vb.x, vb.y, vb.w, vb.h)`
  instead of `width/height="100%"`, so they always fill the visible window. The grid
  `<pattern>` stays `userSpaceOnUse` (20px world) so it scales with zoom.

### Coordinate conversion

`getMouseCoords(e)` converts screen→world through the viewBox and the SVG client rect:
```
worldX = vb.x + (e.clientX - rect.left) / rect.width  * vb.w
worldY = vb.y + (e.clientY - rect.top)  / rect.height * vb.h
```
Every existing handler (node drag, wire tap/move, Shift+drag branch, sign toggle)
then operates in world coordinates with no further change.

### Infinite surface

Remove the node-drag clamp to `clientWidth/clientHeight` (canvas.js ~318-319) so a
node can be dragged anywhere in world space. (Optional very-large world bound to
avoid "losing" a node — e.g. ±100000.)

## Interactions

- **Wheel (`onWheel`):** zoom toward the cursor. Compute the world point under the
  cursor; scale `vb.w`/`vb.h` by a factor (~1.1 per tick, direction from `deltaY`);
  shift `vb.x`/`vb.y` so that world point stays under the cursor. Clamp the zoom to
  ~`[0.1×, 8×]` of the base size. `preventDefault()` to stop page scroll.
- **Pan (drag empty background):** in `onMouseDown`, when the target is the SVG
  itself or the grid rect (not a port/node/wire/sign), start panning
  (`this.panning = { startScreen, startVb }`) in addition to the existing deselect.
  `onMouseMove` translates `vb` by the world-space delta; `onMouseUp` ends it.
  Pan never starts on a node/wire, so it can't conflict with drag-to-move or
  Shift+drag-to-branch.
- **Controls strip** (bottom-right of the Block Diagram canvas, added in
  `index.html`): `+`, `−`, **Reset**, **Fit**, wired to new public methods:
  - `zoomIn()` / `zoomOut()` — zoom around the canvas center by a fixed factor.
  - `resetView()` — viewBox back to base (zoom 1, origin 0,0).
  - `fitView()` — set viewBox to the bounding box of all nodes + padding; no-op (or
    reset) when there are no nodes.

## Pure helpers (extracted for testing, mirroring `isValidPortConnection`)

- `screenToWorld(clientX, clientY, rect, viewBox)` → `{x, y}`.
- `zoomAroundPoint(viewBox, worldPt, factor, clamp)` → new viewBox keeping `worldPt`
  fixed, with the scale clamped.
- `fitBox(nodes, padding)` → viewBox enclosing all node positions (with padding), or
  null when empty.

These are exported and unit-tested; the DOM/gesture wiring uses them.

## Error handling / edge cases

- Empty diagram → `fitView` resets to base (or no-op); no division by zero.
- Zoom clamped both directions; repeated wheel can't invert or explode the viewBox.
- First render before the SVG has a measured size → initialize viewBox from a sane
  default (e.g. current `clientWidth/Height`, fallback 800×600).
- Pan + an in-progress wire/node drag are mutually exclusive (pan only starts on
  empty-background mousedown).

## Testing

- **Unit (pure):** `screenToWorld` inverts a known mapping; `zoomAroundPoint` keeps
  the cursor's world point fixed and respects the clamp; `fitBox` encloses known
  nodes with padding and returns null when empty. Keeps `npm test` green.
- **In-app:** verify wheel-zoom-toward-cursor, drag-pan, and the four buttons in the
  running Block Diagram mode; confirm a saved diagram still loads and renders at the
  initial view.

## Scope (YAGNI)

In: wheel zoom, drag pan, `+/−/Reset/Fit` buttons, infinite world, backward compat.
Out: pinch/touch zoom, minimap, zoom-to-selection, persisting the view in saves.

## Module boundaries

| Unit | Responsibility |
|---|---|
| `canvas.js` viewBox state + render + `getMouseCoords` | the world↔screen model |
| `canvas.js` `onWheel` / pan branch / zoom methods | the gestures + public API |
| pure helpers (`screenToWorld`/`zoomAroundPoint`/`fitBox`) | testable math |
| `index.html` controls strip | the +/−/Reset/Fit buttons wired to the methods |
