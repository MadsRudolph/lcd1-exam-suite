# Design — Transfer-function plots (step / Bode / Nyquist / pole-zero)

**Date:** 2026-05-31
**Status:** approved (design), pending implementation plan
**Author:** stress-test session

## Goal

Add a feature to the LCD1 Solver: given **any** transfer function, draw its
**unit step response, Bode diagram, and Nyquist plot** (plus a pole-zero map),
**annotated** with the exam-relevant values, **100% offline and in-app**. A major
usability win — the app already computes nearly all the underlying numbers; this
surfaces them visually.

## Decisions (locked during brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Compute backend | **Pure JS, in-app, SVG rendering** | Preserves the hard constraints: offline, zero-setup, single double-click, git-pull self-update. No MATLAB/Python runtime to install. `tf.evalAt(jω)`, roots, and step response already exist. |
| Entry point | **Dedicated form + contextual buttons** | A "Plot transfer function" solver (type/paste a G(s)) *and* `[Step] [Bode] [Nyquist]` buttons on any result that carries a TF. Standalone + contextual. |
| Annotation level | **Annotated + readouts + pole-zero map** | The values are nearly free (margins/bandwidth/characterize/stability already compute them); highest exam value. |
| Interactivity | **Static for v1**, interactive later | Lowest risk, fastest to a working feature. Hover-crosshair/zoom is a fast follow. |

## Architecture — three independent layers

Strict separation; each unit is understandable and testable on its own, with no
knowledge of the others' internals.

```
TF string ─parseTf→ NumericTF ─┬─ plotdata.*  (compute, no DOM)  → data objects ─┐
                               └─ plotAnnotations (reuse solvers) → readouts ─────┤
                                                                                   ▼
                                              plot-svg.js (render, no app deps) → <svg>
                                                                                   ▼
                                       lcd-solver-ui.js (glue) → inject into result panel
```

### Layer 1 — compute: `spike/solvers/plotdata.js` (pure, no DOM)

Input a `NumericTF`; return plain data objects.

- `bodeData(tf, {wMin, wMax, n})` → `{ omega[], magDb[], phaseDeg[] }`
  - `omega` log-spaced; `G = tf.evalAt(new Complex(0, w))`; `magDb = 20·log10|G|`;
    `phaseDeg` = unwrapped `arg(G)` in degrees.
  - Auto ω-range from the pole/zero magnitudes (≈ two decades either side).
- `nyquistData(tf, {wMin, wMax, n})` → `{ re[], im[], omega[] }` for ω > 0.
  - Renderer mirrors for ω < 0. Magnitude-capped for integrators (poles on jω).
- `stepData(tf, {tMax, n})` → `{ t[], y[] }` — see "Step method" below.
- `poleZeroData(tf)` → `{ poles: Complex[], zeros: Complex[] }` (from existing roots).
- `plotAnnotations(tf)` → `{ bode, nyquist, step }` — **reuses existing solvers**,
  no new math:
  - bode: `solveMargins` (GM, PM, ω_pc, ω_gc) + `bandwidth` (−3 dB ω_BW)
  - nyquist: `analyzeStability` (RHP-pole/encirclement count, stable/unstable verdict)
  - step: `characterizeTf` / second-order metrics (overshoot %, peak time, settling
    tₛ, final value = DC gain)
  - Each field is `null` when not applicable (e.g. no PM for an always-stable plant);
    the renderer omits missing markers.

### Layer 2 — render: `plot-svg.js` (repo root, like `canvas.js`; pure)

Data + options → an SVG element. No solver/app imports — fully testable.

- `linePlot({ series, xScale: 'linear'|'log', yScale, xLabel, yLabel, markers,
  readout, width, height })` → `<svg>`: axes, gridlines, ticks, the curve(s),
  marker points/lines, and a small readout box.
- Composers built on `linePlot`:
  - `bodePlot(data, ann)` — two stacked panels sharing the log-ω x-axis; GM/PM
    markers at crossovers; −3 dB bandwidth line.
  - `nyquistPlot(data, ann)` — re/im, equal aspect, arrowheads, the −1 point;
    verdict in the readout. Window capped for integrators.
  - `stepPlot(data, ann)` — y vs t; overshoot/peak/settling/final markers.
  - `poleZeroPlot(data)` — s-plane scatter (× poles, ○ zeros), real/imag axes.

### Layer 3 — UI glue: `lcd-solver-ui.js` / `lcd-forms.js` / `lcd-engine.js`

- **Dedicated form** `plot_tf` ("∇ Plot transfer function") in the solver dropdown:
  one TF input → a tabbed panel **Step | Bode | Nyquist | Pole-Zero**.
  `lcd-engine.runSolver("plot_tf", …)` parses the TF, calls `plotdata.*` +
  `plotAnnotations`, returns the datasets; the UI renders the SVGs.
- **Contextual buttons** `[Step] [Bode] [Nyquist]` on any result that carries a
  TF (characterize, margins, bandwidth, stability, block-diagram reduction). The
  engine attaches the parsed TF string to those results; clicking a button renders
  the corresponding plot inline.

## Step method

Use **robust numeric simulation**: realize the (proper) TF as a state-space model
(controllable canonical form) and integrate the step response with **RK4**. Handles
*any* proper rational TF — distinct/repeated/complex poles, marginal, unstable —
unlike the residue method. Auto time-span from the settling estimate
(`dominantSettling`), with a sane cap. The existing residue-based `stepResponse`
stays as-is for the exact P4 distinct-pole solver; plotting uses simulation.

## Semantics

Plot the TF **as given**. Nyquist's verdict treats it as an open-loop L(s)
(encirclements of −1 — the standard reading). An unstable or integrator step is
drawn with a clear "grows without bound" note, not hidden. (Closed-loop overlays
are a later enhancement, not v1.)

## Error handling

- **Improper TF** (deg num > deg den): step diverges → warn, still draw Bode/Nyquist.
- **Unstable TF**: step grows → clip the y-axis and note it.
- **Poles on the jω axis** (integrators): Bode mag → ∞ as ω→0 (clip axis);
  Nyquist magnitude-capped + indented; note it.
- **Pure gain / degenerate**: handle without throwing.
- **Parse error**: existing error UI.

## Testing

- **Compute (`plotdata`)** — parity-style unit tests:
  - Bode magnitude at ω→0 equals the DC gain; |G(jω)| at a known ω matches direct eval.
  - Step final value = DC gain for a stable G; a known 2nd-order's overshoot matches
    the analytic `Mp`.
  - Nyquist verdict matches `analyzeStability` on known stable/unstable plants.
- **Render (`plot-svg`)** — assert the generators return an SVG with the expected
  polyline point counts and no throw across stable / unstable / integrator /
  complex-pole / improper TFs.
- **Cross-check** a few datasets against the python-control figures already produced
  for Mock Exam 1 (Q4 step, Q7 Bode, Q10 Nyquist) for confidence.
- Keep `npm test` green.

## Scope

**In v1:** static annotated SVG plots; the four views (Step, Bode, Nyquist,
Pole-Zero); the annotations listed; the dedicated form + contextual buttons.

**Not in v1 (YAGNI):** hover/zoom interactivity; closed-loop overlays; image
export; Smart-Paste routing of "plot this"; comparing multiple TFs on one axis.

## Module boundaries (summary)

| Module | In | Out | Depends on |
|---|---|---|---|
| `spike/solvers/plotdata.js` | `NumericTF`, opts | data objects, annotations | numeric core + existing solvers |
| `plot-svg.js` | data objects, opts | `<svg>` | nothing (pure) |
| UI glue | form input / button click | rendered panel | the two above + existing UI |
