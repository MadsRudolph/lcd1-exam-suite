# Design — Disturbances & arbitrary transfer functions (Block Diagram)

**Date:** 2026-05-31
**Status:** approved (design), pending implementation plan

## Goal

In the Block Diagram mode, let the user **model disturbances** and compute the
transfer function **between any chosen source and sink**, plus the **open-loop
loop gain L(s)** by breaking a wire. Today the solver hardcodes the single Input
(R) → single Output (Y) and only returns the closed-loop Y/R.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Endpoint selection | **Source ▾ / Sink ▾ dropdowns**. Source = all input + disturbance nodes; Sink = all output nodes. |
| Open-loop | **Break a wire**: click a wire to cut; the tool computes L(s) (loop gain) at that cut. Diagram unchanged. |
| Disturbance | A **new `type: 'disturbance'` node** (sidebar "Disturbance (D)" button), wired into a summing junction like R; treated as a source by the solver. |
| Sink scope | **Output nodes only** (add an Output node anywhere you want to measure). |

## Background — how the solver works today

`solver.js`:
- `solveBlockDiagram(nodes, connections)` is the entry point (called from `app.js`
  on "Solve Loop"). It dispatches to `solveNumerically` (coefficients) and
  `solveSymbolically` (KaTeX algebra steps).
- Both find exactly one `type:'input'` node and one `type:'output'` node, build a
  linear system over the "active" nodes (blocks, sums, outputs) from the incoming
  connections, put the input on the RHS, solve, and read the output node's row.
- Node types today: `input`, `output`, `block`, `sum`. Connections have
  `{ id, fromNode, toNode, sign, tapConnId, ... }`.

## Architecture

### 1. Generalize the core solve (`solver.js`)

Extract the shared machinery into one reusable function:

- **`transferFunction(nodes, connections, sourceId, sinkId)`** → `{ num, den, latex, steps }`
  - Treats every `input` **and** `disturbance` node as a potential source.
  - Sets the chosen `sourceId`'s injected value to 1 and **all other sources to 0**
    (superposition), solves the linear system, and reads the signal at `sinkId`.
  - Both the numeric (coefficient) and symbolic (KaTeX-steps) paths flow through
    this, parameterised by `(sourceId, sinkId)` instead of the hardcoded
    input/output lookup.
- `solveBlockDiagram` becomes a thin wrapper: default `sourceId` = the (first)
  input node, `sinkId` = the (first) output node → preserves current behaviour.

### 2. Disturbance node + endpoint UI

- **Node:** add `type: 'disturbance'`. `canvas.js` draws it distinctly from `input`
  (e.g. a labelled source with a downward inject arrow) and it has an output port
  to wire into a summing junction. The solver's source set = nodes of type `input`
  OR `disturbance`.
- **Sidebar button** "Disturbance (D)" in `index.html` (Add Component group);
  `app.js` calls `canvas.addNode('disturbance', x, y, '1', 'D')`.
- **Source ▾ / Sink ▾ dropdowns** in the Block Diagram panel (near the Solve
  button). Populated from the canvas nodes: Source = input+disturbance labels,
  Sink = output labels. On "Solve", call
  `transferFunction(nodes, connections, sourceId, sinkId)` and render the result +
  steps in the existing TF/steps panel, labelled with the pair (e.g. "Y/D — closed
  loop"). Dropdowns refresh when nodes change.

### 3. Break-a-wire open-loop L(s)

- A **"Break loop"** button puts the canvas into a one-shot *break mode* (cursor
  hint; next wire click is the cut).
- Computing L(s) at a cut of wire `X→Y` (carrying sign s): build a temporary
  connection set = the real connections **minus** the cut wire, **plus** a virtual
  source feeding `Y`'s input (sign s) and a virtual sink reading `X`'s output; zero
  all real sources; run the generalized solver `virtualSource → virtualSink`. The
  result is the loop gain `L(s) = X / test`. The real diagram/connections are
  **not** mutated; the cut wire is highlighted and the result labelled
  "L(s) — open loop (cut at <wire>)".
- Implementation reuses `transferFunction` on the temporary node/connection arrays
  (add a synthetic `input` node wired to Y, and a synthetic `output` node wired
  from X), so no separate solver path is needed.

### 4. Display & bridge

- Results render in the existing `#tf-output` (KaTeX) + `#steps-output` panels,
  with a label describing which TF (source→sink closed loop, or L(s) open loop).
- The existing "push reduced TF into the LCD1 Solver" bridge takes whichever TF is
  currently shown (the user picks the pair / L(s) first, then bridges).

## Data flow

```
canvas nodes/connections + (sourceId, sinkId)
        │
        ├─ closed loop:  transferFunction(nodes, conns, sourceId, sinkId)
        └─ open loop:    transferFunction(nodes+virtualSrc/sink,
                                          conns − cut + virtual wires,
                                          virtualSrcId, virtualSinkId)
        │
        ▼
   { num, den, latex, steps } → #tf-output / #steps-output (+ optional bridge)
```

## Error handling

- No source or no sink selected / present → clear message ("add an Input/Disturbance
  and an Output, then pick a Source and Sink").
- Singular system / disconnected sink → the existing "could not solve" message.
- Break mode: clicking something that isn't a wire → stay in break mode (or cancel
  on Esc); breaking a wire that isn't in a loop → L(s)=0 (or "no loop through this
  wire"), shown plainly.
- Disturbance with no path to the sink → TF = 0, shown plainly.

## Testing

- **Solver is pure** (`nodes, connections → TF`), unit-tested like the existing
  math (mirror `spike/test` / the BDR test style). Key cases on a standard
  single-loop diagram (forward `G`, feedback `H`):
  - `transferFunction(R→Y)` = `G/(1+GH)` (closed loop) — matches current output.
  - `transferFunction(D→Y)` for a disturbance summed before `G` = the expected
    disturbance TF.
  - Loop gain from breaking the feedback wire = `GH` (or `−GH` per sign convention
    — pin the sign in the test).
  - No-path source → 0.
- **In-app:** dropdowns populate and refresh; Solve shows the right labelled TF;
  Break loop → click a wire → L(s); bridge pushes the shown TF.
- Keep `npm test` green; existing block-reduction results unchanged (regression:
  `solveBlockDiagram` default still returns the same Y/R).

## Scope (YAGNI)

In: disturbance node, Source/Sink dropdowns (inputs/disturbances → outputs),
generalized `transferFunction`, break-a-wire L(s), existing display + bridge.

Out: probing arbitrary internal nodes as sinks; multiple simultaneous sources
(true MIMO); automatic loop detection; persisting source/sink choice in saves;
multiple cuts at once.

## Module boundaries

| Unit | Responsibility |
|---|---|
| `solver.js` `transferFunction(nodes, conns, sourceId, sinkId)` | the pure, parameterised solve (numeric + symbolic) |
| `solver.js` `solveBlockDiagram` | thin back-compat wrapper (default R→Y) |
| `canvas.js` | draw the `disturbance` node; break-mode wire-click → emit the cut wire id |
| `index.html` | Disturbance button, Source/Sink dropdowns, Break-loop button |
| `app.js` | populate/refresh dropdowns; wire Solve + Break-loop to `transferFunction`; render results |
| tests | pure-solver cases (R→Y, D→Y, L(s), no-path) |

## Open implementation notes (for the plan)

- Decide the loop-gain sign convention and pin it in a test (recommend: L(s) =
  return ratio so that the characteristic equation is `1 + L = 0`; if the standard
  diagram's feedback sign makes the raw measurement `−GH`, negate so L = `GH`).
- The virtual source/sink for the break must inject at the *destination* side of
  the cut wire and read at the *source* side, preserving the cut wire's sign.
- Dropbox population belongs in `app.js`'s existing `onStateChange`/stats refresh
  path so it stays in sync as nodes are added/removed/relabelled.
