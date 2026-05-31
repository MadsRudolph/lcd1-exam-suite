# Design — Plot hover read-off (interactive crosshair + tooltip)

**Date:** 2026-05-31
**Status:** approved (design), pending implementation plan
**Builds on:** `2026-05-31-transfer-function-plots-design.md` (the "interactive later" phase)

## Goal

Add **hover read-off** to the four transfer-function plots: moving the mouse over a
plot shows a crosshair tracking the nearest point and a tooltip with the exact
values. Highest-value interaction for exam read-offs (read GM/PM/bandwidth/peak off
the curve at any point). **Hover only** — no zoom/pan/export in this iteration.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Interactions | **Hover read-off only** (crosshair + tooltip). No zoom/pan/export. |
| Architecture | **Additive layer.** Plots stay pure SVG strings; behavior is wired on top after injection, using the data the UI already holds (`pd` from `buildPlotData`). |
| Mapping transport | `linePlot` stamps the pixel↔value mapping onto each `<svg>` as `data-*` attributes; composers still **return strings** (existing tests unchanged). |

## Architecture — three pieces

```
pd ─ composers emit SVG string + data-* mapping attrs ─→ UI injects (innerHTML)
                                                          └→ attachHover(view, pd)
                                                             reads attrs + pd arrays,
                                                             wires mousemove/leave,
                                                             draws crosshair + tooltip
```

### `plot-svg.js` (small change)

`linePlot` stamps the pixel↔value mapping onto the `<svg>` root as attributes
(~6 numbers — no data arrays embedded):
- `data-kind` — `"step" | "bode-mag" | "bode-phase" | "nyquist" | "polezero"`
- `data-plotbox` — `"x,y,w,h"` (the plot area rect in SVG user units)
- `data-xscale` — `"linear" | "log"`
- `data-xdomain` — `"min,max"` (in log10 units when log)
- `data-ydomain` — `"min,max"`

Composers pass a `kind` to `linePlot`. Return type stays `string`. Existing
`plot-svg.test.js` assertions (which check `<svg>`/polyline/labels) are unaffected.

### `plot-interact.js` (new)

Pure helpers (unit-tested, no DOM):
- `invertX(px, box, xDomain, isLog)` → world x for a pixel x (un-log when `isLog`).
- `nearestByX(xs, target)` → index of the closest `xs[i]` (xs monotonic).
- `nearest2D(xs, ys, tx, ty)` → index minimizing distance to `(tx, ty)`.

DOM:
- `attachHover(rootEl, pd)` — for each `<svg>` in `rootEl`, read its `data-*` attrs;
  wire `mousemove`/`mouseleave`. On move: map cursor px→world, pick the sample
  (per-kind, see below), and draw a crosshair + tooltip by appending SVG elements to
  the live `<svg>`; on leave, remove them. Idempotent per injection (re-attached
  whenever a tab re-renders).

### `lcd-solver-ui.js` (glue)

After each `view.innerHTML = …` (tabbed panel's `show()` and each contextual button
handler), call `attachHover(view, pd)`. `pd` is already in scope in both places.

## Per-plot hover behavior

| kind | crosshair | nearest by | tooltip |
|---|---|---|---|
| `step` | vertical line at t | `nearestByX(t, …)` | `t=… y=…` |
| `bode-mag` / `bode-phase` | vertical line at ω | `nearestByX(omega, …)` | `ω=… |G|=… dB ∠G=…°` (uses both `magDb` and `phaseDeg`) |
| `nyquist` | dot on curve | `nearest2D(re, im, …)` | `ω=… Re=… Im=…` |
| `polezero` | dot on nearest marker within a small radius, else hidden | `nearest2D` over poles∪zeros | `pole −1+2j` / `zero −3` |

Crosshair = a `<line>` (where applicable) + a `<circle>` at the sample; tooltip =
a `<rect>` + `<text>` placed near the cursor, flipped to stay inside the plot box.
Crosshair/tooltip elements carry a class so `attachHover` can clear them each move.

## Data flow

`TF → buildPlotData(pd) → composers render SVG (+ mapping attrs) → UI injects +
attachHover(view, pd) → on hover: px→world via attrs, nearest sample in pd arrays,
draw crosshair + tooltip.`

## Error handling

- Cursor outside the plot box → crosshair/tooltip hidden.
- Empty/degenerate series (no finite samples) → no crosshair (guard in attach).
- Tab re-render replaces innerHTML → stale listeners die with the old DOM; the new
  injection re-attaches. No leak (listeners are on the replaced elements).
- `data-*` attrs missing/malformed on an `<svg>` → that svg is skipped (no throw).

## Testing

- **Unit (pure):** `invertX` round-trips a known (px↔value) on linear and log axes;
  `nearestByX` and `nearest2D` return the right index on known arrays. Keeps
  `npm test` green.
- **In-app:** drive a synthetic `mousemove` over each plot in the browser-render
  harness and screenshot to confirm the crosshair + tooltip appear and read
  correctly; plus a manual pass in the running app.

## Scope (YAGNI)

In: hover crosshair + tooltip on all four plots. Out: zoom/pan, export,
cross-panel Bode sync beyond the shared tooltip, touch.

## Module boundaries

| Module | In | Out | Depends on |
|---|---|---|---|
| `plot-svg.js` (changed) | data + opts (+`kind`) | SVG string with mapping attrs | nothing |
| `plot-interact.js` (new) | rootEl + `pd` | crosshair/tooltip behavior; pure math | nothing (pure part); DOM (attach) |
| `lcd-solver-ui.js` (changed) | injected SVG + `pd` | wired hover | the two above |
