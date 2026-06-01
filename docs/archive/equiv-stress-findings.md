# Symbolic equivalence checker — stress-test findings

**Date:** 2026-05-31
**Target:** `symbolic/equiv.js → symbolicEquivTest(reference, optionLines)` (commit `fa7885f`,
"Add symbolic equivalence tester and route diagram TFs into it"), tested against the live working
tree.
**For:** the session building the CAS engine. This is the result of feeding the checker each
exam's keyed-correct simplified transfer function as the *reference* and checking it against the
**real multiple-choice option sets** transcribed from the past-exam PDFs, plus a controlled
algebraic-equivalence battery.

> ⚠️ **Snapshot caveat.** When this was run, the working tree had uncommitted edits to
> `symbolic/mpoly.js` (where the multivariate GCD lives) plus new `symbolic/{ess,linearize,
> solve-symbol,combinators}.js` and a new `spike/test/exam-cas.test.js`. The GCD blow-up below may
> already be under repair. Re-run the repros to confirm current state.

---

## Verdict

**The equivalence *relation* is correct. The *termination* is not — it hangs on ~21% of the real
symbolic exam questions.** Because `symbolicEquivTest` is synchronous and is wired into the app
(`lcd-engine.js` / `lcd-solver-ui.js`), each hang would **freeze the app UI** when a student checks
their answer on those questions.

### What works (correctness — no wrong verdicts anywhere it terminated)
- **14 / 18 real exam questions: perfect** — crowns exactly the keyed-correct option, rejects every
  distractor, emits the right canonical form. Examples of correct canonical output:
  - E20Q3 → `(G1G3 + G2G3) / (G1G3 + G2G3 + G3 + 1)`
  - E21Q15 → `c / (taus^2 + s + Kpbc)`
  - E23Q2 → `(C1C2G + C1G) / (C1C2GH + C1GH + 1)`
  - E25Q11 → `-a / (abk + 1)`
  - E15Q7 → `(bdgammas + bddelta) / (alphas^3 + (aalpha + alphac + beta)s^2 + (aalphac + abeta + betac)s + abetac)`
- **Controlled battery: 26 / 27.** Correctly judges *equal* forms that are: scaled by a constant,
  **scaled by a symbol** (`K/(K(s+b))`), expanded, factored, reordered, pole-zero-cancelled,
  **symbolically cancelled** (`K(s+a)/(K(s+a)(s+b)) ≡ 1/(s+b)`), and a full nested `L/(1+L)` feedback
  expansion. Correctly *rejects*: sign-flipped cross terms, dropped terms, inverted fractions, wrong
  feedback sign (`G/(1+GH)` vs `G/(1−GH)`), off-by-one constants, different variables.
- **Edge cases:** bad reference → `{ok:false}` with a "reference" error; malformed option
  (`1/(s+))`) → `unparseable` (no crash); `0` option → `no_match`; blanks ignored. (One nit: the
  prose option `"Cannot be calculated"` strips to `Cannotbecalculated` and parses as a single
  variable → `no_match` rather than `unparseable`. Verdict is still safe.)

### What breaks (termination)
**4 / 18 real exam questions hang (non-terminating):** **E21Q2, E25Q9, E15Q9, E22Q18.** One was let
run **>90 s and was still going** — effectively non-terminating, not merely slow.

All hangs are **reference-vs-distractor** subtractions of two *different* multivariate rational
functions, where the multivariate GCD (recursive primitive PRS in `mpoly.js`) blows up. When the two
sides are actually *equal* (difference is exactly zero) it returns instantly — so the cost is in
reducing a **non-zero multivariate difference**.

---

## Minimal reproducers

```js
import { symbolicEquivTest } from "./symbolic/equiv.js";

// (1) HANGS >90s — and the two sides share the SAME denominator; only the
//     numerator differs (gamma vs gamma*s+1). Subtracting should be trivial.
symbolicEquivTest(
  "gamma/(s^2+alpha*s+beta)*(b*s+c)/(a*s)",
  ["(gamma*s+1)/(s^2+alpha*s+beta)*(b*s+c)/(a*s)"]
);                                                            // E21Q2, opt 3

// (2) HANGS
symbolicEquivTest("a/(b*s^2+s+a*c)", ["a*s/(b*s+1+a*c)"]);    // E22Q18, opt 0

// (3) HANGS (and opts 3,4 of the same question)
symbolicEquivTest(
  "(C1+C2)*s/((s+a)*s+(C1+C2)*(1+b*s))",
  ["C1*s/((s+a)*s+C1+C2)"]
);                                                            // E25Q9, opt 2

// (4) HANGS (and opt 2 of the same question)
symbolicEquivTest(
  "b*d*(gamma*s+1)/((alpha*s+beta)*(s+a)*(s+c)+b*d*(gamma*s+1))",
  ["b*d*(gamma*s+1)/((alpha*s+beta)*(alpha*s+1)*(c*s+1)+b*d*(gamma*s+1))"]
);                                                            // E15Q9, opt 1
```

The exact hanging `(question, option-index)` pairs found by per-option probing:
`E21Q2 [3]`, `E25Q9 [2,3,4]`, `E15Q9 [1,2]`, `E22Q18 [0]`.

---

## The biggest lead

Repro **(1)** is the smoking gun: the reference and the distractor have an **identical denominator**
`(s²+αs+β)·a·s`; only the numerators differ. A subtraction that recognised the common denominator
would be `(num_ref − num_cand)/denom` — trivial. Instead the engine evidently forms
`(n₁·d₂ − n₂·d₁)/(d₁·d₂)`, doubling the degree, then calls the multivariate GCD on a 7-variable
polynomial pair `{s, a, b, c, α, β, γ}` and never finishes.

Suggested directions for the CAS author (any one likely clears most hangs):
1. **Common-denominator short-circuit** in `sub`/`simplify`: if denominators are equal (or one
   divides the other), subtract numerators directly and skip the cross-multiply + GCD.
2. **Guard the multivariate GCD** with a degree/iteration/time cap and a safe fallback. For an
   *equivalence* decision you don't need the reduced form at all — you only need to know whether the
   cross-multiplied numerator `n₁·d₂ − n₂·d₁` is the **zero polynomial**. Testing "is this
   multivariate polynomial identically zero" is far cheaper than computing a canonical GCD: expand
   and check all coefficients are zero, or evaluate at several random integer points for each symbol
   (Schwartz–Zippel) and short-circuit to `no_match` on the first non-zero — then only confirm true
   zeros exactly. That makes `no_match` fast and robust regardless of GCD cost.
3. If the canonical form is still wanted for display, compute it lazily/separately from the
   equality test so a slow GCD can never block the verdict.

---

## Coverage of the test

| Bucket | Count | Result |
|---|---|---|
| Real exam questions (reference = keyed answer, vs real option sets) | 18 | 14 pass, 4 hang |
| — round-trip (engine's own canonical render re-fed as reference) | (on the 14) | consistent |
| Controlled algebraic-equivalence pairs (known truth) | 27 | 26 correct, 1 safe-but-stricter nit |
| Edge / junk / malformed / bad-reference | 5 | all graceful |

Questions exercised: E20Q3 · E21Q2/Q4/Q5/Q13/Q15 · E23Q1/Q2/Q18 · E25Q7/Q9/Q10/Q11 ·
E15Q7/Q9 · E22Q5/Q6/Q18 (block-diagram open/closed-loop TFs and symbolic ess), with options
transcribed from the past-exam PDFs (Greek romanised: τ→tau, α→alpha, β→beta, γ→gamma, δ→delta;
named blocks G1/G2/H1/C1/C2 kept).

**Bottom line:** ship the relation — it's correct and handles all the algebraic-rewrite forms an
exam throws at it. But the equality test must be made **termination-safe** (zero-polynomial test
instead of full GCD, or a common-denominator short-circuit) before it's wired into the app, or
checking an answer on E21Q2 / E25Q9 / E15Q9 / E22Q18 will hang the UI.
