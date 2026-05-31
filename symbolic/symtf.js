import { MPoly } from "./mpoly.js";
import { RatFunc } from "./ratfunc.js";
import { Rational } from "./rational.js";

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
}

// shared s-poly helpers for Task 6
export const _spoly = { pTrim, pAdd, pSub, pMul, pNeg };

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
