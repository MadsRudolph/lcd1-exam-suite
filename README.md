# LCD1 Exam Suite

A **unified, 100% offline desktop app** for the **DTU 34722 Linear Control Design 1** exam. It bundles
two tools into one window so you can go from a block diagram (or a pasted exam question) all the way to
the flagged multiple-choice answer without leaving the app or touching the internet.

| Mode | What it does |
|---|---|
| **◧ Block Diagram** | Draw a control loop on an interactive canvas (inputs, blocks, sum junctions, disturbances, feedback) and reduce it to a single exact symbolic transfer function. Import a diagram from a screenshot, trace over it, and read open-loop `L(s)`, closed-loop `Y/R`, disturbance response and pole locations. |
| **∑ LCD1 Solver** | A "one box for everything" dashboard. Type or paste a `G(s)` and it auto-computes the read-outs (DC gain, type/order, margins, ess, bandwidth, settling, stability), draws Step/Bode/Nyquist/Pole-Zero plots, and runs every exam-problem solver (P1–P7). **Smart Paste** pulls the transfer function and the answer options straight out of a pasted exam question and flags which option matches. |

A floating switcher at the top toggles between the two modes; everything ships in a single
self-updating bundle that runs with no internet connection.

---

## ⚠️ Disclaimer — please read

This is a **free, educational study aid, provided "as is"** with no guarantee that its results are
correct or complete (see [`LICENSE`](LICENSE)).

**Whether any tool or aid may be used in an exam, test or assignment is decided solely by the rules of
your course, examiner and institution — and those rules vary and change.** It is **your own
responsibility** to confirm, in advance and from the official rules and the examiner, whether using
this software (or any aid) is permitted in your specific assessment.

Publishing this project does not endorse or instruct using it where it is not allowed. **Using it in a
setting where it is not permitted is entirely at your own risk.** The author accepts **no responsibility
or liability** for any consequences — including academic-integrity proceedings, disqualification,
failure or other penalties — arising from anyone's use or misuse of this tool. By using it you accept
full responsibility for how, where and whether you use it.

---

## Download & install

The app runs on **Windows and macOS** (and Linux). It is an [Electron](https://www.electronjs.org/)
app, so the only thing you need installed first is **Node.js** (which includes `npm`) and **git**.

### Step 1 — Install the prerequisites (one time)

1. **Node.js** — download the **LTS** installer from **<https://nodejs.org/>** and run it with the
   default options. This gives you both `node` and `npm`.
2. **Git** —
   - **Windows:** install **Git for Windows** from <https://git-scm.com/download/win>.
   - **macOS:** git ships with the Xcode Command Line Tools. If it's missing, run
     `xcode-select --install` in Terminal, or install from <https://git-scm.com/download/mac>.

> You only need git for the first download and for the in-app **Check for Updates** button. If you'd
> rather not use git, you can download the repo as a ZIP from GitHub and skip to Step 3 — but then
> updates have to be re-downloaded by hand.

### Step 2 — Get the app

Open a terminal (**PowerShell** on Windows, **Terminal** on macOS), `cd` to where you keep your
projects, and clone the repo:

```bash
git clone https://github.com/MadsRudolph/lcd1-exam-suite.git
cd lcd1-exam-suite
```

### Step 3 — Launch it

You don't need to run any build commands by hand — the launcher does the one-time setup (install
dependencies, download the Electron runtime, build the bundle) automatically on first run.

**Windows** — in File Explorer, double-click:

- **`Double-Click-To-Run.bat`** — the one to use the first time. It checks for Node.js, runs
  `npm install`, makes sure the Electron runtime downloaded (~230 MB, one time), builds the bundle,
  and launches the app. Subsequent launches are instant.
- **`Launch-Desktop-App.bat`** — a fast launcher for when everything is already set up.

**macOS** — in Finder, double-click **`Launch-Mac.command`**. It does the same first-run setup as the
Windows launcher.

> **macOS Gatekeeper:** the first time, macOS may block the `.command` file. If double-clicking does
> nothing, either **right-click → Open** (then confirm), or run this once in Terminal from the repo
> folder: `chmod +x Launch-Mac.command`.

### Prefer the terminal?

You can skip the launchers entirely and run the npm scripts directly:

```bash
npm install        # one-time: Electron, esbuild, KaTeX
npm run build      # bundle app.js -> bundle.js
npm start          # launch the desktop app
```

### Keeping it updated

The app self-updates. Click **Check for Updates** in the Block Diagram sidebar — it runs `git pull`,
rebuilds the bundle and reloads, so new features appear without re-downloading anything. (This is why
the launchers run the app *live from the cloned folder* rather than a packaged copy.) You can also
update by hand any time with `git pull && npm run build`.

---

## Using the app

When the window opens you're in **Block Diagram** mode. Use the floating pill switcher at the top
(**◧ Block Diagram** / **∑ LCD1 Solver**) to move between the two tools at any time.

### ◧ Block Diagram mode — draw and reduce

1. **Add components** from the left sidebar: **Input (R)**, **Output (Y)**, **Block (G)**,
   **Sum Junction**, **Disturbance (D)**.
2. **Wire them up** by dragging from one node's port to another. `Shift + drag` on a wire creates a
   **branch take-off** (e.g. a feedback tap).
3. **Set transfer functions** — select a block and type its value in the Properties box, e.g.
   `10/(s^2+3s+2)`. Values can stay symbolic (`K`, `a`, `tau`, …).
4. Pick the **Source** and **Sink** in the canvas header and click **Solve Loop** (or press **S**).
   The right panel shows the **simplified transfer function**, **open-loop `L(s)`**,
   **closed-loop `Y/R`**, the **disturbance response**, and the **poles / stability**. Copy the result
   as plain text or LaTeX.
5. **Break Loop** + clicking a wire opens the loop so you can read the raw open-loop `L(s)`.

**Screenshot import:** click **Import Diagram (Ctrl+V)**, then paste (`Ctrl+V` / `Win+Shift+S` on
Windows) or drag in a screenshot of any block diagram. **Trace as Canvas Blueprint** drops the image
behind the canvas at adjustable opacity so you can redraw the diagram on top of it — fully offline, no
OCR service.

Handy keyboard shortcuts (also listed in the sidebar): **R** rotate, **S** solve, **Del** delete,
**Esc** cancel/deselect, scroll to zoom, drag the background to pan.

**Hand it to the solver:** after a successful reduce, a **∑ Use in LCD1 Solver →** button appears next
to the result. It sends the simplified `G(s)` (kept symbolic) into the LCD1 Solver, where you can
either test it against multiple-choice answers as-is, treat it as a loop gain `L(s)` for closed-loop /
type / ess answers, or substitute numbers and run any numeric solver.

### ∑ LCD1 Solver mode — one box for everything

The core of this mode is a single **System** box. Type a `G(s)` — e.g. `12/((s+2)*(s+3))` or
`K/(s*(s+a))` — and the whole board recomputes live as you type:

- **Read-outs (auto-computed):** DC gain, type/order, poles, zeros, gain & phase margins, crossover
  frequencies `ω_c`/`ω_π`, ess (step/ramp), initial/final value, bandwidth, settling time, stability.
- **Plots:** Step, Bode, Nyquist and Pole-Zero, each annotated. You can **overlay the exam's own plot**
  behind the generated one and fade between them to confirm a reconstructed `G(s)` matches — and copy
  runnable **MATLAB** that reproduces the plot in view.
- **Symbolic input:** keep parameters like `K`, `a`, `tau` symbolic and the board reports the
  closed-loop `T = L/(1+L)`, system type, order, `K₀` and ess **in symbols**, then checks which pasted
  answer option is algebraically equal.
- **Design strip:** pick a goal (Stable-K range, Margins, ess table, P-for-PM, PI-Lead design …) and it
  reuses the `G` already in the box.

**Smart Paste — paste a whole exam question.** Click **📋 Paste an exam question** and paste the prompt
straight from the exam PDF — garbled copy-paste is fine (it repairs flattened `s3`, unicode minus,
fraction bars split across lines). It pulls out the transfer function, drops it in the System box so the
whole board computes, extracts the multiple-choice options, and shows a non-committal hint about the
question type. It deliberately **never auto-picks a single answer** — a mis-read can't masquerade as a
confident wrong option; you confirm against the read-outs and the option matcher.

**Build a transfer function:** the **✚ Build a transfer function** widget gives you a visual
numerator-over-denominator editor with a live fraction preview and validity check, then inserts the
one-line `G(s)` the solver reads — no parenthesis juggling.

**Solvers covered (the exam problem types P1–P7 plus general analysis tools):**

| | |
|---|---|
| **P1** | ODE → TF, state-space → TF |
| **P2** | Bode read-off → `G(s)`, and read-off → type/order/GM/PM/`ω_c`/`ω_π` |
| **P3** | Stable-K range (Routh, handles RHP), gain & phase margins |
| **P4** | 2nd-order specs (Mp ↔ ζ ↔ ωₙ/t_p/t_s), closed-loop + 1 spec, K for a transient spec, read-offs from a step-response plot |
| **P5** | K_P from ess (type-0), full ess table (type, Kp/Kv/Ka, step/ramp/parabola) |
| **P6** | PI-Lead phase-budget design, P-for-PM |
| **P7** | Feed-forward controller form, nested-loop ess |
| **Analysis** | Characterize, bandwidth, settling, closed-loop stability, symbolic loop analysis, disturbance ess, solve-for-a-symbol, linearize → TF, symbolic equivalence, evaluate `G(jω)`, initial/final-value theorems, plot any TF |

Every solver can take the options you pasted and flag which one its answer matches (green ✓ for a
confident match, amber for plausible).

---

## Verify the math

The solver engine is a from-scratch JavaScript port of the original Python LCD1 toolkit, validated
against its **70-test oracle**. Run the full suite (pure `node:test`, zero dependencies):

```bash
npm test           # 382 tests
```

Every solver family is parity-checked against the Python oracle's expected values. See
[`spike/README.md`](spike/README.md) for the engine layout and the standalone CLI (you can run any
solver from the terminal, e.g. `node spike/cli.js margins "1/(s+1)**3"`), and
[`docs/archive/js-port-fidelity-spike.md`](docs/archive/js-port-fidelity-spike.md) for the fidelity
write-up.

---

## Project layout

```
main.js · preload.js · index.html · style.css     Electron shell (from the Block Diagram Reducer)
app.js · canvas.js · solver.js · math-engine.js    BDR renderer + exact symbolic block-reduction engine
lcd-solver-ui.js · lcd-engine.js · lcd-forms.js    LCD1 Solver mode (dashboard UI, dispatch, form registry)
lcd-tf-helpers.js · plot-svg.js · plot-interact.js TF builder / MATLAB export + interactive SVG plots
analysis.js · vision-analyzer.js · templates.js    system analysis, screenshot import, example diagrams
spike/                                             validated numeric+symbolic solver engine, parity tests, CLI
symbolic/                                          computer-algebra core (rational/polynomial, equivalence, ess)
mock-exams/                                        a full mock exam (LaTeX + figures) used to stress-test the solver
docs/archive/                                      development history (HANDOFF, specs, plans, stress findings)
Double-Click-To-Run.bat · Launch-Desktop-App.bat   Windows launchers
Launch-Mac.command                                 macOS launcher
```

---

## Background

This repo merges two earlier tools — the **Block Diagram Reducer** (Electron/JS shell, kept as the
base) and the **LCD1 Solver** (originally Python/PyQt6, rewritten into JS) — into one self-updating
offline bundle. The full development history lives in [`docs/archive/`](docs/archive/):

- **[`HANDOFF.md`](docs/archive/HANDOFF.md)** — the integration plan and the JS-port architecture decision.
- **[`block-diagram-reducer-questionnaire.md`](docs/archive/block-diagram-reducer-questionnaire.md)** —
  the Block Diagram Reducer's architecture in its builder's own words.
- **[`js-port-fidelity-spike.md`](docs/archive/js-port-fidelity-spike.md)** and the
  `stress-test-*-findings.md` files — how the JS port was de-risked and hardened against the oracle.
</content>
</invoke>
