# LCD1 Exam Suite

The planned **unified offline app** for the DTU 34722 Linear Control Design 1 exam — merging two
existing tools into one product:

- **Block Diagram Reducer** (Electron/JS, interactive draw-and-reduce): https://github.com/MadsRudolph/block-diagram-reducer
- **LCD1 Solver** (Python/PyQt6, multiple-choice solver + Smart Paste): https://github.com/MadsRudolph/lcd1-solver

> **Status: planning only.** No app code lives here yet. This repo currently holds the integration
> plan so a fresh session can pick up the merge.

## Start here

1. **[`HANDOFF.md`](HANDOFF.md)** — the master integration handoff: both projects, how they relate,
   the pivotal architecture decision (port LCD1 to JS vs. Python backend), recommended approach, and
   step-by-step next actions.
2. **[`docs/block-diagram-reducer-questionnaire.md`](docs/block-diagram-reducer-questionnaire.md)** —
   the Block Diagram Reducer's builder (Anti-Gravity) explaining, in its own words, exactly what it
   made: architecture, data model, the solver/math engine, limits, and integration recommendations.
