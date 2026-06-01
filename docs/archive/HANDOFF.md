# Handoff — Merge "LCD1 Solver" + "Block Diagram Reducer" into one offline app

**Audience:** A fresh coding-agent session that will plan and execute the merge.
**Date:** 2026-05-31
**Author:** Claude Code, synthesising (a) its own deep work on the LCD1 Solver and (b) Anti-Gravity's
authoritative questionnaire answers about the Block Diagram Reducer.
**Primary source to read first:** `docs/block-diagram-reducer-questionnaire.md` — the builder
of the Block Diagram Reducer (Anti-Gravity) answered a detailed questionnaire about its tool there.
Read it in full before doing anything.

---

## 0. The mission

The user has two finished, **100% offline** study tools for **DTU 34722 Linear Control Design 1**, and
wants them merged into **one unified desktop app** that classmates can clone and use in the exam.

User's directive, verbatim in spirit: *"The LCD1 Solver needs to adapt the same as the Block Diagram
Reducer."* → the merged app is an **Electron/JS app with the Block Diagram Reducer as the shell/base**,
and the LCD1 Solver is folded in.

**Your job is NOT to start porting code immediately.** It is to (1) understand both codebases, (2) run
both, (3) resolve the one pivotal architecture decision below (with a small spike), (4) propose a
concrete plan, and (5) get the user's sign-off before the large work. This is a big step.

---

## 1. The two projects

### A. Block Diagram Reducer  (the shell / base)
- **Repo:** https://github.com/MadsRudolph/block-diagram-reducer  (branch `master`)
- **Local:** `C:\Users\Mads2\DTU\block-diagram-reducer`
- **Stack:** Electron desktop app, vanilla ES6 JS bundled by **esbuild** → `bundle.js`, **KaTeX**
  vendored offline. ~4,400 LOC. Version **v1.0.9**, ~120–150 hrs of iteration.
- **What it does:** interactive SVG canvas to *draw* block diagrams (Manhattan wires, feedback taps
  from wire midpoints, summing junctions with clickable ± signs), then reduces them to **exact,
  textbook-grade symbolic transfer functions** with step-by-step KaTeX reduction logs. Has a vision
  importer that reconstructs a diagram from a pasted screenshot, plus a blueprint-watermark tracer.
- **Run:** `npm install` then `npm start` (or double-click `Double-Click-To-Run.bat`). Build bundle:
  `npm run build`. Self-updates via an in-app "Check for Updates" → `git pull` + `npm run build` +
  window reload (see `main.js` IPC `check-update`).
- **File map** (per Anti-Gravity):
  - `main.js` — Electron main process + self-update IPC. `preload.js` — contextBridge `electronAPI`.
  - `index.html` + `style.css` — glassmorphic dark UI, resizable gutter splitter, blackboard cards.
  - `app.js` — renderer controller: events, `Ctrl+V` paste, exam templates, KaTeX render loop.
  - `canvas.js` — `BlockDiagramCanvas`: node/connection state, SVG draw/drag/connect, tap projection.
  - `solver.js` — `solveBlockDiagram(nodes, connections)`: builds `(I − A)X = B·R`, forward node
    elimination; dispatches **numeric rational** vs **symbolic** solver. SISO only.
  - `math-engine.js` — `Polynomial` / `TransferFunction` with **exact integer-coefficient** algebra,
    GCD cancellation (Matlab-grade simplification). **This is the gem — reuse it.**
  - `vision-analyzer.js` — pure-JS offline screenshot→topology (Otsu, morphological close, flood-fill,
    CCL, wire tracing). **Experimental/fragile** — fallback only.
- **Data model:** plain JSON, fully serializable.
  - Node: `{ id, type: 'input'|'output'|'block'|'sum', x, y, value, label, direction? }`
  - Connection: `{ id, fromNode, toNode, sign: '+'|'-' }`
- **Robustness (Anti-Gravity, blunt):** solid → `math-engine.js`, `solver.js` forward elimination,
  `canvas.js` rendering. Fragile → `vision-analyzer.js`, symbolic AST regrouping on dense MIMO.
  Limits: SISO only; throws on algebraic loops (singular `I − A`); symbolic blow-up on large systems.

### B. LCD1 Solver  (to be folded in)
- **Repo:** https://github.com/MadsRudolph/lcd1-solver  (branch `main`)
- **Local:** `C:\Users\Mads2\lcd1-solver`  (just extracted into its own repo)
- **Stack:** Python 3.11+ + **PyQt6** desktop app. Built on **python-control, sympy, numpy, scipy,
  matplotlib**. **70 passing tests** that encode the correct numeric answers (this is the oracle).
- **What it does:** an offline multiple-choice exam solver. A **Smart Paste** parser
  (`lcd_solver/ui/smart_paste.py`) reads a pasted exam question (robust to garbled PDF copy-paste:
  flattened fraction bars, unicode minus, multi-line/factored TFs), routes it to the right solver,
  extracts the transfer function/parameters, and flags the matching multiple-choice option.
- **Coverage (pure functions in `lcd_solver/solvers/`):**
  - P1 ODE / state-space / block-diagram → TF
  - P2 compose `G(s)` from Bode read-off
  - P3 gain/phase **margins**; **stable-K range** (Routh–Hurwitz, handles RHP plants)
  - P4 second-order specs (Mp↔ζ↔ω_n↔t_p↔t_s…); closed-loop K from one metric
  - P5 steady-state error (system type, K_p/K_v/K_a, ess; folds in a stated P-gain)
  - P6 **PI-Lead / Lead-Lag design**: solve for α, N_i, K_P, the Lag **β**, or the **full design**
    (G, ω_c, γ_M, N_i → α, τ_d, τ_i, K_P; φ_G computed from `G(jω_c)` automatically)
  - P7 feed-forward form; nested-loop ess
- **Front-ends:** PyQt6 forms (`ui/forms.py`, `ui/form_builder.py`) and a CLI (`run_cli.py`).
- **Run:** `pip install -r requirements.txt`; `python run.py` (GUI) or `python run_cli.py` (CLI);
  `pytest` (70 tests).

### How they relate
- Both target the **same course/exam**. Both do transfer-function algebra.
- **Overlap:** LCD1 has a simple text-DSL block reducer (`solvers/p1_block_reduce.py`). The Block
  Diagram Reducer's interactive graphical reducer **supersedes it entirely** — drop LCD1's P1
  block-reduce in the merge.
- **Complementarity:** BDR = draw-and-reduce diagrams; LCD1 = the broad P1–P7 multiple-choice toolkit
  + Smart Paste. Together they cover essentially the whole exam.

---

## 2. THE pivotal decision — how LCD1's math lives in the Electron app

This is the crux. There are two credible directions, and **they conflict**, so resolve it explicitly
(with a spike) before committing.

### Option JS-PORT — reimplement LCD1's solvers in JS, on top of `math-engine.js`
- **Matches the user's stated directive** ("LCD1 adapts to BDR's stack") and BDR's clean self-update
  model: one git-pull + esbuild updates *everything*, no frozen binaries, one language.
- Anti-Gravity confirms `math-engine.js` can be the shared TF core, and the missing pieces are bounded:
  - `G(jω)` complex eval — **very easy** (swap `s` for a Complex class)
  - Routh–Hurwitz — **easy** (LCD1 already has the algorithm to translate)
  - polynomial root-finding deg>2 — **medium** (Durand–Kerner/Laguerre in JS)
  - Bode magnitude/phase + gain/phase **margins** — **medium** (complex arithmetic + root solving)
  - 2nd-order metrics, PI-Lead/Lead-Lag/design, ess — **trivial** (closed-form formulas)
  - Smart Paste parser — regex routing, **ports directly to JS**
- Hardest part: P1 ODE/state-space → TF needs symbolic work currently done by sympy (but block
  reduction is already covered by BDR's engine).
- **Cost/risk:** substantial reimplementation + must re-validate against the 70-test oracle to avoid
  numerical/controller-design discrepancies.

### Option PY-BACKEND — keep LCD1 in Python, Electron spawns it  (Anti-Gravity's recommendation)
- Anti-Gravity strongly recommends this (or a hybrid): **freeze LCD1 with PyInstaller** into a
  standalone exe exposing a **local JSON API / CLI**; the Electron renderer posts the pasted question
  and renders the returned JSON. Keeps the 70 battle-tested solvers at **100% fidelity**, immediately.
- **Cost/risk:** a large platform-specific binary; the clean `git pull` self-update no longer updates
  the Python side (must re-package, or run from a live Python env with its own deps) — Anti-Gravity
  flagged exactly this in §9; more moving parts; arguably "two apps in a trench coat."

### Claude's synthesis / recommendation
Lean **JS-PORT** because it honours the user's directive and preserves BDR's single-bundle,
git-pull-updates-everything model (the property that makes this app pleasant for classmates). But the
fidelity risk is real, so **de-risk with a spike before committing**:

1. Port a representative slice to JS on top of `math-engine.js`: **P3 margins + stable-K (Routh)**,
   **P4 second-order**, and **P6 PI-Lead/full-design** (covers complex eval, root-finding, margins,
   and pure formulas).
2. Port the matching LCD1 tests to a JS runner (node:test) and assert parity against the Python
   oracle's expected values (`tests/` in lcd1-solver).
3. If parity is clean and effort is acceptable → commit to the full JS port. If a solver shows nasty
   numerical gaps that are expensive to close → fall back to PY-BACKEND for *just those* (true hybrid).

Either way, the **UI shell + Smart Paste parser port** can proceed in parallel — they don't depend on
the math-fidelity outcome.

**Present both options and this recommendation to the user and get an explicit choice before the big
build.** Do not silently pick.

---

## 3. Anti-Gravity's concrete proposals (adopt unless the spike says otherwise)

- **UI:** a header/sidebar mode selector — "Block Diagram Reducer" vs "Smart Paste / LCD1 Solvers".
  Selecting LCD1 swaps the left canvas for a glassmorphic paste drop-zone (reuse the Vision modal
  style); the right blackboard panel shows parsed parameters, intermediate steps, Bode/Routh output,
  and matched options as KaTeX cards. Preserve BDR's UX invariants: midpoint tap connections, the
  gutter splitter, click-to-toggle summing signs, copy-as-LaTeX/plain.
- **Repo:** keep **block-diagram-reducer as the base**, monorepo. Anti-Gravity proposed
  `backend/lcd_solver/` for the Python (relevant only if PY-BACKEND is chosen). For JS-PORT, prefer a
  `solvers/` (or `lcd/`) JS module set beside `solver.js`, sharing `math-engine.js`.
- **Reuse as-is:** `canvas.js`, `math-engine.js`, `solver.js`, `style.css`. **Rip out** LCD1's PyQt6
  UI and its `p1_block_reduce.py`.
- **Contract Anti-Gravity wants from LCD1** (essential even for the spike): a clean function/endpoint
  `solve(questionText) -> JSON { parameters, steps_latex[], bode/routh arrays, matched_options[] }`.
  Note: `run_cli.py` already routes + solves + matches; formalising a JSON output mode there is a cheap
  first deliverable and is useful under *either* option.

---

## 4. Constraints & conventions (do not break)
- **100% offline, zero-setup, single double-click launch.** No network at runtime. Exam-room use.
- **Self-update** via `git pull` + rebuild must keep working for whatever ships.
- **Windows-first** (the user's machines). `PAGER=cat` to stop git/esbuild hanging on prompts.
- **Commits read like a human developer wrote them — NO AI attribution** (no `Co-Authored-By`, no
  mention of Claude/Anti-Gravity). This is a hard rule across the user's repos.
- The LCD1 **70-test oracle is sacred** — it is the definition of "correct". Any port is verified
  against it, not against vibes.

---

## 5. Suggested first steps (in order)
1. Read `docs/block-diagram-reducer-questionnaire.md` fully; clone & run **both** apps.
2. Skim `math-engine.js` and `solver.js` (BDR) and `lcd_solver/solvers/*` + `tests/*` (LCD1) to map
   what each math primitive needs.
3. Add a `--json` output mode to LCD1's `run_cli.py` (the integration contract) — small, useful now.
4. Run the **spike** in §2 (port P3/P4/P6 slice to JS + parity tests).
5. Write a short architecture proposal (JS-PORT vs PY-BACKEND vs hybrid, with the spike's evidence) and
   **get the user's decision**.
6. Only then: lay out the monorepo, build the mode-switcher shell, and port/wire the rest.

---

## 6. Open questions for the user
- Confirm the architecture after the spike: full JS port (matches your directive) or Python backend
  (Anti-Gravity's lower-risk pick)?
- New repo name for the merged app, or keep building in `block-diagram-reducer`?
- Should the merged app keep BDR's `v1.0.x` version line, or reset?
- Is bundling a ~50–100 MB PyInstaller binary acceptable for classmates if PY-BACKEND wins, or is the
  "small single self-updating bundle" property a hard requirement (which favours JS-PORT)?

---

*Primary sources: this handoff + `docs/block-diagram-reducer-questionnaire.md` (BDR, from its builder) + the
`lcd1-solver` repo and its `tests/` oracle. Both tools are the user's (MadsRudolph) and are on GitHub.*
