# CLAUDE.md — LCD1 Exam Suite (unified app)

This repo is **one unified, 100% offline desktop app** for the DTU 34722 Linear Control
Design 1 exam, merging two existing tools. **Status: merged app built** — BDR Electron shell at the
repo root with an LCD1 Solver mode (`lcd-solver-ui.js` + `lcd-engine.js`) over the JS solver engine in
`spike/`. All P1–P7 solvers are ported and parity-checked against the 70-test oracle (`npm test`).
Run with `npm install && npm run build && npm start`.

> **Dev history is archived** under [`docs/archive/`](docs/archive/) — HANDOFF, the questionnaire,
> specs/plans, and stress-test findings now live there.

> **Stress-test session?** If you were started to generate a mock exam and stress-test the solver, read
> **[`docs/archive/mock-exam-stress-test-handoff.md`](docs/archive/mock-exam-stress-test-handoff.md)** —
> it's the brief for that work. Skip the merge-history first-actions below.

## ▶️ FIRST ACTIONS for a fresh session

1. **Read [`docs/archive/HANDOFF.md`](docs/archive/HANDOFF.md) in full**, then
   [`docs/archive/block-diagram-reducer-questionnaire.md`](docs/archive/block-diagram-reducer-questionnaire.md).
   The handoff is the master plan; the questionnaire is the Block Diagram Reducer's builder explaining
   exactly what it made.
2. **Clone the two source repos** (as siblings to this one) and run both to see what they do:
   ```bash
   git clone git@github.com:MadsRudolph/block-diagram-reducer.git   # Electron/JS — the shell/base
   git clone git@github.com:MadsRudolph/lcd1-solver.git             # Python/PyQt6 — the solver toolkit
   ```
   On Mads's PC they likely already exist locally at `C:\Users\Mads2\DTU\block-diagram-reducer` and
   `C:\Users\Mads2\lcd1-solver`.
3. Skim `block-diagram-reducer/math-engine.js` + `solver.js`, and `lcd1-solver/lcd_solver/solvers/*`
   + `lcd1-solver/tests/*`, to map what each math primitive needs.

## The goal & chosen direction

**One Electron app**, with the **Block Diagram Reducer as the base/shell**, and the **LCD1 Solver
ported/rewritten into JS** so everything lives in one self-updating bundle. The user has explicitly
accepted **rewriting the LCD1 Solver** to achieve a single unified product — so the direction is
JS-port, not a Python backend. (Anti-Gravity argued for a Python backend on fidelity grounds; still do
the small **fidelity spike** in HANDOFF §2 to de-risk before the full port, but the architecture
decision is made: JS-port into the Electron app.)

## Hard constraints / conventions (do not break)

- **100% offline, zero-setup, single double-click launch.** Self-update (`git pull` + `npm run build`
  + reload) must keep working for whatever ships — a reason the JS-port is preferred over a frozen
  Python binary.
- **Windows-first** (Mads's machines). Use `PAGER=cat` so git/esbuild don't hang on prompts.
- **Commits read like a human developer wrote them — NO AI attribution.** No `Co-Authored-By`, no
  mention of Claude / Anti-Gravity, in commit messages or code comments. (Hard rule across these repos.)
- **The LCD1 70-test oracle (`lcd1-solver/tests/`) is the definition of "correct."** Validate every
  ported solver against it; do not trust by inspection.

## Reuse map (from the handoff)

- **Keep as-is:** BDR's `canvas.js`, `math-engine.js`, `solver.js`, `style.css`, Electron shell.
- BDR's graphical block-diagram reducer **supersedes** LCD1's `solvers/p1_block_reduce.py` — drop it.
- **Rip out** LCD1's PyQt6 UI; rebuild those forms in the Electron UI.
- Note: BDR's `math-engine.js` uses **exact integer-coefficient** polynomials (great for symbolic
  block reduction). LCD1's numeric solvers need **float coefficients + complex `G(jω)` evaluation,
  root-finding, Routh-Hurwitz, Bode/margins** — likely a separate lightweight numeric layer beside it
  (see HANDOFF §2 for difficulty notes).

## Suggested first deliverables (HANDOFF §5)

1. Add a `--json` output mode to `lcd1-solver/run_cli.py` (the integration contract). Cheap, useful now.
2. Run the spike: port P3 (margins + stable-K/Routh), P4 (2nd-order), P6 (PI-Lead/full-design) to a JS
   numeric core; assert parity against the LCD1 oracle with a node:test runner.
3. Then: monorepo layout in this repo (seed from BDR), build the mode-switcher shell
   (Block Diagram ⇄ LCD1 Solver), and port the Smart Paste parser.
