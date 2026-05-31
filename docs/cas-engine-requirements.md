# CAS engine — requirements & hand-off (derived from real LCD1 exams)

**For:** the session building a symbolic CAS math engine in JS from scratch for this repo.
**Date:** 2026-05-31
**Why this exists:** a full stress-test of the LCD1 Exam Suite against 8 past exams
([`stress-test-2-findings.md`](stress-test-2-findings.md)) found that the **single biggest surviving
gap** — after you account for the GUI, human plot read-off, and the numeric Block-Diagram reducer —
is **symbolic algebra in literal parameters**. The exams are full of "what is the open-loop /
closed-loop transfer function?" and "what is the steady-state error?" questions whose answer options
are written in *symbols* (`G1, G2, H, C1, C2, a, b, c, K, Kp, τ, k, α, β`), not numbers. The two
existing engines are both numeric and **cannot** do these. This doc specifies what the CAS must do,
with **real exam questions as acceptance tests**, and draws a hard line around what is *not* the
CAS's job.

---

## 1. Where the CAS fits (don't reinvent the numeric engines)

The repo already has **two** engines — keep them, the CAS is a **third, symbolic** layer beside them:

| Engine | File | Domain | Use |
|---|---|---|---|
| BDR numeric | `math-engine.js` | `Polynomial`/`TransferFunction` with **float coefficients**, exact-ish rational arithmetic (add/mul/feedback/gcd-simplify) | the Block-Diagram reducer's math, **numeric blocks only** |
| LCD1 numeric | `spike/numeric/*` + `spike/solvers/*` | float TF, complex `G(jω)`, roots, Routh, margins, Bode, time response | all the P1–P7 solvers / CLI |
| **CAS (you)** | new | **multivariate symbolic** rational functions over literal parameters | symbolic block reduction, symbolic ess, symbolic TF derivation, linearization |

There is partial symbolic scaffolding already in `symbolic/` (`mpoly.js`, `ratfunc.js`,
`rational.js`, `symtf.js`) and tests in `spike/test/sym-*.test.js`. **Read those first** — they may
be the seed you extend rather than starting truly from zero. The existing
`docs/superpowers/plans/2026-05-31-symbolic-tf-simplification.md` is the prior design thinking.

**Parity rule (inherited from this repo):** the LCD1 70-test Python oracle and the existing
`spike/test/*` suites define "correct" for the numeric path. Your CAS must, when its symbols are
substituted with numbers, **agree with the numeric engines**. Add CAS tests in the same `node --test`
style as `spike/test/sym-*.test.js`.

---

## 2. Required capabilities (checklist)

The CAS needs to represent and manipulate **rational functions of `s` whose coefficients are
themselves polynomials in arbitrary literal symbols**. Concretely:

1. **Multivariate symbolic field.** Symbols: `s` (the Laplace variable, special) plus any of
   `a b c d k K K1 K2 Kp Ki τ tau α alpha β beta G G1 G2 G3 H H1 H2 C1 C2 ζ ω0 …`. Represent a TF as
   `N(s)/D(s)` where `N`, `D` are polynomials in `s` with coefficients in `Q[other symbols]`
   (i.e. multivariate-polynomial coefficients). `ratfunc.js`/`mpoly.js` look aimed at exactly this.
2. **Ring/field ops:** `+ − × ÷`, and the **three block-diagram combinators**:
   - series  `G1·G2`
   - parallel `G1 + G2`
   - feedback `G/(1 ± G·H)` (negative/positive)
3. **Canonical simplify:** cancel common polynomial factors (multivariate GCD), normalize sign/scale,
   collect like terms. `G/(1+GH)` with `G=Ng/Dg, H=Nh/Dh` must reduce to `Ng·Dh/(Dg·Dh ± Ng·Nh)`.
4. **Limits / evaluation theorems** (all symbolic):
   - **DC gain** `lim_{s→0} G(s)` (and `lim_{s→0} s^N·G` after factoring N integrators → the loop
     gain / position-velocity constants).
   - **Final-value** `lim_{t→∞} y = lim_{s→0} s·Y(s)` and **initial-value** `y(0)=lim_{s→∞} s·Y(s)`.
   - **System type** = multiplicity of the `s=0` pole; **order** = deg(D).
5. **Steady-state error, symbolic.** For unity (and non-unity) feedback: `e_ss = 1/(1+K0)` for a step
   on a type-0 system, `1/Kv` ramp, etc., **expressed in the literal loop gain** (e.g. `1/(1+Kp·b·c)`).
   Must also handle **error to a disturbance** injected at a named node (see §3, recurring).
6. **Solve a single-unknown equation** symbolically/numerically: e.g. `a/(1+a) = 2/3 → a = 2`,
   `1/(1+0.4·K1)=ε → K1=…`.
7. **Linearization (Jacobian at an operating point).** Given a nonlinear ODE / static map
   `f(x,u)=0` or `ẋ=f(x,u)`, compute `∂f/∂x, ∂f/∂u` at `(x̄,ū)` → linear ΔODE → TF. Needs symbolic
   partial derivatives. (Recurs across the exam corpus; flagged as the #1 addable in
   [`exam-coverage.md`](exam-coverage.md).)
8. **Pretty-print to the exam's notation** — a `toFormulaString`/`toKaTeX` that reproduces forms like
   `bd(γs+δ)/((αs+β)(s+a)(s+c))` so the answer can be **option-matched** against the printed choices.

Nice-to-have (later): symbolic partial fractions / inverse Laplace `y(t)`; symbolic Routh array.

---

## 3. Acceptance tests — real exam questions (the spec, in examples)

Each row is a question the CAS **should** solve. Expected answers are the **exam answer-key** values
(verify against the PDF before locking a test — keys are transcribed from the worked solutions, and a
couple of the autumn keys are terse). PDFs live in
`C:\Users\Mads2\DTU\Obsidian\Courses\34722 Linear Control Design 1\Exercises\Solutions\Past Exams\`.

### A. Symbolic block-diagram reduction (series / parallel / feedback)

| Exam Q | Given | Expected answer (symbolic) |
|---|---|---|
| E20 Q3 | blocks G1,G2 in parallel feeding G3, unity fb | `(G1+G2)G3 / (1+(1+G1+G2)G3)` |
| E21 Q4 | inner loop H2 around G, outer H1 | `C·G·H1 / (1 + G·H1·H2)` |
| E21 Q5 | r→y closed loop | (key option 4 — read from PDF) |
| E23 Q1 | C1,(1+C2),G,H | `Gopen = C1(1+C2)·G·H` |
| E23 Q2 | same, closed | `C1(1+C2)G / (1 + C1(1+C2)GH)` |
| E25 Q7 | (C1+C2), 1/(s+a), 1/s, (1+bs) | `Gopen = (C1+C2)·1/(s+a)·1/s·(1+bs)` |
| E25 Q9 | same, closed r→y | `(C1+C2)s / [ (s+a)s + (C1+C2)(1+bs) ]` |
| E22 Q5 | K/(s+1) · 2/(s+a) | `2K / ((s+1)(s+a))` |
| E22 Q18 | reduce Fig-6 loop | `a / (b s² + s + a c)` |
| E15 Q7 | δ,b,d,(αs+β),(s+a),(s+c) | `bd(γs+δ) / ((αs+β)(s+a)(s+c))` |
| E15 Q9 | same, closed, δ=1 | `bd(γs+1) / ((αs+β)(s+a)(s+c)+bd(γs+1))` |

> **Verification trick already in the toolbox:** substitute numbers for every symbol, run the
> **numeric** `math-engine.js` reduction or the CLI, and confirm the CAS result matches numerically.
> This is how a student works around the gap today, and it's a free oracle for your tests.

### B. Type / order / static loop gain (limits & pole-at-origin counting)

| Exam Q | Given | Expected |
|---|---|---|
| E20 Q4 | open-loop `K3/(s+K3)·(K1 s+K2)/s` | order 2, **type 1** |
| E21 Q14 | `Kp·b·c/(s(τs+1))` | `K0 = Kp·b·c`, type **N=1** |
| E23 Q3 | C2=K2/s in the chain | type 1, order 3 |
| E23 Q4 | — | `K0 = K1·K2·k` |
| E25 Q8 | (C1+C2)/(s(s+a))·(1+bs) | type 1, order 4 |
| E25-Test Q1 | `(s+5)/(s²+2s+10)·(2/s)·0.1` | `K0 = 0.1K` (Andersen 11.16 form — factor the integrator first) |

These all need `lim_{s→0} s^N G` after counting integrators. NB: the numeric engine returns
`DC gain = NaN` for any integrator (see B1 in the stress-test report); the CAS must instead factor
`s^N` out and report the finite constant + the type.

### C. Symbolic steady-state error (reference and disturbance)

| Exam Q | Given | Expected |
|---|---|---|
| E25 Q10 | `G=k(s+b)/(s²+cs+1)`, step at r | `e_rss = 1/(1+kab)` |
| E25 Q11 | step at d | `e_dss = −a/(1+kab)` |
| E23 Q18 | type-0, loop gain a, step at r | `1/(1+a)` |
| E23 Q19 | step at d | `1/(1+a)` |
| E22 Q6 | unit step at d | `−2/(2K+a)` |
| E15 Q17 | step at d, integrator after injection | `e_dss = 0` |
| E15 Q16 | static loop gain of outer loop | `Kp/(2a)` |
| E25-Test Q4 | `y_ss,d` given = 2.86, solve K | `K = 7` (needs disturbance TF then solve) |

**Disturbance ess is the recurring sub-capability the whole suite lacks:** the error/ess must be
computable for an input injected at an **arbitrary named node**, not just `r` through unity feedback.
Design the symbolic ess around a general loop with labelled injection points.

### D. Solve-for-a-symbol

| Exam Q | Equation | Expected |
|---|---|---|
| E23 Q20 | `a/(1+a) = 2/3` | `a = 2` |
| S21P2 Q19 | `1/(1+0.4K1)=0.4` then `1/(1+0.6·K2·0.4)=0.05` | `K1=3.75, K2=79.17` |

(S21P2 Q19 is also stress-test bug **B6** — the existing `nested-ess` hard-codes the wrong topology
and returns 12.67. A CAS that solves the two equations from the actual diagram gets 79.17. Either fix
`nested-ess` numerically **or** let the CAS handle it generally.)

### E. Linearization → TF

| Exam Q | Given | Expected |
|---|---|---|
| E22 Q1 | nonlinear plant linearized at operating point | `G0 = c·b/(s+a)` |
| (spring set) S20 Q2, ReExam F22 Q1, ReExam F21 Q1, Final A2 | nonlinear ODE → linearize → TF | per each key |

Needs symbolic partial derivatives at `(x̄,ū)`, then ΔODE → TF. Highest-value single addition per the
earlier audit.

---

## 4. Integration points (how it should plug into the app)

- **Block-Diagram reducer:** allow a block's transfer function to contain literal symbols
  (`1/(s+a)`, `G1`). Today `math-engine.js parsePoly` does `parseFloat` and turns any non-number into
  `1` — route symbolic blocks to the CAS instead, keep numeric blocks on the fast numeric path.
- **A new symbolic-ess / symbolic-TF solver** in the LCD1 Solver mode (a form that takes a loop
  description or a reduced symbolic G and returns type/order/K0/ess in symbols), reachable like the
  other forms in `lcd-forms.js` / dispatched through `lcd-engine.js`.
- **Option-matching:** the killer feature for a multiple-choice exam is matching a CAS result against
  the printed options. The numeric path already has `spike/match.js` (NUMBER/DICT/TF/PICK). Add a
  **symbolic-equivalence match** (two rational functions equal iff `N1 D2 − N2 D1 ≡ 0` as multivariate
  polynomials) so "is my answer option 3?" works on the symbolic forms.
- **The bridge:** a reduced symbolic diagram should be pushable into the symbolic solver (mirrors the
  existing numeric BDR→LCD1 bridge).

---

## 5. NOT the CAS's job (separate bugs / out of scope)

So the CAS effort isn't blamed for — or burdened with — these. Full detail in
[`stress-test-2-findings.md`](stress-test-2-findings.md):

- **B1** — CLI `step-response`/`characterize` crash on an integrator pole. A **numeric**
  `spike/solvers/timeresponse.js` partial-fraction bug (the app's RK4 plot already dodges it). Fix in
  the numeric layer, not the CAS.
- **B2 / B3** — Smart-Paste and `pi-lead --unknown design` leak a raw `TypeError` on missing
  TF/args. **Router/CLI guard** bug.
- **B4** — CLI `question` emits a confident wrong option because it bypasses the app's
  no-confident-match guard. **Router** issue (port the guard to the CLI path).
- **B5** — Smart-Paste mis-extracts numbers from prose. **Parser** issue.
- **B6** — `nested-ess` wrong number (12.67 vs 79.17). A **numeric solver** topology bug — *unless*
  you choose to let the CAS subsume nested-loop ess generally (see §3D).
- **B8** — `margins` reports unwrapped PM (306.96° vs −46°). **Presentation** in the numeric margins.
- **Pure conceptual / true-false** and **plot read-off** questions are not algebra; they stay with the
  human + the GUI plots.

---

## 6. Quick orientation checklist for the CAS session

1. Read `symbolic/{mpoly,ratfunc,rational,symtf}.js` and `spike/test/sym-*.test.js` — likely your seed.
2. Read `docs/superpowers/plans/2026-05-31-symbolic-tf-simplification.md` (prior design).
3. Read this file's §2 (capabilities) and §3 (acceptance tests). Turn §3 into `node --test` cases;
   use numeric substitution against `math-engine.js` / the CLI as the oracle.
4. Honour repo conventions: 100% offline, Windows-first, **commits read like a human wrote them — no
   AI attribution**, keep `npm test` green.

When §3's tables pass and the symbolic forms are reachable in the app with option-matching, the
suite covers the part of the LCD1 exam it currently can't touch.
