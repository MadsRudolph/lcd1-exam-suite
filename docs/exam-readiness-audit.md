# LCD1 Solver — full exam audit & readiness report

**Date:** 2026‑06‑01 (exam: 2026‑06‑02)
**Scope:** every question from every past‑exam set I could find, run through the **exact code the GUI
solver runs** (`smartPaste` + `runSolver` in `lcd-engine.js`, plus the live dashboard read‑outs),
cross‑checked against the official solutions and grounded against the 34722 lecture material in
NotebookLM where a convention was ambiguous.

> How this was done: a headless harness (`exam-harness.src.js` → `exam-harness.mjs`) imports the same
> engine functions the Electron UI calls and runs a battery of cases (`exam-cases.json`). This is
> faithful to "the GUI solver" because the math, the input‑forgiveness and the option‑matcher are all
> shared code — only the rendering differs. Re‑run any time with
> `node exam-harness.mjs exam-cases.json`.

---

## Corpus

| Set | Questions | Source |
|---|---|---|
| F22 — 25 May 2022 (Exam A) | 10 | `eksdok/EXAMS_LCD1_2022…` + solutions |
| F22 — questionnaire (Exam B, Q11–20) | 10 | same PDF + solutions |
| S20 (Spring 2020) | 19 | `Exam_S20.pdf` (with solutions) |
| S21 (Spring 2021) | 20 | `Exam_S21.pdf` (with answer key) |
| ReExam F21 (18 Aug 2021) | 10 | `REExam_F21 with Solutions.pdf` |
| Final Test (short) | 11 | `Final Test Exam (Short version).pdf` |
| Theoretical Exercises | 10 | Obsidian course folder (+ solutions) |
| F21 Part 2 (no answers) | 10 | `Exam_F21_LCD1 Part 2 …` (== S21 Q11–20) |
| Mock Exam 1 (in‑repo) | 16 | `mock-exams/` (+ solutions) |
| **Total** | **116** (≈106 unique) | |

Each question was classified: **solver‑shaped** (a value drops out of a solver), **block‑diagram**
(belongs in the graphical Block Diagram mode), or **not‑solver‑shaped** (pick‑a‑plot / conceptual /
proof).

---

## Verdict

**The numerics are excellent. The packaging around them was the weak point — and that is now fixed.**

* Of the solver‑shaped questions I ran, **every one produced the correct value** (matching the official
  facit), apart from two cases where the *exam itself* has a misprint (F22 Q6 `s+21`→`s+2.1`, F22/Mock
  Q19/Q14 `α=0.001`→`0.01`) — and there the tool correctly refuses to flag a wrong option.
* Standouts: S21 Q14 phase margin **97.7°** (exact), Final‑Test Q7 PI‑Lead **K_P = 6.61** (exact),
  S21 Q19 nested‑ess **K₂ = 79.17** (exact), the full PI‑Lead/Lead‑Lag design block, stable‑K with RHP
  plants, ess tables, 2nd‑order specs — all dead‑on.
* The recurring exam shapes the solver **cannot** touch are the ones no numeric tool can: *pick the
  matching Bode/Nyquist/step plot*, *which statement is correct* (theory), and *prove this relation*.
  Those are ~30–40% of a typical paper and are an inherent ceiling, not a bug. The tool can still
  **verify the underlying G(s)** behind a pick‑a‑plot question (compute ζ, poles, margins, then eyeball
  which figure fits).

---

## What was broken — and is now fixed (tonight)

All fixes shipped with tests; full suite **393/393 green** and `bundle.js` rebuilt.

### 1. Option matching didn't work on real exam options — **FIXED** (the big one)
The headline feature is "flag which multiple‑choice option matches." It was silently failing on the
way options are *actually written*. Every option of the form `1. K = 8.4`, `a) 0.5`, `5. 88`,
`GM 7.6 dB, PM 23`, `4.3 %` came back **`unparseable`**, and the matcher then printed a misleading
"computed value isn't close to any option" — even when the right option was sitting right there.

* **Root cause:** `parseNumber` accepted only a bare number/fraction; it didn't strip the list marker
  (`1.`, `a)`, `(c)`), the quantity label (`K =`, `GM =`, `α =`), or units (`%`, `rad/s`, `°`).
* **Also broken:** the stable‑K matcher tried to parse each option as a *single* number, so it could
  never match a **range‑shaped** option like `0 < K < 8` (the most common stable‑K answer format) — it
  even failed to flag `0 < K < 8` against a computed `(0, 8)`.
* **Fix:** hardened `parseNumber` (strips enumerators/labels/units, decimals like `0.4` are still safe);
  added a range‑aware stable‑K matcher that handles both `a < K < b` / `(a,b)` / `K > a` intervals **and**
  single‑candidate gains; Smart Paste now preserves range options instead of collapsing `0<K<90` to `0`.
* **Result:** option auto‑flagging went from **0/18 → 14/18** of the option‑bearing exam questions I
  ran (the other 4 are: one correct rejection of the exam typo, two read‑off roundings >15% that are
  *correctly* declined with a "closest, but X% off" note, and one overshoot‑% key nuance — see gaps).

### 2. Smart Paste choked on unicode superscripts — **FIXED**
Pasting `G(s) = 12/(s²+5s+6)` straight from a PDF returned **no transfer function** (the extractor's
character set stopped at `²`), despite the README claiming superscripts are repaired. Now `s²` is
normalised to `s**2` during extraction; the DC‑gain example pastes and computes 6.02 dB correctly.

### 3. Linearization died on every nonlinear term — **FIXED (numeric fallback)**
`linearize_tf` is polynomial/rational only, so `sin`, `√`, `exp` failed — and the error was the
*misleading* "f must not depend on the Laplace variable s" (the `s` in `sin`/`sqrt` tripped the guard).
Linearizing a nonlinear ODE recurs in **4–5 exams** (S20 Q2, ReExam F21 Q1, Final‑Test Q2, Mock Q15…).

* **Fix:** when the symbolic core can't handle `f`, fall back to a **numeric** first‑order linearization
  (central differences for ∂f/∂x and ∂f/∂u at the operating point), which handles `sin/√/exp/log`.
  S20 Q2 now returns **108.7/(s+0.653)** — exactly the facit. When constants are left symbolic (e.g.
  `k`, `R`, `B`), it now gives a clear, actionable message ("substitute the constants as numbers")
  instead of the confusing Laplace error.

### 4. Cosmetic: DC gain in dB + clean poles — **FIXED**
`characterize` now also reports **DC gain (dB)** (questions ask for it directly, e.g. F22 Q7 → 6.02 dB),
and repeated/origin poles no longer display float dust like `1.7e-44+1.414j` (snapped to `0`).

---

## Remaining gaps — now addressed

All seven gaps from the first pass are resolved: four natively in JS, three via a **MATLAB reference**
(the tool emits ready‑to‑run MATLAB for the heavy symbolic types rather than rebuilding a CAS, since
MATLAB is available anyway). Full suite **403/403 green**; `bundle.js` rebuilt.

1. **ess with a P‑controller in a branch** (S21 Q16, Theory Q5, F21P2 Q16) — **FIXED (native).** The P5
   ess form has an optional **K_P** field; the loop becomes K_P·G so `ess_step = 1/(1+K_P·G(0))`
   (NotebookLM‑confirmed). S21 Q16 now returns 0.2 and flags the `0.2` option.
3. **State‑space → TF pole/zero cancellation + reduced‑TF matching** (ReExam F21 Q6) — **FIXED (native).**
   The displayed TF is reduced (`(10s+10)/(s²+2s+1)` → `10/(s+1)`), and the option matcher now compares
   rationals by cross‑multiplication (`a/b = c/d ⇔ a·d = c·b`), so a reduced‑form option matches an
   unreduced computed TF (and `2/(s+1) ≠ 1/(s+1)` is still distinguished). ODE→TF / SS→TF results now
   run the TF option matcher too.
6. **GM in dB from a Nyquist crossing** (F22 Q11) — **FIXED (native).** New calculator: enter the
   crossing distance `d` → `GM = 1/d`, `20·log₁₀(1/d)` dB, and the critical gain `1/d`; flags the dB option.
7. **Overshoot‑% option matching** (ReExam F21 Q10) — **FIXED (native).** When 2nd‑order options are
   written as percentages, the matcher targets `Mp%` instead of `ζ`, so `4.3 %` is flagged.
2. **Time‑domain response y(t)** (ReExam F21 Q7, Q8) — **MATLAB reference.** New "Time response y(t) —
   MATLAB" calculator emits `Y=G·U; y=ilaplace(Y)` plus the initial/final‑value theorems, pre‑filled
   with your G(s) and input.
4. **2nd‑order / mixed‑term linearization** (Final‑Test Q2, Mock Q15) — **partly native + MATLAB ref.**
   First‑order transcendental linearization runs natively (numeric fallback); the "Linearize → TF —
   MATLAB" calculator covers sin/√/exp and higher‑order ODEs (symbolic Jacobian / state‑space recipe).
5. **Stability range in a state‑matrix parameter** (F22 Q9) — **MATLAB reference.** New "Parameter
   stability — MATLAB" calculator emits `charpoly` + `eig`/Routh to solve for the stable region of a
   literal parameter.

> The three MATLAB‑reference calculators live in the **Calculators** strip; each shows a **⧉ Copy
> MATLAB** button. Use them when MATLAB is the faster route — the JS tool no longer pretends to do
> everything.

---

## Exam‑day guide — fastest path per question type

The single biggest "ease" win: **paste the question, read the board, then use a Design chip.** The
solver never auto‑answers from a paste (by design — a mis‑read can't masquerade as a confident letter),
so always sanity‑check the read‑out before trusting the green ✓.

| If the question is…                           | Do this                                                                                        | Reads out                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| "poles of this ODE / system"                  | **P1 ODE→TF** (type the coefficients, highest order first)                                     | poles, DC gain                                  |
| "transfer function from this state space"     | **P1 State‑space→TF** (A,B,C,D as `[[…]]`)                                                     | G(s), poles                                     |
| "DC gain in dB"                               | type G(s) in the **System box** → read **DC gain (dB)**, or **Characterize**                   | dB now shown                                    |
| "gain/phase margin, ω_c, ω_π"                 | **System box** → margins read‑out (or **P3 Margins**)                                          | GM, GM dB, PM, ω_gc, ω_pc                       |
| "range of K for stability"                    | **Design → Stable‑K range** (handles RHP plants)                                               | K interval; paste the options to flag the range |
| "K for phase margin PM"                       | **Design → P for PM**                                                                          | K_P, ω_c                                        |
| "PI‑Lead / Lead‑Lag design (α, K_P, β)"       | **Design → PI‑Lead**; pick the unknown; read φ_G off the Bode phase plot if asked              | the parameter, + option flag                    |
| "overshoot / ζ / ωₙ / t_p / t_s"              | **P4 2nd‑order specs** (fill any subset). For a *step plot*, **P4 From a step‑response plot**  | full 2nd‑order table                            |
| "K so overshoot ≤ X%"                         | **Design → K for transient spec**, spec `Mp <= 0.12`                                           | K boundary                                      |
| "closed‑loop K from one metric"               | **P4 Closed‑loop + 1 spec** (note the closed‑loop TF has `+K`)                                 | K + table                                       |
| "steady‑state error / system type"            | **System box** (type/ess auto), or **P5 ess table** — put the P‑gain in the **K_P** field if the loop has one (forward or feedback) | type, K_p/K_v/K_a, ess |
| "K_P from a target ess"                       | **P5 K_P from ess**                                                                            | K_P                                             |
| "nested‑loop ess (find K₂ / K_P)"             | **P7 Nested ess**                                                                              | the gain                                        |
| "feed‑forward controller form"                | **P7 Feedforward form**                                                                        | option letter + formula                         |
| "linearize this nonlinear ODE"                | **Linearize → TF** (1st‑order, incl. sin/√/exp). Higher order → **Linearize → TF — MATLAB**     | G(s), pole, gain                                |
| "evaluate G(jω) / find ω for a gain or phase" | **Analysis → evaluate G(jω)**                                                                  | G dB, ∠G, ω                                     |
| "gain margin from a Nyquist crossing"         | **GM from a Nyquist crossing** — enter the crossing distance d                                  | GM (dB), GM (linear), critical gain 1/d         |
| "find y(t) / the time response"               | **Time response y(t) — MATLAB** (copy & run)                                                    | MATLAB: y(t), y(0⁺), y(∞)                       |
| "for which parameter values is it stable"     | **Parameter stability — MATLAB** (copy & run)                                                   | MATLAB: charpoly + stability region             |
| "block diagram → TF"                          | **◧ Block Diagram mode** — draw it, Solve Loop, then *Use in LCD1 Solver*                      | exact symbolic TF                               |
| "pick the matching Bode/Nyquist/step plot"    | type the candidate G(s), open **Plots**, overlay the exam figure                               | not auto‑answered — eyeball                     |
| "which statement is correct / prove…"         | not solvable — use your own knowledge                                                          | —                                               |

**Pasting tips that now work:** garbled superscripts (`s²`), unicode minus, `G(s) =` labels, and
flattened fraction bars are all repaired; options written `1. K = 8.4`, `a) 0.5`, `0 < K < 90`,
`GM 7.6 dB`, `4.3 %` are now parsed and flagged.

**Two known exam misprints** (the tool is right, the PDF is wrong): F22 Q6 prints `K/(s(s+21))` but the
answer needs `s+2.1`; the PI‑Lead Q19 prints `α=0.001` but needs `α=0.01`. If the tool flags "no
confident match," double‑check the printed plant for this.
