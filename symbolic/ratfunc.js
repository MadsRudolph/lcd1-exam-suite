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
