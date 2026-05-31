// Minimal complex-number class for G(jw) evaluation.
export class Complex {
  constructor(re = 0, im = 0) {
    this.re = re;
    this.im = im;
  }
  add(o) {
    return new Complex(this.re + o.re, this.im + o.im);
  }
  sub(o) {
    return new Complex(this.re - o.re, this.im - o.im);
  }
  mul(o) {
    return new Complex(
      this.re * o.re - this.im * o.im,
      this.re * o.im + this.im * o.re,
    );
  }
  scale(k) {
    return new Complex(this.re * k, this.im * k);
  }
  div(o) {
    const d = o.re * o.re + o.im * o.im;
    return new Complex(
      (this.re * o.re + this.im * o.im) / d,
      (this.im * o.re - this.re * o.im) / d,
    );
  }
  inv() {
    const d = this.re * this.re + this.im * this.im;
    return new Complex(this.re / d, -this.im / d);
  }
  abs() {
    return Math.hypot(this.re, this.im);
  }
  arg() {
    return Math.atan2(this.im, this.re);
  }
}

export const C = (re, im = 0) => new Complex(re, im);
