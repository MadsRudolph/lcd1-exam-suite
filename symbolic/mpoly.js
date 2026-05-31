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
        const dR = degUni(R);
        const t = R[dR];                                 // lc(R) BEFORE scaling
        const shift = dR - dB;
        R = R.map(co => co.mul(lcB));                    // scale whole R by lc(B)
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

    // Evaluate every variable to a Rational (map: { name -> Rational|number|string }),
    // returning the resulting constant Rational. Missing variables throw, so callers
    // must supply a value for every symbol present.
    evalAt(map) {
        const val = (n) => {
            const v = map[n];
            if (v === undefined) throw new Error(`evalAt: no value for symbol '${n}'`);
            return v instanceof Rational ? v : Rational.parse(String(v));
        };
        let acc = Rational.ZERO;
        for (const [k, c] of this.terms) {
            let term = c;
            for (const [n, e] of monoFromKey(k)) {
                const x = val(n);
                for (let i = 0; i < e; i++) term = term.mul(x);
            }
            acc = acc.add(term);
        }
        return acc;
    }

    // Substitute a subset of variables with constant values (Rational|number|string),
    // leaving the others symbolic. Returns an MPoly in the remaining variables.
    substitute(map) {
        let out = MPoly.ZERO;
        for (const [k, c] of this.terms) {
            const mono = monoFromKey(k);
            let coeff = c;
            const rest = new Map();
            for (const [n, e] of mono) {
                if (Object.prototype.hasOwnProperty.call(map, n)) {
                    const v = map[n] instanceof Rational ? map[n] : Rational.parse(String(map[n]));
                    for (let i = 0; i < e; i++) coeff = coeff.mul(v);
                } else {
                    rest.set(n, e);
                }
            }
            out = out.add(new MPoly(new Map([[keyFromMono(rest), coeff]])));
        }
        return out;
    }

    // Partial derivative with respect to one variable (polynomial rule).
    partial(varName) {
        const m = new Map();
        for (const [k, c] of this.terms) {
            const mono = monoFromKey(k);
            const e = mono.get(varName) || 0;
            if (e === 0) continue;
            mono.set(varName, e - 1);
            const key = keyFromMono(mono);
            m.set(key, (m.get(key) || Rational.ZERO).add(c.mul(Rational.of(e))));
        }
        return new MPoly(m);
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

    // collected string, monomials lex-descending, constant last; coeff 1 omitted except constant.
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
