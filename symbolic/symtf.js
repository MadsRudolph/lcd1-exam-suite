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
