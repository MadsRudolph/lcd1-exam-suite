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
