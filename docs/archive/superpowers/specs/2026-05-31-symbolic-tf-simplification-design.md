# Design — Exact symbolic transfer-function simplification (JS CAS)

**Date:** 2026-05-31
**Status:** approved (design), pending implementation plan

## Goal

Make every final open-loop and closed-loop transfer function the Block Diagram mode
produces come out **fully simplified**: a single fraction, no nested fractions, with the
numerator and denominator **expanded into standard polynomial form in `s`, collected by
descending powers of `s`**, and with common poles/zeros cancelled.

Concretely, instead of the unsimplified Mason-style output the symbolic path emits today:

```
\frac{\frac{1}{s}\cdot\frac{K}{s+1}}{\frac{1}{s}\cdot(2\cdot\frac{K}{s+1}+a)+1}
```

the calculator must reduce it to:

```
\frac{K}{s^2 + (a+1)s + a + 2K}
```

## Why a from-scratch JS CAS

The app is **100% offline, self-contained JavaScript** (`CLAUDE.md` hard constraint:
"JS-port, not an external backend"). MATLAB/SymPy were considered and **rejected by the
user** — a MATLAB dependency reopens the external-runtime problem the project deliberately
left behind (no Node MATLAB engine → shell-out latency or a fragile persistent process; a
Symbolic-Math-Toolbox assumption that isn't guaranteed on every machine). So the engine is
built in JS with **zero new runtime dependencies**.

The **numeric** path already produces clean collected polynomials (e.g. `10/(s^2+2s+20)`)
via the float `TransferFunction`/`Polynomial` in `math-engine.js`, and is validated against
the 70-test oracle. The defect is **only** in the **symbolic-parameter** path
(`solveSymbolically` in `solver.js`), which treats each block value (`K/(s+1)`, `1/s`, `a`)
as an **opaque variable** and therefore can never clear fractions or collect powers of `s`.

## Course grounding (NotebookLM, 34722 lcd1)

Verified against the user's course notebook:
- **Closed loop** `T(s) = G(s)/(1 + G(s)H(s))`; **loop gain** `L = GH`; characteristic
  equation is the closed-loop denominator `1 + L = 0`. (Matches the existing break-loop
  feature's pinned sign convention — `L = +GH`.)
- Final answer must be **one fraction, positive powers of `s`, no nested fractions**. The
  course *accepts both expanded and factored* forms; the user wants **expanded + collected**,
  which is a valid stricter subset.
- The course does **not** mandate pole/zero cancellation. The user requires it (requirement
  2). We honour that, but note the standard caveat in the spec: cancelling a common
  pole/zero can hide an internal-stability problem (e.g. a cancelled unstable pole). The
  engine still cancels as requested; this is a documentation note, not a behavioural switch.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Engine | Pure JS CAS, exact arithmetic, zero new deps |
| Generality | **Full**: arbitrary parameters, products/powers of parameters, guaranteed-complete pole/zero cancellation via multivariate GCD |
| Arithmetic | **Exact** `BigInt` rationals (floats cannot guarantee cancellation) |
| Output form | Expanded + collected by descending powers of `s`; each `s`-coefficient a collected multivariate polynomial in the parameters |
| Numeric path | **Untouched** — keep the existing float `TransferFunction` path for purely numeric diagrams (oracle-validated). New engine drives the **symbolic** path only |
| Educational steps | **Kept** — `solveSymbolically`'s step-by-step reduction stays; only the headline "Simplified Transfer Function" switches to the new collected form |

## Architecture — layered exact algebra stack

`s` is the main variable; every other identifier (`K`, `a`, `H1`, …) is a symbolic
**parameter**. Layers are built bottom-up; each is independently unit-tested.

### 1. `Rational` (`symbolic/rational.js`)
Exact scalar over `BigInt` numerator/denominator, auto-normalised (gcd reduce + sign on the
numerator). API: `add, sub, mul, div, neg, isZero, isOne, equals, sign, toString`, plus
constructors `Rational.of(n)`, `Rational.ZERO/ONE`. Foundation of exactness.

### 2. `MPoly` (`symbolic/mpoly.js`)
Multivariate polynomial in the **parameters**, `Rational` coefficients. Representation: a
`Map` from a canonical monomial key (sorted `name^exp` product, `""` for the constant) to a
non-zero `Rational`. API: `add, sub, mul, neg, isZero, isConstant, equals, constant value`,
`divideExact(other)` (exact quotient or throw/`null` if not divisible), and **`MPoly.gcd(a,b)`**.

**`MPoly.gcd` is the one hard algorithm** — recursive content-and-primitive-part Euclidean
GCD (pick a parameter as the main variable, treat the poly as univariate in it with `MPoly`
coefficients in the remaining parameters, compute content = gcd of those coefficients
recursively and primitive part, run a pseudo-remainder sequence; base case is `Rational`
gcd = 1 for any non-zero scalars). It returns a content-normalised gcd. This layer carries
the heaviest test suite.

### 3. `RatFunc` (`symbolic/ratfunc.js`)
`MPoly / MPoly` kept in lowest terms via `MPoly.gcd`. This is the field `Q(params)` in
which the `s`-coefficients live **during cancellation only**. API: `add, sub, mul, div, neg,
inverse, isZero, equals`, normalise on construction. Final results almost always reduce to
denominator `1`; `RatFunc` exists so the `s`-GCD below can divide coefficients.

### 4. `SymTF` (`symbolic/symtf.js`)
A transfer function `num(s)/den(s)` where `num`, `den` are **arrays of `MPoly`** (dense,
index = power of `s`, mirroring `Polynomial.coeffs` ordering `[s^0 … s^n]`). API:
- `add, sub, mul, neg` (rational-function arithmetic: `n1/d1 ± n2/d2 = (n1 d2 ± n2 d1)/(d1 d2)`, `mul` = numerator·numerator / denom·denom);
- `feedback(H, sign)` (optional convenience; the solver mainly uses add/mul);
- **`simplify()`** — the core:
  1. Lift `num`, `den` to polynomials in `s` over `RatFunc` (field `Q(params)`).
  2. Euclidean **`s`-GCD** of `num` and `den` over that field → `g(s)`.
  3. Divide both by `g(s)` (exact over the field).
  4. Clear `RatFunc` denominators in the resulting coefficients (multiply through by their
     lcm), then factor out the **integer content** (gcd of all `MPoly` coefficients across
     num and den) so coefficients are primitive.
  5. Normalise sign/leading term canonically (e.g. make the denominator's leading `s`
     coefficient have a positive leading numeric part; if it is a non-zero constant, make
     the denominator monic by dividing both by it).
  Result: cancelled, expanded, collected `num(s)/den(s)` with `MPoly` coefficients.

### 5. `parseExprToTF` (`symbolic/parse-expr.js`)
Tokenizer + recursive-descent parser: a block-value string → `SymTF`. Grammar over
`+ - * / ^ ( )`, the variable `s`, integer/decimal numbers, parameter identifiers
(`[A-Za-z][A-Za-z0-9_]*`, where the lone token `s` is the variable and all others are
parameters), and **implicit multiplication** (juxtaposition: `2s`, `Ks`, `(s+1)(s+2)`).
Builds the result via `SymTF` arithmetic. Replaces `TransferFunction.parse` for the
symbolic case. Decimal coefficients become exact `Rational`s (e.g. `0.5 → 1/2`).

### 6. `solveExact` (`symbolic/solve-exact.js`)
Mirrors the numeric Gaussian-elimination solver (`solveNumerically`'s linear-system build +
elimination) but over `SymTF`, parsing each block value with `parseExprToTF`. Same shape:
build the active-node matrix `M` and source vector `V`, eliminate, read the sink row, call
`.simplify()`. Handles numeric diagrams too (parameters set is empty → `MPoly`s are
constants), but is **only invoked for the symbolic case** here. Signature mirrors
`transferFunction(nodes, connections, sourceId, sinkId)` and returns a simplified `SymTF`.

### 7. `render` (`symbolic/render.js`)
`SymTF` → `{ toKaTeX(), toFormulaString() }` in the collected descending-`s`-power form:
- walk `s^n … s^0`; skip zero coefficients; coefficient `1` omitted except the `s^0` term;
- a coefficient that is a sum gets parenthesised when it multiplies `s^k` (→ `(a+1)s`);
- sign handling between terms; `MPoly` terms ordered deterministically (parameters lexup,
  higher parameter-degree first, constant last) so `a + 2K` renders stably;
- denominator `1` → render bare numerator (no fraction), matching `TransferFunction.toKaTeX`.

## Integration (`solver.js`)

`transferFunction(nodes, connections, sourceId, sinkId)` — **symbolic branch only**:
- Today: `const r = solveSymbolically(...); return { ...r, tf: null };`
- New: still call `solveSymbolically(...)` for `initialEquations` + `steps` (the educational
  reduction view is unchanged), **but** compute the headline TF with
  `solveExact(nodes, connections, sourceId, sinkId)` and expose it as `finalTransferFunction`
  (`toKaTeX`/`toFormulaString` from `render`). Also expose the `SymTF` as `result.symtf` so
  `loopGain` can negate it exactly. `tf` (numeric `TransferFunction`) stays `null` for the
  symbolic case (downstream plots still only consume the numeric `tf`).

`loopGain` / `negateResult` — for the symbolic case, negate the `SymTF` numerator exactly
(via `result.symtf.neg()` re-rendered) instead of the current string-wrapping `-\left(...\right)`.
Because both the closed-loop solve and `loopGain` flow through `transferFunction`, **all**
closed-loop and open-loop `L(s)` outputs are simplified with no extra wiring.

The **numeric branch is byte-for-byte unchanged.**

## Data flow

```
block values (strings)         (sourceId, sinkId)
        │                              │
        ▼                              ▼
   parseExprToTF ──► SymTF ──► solveExact (Gaussian elim over SymTF)
                                       │
                                       ▼
                                 SymTF.simplify()   (s-GCD cancel, clear, content, normalise)
                                       │
                                       ▼
                                   render ──► { toKaTeX, toFormulaString }
                                       │
                                       ▼
                       finalTransferFunction  (+ symtf for loopGain negation)
```

## Error handling
- Unparseable block value (bad token, mismatched parens) → throw with a clear message; the
  existing `triggerSolve` catch surfaces it in the TF panel.
- Division by a zero polynomial during arithmetic/GCD → throw a clear error (not NaN).
- Singular system / disconnected sink → TF = 0 (`num = [0]`), rendered `0`, as today.
- Exact arithmetic throughout → no silent float drift or spurious tiny coefficients.

## Testing

Bottom-up, `node --test` under `spike/test/`, importing `../../symbolic/*`.
- **`Rational`**: normalisation, sign, add/mul/div, zero/one, fraction reduction.
- **`MPoly`**: arithmetic, `isConstant`, `divideExact` (divisible + non-divisible), and a
  **large `gcd` suite** — shared factor, coprime, content-only, multivariate
  (`gcd(Ka+Kb, a+b)=a+b` style), scalar/zero/constant edge cases.
- **`RatFunc`**: lowest-terms normalisation, field ops, inverse, equality.
- **`SymTF`**: arithmetic; `simplify()` golden cases incl. a deliberate pole/zero
  cancellation `s(s+1)/[s(s+2)] → (s+1)/(s+2)` and content normalisation.
- **`parseExprToTF`**: `K/(s+1)`, `10/(s^2+2s)`, `1/s`, `(s+1)(s+2)`, `2s`, `a`, `0.5`,
  nested parens, error cases.
- **`solveExact` + end-to-end** (the acceptance cases):
  - **the spec example** built as a diagram → `K/(s^2+(a+1)s+a+2K)`;
  - `G=K/(s+1)`, `H=2` feedback → `K/(s+2K+1)`;
  - opaque blocks `G`,`H` → `G/(GH+1)`;
  - a numeric diagram solved by `solveExact` **equals** the float numeric engine's result.
- **Regression**: all 154 existing tests stay green (numeric path untouched; confirm no test
  asserts the *old* nested symbolic final string — update such assertions to the new form if
  any exist).

## Module boundaries

| Unit | Responsibility |
|---|---|
| `symbolic/rational.js` | exact `BigInt` rational scalar |
| `symbolic/mpoly.js` | multivariate polynomial in parameters + multivariate GCD |
| `symbolic/ratfunc.js` | fraction field of `MPoly` (for the cancellation step) |
| `symbolic/symtf.js` | `num(s)/den(s)` over `MPoly` + `simplify()` |
| `symbolic/parse-expr.js` | block-value string → `SymTF` |
| `symbolic/solve-exact.js` | linear-system solve over `SymTF` |
| `symbolic/render.js` | `SymTF` → KaTeX / plain text, collected form |
| `solver.js` (integration) | use `solveExact` for the symbolic final TF + `loopGain` negation; numeric path unchanged |

## Scope (YAGNI)

In: the seven modules above, exact full-generality simplification, integration into the
symbolic path + `loopGain`, collected expanded rendering.

Out: a factored-form display toggle (course accepts factored, but the user wants expanded —
one form, no toggle); replacing the numeric float engine (kept as-is); partial-fraction
expansion; symbolic root-finding/factoring of the result; any MATLAB/Python path.

## Open implementation notes (for the plan)

- **Multivariate GCD is the risk.** Build it first after `Rational`/`MPoly` arithmetic, with
  an exhaustive test suite, before anything depends on it. Use exact `BigInt` throughout to
  avoid coefficient-growth corruption.
- **Canonical normalisation** must be deterministic (sign, content, monic-when-constant-denom,
  parameter ordering) so rendered output and test assertions are stable.
- **Numeric-path guard**: keep the existing `hasSymbolic` dispatch; `solveExact` is reached
  only when `hasSymbolic` is true.
- **`render` must match `TransferFunction` conventions** (bare numerator when denominator is
  `1`, `frac` otherwise) so numeric and symbolic outputs look consistent.
