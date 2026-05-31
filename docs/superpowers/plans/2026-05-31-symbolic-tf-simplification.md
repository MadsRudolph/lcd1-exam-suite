# Exact Symbolic Transfer-Function Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every symbolic-parameter transfer function the Block Diagram mode outputs fully simplified — one fraction, no nested fractions, numerator/denominator expanded and collected by descending powers of `s`, with common poles/zeros cancelled (e.g. the Mason form for `1/s, K/(s+1), 2, a` reduces to `K/(s² + (a+1)s + a + 2K)`).

**Architecture:** A from-scratch, exact (BigInt-rational) JS computer-algebra stack — `Rational` → `MPoly` (multivariate polynomial in the parameters, with a multivariate GCD) → `RatFunc` → `SymTF` (`num(s)/den(s)` over `MPoly`, with `simplify()`) → `parseExprToTF` → `solveExact` → `render` — wired into `solver.js`'s symbolic path. The numeric float path is left untouched.

**Tech Stack:** Vanilla ES modules, `BigInt`, `node --test` (run from `spike/`), esbuild bundle. Zero new runtime dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-31-symbolic-tf-simplification-design.md`](../specs/2026-05-31-symbolic-tf-simplification-design.md)

---

## Conventions (do not break)

- Commit messages read like a human wrote them — **NO AI attribution / Co-Authored-By**, no mention of AI in messages or comments. Use `PAGER=cat` on git. Windows shell.
- `bundle.js` and `node_modules/` are gitignored — never commit them. Rebuild with `npm run build`.
- Run tests with `npm test` from the repo root `C:\Users\Mads2\lcd1-exam-suite` (it runs `node --test` under `spike/`). New CAS modules live in a root `symbolic/` dir; tests live in `spike/test/` importing `../../symbolic/<mod>.js` (same pattern as `spike/test/canvas-connect.test.js` importing `../../canvas.js`).
- All arithmetic is **exact** — `BigInt` rationals only, never floats. Floats silently break cancellation.

## File Structure

| File | Responsibility |
|---|---|
| `symbolic/rational.js` | exact `BigInt` rational scalar |
| `symbolic/mpoly.js` | multivariate polynomial in parameters + arithmetic + multivariate GCD |
| `symbolic/ratfunc.js` | fraction field of `MPoly` (used only inside the `s`-GCD) |
| `symbolic/symtf.js` | `num(s)/den(s)` over `MPoly` + `simplify()` |
| `symbolic/parse-expr.js` | block-value string → `SymTF` |
| `symbolic/solve-exact.js` | linear-system solve over `SymTF` |
| `symbolic/render.js` | `SymTF` → KaTeX / plain text, collected form |
| `solver.js` (modify) | use `solveExact` for the symbolic final TF + exact `loopGain` negation |

Coefficient/array convention everywhere: **polynomials in `s` are dense arrays indexed by power, `[s^0, s^1, …, s^n]`** — same ordering as the existing `Polynomial.coeffs` in `math-engine.js`.

---

### Task 1: `Rational` — exact BigInt rational scalar

**Files:**
- Create: `symbolic/rational.js`
- Test: `spike/test/sym-rational.test.js`

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-rational.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rational } from "../../symbolic/rational.js";

test("normalises sign and reduces", () => {
  const r = new Rational(2n, -4n);
  assert.equal(r.num, -1n);
  assert.equal(r.den, 2n);
  assert.equal(r.toString(), "-1/2");
});

test("integer prints without denominator", () => {
  assert.equal(new Rational(6n, 3n).toString(), "2");
});

test("arithmetic is exact", () => {
  const a = new Rational(1n, 3n), b = new Rational(1n, 6n);
  assert.equal(a.add(b).toString(), "1/2");
  assert.equal(a.sub(b).toString(), "1/6");
  assert.equal(a.mul(b).toString(), "1/18");
  assert.equal(a.div(b).toString(), "2");
  assert.equal(a.neg().toString(), "-1/3");
});

test("zero/one and equality", () => {
  assert.equal(Rational.ZERO.isZero(), true);
  assert.equal(Rational.ONE.isOne(), true);
  assert.equal(new Rational(0n, 5n).isZero(), true);
  assert.equal(new Rational(3n, 6n).equals(new Rational(1n, 2n)), true);
  assert.throws(() => new Rational(1n, 0n));
  assert.throws(() => Rational.ONE.div(Rational.ZERO));
});

test("parse integers, fractions, decimals", () => {
  assert.equal(Rational.parse("3").toString(), "3");
  assert.equal(Rational.parse("-7").toString(), "-7");
  assert.equal(Rational.parse("0.5").toString(), "1/2");
  assert.equal(Rational.parse("2/8").toString(), "1/4");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/rational.js`**

```javascript
function bigAbs(x) { return x < 0n ? -x : x; }
function bigGcd(a, b) {
    a = bigAbs(a); b = bigAbs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

export class Rational {
    // Invariant: den > 0, gcd(|num|, den) === 1.
    constructor(num, den = 1n) {
        num = BigInt(num); den = BigInt(den);
        if (den === 0n) throw new Error("Rational: zero denominator");
        if (den < 0n) { num = -num; den = -den; }
        const g = bigGcd(num, den) || 1n;
        this.num = num / g;
        this.den = den / g;
    }
    static of(n) { return new Rational(BigInt(n), 1n); }
    static get ZERO() { return new Rational(0n, 1n); }
    static get ONE() { return new Rational(1n, 1n); }

    static parse(str) {
        str = String(str).trim();
        if (str.includes("/")) {
            const [n, d] = str.split("/");
            return new Rational(BigInt(n.trim()), BigInt(d.trim()));
        }
        if (str.includes(".")) {
            const neg = str.startsWith("-");
            const body = neg ? str.slice(1) : str;
            const [intPart = "0", fracPart = ""] = body.split(".");
            const den = 10n ** BigInt(fracPart.length);
            const num = BigInt((intPart || "0") + fracPart);
            return new Rational(neg ? -num : num, den);
        }
        return new Rational(BigInt(str), 1n);
    }

    isZero() { return this.num === 0n; }
    isOne() { return this.num === 1n && this.den === 1n; }
    sign() { return this.num > 0n ? 1 : this.num < 0n ? -1 : 0; }
    add(o) { return new Rational(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o) { return new Rational(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o) { return new Rational(this.num * o.num, this.den * o.den); }
    div(o) { if (o.isZero()) throw new Error("Rational: divide by zero"); return new Rational(this.num * o.den, this.den * o.num); }
    neg() { return new Rational(-this.num, this.den); }
    equals(o) { return this.num === o.num && this.den === o.den; }
    toString() { return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`; }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS (5 new tests; existing 154 still green).

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/rational.js spike/test/sym-rational.test.js
PAGER=cat git commit -m "Add exact BigInt rational scalar for the symbolic engine"
```

---

### Task 2: `MPoly` core — multivariate polynomial arithmetic + exact division

**Files:**
- Create: `symbolic/mpoly.js`
- Test: `spike/test/sym-mpoly.test.js`

**Context:** A polynomial in the *parameters* (everything except `s`), with `Rational` coefficients. Internally `terms` is a `Map<string, Rational>` keyed by a canonical monomial string `"name:exp,name:exp"` (vars sorted ascending, exponents > 0; the empty string `""` is the constant monomial). Module-scope helpers handle monomials. Leading term uses a lexicographic monomial order (a valid monomial order, needed for exact division). GCD comes in Task 3.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-mpoly.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K");
const a = MPoly.variable("a");
const two = MPoly.constant(Rational.of(2));

test("constant / variable / zero", () => {
  assert.equal(MPoly.ZERO.isZero(), true);
  assert.equal(two.isConstant(), true);
  assert.equal(K.isConstant(), false);
  assert.equal(two.constantValue().toString(), "2");
});

test("add / sub / mul / neg, with collection", () => {
  assert.equal(K.add(K).toString(), "2K");
  assert.equal(a.add(MPoly.ONE).toString(), "a + 1");          // a + 1
  assert.equal(two.mul(K).toString(), "2K");
  assert.equal(K.mul(a).toString(), "Ka");                      // K^1 a^1
  assert.equal(K.mul(K).toString(), "K^2");
  assert.equal(a.sub(a).isZero(), true);
  assert.equal(K.neg().toString(), "-K");
});

test("equality ignores term order", () => {
  assert.equal(K.add(a).equals(a.add(K)), true);
});

test("exact division: divisible returns quotient", () => {
  // (K*a + 2K) / K = a + 2
  const num = K.mul(a).add(two.mul(K));
  const q = num.divideExact(K);
  assert.equal(q.toString(), "a + 2");
});

test("exact division: not divisible returns null", () => {
  assert.equal(a.add(MPoly.ONE).divideExact(K), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/mpoly.js`**

```javascript
import { Rational } from "./rational.js";

// ---- monomial helpers: a monomial is a Map<varName, exp>, canonical key string ----
function monoFromKey(key) {
    const m = new Map();
    if (key === "") return m;
    for (const part of key.split(",")) {
        const [name, exp] = part.split(":");
        m.set(name, Number(exp));
    }
    return m;
}
function keyFromMono(m) {
    const names = [...m.keys()].filter(n => (m.get(n) || 0) > 0).sort();
    return names.map(n => `${n}:${m.get(n)}`).join(",");
}
function monoMulKeys(k1, k2) {
    const m = monoFromKey(k1);
    for (const [n, e] of monoFromKey(k2)) m.set(n, (m.get(n) || 0) + e);
    return keyFromMono(m);
}
// k1 / k2 as monomials: null if any exponent would go negative.
function monoDivKeys(k1, k2) {
    const m = monoFromKey(k1);
    for (const [n, e] of monoFromKey(k2)) {
        const cur = m.get(n) || 0;
        if (cur < e) return null;
        m.set(n, cur - e);
    }
    return keyFromMono(m);
}
// Lexicographic monomial order over the union of variables; returns 1 if k1>k2.
function monoCmp(k1, k2) {
    const m1 = monoFromKey(k1), m2 = monoFromKey(k2);
    const vars = [...new Set([...m1.keys(), ...m2.keys()])].sort();
    for (const v of vars) {
        const e1 = m1.get(v) || 0, e2 = m2.get(v) || 0;
        if (e1 !== e2) return e1 > e2 ? 1 : -1;
    }
    return 0;
}

export class MPoly {
    // terms: Map<keyStr, Rational> (no zero coeffs)
    constructor(terms = new Map()) {
        this.terms = new Map();
        for (const [k, c] of terms) if (!c.isZero()) this.terms.set(k, c);
    }
    static get ZERO() { return new MPoly(); }
    static get ONE() { return MPoly.constant(Rational.ONE); }
    static constant(rat) {
        const m = new Map();
        if (!rat.isZero()) m.set("", rat);
        return new MPoly(m);
    }
    static variable(name) {
        const m = new Map();
        m.set(`${name}:1`, Rational.ONE);
        return new MPoly(m);
    }

    isZero() { return this.terms.size === 0; }
    isConstant() { return this.terms.size === 0 || (this.terms.size === 1 && this.terms.has("")); }
    constantValue() { return this.terms.get("") || Rational.ZERO; }
    clone() { return new MPoly(this.terms); }
    vars() {
        const s = new Set();
        for (const k of this.terms.keys()) for (const n of monoFromKey(k).keys()) s.add(n);
        return s;
    }

    add(o) {
        const m = new Map(this.terms);
        for (const [k, c] of o.terms) m.set(k, (m.get(k) || Rational.ZERO).add(c));
        return new MPoly(m);
    }
    neg() {
        const m = new Map();
        for (const [k, c] of this.terms) m.set(k, c.neg());
        return new MPoly(m);
    }
    sub(o) { return this.add(o.neg()); }
    mul(o) {
        const m = new Map();
        for (const [k1, c1] of this.terms) for (const [k2, c2] of o.terms) {
            const k = monoMulKeys(k1, k2);
            m.set(k, (m.get(k) || Rational.ZERO).add(c1.mul(c2)));
        }
        return new MPoly(m);
    }
    // multiply by a single term (coeff * monomialKey)
    mulTerm(coeff, key) {
        const m = new Map();
        for (const [k, c] of this.terms) m.set(monoMulKeys(k, key), c.mul(coeff));
        return new MPoly(m);
    }
    equals(o) { return this.sub(o).isZero(); }

    // lex-max term -> { key, coeff }
    leadingTerm() {
        let bestKey = null;
        for (const k of this.terms.keys()) if (bestKey === null || monoCmp(k, bestKey) > 0) bestKey = k;
        return { key: bestKey, coeff: this.terms.get(bestKey) };
    }

    // exact division: returns Q with this === Q*B, or null if not divisible.
    divideExact(B) {
        if (B.isZero()) throw new Error("MPoly: divide by zero");
        const bl = B.leadingTerm();
        let R = this.clone();
        const Q = new Map();
        while (!R.isZero()) {
            const rl = R.leadingTerm();
            const qm = monoDivKeys(rl.key, bl.key);
            if (qm === null) return null;
            const qc = rl.coeff.div(bl.coeff);
            Q.set(qm, (Q.get(qm) || Rational.ZERO).add(qc));
            R = R.sub(B.mulTerm(qc, qm));
        }
        return new MPoly(Q);
    }

    // collected string, monomials lex-descending, constant last; coeff 1 omitted except constant.
    // e.g. {K:1}->"K", {"":2}->"2", a+1 -> "a + 1", 2*K -> "2K", a+2K -> "a + 2K".
    toString() {
        if (this.isZero()) return "0";
        const keys = [...this.terms.keys()].sort((x, y) => {
            if (x === "") return 1;            // constant monomial sorts last
            if (y === "") return -1;
            return monoCmp(y, x);              // lex descending
        });
        const parts = keys.map((k) => {
            const c = this.terms.get(k);
            const isConst = (k === "");
            const neg = c.sign() < 0;
            const mag = neg ? c.neg() : c;
            const coeffStr = (isConst || !mag.isOne()) ? mag.toString() : "";
            let monoStr = "";
            if (!isConst) for (const [n, e] of monoFromKey(k)) monoStr += e === 1 ? n : `${n}^${e}`;
            return { neg, body: `${coeffStr}${monoStr}` };
        });
        let s = "";
        parts.forEach((p, i) => {
            if (i === 0) s = (p.neg ? "-" : "") + p.body;
            else s += (p.neg ? " - " : " + ") + p.body;
        });
        return s;
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/mpoly.js spike/test/sym-mpoly.test.js
PAGER=cat git commit -m "Add multivariate polynomial arithmetic and exact division"
```

---

### Task 3: `MPoly.gcd` — multivariate GCD (recursive primitive PRS)

**Files:**
- Modify: `symbolic/mpoly.js` (add univariate-view helpers + `MPoly.gcd`)
- Test: `spike/test/sym-mpoly-gcd.test.js`

**Context:** The crux. Compute `gcd(A, B)` over `Q[params]` via the classic recursive primitive Euclidean (PRS) algorithm: pick the lex-smallest variable `v` present, view both as univariate in `v` with `MPoly` coefficients, take contents (gcd of those coefficients, recursing on fewer variables) and primitive parts, run a pseudo-remainder sequence in `v`, and combine `gcd = gcd(contentA, contentB) · primitiveGcd`. Base case (no variables) → constant `1`. The result is normalised so its lex-leading coefficient is `1` (canonical over `Q`).

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-mpoly-gcd.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K"), a = MPoly.variable("a"), b = MPoly.variable("b");
const c = (n) => MPoly.constant(Rational.of(n));

test("gcd of constants is 1", () => {
  assert.equal(MPoly.gcd(c(4), c(6)).toString(), "1");
});

test("monomial content: gcd(K*a + 2K, K) = K", () => {
  const A = K.mul(a).add(c(2).mul(K));
  assert.equal(MPoly.gcd(A, K).toString(), "K");
});

test("common linear factor: gcd(K(a+b), a+b) = a+b", () => {
  const ab = a.add(b);
  const A = K.mul(ab);
  // normalised monic (lex-leading coeff 1); a+b already has leading coeff 1
  assert.equal(MPoly.gcd(A, ab).equals(ab), true);
});

test("coprime: gcd(a+1, a+2) = 1", () => {
  assert.equal(MPoly.gcd(a.add(c(1)), a.add(c(2))).toString(), "1");
});

test("shared factor across two vars: gcd((a+b)(a+1), (a+b)(a+2)) = a+b", () => {
  const ab = a.add(b);
  const A = ab.mul(a.add(c(1)));
  const B = ab.mul(a.add(c(2)));
  assert.equal(MPoly.gcd(A, B).equals(ab), true);
});

test("gcd with zero returns the other (normalised)", () => {
  assert.equal(MPoly.gcd(MPoly.ZERO, K).toString(), "K");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (`MPoly.gcd` undefined).

- [ ] **Step 3: Add the GCD machinery to `symbolic/mpoly.js`**

Append inside the `MPoly` class (after `divideExact`):

```javascript
    // --- univariate view in variable v: array index = degree in v, entries are MPoly in the rest ---
    toUnivariate(v) {
        const arr = [];
        for (const [k, coeff] of this.terms) {
            const m = monoFromKeyExported(k);
            const e = m.get(v) || 0;
            m.delete(v);
            const rest = new MPoly(new Map([[keyFromMonoExported(m), coeff]]));
            arr[e] = (arr[e] || MPoly.ZERO).add(rest);
        }
        for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = MPoly.ZERO;
        return arr;
    }
    static fromUnivariate(arr, v) {
        let out = MPoly.ZERO;
        for (let e = 0; e < arr.length; e++) {
            if (arr[e].isZero()) continue;
            out = out.add(arr[e].mulTerm(Rational.ONE, e === 0 ? "" : `${v}:${e}`));
        }
        return out;
    }

    // lex-leading Rational coefficient (over all terms) — used to normalise to monic.
    leadingRational() {
        if (this.isZero()) return Rational.ONE;
        return this.leadingTerm().coeff;
    }
    scaleByRational(r) {
        const m = new Map();
        for (const [k, c] of this.terms) m.set(k, c.mul(r));
        return new MPoly(m);
    }
    normalizeMonic() {
        if (this.isZero()) return this;
        return this.scaleByRational(Rational.ONE.div(this.leadingRational()));
    }

    static gcd(A, B) {
        if (A.isZero()) return B.isZero() ? MPoly.ZERO : B.normalizeMonic();
        if (B.isZero()) return A.normalizeMonic();
        const vars = new Set([...A.vars(), ...B.vars()]);
        if (vars.size === 0) return MPoly.ONE;            // nonzero constants
        const v = [...vars].sort()[0];
        let Au = A.toUnivariate(v), Bu = B.toUnivariate(v);
        const cA = contentOf(Au), cB = contentOf(Bu);
        const contentGcd = MPoly.gcd(cA, cB);
        const ppA = Au.map(co => co.divideExact(cA));
        const ppB = Bu.map(co => co.divideExact(cB));
        const g = primitivePRS(ppA, ppB);                // array (univariate in v), primitive
        const result = contentGcd.mul(MPoly.fromUnivariate(g, v));
        return result.normalizeMonic();
    }
```

Add these module-scope helpers near the top of `symbolic/mpoly.js` (and re-export the two monomial helpers the class methods above reference):

```javascript
// expose monomial helpers to class methods that need them
const monoFromKeyExported = monoFromKey;
const keyFromMonoExported = keyFromMono;

function trimUni(arr) {                 // drop trailing zero coeffs (high degree)
    let n = arr.length;
    while (n > 1 && arr[n - 1].isZero()) n--;
    return arr.slice(0, n);
}
function degUni(arr) { const t = trimUni(arr); return t[t.length - 1].isZero() ? -1 : t.length - 1; }
function contentOf(arr) {               // gcd of all coefficients (MPolys in fewer vars)
    let g = MPoly.ZERO;
    for (const co of arr) g = MPoly.gcd(g, co);
    return g.isZero() ? MPoly.ONE : g;
}
function primitivePartUni(arr) {
    const ct = contentOf(arr);
    return arr.map(co => co.divideExact(ct));
}
// pseudo-remainder of A by B (arrays of MPoly, univariate); returns array.
function pseudoRem(A, B) {
    A = trimUni(A); B = trimUni(B);
    const dB = degUni(B);
    const lcB = B[dB];
    let R = A.slice();
    while (degUni(R) >= dB && degUni(R) >= 0) {
        R = R.map(co => co.mul(lcB));                    // scale whole R by lc(B)
        const dR = degUni(R);
        const t = R[dR];
        const shift = dR - dB;
        for (let i = 0; i <= dB; i++) R[i + shift] = R[i + shift].sub(t.mul(B[i]));
        R = trimUni(R);
    }
    return R;
}
function primitivePRS(A, B) {
    let P = trimUni(A), Q = trimUni(B);
    if (degUni(P) < degUni(Q)) [P, Q] = [Q, P];
    while (!(degUni(Q) < 0)) {
        const R = pseudoRem(P, Q);
        P = Q;
        Q = (degUni(R) < 0) ? [MPoly.ZERO] : primitivePartUni(R);
    }
    return primitivePartUni(P);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS (6 GCD tests). If a case fails, the bug is almost certainly in `pseudoRem`/`primitivePRS` normalisation — add `console.log` of intermediate `toString()`s, fix, re-run. Do **not** weaken the test expectations.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/mpoly.js spike/test/sym-mpoly-gcd.test.js
PAGER=cat git commit -m "Add multivariate polynomial GCD via recursive primitive PRS"
```

---

### Task 4: `RatFunc` — fraction field of `MPoly`

**Files:**
- Create: `symbolic/ratfunc.js`
- Test: `spike/test/sym-ratfunc.test.js`

**Context:** `num/den` of `MPoly`, kept in lowest terms via `MPoly.gcd` and with a monic-leading denominator for a canonical form. Used only inside `SymTF.simplify` to run the `s`-GCD over the field `Q(params)`.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-ratfunc.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { RatFunc } from "../../symbolic/ratfunc.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const K = MPoly.variable("K"), a = MPoly.variable("a");
const c = (n) => MPoly.constant(Rational.of(n));

test("reduces to lowest terms on construction", () => {
  // (K*a) / K  ->  a / 1
  const r = new RatFunc(K.mul(a), K);
  assert.equal(r.num.toString(), "a");
  assert.equal(r.den.toString(), "1");
  assert.equal(r.isPolynomial(), true);
});

test("add over a common denominator, then reduce", () => {
  // 1/a + 1/K = (K + a)/(aK)
  const r = new RatFunc(c(1), a).add(new RatFunc(c(1), K));
  assert.equal(r.num.toString(), "K + a");
  assert.equal(r.den.toString(), "Ka");
});

test("mul, div, neg, inverse, isZero", () => {
  const half = new RatFunc(c(1), c(2));
  assert.equal(half.mul(new RatFunc(c(4), c(1))).num.toString(), "2");
  assert.equal(new RatFunc(a, c(1)).inverse().num.toString(), "1");
  assert.equal(new RatFunc(a, c(1)).inverse().den.toString(), "a");
  assert.equal(RatFunc.ZERO.isZero(), true);
  assert.equal(new RatFunc(K, c(1)).neg().num.toString(), "-K");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/ratfunc.js`**

```javascript
import { MPoly } from "./mpoly.js";
import { Rational } from "./rational.js";

export class RatFunc {
    constructor(num, den = MPoly.ONE) {
        if (den.isZero()) throw new Error("RatFunc: zero denominator");
        // reduce by gcd
        const g = MPoly.gcd(num, den);
        let n = num.divideExact(g), d = den.divideExact(g);
        // make denominator's lex-leading coeff positive and, if constant, monic
        const dl = d.leadingRational();
        if (dl.sign() < 0) { n = n.neg(); d = d.neg(); }
        if (d.isConstant()) {                       // make denominator 1
            const dv = d.constantValue();
            n = n.scaleByRational(Rational.ONE.div(dv));
            d = MPoly.ONE;
        }
        this.num = n; this.den = d;
    }
    static get ZERO() { return new RatFunc(MPoly.ZERO, MPoly.ONE); }
    static get ONE() { return new RatFunc(MPoly.ONE, MPoly.ONE); }
    static fromMPoly(p) { return new RatFunc(p, MPoly.ONE); }

    isZero() { return this.num.isZero(); }
    isPolynomial() { return this.den.isConstant(); }
    equals(o) { return this.sub(o).isZero(); }
    add(o) { return new RatFunc(this.num.mul(o.den).add(o.num.mul(this.den)), this.den.mul(o.den)); }
    sub(o) { return new RatFunc(this.num.mul(o.den).sub(o.num.mul(this.den)), this.den.mul(o.den)); }
    mul(o) { return new RatFunc(this.num.mul(o.num), this.den.mul(o.den)); }
    neg() { return new RatFunc(this.num.neg(), this.den); }
    inverse() { if (this.isZero()) throw new Error("RatFunc: inverse of zero"); return new RatFunc(this.den, this.num); }
    div(o) { return this.mul(o.inverse()); }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/ratfunc.js spike/test/sym-ratfunc.test.js
PAGER=cat git commit -m "Add fraction field over multivariate polynomials"
```

---

### Task 5: `SymTF` — transfer function arithmetic

**Files:**
- Create: `symbolic/symtf.js`
- Test: `spike/test/sym-symtf.test.js`

**Context:** `num`/`den` are dense arrays of `MPoly`, index = power of `s` (`[s^0, …, s^n]`). Arithmetic is rational-function arithmetic in `s`. `simplify()` is Task 6 (stub it to `return this;` here so the module loads; tests in this task only cover raw arithmetic).

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-symtf.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const K = MPoly.variable("K");
// helper: build SymTF from coefficient arrays of plain numbers
const tf = (num, den) => new SymTF(num.map(c), den.map(c));

test("add: 1/s + 1/s = 2/s (before simplify)", () => {
  const r = tf([1], [0, 1]).add(tf([1], [0, 1]));
  // (s + s) / (s*s) = 2s / s^2  (raw, unsimplified)
  assert.equal(r.num.map(m => m.toString()).join(","), "0,2");
  assert.equal(r.den.map(m => m.toString()).join(","), "0,0,1");
});

test("mul: (1/s)*(K/(s+1)) numerator/denominator", () => {
  const A = new SymTF([c(1)], [c(0), c(1)]);           // 1/s
  const B = new SymTF([K], [c(1), c(1)]);              // K/(s+1)
  const r = A.mul(B);
  assert.equal(r.num.map(m => m.toString()).join(","), "K");          // K
  assert.equal(r.den.map(m => m.toString()).join(","), "0,1,1");      // s + s^2
});

test("neg and constants", () => {
  const r = tf([3], [1]).neg();
  assert.equal(r.num[0].toString(), "-3");
  assert.equal(SymTF.zero().isZero(), true);
  assert.equal(SymTF.one().num[0].toString(), "1");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/symtf.js`**

```javascript
import { MPoly } from "./mpoly.js";

// dense polynomial-in-s helpers over MPoly coefficients (index = power of s)
function pTrim(p) { let n = p.length; while (n > 1 && p[n - 1].isZero()) n--; return p.slice(0, n); }
function pAdd(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || MPoly.ZERO).add(b[i] || MPoly.ZERO));
    return pTrim(out);
}
function pNeg(a) { return a.map(m => m.neg()); }
function pSub(a, b) { return pAdd(a, pNeg(b)); }
function pMul(a, b) {
    const out = new Array(a.length + b.length - 1).fill(MPoly.ZERO);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = out[i + j].add(a[i].mul(b[j]));
    return pTrim(out);
}

export class SymTF {
    // num, den: arrays of MPoly, index = power of s
    constructor(num, den) {
        this.num = pTrim(num.length ? num : [MPoly.ZERO]);
        this.den = pTrim(den.length ? den : [MPoly.ONE]);
        if (this.den.length === 1 && this.den[0].isZero()) throw new Error("SymTF: zero denominator");
    }
    static zero() { return new SymTF([MPoly.ZERO], [MPoly.ONE]); }
    static one() { return new SymTF([MPoly.ONE], [MPoly.ONE]); }
    static constMPoly(m) { return new SymTF([m], [MPoly.ONE]); }

    isZero() { return this.num.length === 1 && this.num[0].isZero(); }
    add(o) { return new SymTF(pAdd(pMul(this.num, o.den), pMul(o.num, this.den)), pMul(this.den, o.den)); }
    sub(o) { return new SymTF(pSub(pMul(this.num, o.den), pMul(o.num, this.den)), pMul(this.den, o.den)); }
    mul(o) { return new SymTF(pMul(this.num, o.num), pMul(this.den, o.den)); }
    neg() { return new SymTF(pNeg(this.num), this.den); }

    // Task 6 fills this in; identity stub so the module loads.
    simplify() { return this; }
}

// shared s-poly helpers for Task 6
export const _spoly = { pTrim, pAdd, pSub, pMul, pNeg };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/symtf.js spike/test/sym-symtf.test.js
PAGER=cat git commit -m "Add symbolic transfer-function arithmetic over multivariate polynomials"
```

---

### Task 6: `SymTF.simplify()` — guaranteed cancellation + canonical form

**Files:**
- Modify: `symbolic/symtf.js` (replace the `simplify()` stub)
- Test: `spike/test/sym-simplify.test.js`

**Context:** Lift `num`/`den` to polynomials in `s` over `RatFunc` (the field `Q(params)`), run a monic Euclidean GCD in `s`, divide both by it, convert back, clear `RatFunc` denominators, and content-normalise to primitive integer-ish coefficients with a canonical sign / monic-when-constant-denominator. This delivers requirements 1–4 of the spec.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-simplify.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const str = (arr) => arr.map(m => m.toString()).join(",");

test("cancels a common s factor: s(s+1) / s(s+2) -> (s+1)/(s+2)", () => {
  const num = [c(0), c(1), c(1)];   // s^2 + s
  const den = [c(0), c(2), c(1)];   // s^2 + 2s
  const r = new SymTF(num, den).simplify();
  assert.equal(str(r.num), "1,1");  // s + 1
  assert.equal(str(r.den), "2,1");  // s + 2
});

test("cancels common parameter content: 2K / (2K s + 4K) -> 1/(s+2)", () => {
  const K = MPoly.variable("K");
  const num = [c(2).mul(K)];
  const den = [c(4).mul(K), c(2).mul(K)];
  const r = new SymTF(num, den).simplify();
  assert.equal(str(r.num), "1");
  assert.equal(str(r.den), "2,1");
});

test("monic-normalises a constant-denominator result: (2s+4)/2 -> s+2", () => {
  const r = new SymTF([c(4), c(2)], [c(2)]).simplify();
  assert.equal(str(r.num), "2,1");
  assert.equal(str(r.den), "1");
});

test("clears fractional coefficients to integer-primitive: (s/2 + 1)/1 -> (s+2)/2", () => {
  // s/2 + 1 == (s + 2)/2 ; canonical form is integer-primitive (no introduced fractions),
  // so num = s + 2, den = 2 (NOT s+2 over 1 — that would change the value).
  const r = new SymTF([c(1), new MPoly(new Map([["", new Rational(1n, 2n)]]))], [c(1)]).simplify();
  assert.equal(str(r.num), "2,1");
  assert.equal(str(r.den), "2");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (stub returns unsimplified).

- [ ] **Step 3: Replace `simplify()` in `symbolic/symtf.js`**

Add the import at the top:

```javascript
import { RatFunc } from "./ratfunc.js";
import { Rational } from "./rational.js";
```

Replace the stub `simplify()` with:

```javascript
    simplify() {
        // 1. lift s-coefficients into the field Q(params)
        let N = this.num.map(m => RatFunc.fromMPoly(m));
        let D = this.den.map(m => RatFunc.fromMPoly(m));

        // 2. monic Euclidean GCD in s over the field, divide both by it
        const g = sGcd(N, D);
        N = sDivField(N, g).q;
        D = sDivField(D, g).q;

        // 3. clear the RatFunc denominators (multiply through by their lcm)
        let denLcm = MPoly.ONE;
        for (const r of [...N, ...D]) denLcm = lcmMPoly(denLcm, r.den);
        let numM = N.map(r => r.num.mul(denLcm.divideExact(r.den)));
        let denM = D.map(r => r.num.mul(denLcm.divideExact(r.den)));

        // 4. remove a common PARAMETER-polynomial factor (content) shared by num and den
        //    (the s-GCD treats pure-parameter factors as field units, so they survive to here)
        let content = MPoly.ZERO;
        for (const m of [...numM, ...denM]) content = MPoly.gcd(content, m);
        if (!content.isZero() && !(content.isConstant() && content.constantValue().isOne())) {
            numM = numM.map(m => m.divideExact(content));
            denM = denM.map(m => m.divideExact(content));
        }

        // 5. integer-primitive: clear coefficient fractions and divide out the integer gcd
        const factor = integerPrimitiveFactor([...numM, ...denM]);
        numM = numM.map(m => m.scaleByRational(factor));
        denM = denM.map(m => m.scaleByRational(factor));

        // 6. sign: make the denominator's leading-in-s coefficient have a positive leading sign
        const dl = denM[denM.length - 1].leadingRational();
        if (dl.sign() < 0) { numM = numM.map(m => m.neg()); denM = denM.map(m => m.neg()); }

        return new SymTF(numM, denM);
    }
```

Add these module-scope helpers (after the `_spoly` export):

```javascript
// ---- polynomial-in-s arithmetic over the RatFunc field, for the s-GCD ----
function rTrim(p) { let n = p.length; while (n > 1 && p[n - 1].isZero()) n--; return p.slice(0, n); }
function rDeg(p) { const t = rTrim(p); return (t.length === 1 && t[0].isZero()) ? -1 : t.length - 1; }
function rSub(a, b) {
    const n = Math.max(a.length, b.length), out = [];
    for (let i = 0; i < n; i++) out.push((a[i] || RatFunc.ZERO).sub(b[i] || RatFunc.ZERO));
    return rTrim(out);
}
function rScaleShift(p, coeff, shift) { // p * coeff * s^shift
    const out = new Array(shift).fill(RatFunc.ZERO).concat(p.map(r => r.mul(coeff)));
    return rTrim(out);
}
// long division over the field: returns {q, r} with a = q*b + r
function sDivField(a, b) {
    a = rTrim(a); b = rTrim(b);
    const db = rDeg(b);
    if (db < 0) throw new Error("sDivField: zero divisor");
    const lcb = b[db];
    let r = a.slice(), q = new Array(Math.max(0, rDeg(a) - db + 1)).fill(RatFunc.ZERO);
    while (rDeg(r) >= db) {
        const dr = rDeg(r);
        const coeff = r[dr].div(lcb);
        const shift = dr - db;
        q[shift] = coeff;
        r = rSub(r, rScaleShift(b, coeff, shift));
    }
    return { q: rTrim(q.length ? q : [RatFunc.ZERO]), r: rTrim(r) };
}
function sGcd(a, b) {
    let x = rTrim(a), y = rTrim(b);
    while (!(rDeg(y) < 0)) { const { r } = sDivField(x, y); x = y; y = r; }
    // make x monic over the field
    const dx = rDeg(x);
    if (dx < 0) return [RatFunc.ONE];
    const lead = x[dx];
    return x.map(r => r.div(lead));
}
function lcmMPoly(a, b) {
    if (a.isZero()) return b;
    if (b.isZero()) return a;
    const g = MPoly.gcd(a, b);
    return a.mul(b.divideExact(g));
}

// ---- integer-primitive scaling factor (a Rational to multiply all coeffs by) ----
function biAbs(x) { return x < 0n ? -x : x; }
function biGcd(a, b) { a = biAbs(a); b = biAbs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function biLcm(a, b) { return (a === 0n || b === 0n) ? 0n : biAbs(a / biGcd(a, b) * b); }
// Returns factor f such that multiplying every coefficient by f makes them all integers
// with overall gcd 1 (so num and den become integer-primitive; the ratio is unchanged).
function integerPrimitiveFactor(mpolys) {
    const coeffs = [];
    for (const m of mpolys) for (const c of m.terms.values()) coeffs.push(c);
    if (coeffs.length === 0) return Rational.ONE;
    let L = 1n;                          // lcm of all coefficient denominators
    for (const c of coeffs) L = biLcm(L, c.den);
    let G = 0n;                          // gcd of all (cleared) integer numerators
    for (const c of coeffs) G = biGcd(G, c.num * (L / c.den));
    if (G === 0n) return Rational.ONE;
    return new Rational(L, G);
}
```

(`integerPrimitiveFactor` multiplies BOTH num and den by the same factor, so the transfer function is unchanged; it only normalises the coefficients to integer-primitive form. The four `simplify` tests pin the exact expected output.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS (4 simplify tests; all prior tests green).

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/symtf.js spike/test/sym-simplify.test.js
PAGER=cat git commit -m "Add guaranteed pole/zero cancellation and canonical form to SymTF"
```

---

### Task 7: `parseExprToTF` — block-value string → `SymTF`

**Files:**
- Create: `symbolic/parse-expr.js`
- Test: `spike/test/sym-parse.test.js`

**Context:** Tokenize + recursive-descent parse a transfer-function expression string into a `SymTF`. Supports `+ - * / ^ ( )`, the variable `s`, numbers (integer/decimal), parameter identifiers, and implicit multiplication (`2s`, `Ks`, `(s+1)(s+2)`). `s` builds `[0,1]/[1]`; a parameter `X` builds `[X]/[1]`; a number `n` builds `[n]/[1]`.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-parse.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExprToTF } from "../../symbolic/parse-expr.js";

const str = (tf) => `${tf.num.map(m => m.toString()).join(",")} | ${tf.den.map(m => m.toString()).join(",")}`;

test("number, variable, s", () => {
  assert.equal(str(parseExprToTF("2")), "2 | 1");
  assert.equal(str(parseExprToTF("a")), "a | 1");
  assert.equal(str(parseExprToTF("s")), "0,1 | 1");
});

test("K/(s+1)", () => {
  assert.equal(str(parseExprToTF("K/(s+1)")), "K | 1,1");
});

test("1/s and implicit multiplication 2s", () => {
  assert.equal(str(parseExprToTF("1/s")), "1 | 0,1");
  assert.equal(str(parseExprToTF("2s")), "0,2 | 1");
});

test("power and product (s+1)(s+2) -> s^2+3s+2", () => {
  const r = parseExprToTF("(s+1)(s+2)");
  assert.equal(r.num.map(m => m.toString()).join(","), "2,3,1");
  assert.equal(r.den.map(m => m.toString()).join(","), "1");
});

test("10/(s^2+2s)", () => {
  assert.equal(str(parseExprToTF("10/(s^2+2s)")), "10 | 0,2,1");
});

test("malformed input throws", () => {
  assert.throws(() => parseExprToTF("K/("));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/parse-expr.js`**

```javascript
import { SymTF } from "./symtf.js";
import { MPoly } from "./mpoly.js";
import { Rational } from "./rational.js";

function tokenize(src) {
    const tokens = [];
    let i = 0;
    const s = src.replace(/\s+/g, "");
    while (i < s.length) {
        const ch = s[i];
        if ("+-*/^()".includes(ch)) { tokens.push({ t: ch }); i++; continue; }
        if (/[0-9.]/.test(ch)) {
            let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
            tokens.push({ t: "num", v: s.slice(i, j) }); i = j; continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
            tokens.push({ t: "id", v: s.slice(i, j) }); i = j; continue;
        }
        throw new Error(`Unexpected character '${ch}' in '${src}'`);
    }
    return tokens;
}

// Recursive descent with implicit multiplication. Grammar:
//   expr   := term (('+'|'-') term)*
//   term   := factor ( ('*'|'/') factor | factor )*     // juxtaposition = '*'
//   factor := base ('^' integer)?
//   base   := number | id | 's' | '(' expr ')'
export function parseExprToTF(src) {
    const tk = tokenize(src);
    let pos = 0;
    const peek = () => tk[pos];
    const next = () => tk[pos++];

    function base() {
        const t = peek();
        if (!t) throw new Error(`Unexpected end of '${src}'`);
        if (t.t === "(") {
            next();
            const e = expr();
            if (!peek() || peek().t !== ")") throw new Error(`Missing ')' in '${src}'`);
            next();
            return e;
        }
        if (t.t === "num") { next(); return SymTF.constMPoly(MPoly.constant(Rational.parse(t.v))); }
        if (t.t === "id") {
            next();
            if (t.v === "s") return new SymTF([MPoly.ZERO, MPoly.ONE], [MPoly.ONE]);
            return SymTF.constMPoly(MPoly.variable(t.v));
        }
        throw new Error(`Unexpected token '${t.t}' in '${src}'`);
    }
    function factor() {
        let b = base();
        if (peek() && peek().t === "^") {
            next();
            const e = next();
            if (!e || e.t !== "num") throw new Error(`Expected exponent in '${src}'`);
            const n = parseInt(e.v, 10);
            let r = SymTF.one();
            for (let k = 0; k < n; k++) r = r.mul(b);
            b = r;
        }
        return b;
    }
    function startsFactor(t) { return t && (t.t === "num" || t.t === "id" || t.t === "("); }
    function term() {
        let r = factor();
        for (;;) {
            const t = peek();
            if (t && (t.t === "*" || t.t === "/")) {
                next();
                const f = factor();
                r = t.t === "*" ? r.mul(f) : r.div(f);
            } else if (startsFactor(t)) {           // implicit multiplication (juxtaposition)
                r = r.mul(factor());
            } else break;
        }
        return r;
    }
    function expr() {
        let r = term();
        for (;;) {
            const t = peek();
            if (t && (t.t === "+" || t.t === "-")) { next(); const u = term(); r = t.t === "+" ? r.add(u) : r.sub(u); }
            else break;
        }
        return r;
    }
    const result = expr();
    if (pos !== tk.length) throw new Error(`Trailing tokens in '${src}'`);
    return result;
}
```

Add a `div` method on `SymTF` so the parser can divide (in `symbolic/symtf.js`, inside the class, next to `mul`):

```javascript
    div(o) {
        if (o.isZero()) throw new Error("SymTF: divide by zero");
        // (n1/d1) / (n2/d2) = (n1*d2)/(d1*n2)
        return new SymTF(_spoly.pMul(this.num, o.den), _spoly.pMul(this.den, o.num));
    }
```

(The six parse tests pin behaviour, including `/` and implicit multiplication.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/parse-expr.js symbolic/symtf.js spike/test/sym-parse.test.js
PAGER=cat git commit -m "Add transfer-function expression parser to SymTF"
```

---

### Task 8: `solveExact` — linear-system solve over `SymTF`

**Files:**
- Create: `symbolic/solve-exact.js`
- Test: `spike/test/sym-solve-exact.test.js`

**Context:** Mirror `solveNumerically` (`solver.js`) but over `SymTF`. Build the active-node list (blocks + sums + outputs, with the **sink forced last** — same convention the numeric/symbolic solvers already use), parse each block value via `parseExprToTF`, fill the matrix `M` (SymTF) and source vector `V`, Gaussian-eliminate, read the sink row, and `simplify()`. Sources are nodes of type `input` or `disturbance`; the chosen `sourceId` is injected, all others zeroed (they fall out, exactly as in the numeric solver). Returns a simplified `SymTF`.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-solve-exact.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { solveExact } from "../../symbolic/solve-exact.js";

const str = (tf) => `${tf.num.map(m => m.toString()).join(",")} | ${tf.den.map(m => m.toString()).join(",")}`;

test("K/(s+1) with feedback H=2 -> K/(s+1+2K)", () => {
  const nodes = [
    { id: "R", type: "input",  value: "1",       label: "R" },
    { id: "S", type: "sum",    value: "",        label: "S" },
    { id: "G", type: "block",  value: "K/(s+1)", label: "G" },
    { id: "H", type: "block",  value: "2",       label: "H", direction: "left" },
    { id: "Y", type: "output", value: "1",       label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "c5", fromNode: "H", toNode: "S", sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  assert.equal(str(r), "K | 1 + 2K,1");          // K / (s + (1+2K))
});

test("the spec example -> K/(s^2+(a+1)s+a+2K)", () => {
  const nodes = [
    { id: "R",  type: "input",  value: "1",       label: "R" },
    { id: "S",  type: "sum",    value: "",        label: "S" },
    { id: "A",  type: "block",  value: "1/s",     label: "A" },
    { id: "B",  type: "block",  value: "K/(s+1)", label: "B" },
    { id: "M2", type: "block",  value: "2",       label: "M2", direction: "left" },
    { id: "Ma", type: "block",  value: "a",       label: "Ma", direction: "left" },
    { id: "Y",  type: "output", value: "1",       label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R",  toNode: "S",  sign: "+" },
    { id: "c2", fromNode: "S",  toNode: "A",  sign: "" },
    { id: "c3", fromNode: "A",  toNode: "B",  sign: "" },
    { id: "c4", fromNode: "B",  toNode: "Y",  sign: "" },
    { id: "c5", fromNode: "B",  toNode: "M2", sign: "" },
    { id: "c6", fromNode: "M2", toNode: "S",  sign: "-" },
    { id: "c7", fromNode: "A",  toNode: "Ma", sign: "" },
    { id: "c8", fromNode: "Ma", toNode: "S",  sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  assert.equal(str(r), "K | a + 2K,a + 1,1");    // K / (s^2 + (a+1)s + (a+2K))
});

test("opaque blocks G,H -> G/(GH+1)", () => {
  const nodes = [
    { id: "R", type: "input",  value: "1", label: "R" },
    { id: "S", type: "sum",    value: "",  label: "S" },
    { id: "G", type: "block",  value: "G", label: "G" },
    { id: "H", type: "block",  value: "H", label: "H", direction: "left" },
    { id: "Y", type: "output", value: "1", label: "Y" },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "c5", fromNode: "H", toNode: "S", sign: "-" },
  ];
  const r = solveExact(nodes, conns, "R", "Y");
  assert.equal(str(r), "G | GH + 1,");           // G / (GH + 1), den is degree 0 in s
});
```

Note the last expectation: a degree-0 denominator prints as `"GH + 1"` with a trailing comma only if there is one element — adjust the expected string to whatever the single-element join yields. If `str` yields `"G | GH + 1"`, use that. Pin to the actual single-element output.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/solve-exact.js`**

```javascript
import { SymTF } from "./symtf.js";
import { MPoly } from "./mpoly.js";
import { parseExprToTF } from "./parse-expr.js";

const SOURCE_TYPES = ["input", "disturbance"];

export function solveExact(nodes, connections, sourceId, sinkId) {
    const sinkNode = nodes.find(n => n.id === sinkId);
    if (!nodes.find(n => n.id === sourceId)) throw new Error("Missing source node");
    if (!sinkNode) throw new Error("Missing sink node");

    const base = [
        ...nodes.filter(n => n.type === "block"),
        ...nodes.filter(n => n.type === "sum"),
        ...nodes.filter(n => n.type === "output"),
    ];
    // sink last
    const active = base.filter(n => n.id !== sinkId).concat(base.filter(n => n.id === sinkId));
    const K = active.length;
    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");
    const idx = {};
    active.forEach((n, i) => (idx[n.id] = i));

    // M X = V ;  M = I - A
    const M = Array.from({ length: K }, (_, i) =>
        Array.from({ length: K }, (_, j) => (i === j ? SymTF.one() : SymTF.zero())));
    const V = Array.from({ length: K }, () => SymTF.zero());

    for (let i = 0; i < K; i++) {
        const target = active[i];
        for (const conn of connections.filter(c => c.toNode === target.id)) {
            let w = SymTF.one();
            if (target.type === "block") w = parseExprToTF(target.value);
            if (target.type === "sum" && conn.sign === "-") w = w.neg();
            if (conn.fromNode === sourceId) V[i] = V[i].add(w);
            else {
                const j = idx[conn.fromNode];
                if (j !== undefined) M[i][j] = M[i][j].sub(w);
            }
        }
    }

    // Gaussian elimination over SymTF
    for (let k = 0; k < K; k++) {
        let pivot = -1;
        for (let r = k; r < K; r++) if (!M[r][k].isZero()) { pivot = r; break; }
        if (pivot === -1) continue;
        if (pivot !== k) { [M[k], M[pivot]] = [M[pivot], M[k]]; [V[k], V[pivot]] = [V[pivot], V[k]]; }
        const pv = M[k][k];
        for (let j = 0; j < K; j++) M[k][j] = M[k][j].div(pv);
        V[k] = V[k].div(pv);
        for (let i = 0; i < K; i++) {
            if (i === k) continue;
            const f = M[i][k];
            if (f.isZero()) continue;
            for (let j = 0; j < K; j++) M[i][j] = M[i][j].sub(f.mul(M[k][j]));
            V[i] = V[i].sub(f.mul(V[k]));
        }
    }

    return V[idx[sinkId]].simplify();
}
```

Note: `SymTF` needs the `div` method added in Task 7 — confirm it is present.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS (3 end-to-end cases, including the spec example).

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/solve-exact.js spike/test/sym-solve-exact.test.js
PAGER=cat git commit -m "Add exact symbolic block-diagram solver over SymTF"
```

---

### Task 9: `render` — `SymTF` → KaTeX / plain text

**Files:**
- Create: `symbolic/render.js`
- Test: `spike/test/sym-render.test.js`

**Context:** Render a `SymTF` as `{ toKaTeX(), toFormulaString() }` in collected descending-`s`-power form. A coefficient that is a sum is parenthesised when it multiplies `s^k`. Denominator `1` → bare numerator (no fraction), matching `TransferFunction.toKaTeX`. The `MPoly.toString()` from Task 2 already collects parameters; reuse it for plain text and adapt for KaTeX (`^` exponents, `\cdot` not needed for monomials, `\frac` for the outer fraction).

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-render.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSymTF } from "../../symbolic/render.js";
import { SymTF } from "../../symbolic/symtf.js";
import { MPoly } from "../../symbolic/mpoly.js";
import { Rational } from "../../symbolic/rational.js";

const c = (n) => MPoly.constant(Rational.of(n));
const K = MPoly.variable("K"), a = MPoly.variable("a");

test("spec example renders collected with grouped s coefficient", () => {
  // K / (s^2 + (a+1)s + (a+2K)). MPoly.toString uses the algebraic (ASCII) monomial
  // order — uppercase K before lowercase a — so the constant coefficient renders
  // "2K + a" (mathematically identical to a+2K) and the s^1 coefficient "a + 1".
  const num = [K];
  const den = [a.add(c(2).mul(K)), a.add(c(1)), c(1)];
  const r = renderSymTF(new SymTF(num, den));
  assert.equal(r.toFormulaString(), "K / (s^2 + (a + 1)s + 2K + a)");
  assert.equal(r.toKaTeX(), "\\frac{K}{s^2 + (a + 1)s + 2K + a}");
});

test("constant denominator renders as bare numerator", () => {
  const r = renderSymTF(new SymTF([c(2), c(1)], [c(1)]));   // s + 2
  assert.equal(r.toFormulaString(), "s + 2");
  assert.equal(r.toKaTeX(), "s + 2");
});

test("unit leading coefficient on s is omitted; constant shown", () => {
  const r = renderSymTF(new SymTF([c(2), c(3), c(1)], [c(1)])); // s^2 + 3s + 2
  assert.equal(r.toFormulaString(), "s^2 + 3s + 2");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `symbolic/render.js`**

```javascript
// Render a polynomial-in-s (array of MPoly, index = power) collected by descending power.
function renderPoly(coeffs, mode) {
    // mode: "text" | "katex"
    const parts = [];
    for (let p = coeffs.length - 1; p >= 0; p--) {
        const m = coeffs[p];
        if (m.isZero()) continue;
        const isSum = m.terms.size > 1;
        let coeffStr = m.toString();                  // collected, e.g. "a + 1", "2K", "1", "-3"
        const sVar = p === 0 ? "" : (p === 1 ? "s" : (mode === "katex" ? `s^${p}` : `s^${p}`));

        // sign extraction for joining
        let neg = coeffStr.startsWith("-");
        let body = neg ? coeffStr.slice(1) : coeffStr;

        let termStr;
        if (p === 0) {
            termStr = body;                            // constant term shows its coefficient
        } else if (body === "1") {
            termStr = sVar;                            // 1*s^k -> s^k
        } else if (isSum) {
            termStr = `(${body})${sVar}`;              // (a+1)s
        } else {
            termStr = `${body}${sVar}`;                // 2Ks, 3s
        }
        parts.push({ neg, termStr });
    }
    if (parts.length === 0) return "0";
    let out = "";
    parts.forEach((p, i) => {
        if (i === 0) out = (p.neg ? "-" : "") + p.termStr;
        else out += (p.neg ? " - " : " + ") + p.termStr;
    });
    return out;
}

export function renderSymTF(tf) {
    const numText = renderPoly(tf.num, "text");
    const denIsOne = tf.den.length === 1 && tf.den[0].isConstant() && tf.den[0].constantValue().isOne();
    const denText = renderPoly(tf.den, "text");
    return {
        toFormulaString() {
            return denIsOne ? numText : `${numText} / (${denText})`;
        },
        toKaTeX() {
            return denIsOne ? numText : `\\frac{${numText}}{${denText}}`;
        },
    };
}
```

(Implementer note: `MPoly.toString()` already orders parameters and renders `K^2`, `Ka`, `a + 2K`, etc. — KaTeX uses the same exponent syntax `s^2`/`K^2`, so a single `renderPoly` serves both modes here. The three tests pin the exact strings.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add symbolic/render.js spike/test/sym-render.test.js
PAGER=cat git commit -m "Add collected KaTeX/text rendering for SymTF"
```

---

### Task 10: Integrate into `solver.js` — symbolic final TF + exact `loopGain` negation

**Files:**
- Modify: `solver.js` (`transferFunction` symbolic branch; `negateResult`)
- Test: `spike/test/sym-integration.test.js`

**Context:** In `transferFunction`'s symbolic branch, keep `solveSymbolically` for the step-by-step view but compute the headline TF with `solveExact(...)` rendered via `renderSymTF`, and expose the `SymTF` as `result.symtf`. Update `loopGain`'s `negateResult` to negate the `SymTF` exactly for the symbolic case. The numeric branch is untouched.

- [ ] **Step 1: Write the failing test**

Create `spike/test/sym-integration.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { transferFunction, loopGain } from "../../solver.js";

function loop() {
  const nodes = [
    { id: "R", type: "input",  value: "1",       label: "R", x: 0, y: 0 },
    { id: "S", type: "sum",    value: "",        label: "S", x: 0, y: 0 },
    { id: "G", type: "block",  value: "K/(s+1)", label: "G", x: 0, y: 0 },
    { id: "H", type: "block",  value: "2",       label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y", type: "output", value: "1",       label: "Y", x: 0, y: 0 },
  ];
  const conns = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "fb", fromNode: "H", toNode: "S", sign: "-" },
  ];
  return { nodes, conns };
}

test("symbolic closed loop renders the collected simplified TF", () => {
  const { nodes, conns } = loop();
  const r = transferFunction(nodes, conns, "R", "Y");
  assert.equal(r.finalTransferFunction.toKaTeX(), "\\frac{K}{s + 2K + 1}");
  assert.equal(r.finalTransferFunction.toFormulaString(), "K / (s + 2K + 1)");
  assert.ok(r.symtf, "exposes the SymTF for loopGain");
});

test("symbolic open-loop L(s) = GH = 2K/(s+1), simplified", () => {
  const { nodes, conns } = loop();
  const r = loopGain(nodes, conns, "fb");
  assert.equal(r.finalTransferFunction.toFormulaString(), "2K / (s + 1)");
});
```

(Pin the exact ordering — `MPoly.toString()` orders the denominator constant `s + 2K + 1` deterministically; if the engine yields `s + 1 + 2K`, update the expected strings to match the deterministic order the renderer actually produces. Run once, read the output, lock the assertion to it.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` — Expected: FAIL (symbolic path still nested).

- [ ] **Step 3: Wire `solveExact` into `transferFunction` (symbolic branch)**

In `solver.js`, add imports at the top (after the existing `import` line):

```javascript
import { solveExact } from './symbolic/solve-exact.js';
import { renderSymTF } from './symbolic/render.js';
```

In `transferFunction`, replace the symbolic branch:

```javascript
    if (hasSymbolic) {
        const r = solveSymbolically(nodes, connections, sourceId, sinkId);
        return { ...r, tf: null };
    }
```

with:

```javascript
    if (hasSymbolic) {
        const r = solveSymbolically(nodes, connections, sourceId, sinkId);
        const symtf = solveExact(nodes, connections, sourceId, sinkId);
        const rendered = renderSymTF(symtf);
        return {
            initialEquations: r.initialEquations,
            steps: r.steps,
            tf: null,
            symtf,
            finalTransferFunction: {
                toKaTeX: () => rendered.toKaTeX(),
                toFormulaString: () => rendered.toFormulaString(),
            },
        };
    }
```

- [ ] **Step 4: Make `loopGain` negate the `SymTF` exactly**

In `solver.js`, update `negateResult` to handle the symbolic case via the `SymTF` instead of string-wrapping. Replace the symbolic branch of `negateResult` (the part after `if (result.tf) { ... }`) with:

```javascript
    if (result.symtf) {
        const neg = result.symtf.neg().simplify();
        const rendered = renderSymTF(neg);
        return {
            initialEquations: [],
            steps: [],
            tf: null,
            symtf: neg,
            finalTransferFunction: {
                toKaTeX: () => rendered.toKaTeX(),
                toFormulaString: () => rendered.toFormulaString(),
            },
        };
    }
    // pure-numeric symbolic-string fallback (no symtf, no tf): keep old behaviour
    const k = result.finalTransferFunction.toKaTeX();
    const f = result.finalTransferFunction.toFormulaString();
    return {
        initialEquations: [],
        steps: [],
        tf: null,
        finalTransferFunction: {
            toKaTeX: () => `-\\left(${k}\\right)`,
            toFormulaString: () => `-(${f})`,
        },
    };
```

(`SymTF` already has `.neg()` and `.simplify()` from Tasks 5–6. Import `renderSymTF` is already added in Step 3.)

- [ ] **Step 5: Run the test, fix ordering, and run the full suite**

Run: `npm test`
Expected: the two integration tests pass. If the denominator term order differs (`s + 2K + 1` vs `s + 1 + 2K`), read the actual rendered string and lock the test assertion to it (the order is deterministic from `MPoly.toString()`), then re-run. Confirm **all** existing tests stay green (numeric path untouched). If any pre-existing test asserted the *old* nested symbolic string, update it to the new collected form.

- [ ] **Step 6: Build and commit**

```bash
PAGER=cat git add solver.js spike/test/sym-integration.test.js
PAGER=cat git commit -m "Render simplified collected transfer functions for the symbolic path"
```

Then `npm run build` and confirm `bundle.js` builds cleanly (do **not** commit it).

---

## Final verification

- [ ] `npm test` → all green (154 existing + the new symbolic suites).
- [ ] `npm run build` succeeds.
- [ ] In-app smoke test: Block Diagram with a symbolic block (e.g. `G = K/(s+1)`, `H = 2`) → "Simplified Transfer Function" shows `\frac{K}{s + 2K + 1}` (not the nested form); Break Loop on the feedback wire → `2K/(s+1)`; the spec example diagram → `K/(s² + (a+1)s + a + 2K)`.
- [ ] Numeric diagrams unchanged (e.g. default feedback template still `10/(s²+2s+20)`).
- [ ] `bundle.js` not staged in any commit.

## Notes for the implementer

- **Exactness is non-negotiable** — `BigInt` rationals throughout. A single float would break cancellation silently.
- **Build bottom-up.** Do not start Task `N+1` until Task `N`'s tests are green; later layers depend on earlier invariants (especially `MPoly.gcd`).
- **`MPoly.gcd` (Task 3) is the risk.** If a higher-level test fails mysteriously, suspect the GCD first and add targeted `MPoly.gcd` tests reproducing the sub-case.
- **Polynomial-in-`s` arrays are ascending power** (`[s^0 … s^n]`) everywhere, matching `Polynomial.coeffs`.
- **Deterministic ordering** of parameters in `MPoly.toString()` makes rendered output and test assertions stable; if you change the ordering, update the render/integration test strings to match.
- **Numeric path stays untouched** — `solveExact` is only reached through `transferFunction`'s `hasSymbolic` branch.
- **The tests are the source of truth.** Reference implementations are complete and intended to pass the given tests as-is; if a reference snippet and its test ever disagree, trust the test and fix the code. Never weaken a test expectation to make it pass (except where a step explicitly says to lock an assertion to the engine's deterministic ordering after reading it once — Tasks 8 and 10).
