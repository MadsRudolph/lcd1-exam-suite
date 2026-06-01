# LCD1 Exam Suite

A **unified, 100% offline desktop app** for the DTU 34722 Linear Control Design 1 exam, merging two
tools into one Electron bundle:

- **Block Diagram Reducer** — interactive draw-and-reduce canvas with exact symbolic transfer functions.
- **LCD1 Solver** — Smart-Paste multiple-choice solver covering exam problem types P1–P7, ported from
  Python to JS and validated against the original 70-test oracle.

A floating mode switcher toggles between the two; everything ships in a single self-updating bundle.

## Run it

Works on **Windows, macOS and Linux** — it's an Electron app, nothing platform-specific.
You need [Node.js](https://nodejs.org/) and git installed.

```bash
npm install        # one-time (Electron, esbuild, KaTeX)
npm run build      # bundle app.js -> bundle.js
npm start          # launch the desktop app
```

Or skip the terminal and double-click a launcher:

- **Windows** — `Double-Click-To-Run.bat` (installs deps + builds on first run) or `Launch-Desktop-App.bat`.
- **macOS** — `Launch-Mac.command` (same first-run setup). If double-clicking is blocked, run
  `chmod +x Launch-Mac.command` once, or right-click → Open.

In the app, use the top switcher: **◧ Block Diagram** to draw/reduce diagrams, **∑ LCD1 Solver** to
paste an exam question and get the routed solution with the matching multiple-choice option flagged.

## Verify the math

```bash
npm test           # full test suite — 326 tests (node:test, zero deps)
```

Every solver is checked against the Python oracle (`lcd1-solver/tests/`, 70/70 passing). See
[`docs/archive/js-port-fidelity-spike.md`](docs/archive/js-port-fidelity-spike.md) for the fidelity
write-up and [`spike/README.md`](spike/README.md) for the engine layout and the standalone CLI.

## Layout

```
main.js · preload.js · index.html · style.css   Electron shell (from Block Diagram Reducer)
app.js · canvas.js · solver.js · math-engine.js  BDR renderer + symbolic engine
lcd-solver-ui.js · lcd-engine.js                 LCD1 Solver mode (UI + dispatch)
lcd-tf-helpers.js · plot-svg.js                  TF-builder / MATLAB export + SVG plots
spike/ · symbolic/                               validated JS solver engine, CAS, parity tests, CLI
docs/archive/                                    development history (specs, plans, stress findings)
```

## Background

Development history lives in [`docs/archive/`](docs/archive/):

- **[`docs/archive/HANDOFF.md`](docs/archive/HANDOFF.md)** — the integration plan and the
  architecture decision (JS port).
- **[`docs/archive/block-diagram-reducer-questionnaire.md`](docs/archive/block-diagram-reducer-questionnaire.md)**
  — the Block Diagram Reducer's architecture in its builder's own words.
