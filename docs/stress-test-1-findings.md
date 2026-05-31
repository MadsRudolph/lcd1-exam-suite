# Stress-test 1 — findings (Mock Exam 1)

**Date:** 2026-05-31
**Method:** Mock Exam 1 (`mock-exams/`) solved with the app, question by question.
Per question we record: the answer the app gave vs the key, *how* it was obtained
(mode/form/CLI), and the outcome class —
**OK** (clean) / **friction** (computes it but awkward input) / **gap** (not
solver-shaped) / **bug** (wrong answer or missing guard).

Answer key (python-control, agrees with the JS engine): Q1 `10/(s²+15s+24)`,
Q2 `−2±3j`, Q3 `1/(s²+5s+6)`, Q4 plot 1, Q5 6 dB, Q6 `200/((s+2)(s+10))`,
Q7 plot 1, Q8 GM 7.6 dB / PM 23°, Q9 `0<K<90`, Q10 plot 1, Q11 0.5, Q12 K≈11.4,
Q13 K_P≈3.41, Q14 (typo) app flags no-match, Q15 `1/(s²+s+2)`, Q16 option 1.

## Per-question log

| Q | Class | App route used | Result vs key | Notes |
|---|---|---|---|---|
| 1 | **bug (fixed)** | Block Diagram mode | correct (opt 1) | wire take-off reworked: drag a branch off any wire point; multi-tap; strict out↔in rule (tested) |
| 2 | **bug (fixed)** | Smart Paste | poles −2±3j ✓ | ODE coeffs never extracted (route returned `{}`); diacritic ÿ/ẏ now parsed |
| 3 | gap | Smart Paste / form | n/a | state-space matrix not parsed from garbled copy → use the SS form |
| 4 | gap (visual) | — | n/a | pick-the-step-plot — not solver-shaped |
| 5 | bug (open) | Smart Paste | mis-routed | "DC gain in dB" routes to margins; needs a DC-gain route (trap Q) |
| 6 | gap (visual) | bode form | n/a | determine G(s) from a Bode figure |
| 7 | gap (visual) | — | n/a | pick-the-Bode-plot |
| 8 | OK | Smart Paste | GM 7.6 dB ✓ | works after split-fraction fix |
| 9 | **bug (fixed)** | Smart Paste | K∈(0,90) ✓ | symbolic-K plant `K/den` rejected; now normalised to `1/den` (range-option crown still TODO) |
| 10 | gap (visual) | — | n/a | pick-the-Nyquist-plot |
| 11 | **bug (fixed)** | Smart Paste | ess 0.5 ✓ | split-fraction fix + ess match-key now keyed on ramp/parabola |
| 12 | **bug (fixed)** | Smart Paste | K≈11.4 ✓ | closed-loop TF read from text (was a wrong hard-coded default); match on K not Mp |
| 13 | bug (open) | Smart Paste / form | mis-extract | PI-Lead "find K_P" reads unknown wrong → use the PI-Lead form |
| 14 | OK (by design) | Smart Paste | flags 90% off ✓ | plant now extracted; guard correctly refuses the planted typo |
| 15 | gap (un-built) | — | n/a | linearization — solver can't; do by hand then use ODE→TF/TF form |
| 16 | gap (conceptual) | — | n/a | true/false — mis-routes to P_for_PM, harmless |

## Findings already surfaced during CLI cross-check (pre-run)

1. **CLI `question` bypasses the no-confident-match guard (Q14).** The app's
   Smart Paste path (`lcd-engine.js` → `match.js`) flags a mismatch
   ("closest, but 90% off") for the planted `s+21` typo, but the CLI
   `question` command (`spike/cli.js`) prints the raw `K_P=623.7` with no
   option-matching at all. The two documented Smart-Paste front-ends disagree.
   *Class: bug / inconsistency.*

2. **`k-for-spec` vs `closed-loop` disagree on the same TF string (Q12).**
   `k-for-spec "K/(s²+4s+K)" "Mp<=0.1"` → K=10.45 (treats arg as open-loop L,
   forms L/(1+L)); `closed-loop "K/(s²+4s+K)" --kind Mp --value 0.1` → K=11.45
   (treats arg as the closed loop). Same-looking input, different answers, no
   warning about which interpretation is in play. *Class: friction / footgun.*

3. **Block Diagram: a wire could only be tapped once (Q1).** *(FIXED)*
   A multi-loop diagram needs the output to fan out to several take-off branches
   (Q1: inner feedback + outer feedback both tap G2's output). Each wire drew a
   single green tap port at its midpoint *inline* during `drawConnection`, so the
   first branch wire — and every wire drawn after it in the render loop — painted
   over the port, leaving it unclickable. The data model already allowed multiple
   branches (`tapConnId`); only the render order blocked it.
   *Fix (final, after testing in-app):* the single green-dot tap was fragile (tiny
   target, grabbed the wrong element, branches detached, only one branch). Reworked
   the wire interaction in `canvas.js`:
   - **plain drag** on a wire moves/reshapes it (restored — the rework had
     temporarily broken this);
   - **Shift + drag** from any point on any wire (incl. branch wires) pulls a new
     take-off branch, anchored exactly where grabbed — fan out indefinitely;
   - **plain click** selects (for delete).
   Every wire has a wide transparent hit-area so it's easy to grab. The connect
   rule was extracted to a pure, tested `isValidPortConnection()` enforcing
   **output↔input only** (the output→output drag the student tried is provably
   rejected — `spike/test/canvas-connect.test.js`, 6 tests). The Shift+drag and
   drag gestures were added to the Keyboard Shortcuts panel (`index.html`).
   *Class: bug. Verify: reload app.*

   Also fixed alongside: the Q1 figure in the mock exam itself rendered cramped
   (summing-junction signs/feedback routing) — redrawn in `exam-content.tex`.
   (Authoring issue, not the app.)

4. **Smart Paste dropped split transfer-function fractions.** *(FIXED)* Copying
   from the PDF puts the numerator on the label line (`G(s) =20`) and the
   denominator on the next line (`s(s+2)(s+5)`), sometimes with prose trailing it
   (`s(s+ 21), find ...`). `extractTf` grabbed only the numerator and returned a
   bare constant, breaking **every** TF question (Q5, Q8, Q9, Q11, Q14, …).
   *Fix:* `smart-paste.js extractTf` rejoins the numerator with the next line's
   math prefix; a symbolic gain numerator (`K/den`) is normalised to `1/den`.

5. **Closed-loop route used a wrong hard-coded default (Q12).** *(FIXED)* When
   `extractTf` failed on the symbolic-K closed loop, the route silently fell back
   to `K/(s**2+2*s+K)` — the wrong `s` coefficient — so Q12 computed K≈2.9 instead
   of 11.4. *Fix:* new `extractClosedLoopTf()` reconstructs `K/(s**2+4*s+K)` from
   the split, K-bearing text and validates it with K=1. Also, "**choose K** so
   that <spec>" now matches options on **K**, not the spec metric.

6. **ODE coefficients were never extracted (Q2).** *(FIXED)* The ODE route
   returned `inputs:{}`, so the solver had nothing to chew on. *Fix:* new
   `extractOde()` parses the derivative notations a PDF emits — ÿ/ẏ (Unicode
   diacritics U+00A8/U+02D9), `y''`/`y'`, `\ddot`/`\dot`, `y(2)`/`y(1)` — into
   `y_coeffs`/`u_coeffs`.

7. **ess matched the whole dict ambiguously (Q11).** *(FIXED)* A ramp question
   only set a match key for *step*; ramp/parabola fell back to auto-matching the
   whole result dict (type, K_v, 0, …) and crowned the wrong option. *Fix:* key on
   the named input — `ess_ramp` / `ess_parabola` / `ess_step`.

All six fixes are covered by `spike/test/smart-paste-pdf.test.js` (9 tests).
Verified end-to-end through the **app engine path** (`routeQuestion` + `runSolver`),
not just the CLI.

### Still open (lower priority)
- **Q5** "DC gain in dB" routes to margins — needs a DC-gain route + numeric match.
- **Q13** PI-Lead "find K_P" mis-reads the unknown — use the PI-Lead form for now.
- **Q3** state-space matrix isn't parsed from garbled copy — use the SS form.
- **Q9** stable-K range options (`0<K<90`) aren't auto-crowned (range-vs-range match).
- Genuine gaps (by design): pick-a-plot (Q4/6/7/10), conceptual (Q16),
  linearization (Q15) — Smart Paste shouldn't pretend to solve these.

## Prioritized fix list

1. **[done]** Block Diagram multi-tap per wire (finding 3).
2. Decide whether the CLI `question` command should run the option-matching
   guard like the app does (finding 1), or document that it intentionally
   doesn't.
3. Consider a clarifying label/warning when `k-for-spec` vs `closed-loop` are
   given the same string (finding 2).
- Added in-app transfer-function plots (step/Bode/Nyquist/pole-zero), annotated,
  computed in the JS engine — see docs/superpowers/specs/2026-05-31-transfer-function-plots-design.md.
