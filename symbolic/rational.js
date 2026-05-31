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
