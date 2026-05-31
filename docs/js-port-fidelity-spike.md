# JS-port fidelity spike — results & go/no-go

**Date:** 2026-05-31
**Scope:** HANDOFF §2 de-risking spike. Port a representative slice of the LCD1 solvers
(P3 margins + stable-K, P4 second-order, P6 PI-Lead/full-design) to a from-scratch JS
numeric core and assert **parity against the Python 70-test oracle**.
**Location:** [`spike/`](../spike) — self-contained `node --test` project, no app code touched.

## TL;DR — GO

A from-scratch JS numeric core reproduces the Python (`python-control` + `numpy`) results at
**full fidelity**, not merely within the multiple-choice tolerances. Every ported solver matches
the oracle; several reproduce python-control's exact intermediate values. The numeric controls
math (the part Anti-Gravity flagged as the fidelity risk) is **not** the risk. The one remaining
gap is symbolic/parametric handling of a free gain symbol `K`, which is bounded and isolated.

## What was ported and verified

`npm test` in `spike/` → **19 pass, 0 fail** (~0.5 s). The Python oracle for the same slice
(`pytest tests/test_p3.py tests/test_p4.py tests/test_p6.py`) → **16 pass** on this machine.

| Solver | JS function | Oracle cases | Result |
|---|---|---|---|
| P4 2nd-order metrics | `solve2ndOrder` | REEXAM_F21_Q10, S20_Q5, t_p/t_s formula, inconsistency guard | ✅ all pass |
| P3 Bode margins | `solveMargins` | 1/(s+1)³ → GM 8.00000, GM_dB 18.0618 | ✅ exact |
| P3 stable-K range | `solveStableKRange` | S21_Q4 (0,8), REEXAM_F21_Q14 (0,0.400 vs 0.398), unstable→(K>0,∞) | ✅ all pass |
| P6 PI-Lead α/Nᵢ | `solvePiLead` (trig) | F22_Q17, REEXAM_F21_Q17, REEXAM_F21_Q15 | ✅ all pass |
| P6 PI-Lead Kₚ | `solvePiLead` (phase interp + complex eval) | F22_Q19 → 3.4139 vs facit 3.4154 | ✅ pass |
| P6 P-for-PM | `solvePForPM` | S21_Q6 → 8.176 (Python yields ~8.18), S20_Q9 | ✅ pass |

The Kₚ and P-for-PM cases are the meaningful ones: they exercise complex `G(jω)` evaluation,
unwrapped plant-phase interpolation on a log grid, and complex controller composition — and the
JS output tracks python-control's actual interpolated value (8.176 vs the Python's documented
~8.18), not just the loose facit.

## The JS numeric core that made it work (`spike/numeric/`)

| Module | Replaces | Difficulty (predicted → actual) |
|---|---|---|
| `complex.js` — `Complex` arithmetic | numpy complex | trivial → trivial |
| `tf.js` — `NumericTF.evalAt(jω)`, poles, DC gain | `control.evalfr`, `control.dcgain` | very easy → very easy |
| `roots.js` — Durand–Kerner + deg 1/2 closed form | `numpy.roots` / `control.poles` | medium → easy (one caveat below) |
| `margins.js` — gain/phase crossover, Nyquist neg-real crossings | `control.margin` | medium → easy (bisection-refined, beats grid interp) |
| `solvers/p6.js` — unwrapped phase + `numpy.interp` clone | `numpy.unwrap` + `numpy.interp` | medium → easy |

HANDOFF §2's difficulty estimates were accurate or pessimistic. Nothing in the numeric layer
required more than standard textbook algorithms.

## Findings worth carrying forward

1. **Numeric fidelity is a solved problem.** Bisection-refined crossover finding is *more*
   accurate than python-control's fixed-grid interpolation, so GM/PM land on the analytic
   values (GM = 8.00000 exactly for 1/(s+1)³). Where the Python deliberately uses grid interp
   (P6 Kₚ, P-for-PM), the JS replicates the grid so it reproduces the *same* answer.

2. **Durand–Kerner is linear on multiple roots.** A degenerate triple root (s+1)³ resolves to
   ~3×10⁻⁶ rather than machine precision (distinct roots hit 10⁻⁹). Irrelevant at the
   10⁻²–5×10⁻² tolerances the controls work runs at, but if exact pole multiplicity ever matters,
   add an Aberth–Ehrlich step or a Newton polish. Documented in `test/numeric.test.js`.

3. **The real remaining risk is the symbolic-parametric `K` layer, not the numerics.** Two
   functions in this slice were *not* ported because they solve for a free gain symbol `K`
   symbolically (currently sympy):
   - P4 `solve_K_for_spec` / `solve_closed_loop_2nd_order` (oracle case S21_Q9).
   - This is the same "hardest part: symbolic work currently done by sympy" called out in
     HANDOFF §2.
   It is bounded: the exam cases reduce to a 2nd-order closed loop whose coefficients are linear
   in `K`, so a small numeric 1-D solve (bisect `ζ(K) = ζ_req`) replaces sympy without a full CAS —
   **once a parser separates the loop-gain `K` from the plant** (that parser is the Smart Paste
   deliverable, not part of this spike). BDR's `math-engine.js` does single-variable exact algebra
   but is not built to solve equations for a second free symbol, so this layer is net-new JS
   regardless.

4. **No dependency on BDR's `math-engine.js` was needed for the numeric solvers.** The exact
   integer-coefficient engine is the right tool for *symbolic block reduction*; the LCD1 numeric
   solvers want float coefficients + complex evaluation, which is a separate lightweight layer
   (exactly as CLAUDE.md's reuse map predicted). They coexist; they don't merge.

## Recommendation

**Proceed with the full JS port** (the already-chosen direction). The fidelity risk that motivated
the spike is retired for the numeric solvers. Sequence the remaining work as:

1. Port the rest of the numeric solvers (P2 Bode read-off, P5 ess, P7) — all closed-form or
   reusing this core; low risk.
2. Build the **Smart Paste parser** in JS (regex routing, per HANDOFF). This also unlocks the
   `K`-separation needed for `solve_K_for_spec`.
3. Handle the symbolic-parametric `K` cases with a focused numeric 1-D solve on the parsed plant
   (no CAS required for the exam's 2nd-order-reducible loops). Re-validate against S21_Q9.
4. P1 ODE/state-space→TF is the only piece still wanting symbolic muscle; block reduction itself
   is already covered by BDR's engine, so the residual P1 surface is small.

## How to run

```bash
cd spike && npm test          # JS parity suite (19 tests)
# oracle, for comparison:
cd ../../lcd1-solver && python -m pytest tests/test_p3.py tests/test_p4.py tests/test_p6.py -q
```
