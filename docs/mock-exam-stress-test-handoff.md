# Handoff — Mock-exam stress test of the LCD1 Exam Suite

**Audience:** a fresh Claude Code session (no memory of prior work).
**Mission:** generate a realistic, genuinely hard **mock LCD1 exam as a PDF**, then sit with the user
while they try to solve it *with the app, as if it were the real exam* — and find every place the
solver fails, gives a wrong answer, or is awkward to use.

> **This is an adversarial test, not a demo.** Do NOT cherry-pick questions you know the solver can
> handle. Mirror the real exam's topic spread and difficulty, and deliberately include the categories
> the solver is known to struggle with (see "Coverage" below). A mock exam that the tool aces 20/20
> has failed its job.

---

## 0. What this project is (orient yourself first)

A **100% offline Electron desktop app** for the DTU **34722 Linear Control Design 1** multiple-choice
exam. It merges two tools:
- **Block Diagram Reducer** — draw a block diagram on a canvas, reduce it to an exact G(s).
- **LCD1 Solver** — a JS port (validated against a 70-test Python oracle) of solvers for exam problem
  types P1–P7, plus general-TF analysis. Reachable via **Smart Paste** (paste a question → it routes &
  solves), **visible forms** (every solver's fields, editable), and a **CLI** (`spike/cli.js`).
- A **bridge**: a reduced block diagram can be pushed into the LCD1 solver.

**Run it:** `npm install` (first time) → `npm run build` → `npm start`. Or double-click
`Double-Click-To-Run.bat`. Top switcher toggles **◧ Block Diagram** / **∑ LCD1 Solver**.

**Test the math:** `npm test` → should be **94 passing** (parity vs the oracle).

**Read these to go deep (in order):**
1. `docs/exam-coverage.md` — the audit of every past exam: what the solver covers and the gap buckets. **Most important file for this task.**
2. `spike/README.md` — the solver engine layout + the full CLI command list.
3. `docs/js-port-fidelity-spike.md`, `docs/security-review.md` — background, not essential here.

**Key files:** `lcd-solver-ui.js` (LCD1 UI), `lcd-engine.js` (dispatch), `lcd-forms.js` (form registry),
`spike/solvers/*` (the math), `spike/cli.js` (CLI), `spike/smart-paste.js` (the paste parser).

---

## 1. The solver's coverage — so you can target its weak spots

From `docs/exam-coverage.md`. Use this to make the mock exam span the whole range, not just the green.

**Solidly covered (computational):**
- P1 ODE→TF (poles), state-space→TF; multi-block reduction (Block Diagram mode)
- P2 compose G(s) from a Bode read-off (DC dB + slope corners + phase events)
- P3 gain/phase margins, stable-K range (Routh, RHP plants)
- P4 second-order specs (Mp↔ζ↔ωₙ↔t_p↔t_s↔ω_BW…), closed-loop TF + 1 metric → K, K-for-Mp/ζ spec
- P5 K_P from ess, ess table (type, Kp/Kv/Ka, step/ramp/parabola)
- P6 PI-Lead / Lead-Lag design (α, N_i, K_P, β, full design), P-controller for a target PM
- P7 feed-forward form picker, nested-loop ess gains
- Analysis: bandwidth (−3 dB), dominant-pole settling, closed-loop stability (RHP-pole count /
  Nyquist verdict from a given TF), step response y(t) (inverse-Laplace, distinct poles), characterize
  (poles + ζ/ωₙ + 2nd-order table)

**Permanent gaps — NOT solver-shaped (include several; the student must reason these out):**
- **Pick-the-correct-plot** — choose the matching Bode / Nyquist / step-response figure from options.
- **Conceptual true/false** — "which statement about bandwidth / PM / Lead placement is correct".
- **Symbolic proofs / derivations** — prove φ_m, the first-order relations, the Lag-β ess reduction.

**Known gap, not yet built (include at least one):**
- **Linearize a nonlinear ODE at an operating point → TF.** Recurs in real exams; the solver can't do it.

**Things that LOOK like gaps but the forms now handle:** reading a value (t_p, Mp, GM_dB, φ_G, G(0))
off a provided plot and typing it into a form. Include these — they test the read-off → form workflow.

**Traps worth planting (the tool should survive these gracefully):**
- A question whose printed data contradicts its answer key (real exams have these: `s+21` vs `s+2.1`;
  `α=0.001` vs `α=0.01`). The tool has a "no confident match" guard — see if it flags the mismatch
  instead of bluffing.
- A **dB-vs-linear** DC-gain question (the G(0) unit trap).
- Distractor options that are *near* each other so the option-matching is genuinely exercised.

---

## 2. Real exam format & style (match this)

Reference PDFs (real past exams, read a couple for tone):
`C:\Users\Mads2\DTU\Obsidian\Courses\34722 Linear Control Design 1\Exercises\Solutions\Past Exams\`
(e.g. `LCD1 F22 - Questions with answers.pdf`, `LCD1 S21 - Questions with answers.pdf`).

Conventions:
- Title: **"EXAM Linear Control Design 1 — <date> — Questions, Multiple Choice"**, ~10–20 questions,
  **(1 Point)** each. Running footer like "10 questions LC1 exam <date>".
- Each question: a prompt, often a figure (block diagram / Bode / Nyquist / step response), then
  **4–5 numbered options**. Real plants are low-order with clean numbers.
- Topic mix in a typical paper: 1× block reduction, 1–2× first/second-order response (often pick-a-plot),
  1–2× Bode (compose or pick-a-plot or read-off), 1× DC gain, 1× ODE/state-space poles, 1–2× stability
  (Routh / Nyquist / margins), 1× ess, 2–4× controller design (P / PI-Lead / Lead-Lag / feed-forward),
  1–2× conceptual, sometimes 1× linearization.
- Provide an **answer key with worked reasoning** (like the real "Solutions" PDFs). Keep two artifacts:
  a **Questions** PDF (what the user solves) and a **Solutions** PDF (to verify against).

---

## 3. How to build the PDF

You need real figures for the visual questions — that's part of the challenge. Two viable paths:

- **LaTeX (closest to the real exams):** write `.tex`, compile with `pdflatex`. Generate figures with
  **matplotlib + python-control** — that stack is installed in the sibling repo `C:\Users\Mads2\lcd1-solver`
  (it's how the real solution plots were made). Save figures as PNG/PDF and `\includegraphics` them.
- **The `pdf` skill** (anthropic-skills:pdf) if LaTeX isn't available — assemble the PDF directly,
  embedding matplotlib-generated figure images.

Either way: use `python-control`/`numpy`/`matplotlib` to produce authentic Bode/Nyquist/step plots so
the "pick the plot" and "read off the plot" questions are real, not faked.

Suggested output location: a new `mock-exams/` folder, e.g. `mock-exams/Mock-Exam-1-Questions.pdf`
and `mock-exams/Mock-Exam-1-Solutions.pdf`. (Add `mock-exams/*.pdf` to `.gitignore` if large, or
commit them — ask the user.)

---

## 4. The stress-test workflow (do this together)

1. **Generate** the mock exam (Questions PDF + Solutions PDF), spanning the full coverage map per §1,
   with realistic figures and distractors. Aim for ~12–18 questions. Decide the answer key as you write.
2. Hand the **Questions PDF** to the user. They solve each question **using the app** as in a real exam
   — Smart Paste, the forms, Block Diagram mode, and/or the CLI (`node spike/cli.js …`).
3. For **each** question, record together:
   - the answer the user got with the tool vs the key;
   - **how** they got it (which mode/form), and whether the tool got there cleanly, with friction, or
     not at all;
   - the failure class if it failed: **genuine gap** (solver-shaped problem it can't do) / **UX friction**
     (it can compute it but the input was awkward) / **wrong answer / bug** / **input not expressible**.
4. You can **also drive the CLI yourself** in parallel to cross-check each computable question.
5. Produce a short **stress-test report** (`docs/stress-test-1-findings.md`): per-question outcomes, the
   distinct failure modes, and a prioritized fix list. Then fix the real bugs/gaps with TDD (mirror the
   existing `spike/test/*` style; keep `npm test` green) and commit.

**Conventions for this repo:** commits read like a human wrote them — **no AI attribution**, no
Co-Authored-By. Windows-first; use `PAGER=cat`. Keep everything offline and the single self-updating
bundle intact (`bundle.js` and `node_modules/` are gitignored; the in-app "Check for Updates" does
git pull + rebuild + reload).

---

## 5. Definition of done for the session

- A realistic mock exam PDF exists that genuinely challenges the tool (includes pick-the-plot,
  conceptual, a linearization, Nyquist, and a planted data/answer mismatch — not only green questions).
- The user has attempted it with the app and you've logged, per question, what worked and what didn't.
- A findings report with a prioritized fix list, and at least the clear bugs fixed (tests green).

Start by reading `docs/exam-coverage.md`, skim two real exam PDFs for tone, then draft the question list
and run it past the user before generating the full PDF.
