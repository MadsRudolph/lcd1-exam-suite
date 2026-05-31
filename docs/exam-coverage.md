# Exam coverage audit — what the solver can and can't do

**Date:** 2026-05-31
**Scope:** every past-exam PDF in the Obsidian `34722 Linear Control Design 1 / Past Exams` folder —
F22, ReExam F22 (17 Aug 22), S21, S20, ReExam F21 (18 Aug 21), the Final Test, and the Theory
exercises. ~110 questions total. Each question was mapped to a solver and the covered ones were
**run through the CLI** to confirm the numbers come out right.

## Verdict

The solver covers the **computational core of every exam** — block reduction, ODE/state-space → TF,
margins, stable-K, second-order specs, steady-state error, and the full PI-Lead/Lead-Lag design
block. The questions it can't do fall into a few clear buckets, most of which are **not
solver-shaped** (pick-a-plot, prove-this, define-that). A smaller set are real math we *could* add.

| Exam | Questions | Computationally covered | Out of scope (visual/conceptual) | Addable math gap |
|---|---|---|---|---|
| F22 (25 May 22) | 10 | 6 | 3 | 1 |
| ReExam F22 (17 Aug 22) | 20 | 11 | 6 | 3 |
| S21 (31 May 21) | 20 | 12 | 8 | 0 |
| S20 (Spring 20) | 19 | 8 | 9 | 2 |
| ReExam F21 (18 Aug 21) | 20 | 11 | 6 | 3 |
| Final Test | 11 | 6 | 4 | 1 |
| Theory | 10 | 5 | 5 | 0 |

(“Computationally covered” counts questions where, once any value read off a plot is typed into the
form, the solver produces the answer.)

## CLI verification — covered types all give the right answer

Run from `spike/`:

| Exam Q | CLI command | Result | Facit |
|---|---|---|---|
| F22 Q7 (DC gain) | `tf "12/((s+2)*(s+3))"` | 2 (6.02 dB) | 6 dB ✓ |
| F22 Q8 (ODE poles) | `ode --y "5,1,0.5" --u "3"` | −0.1 ± 0.3j | −0.1 ± 0.3j ✓ |
| F22 Q5 (Bode→G) | `bode --dc 6.02 --corners "1:-20,1:-20,2:20" --phase ...` | poles −1,−1; zero +2 | (s−2)/(1+s)² ✓ |
| F22 Q6 (P for PM) | `p-for-pm "1/(s*(s+2.1))" 40` | K_P = 8.18 | 8.4 ✓ |
| S21 Q4 (stable-K) | `stable-k "1/(s+1)**3"` | (0, 8) | 0 < K < 8 ✓ |
| S21 Q9 (K for Mp) | `k-for-spec "K/(s*(s+5))" "Mp <= 0.12"` | 19.97 | ~20 ✓ |
| S21 Q17 (lag β) | `pi-lead --unknown beta --gammaM 70 --phiG -142.891 --alpha 0.2 --Ni 3` | 1.99 | 2 ✓ |
| ReExam F21 Q6 (SS→TF) | `ss --A "[[-1,0],[0,-1]]" --B "[[1],[9]]" --C "[[1,1]]"` | poles −1; DC 10 | −1; 10 ✓ |
| ReExam F21 Q4 (ess) | `ess "5*(s+4)/(s**2*(s+1)*(s+20))"` | type 2; ess_par 1 | type 2; 1 ✓ |
| ReExam F21 Q18 (design) | `pi-lead --unknown design --G "..." --wc 10 --gammaM 45 --Ni 8` | α 0.080; K_P 200 | 0.08; 200 ✓ |
| F22 Q19 (PI-Lead K_P) | `pi-lead --unknown KP --G "900/(...)" --gammaM 75 --alpha 0.01 --Ni 3` | 3.414 | 3.4154 ✓ |
| P4 closed-loop | `closed-loop "K/(s**2+2*s+K)" --kind Mp --value 0.163` | K 4.0; ζ 0.5; ω_n 2 | ✓ |
| Theory Q9 (nested) | `nested-ess --arch two_KP_same --G0 0.75 --ess 0.25` | 4 | 4 ✓ |
| margins | `margins "1/(s+1)**3"` | GM 8 (18.06 dB) | 8 ✓ |
| Theory Q8 (feed-fwd) | `feedforward --n 3 --D 2` | option d | d ✓ |

Every computationally-covered family checks out. (`ode`, `ss`, `closed-loop`, `k-for-spec`,
`feedforward`, and `pi-lead --unknown design/beta` were added to the CLI for this audit.)

## Gap categories

### Permanent — not solver-shaped (don't try to automate)
1. **Pick-the-correct-plot (visual).** Choose the matching Bode/Nyquist/step-response figure from 4–5
   options. The single most common gap (most exams have 2–4). A numeric solver can't eyeball plots.
2. **Conceptual / theory true-false.** "Which statement is correct" about bandwidth, phase margin,
   Lead placement, K_P effects. No single numeric answer.
3. **Symbolic proofs / derivations.** Theory Q1–Q3, Q10 (prove φ_m, the first-order relations, the
   Lag-β ess reduction). The tool computes values, it doesn't write proofs.

### Already handled by the new forms (the read-off bucket)
Questions where a value (t_p, Mp, GM_dB, phase, DC gain, bandwidth) must be **read off a plot** and
then computed. The agents first flagged these as gaps, but the **editable forms** added earlier mean
the student reads the number, types it in, and solves. e.g. Final A3/A4, Theory B6, several Bode
read-off questions. **No action needed** — this is exactly why the forms matter.

### Addable math (recurring, worth considering — ranked)
1. **Linearization of a nonlinear ODE at an operating point**, then ODE→TF. Recurs **4×** (S20 Q2,
   ReExam F22 Q1, ReExam F21 Q1, Final A2). Highest-value addition; needs symbolic partial
   derivatives.
2. **Nyquist stability from a given TF** — encirclement count + K_P to stabilise an RHP plant. Recurs
   several times. We already compute the negative-real-axis crossing inside stable-K, so a `nyquist`
   command is a moderate extension (only works when the plant TF is given, not figure-only).
3. **Bandwidth & settling time of a general TF** (not just 2nd-order). ReExam F22 Q7 (settling),
   S20 Q7 (bandwidth). Easy — reuses the existing complex-eval + root finder.
4. **Inverse-Laplace / partial-fraction time response y(t)** and final value. ReExam F21 Q7, Q8.
   Moderate (residues).
5. Niche one-offs: nonlinear static-equilibrium algebra (S20 Q1, ReExam F21 Q2); Laplace of a forced
   ODE with nonzero ICs (ReExam F22 Q9); pre-filter τ_f from a resonance peak (ReExam F21 Q18).

## Two exam typos found along the way
The audit re-surfaced two questions whose printed data contradicts the official answer (the solver is
correct; the PDF has a misprint):
- **F22 Q6:** prints `K/(s(s+21))` but the answer 8.4 requires `s+2.1` (`s+21` → K≈817).
- **F22 / ReExam Q19:** prints `α = 0.001` but the answer 3.4154 requires `α = 0.01`.
The "no confident match" guard added earlier means the tool now flags these instead of silently
returning a wrong option.
