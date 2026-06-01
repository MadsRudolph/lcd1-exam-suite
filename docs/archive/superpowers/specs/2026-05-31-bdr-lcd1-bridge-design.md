# Design — Block Diagram ⇄ LCD1 Solver bridge

**Date:** 2026-05-31
**Status:** approved (verbal), implementing.

## Goal

Let a user sketch a block diagram, reduce it to G(s), and push that G(s) straight into the LCD1
solvers — choosing per question how to interpret it (open-loop plant vs closed-loop Y/R).

## Decisions (from brainstorm)

1. **Handoff carries the reduced G(s) string; the user picks the interpretation per question.** The
   diagram's meaning (open vs closed loop) is set by what the user draws and which solver they send
   it to — the bridge stays neutral.
2. **Push + "what next?" chooser.** A "Use in LCD1 Solver →" button on the reduce panel switches to
   LCD1 mode and shows a chooser; picking a solver opens that form with G(s) pre-filled.
3. **Symbolic diagrams: substitute at handoff.** If the reduced TF still has letters (G1, H1, …), pop
   a modal to enter numeric values, substitute into the block values, and re-run the numeric solver.

## Architecture

- **`lcd-handoff.js`** — a tiny shared module: `setHandoff(tfString)` / `consumeHandoff()`. One value,
  no coupling between canvas and solver.
- **Block Diagram side (`app.js`)** — after a successful reduce, show the button. On click:
  1. collect distinct alphabetic symbols (≠ `s`) across all block `value`s;
  2. if any, show a modal prompting a number for each, then build a numeric copy of the nodes with
     those substitutions and call `solveBlockDiagram` again (numeric path);
  3. take `finalTransferFunction.toFormulaString()`, normalize `^`→`**`, `setHandoff(...)`, switch mode.
- **LCD1 side (`lcd-solver-ui.js`)** — on entering LCD1 mode with a pending handoff, render a
  "From diagram" chooser listing applicable solvers, each tagged open-loop or closed-loop:
  - Margins (GM/PM) — open-loop L(s)
  - Stable-K range — open-loop plant
  - Steady-state error — open-loop plant, unity feedback
  - P-for-PM / PI-Lead design — open-loop plant
  - Characterize (poles, ζ, ωₙ, Mp, step) — closed-loop Y/R
  - (later) Bandwidth, Nyquist stability — once the gap-fix solvers land
  Picking one selects that form and sets its `G(s)` field from the handoff.

## New capability: characterize a numeric closed-loop TF

`characterizeTf(tf)` (in the solver engine): returns poles, zeros, DC gain, and — when the
denominator is 2nd-order — ζ, ωₙ extracted from `a1/a2 = 2ζωₙ`, `a0/a2 = ωₙ²`, then the full
`solve_2nd_order` table (Mp, t_p, t_s, …). This is the landing spot for the closed-loop interpretation.

## Data flow

`(nodes, connections)` → [substitute symbols if needed] → `solveBlockDiagram` (numeric) →
`toFormulaString()` → normalize → `lcd-handoff` → LCD1 chooser → `parseTf` → chosen solver → result.

## Errors

- Missing input/output node or algebraic loop → `solveBlockDiagram` throws; show the message, do NOT
  switch modes.
- Non-numeric value in the substitution modal → inline validation error.
- TF still unparseable after substitution → clear error in the chooser.

## Testing

- Unit: symbol-substitution + numeric re-solve (symbolic diagram + values → expected numeric TF).
- Oracle: `characterizeTf` 2nd-order extractor — `1/(s²+2s+2)` → ζ=0.7071, ωₙ=√2; non-2nd-order falls
  back to poles/DC only.
- End-to-end: nodes/connections → handoff string → `parseTf` → `solveMargins`, asserting the numbers.

## Out of scope / sequencing

- Gap-fix solvers (bandwidth/settling, Nyquist-from-TF, inverse-Laplace, linearization) are a separate
  track, built first; bandwidth and Nyquist then appear as extra chooser entries.
- Nonlinear-ODE linearization needs its own input-format decision before building (flagged separately).
