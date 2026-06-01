# Block-diagram templates library + local saves — design

**Date:** 2026-05-31
**Goal:** (1) many more loadable example templates in the left panel of the Block-Diagram board,
and (2) the ability to save a diagram you built and reload it later — stored **locally on the
machine, never in git**.

## Approach
Templates and saved diagrams are the **same artifact**: a small JSON diagram-state. Build one
serialization format and one loader; reuse for both. Replaces today's hardcoded imperative
`loadTemplate(type)` switch with a data-driven list.

## Diagram-state format (v1)
```json
{ "version": 1,
  "nodes": [ { "type":"block", "x":350, "y":200, "value":"10/(s^2+2s)", "label":"G", "direction":"right" } ],
  "connections": [ { "from":0, "to":1, "sign":"+" } ] }
```
- `from`/`to` reference nodes by **array index** (stable; avoids id collisions on load).
- `direction` optional (defaults `"right"`). `sign` ∈ `"+" | "-" | ""`.

## Components (each one job)
1. **`canvas.js` — `exportState()` / `loadState(data)`** (2 methods on the existing `Canvas`).
   - `exportState()` walks `this.nodes`/`this.connections` → the v1 object (node→index map for conns).
   - `loadState(data)` → `clear()`, recreate nodes via `addNode(...)` (set `.direction`), push
     connections mapping index→new id, `render()`. This single method backs both templates and saves.
2. **`templates.js` (new, shipped/read-only)** — `export const TEMPLATES = [{ id, name, group, state }]`.
   - Group **"Control structures"** (~12, authored): open-loop, unity feedback, G/H sensor feedback,
     P, PI, PID, lead, lag, lead-lag, inner/outer cascade, disturbance-on-plant, feedforward+feedback,
     parallel `G1+G2`.
   - Group **"Past exams"** (~8): existing S20Q3 / S21Q1 / F22Q1 (converted) + E20Q3, E21Q4, E21Q5,
     E23Q1, E23Q2, E25Q7, E25Q9.
3. **`diagram-store.js` (new)** — `localStorage` wrapper, single key `lcd1.savedDiagrams` holding a
   JSON array `[{ id, name, savedAt, state }]`. API: `list()`, `save(name, state)` (overwrite by
   name), `rename(id, name)`, `remove(id)`, `get(id)`. Pure (injectable storage for tests).
4. **UI — `index.html` + `app.js` + `style.css`.**
   - Left panel: render **Examples** from `TEMPLATES` (grouped) and a **My Diagrams** section from
     `diagram-store.list()`, reusing `.template-item` styling.
   - Canvas toolbar: a **Save** button → prompt for a name → `store.save(name, canvas.exportState())`
     → refresh My Diagrams.
   - My-Diagrams item: click → `canvas.loadState(get(id).state)`; small **rename** / **delete** icons.

## Persistence guarantee
`localStorage` lives in Electron's `userData` profile, keyed by app origin — outside the repo, never
committed, and untouched by the self-update (`git pull` + `npm run build` + reload). Schema `version`
field allows forward migration.

## Testing
- `spike/test/diagram-io.test.js` — round-trip: `loadState(exportState())` preserves node count,
  fields, and connection topology; index/id remap is correct; `direction` survives.
- `spike/test/diagram-store.test.js` — CRUD over an injected in-memory storage shim: save (new +
  overwrite-by-name), list ordering, rename, remove, get-missing.
- Templates: a test asserting every `TEMPLATES[i].state` loads without error and has ≥1 node.
- UI wiring verified manually in the app.

## Out of scope (YAGNI)
Folders/tags, cloud sync, sharing/export-to-file (localStorage only, per decision), undo of a delete.
