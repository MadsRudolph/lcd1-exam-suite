// Float-coefficient transfer function with complex G(jw) evaluation.
// Mirrors the python-control TF the LCD1 solvers operate on: num/den are
// highest-degree-first coefficient arrays in s.
import { Complex } from "./complex.js";
import { roots, horner } from "./roots.js";

export class NumericTF {
  constructor(num, den) {
    this.num = num.slice();
    this.den = den.slice();
  }

  /** Evaluate G(s) at a complex s. */
  evalAt(s) {
    return horner(this.num, s).div(horner(this.den, s));
  }

  /** Closed-loop / open-loop poles = roots of the denominator. */
  poles() {
    return roots(this.den);
  }

  zeros() {
    return roots(this.num);
  }

  /** DC gain G(0) = num[last]/den[last]. */
  dcGain() {
    return this.num[this.num.length - 1] / this.den[this.den.length - 1];
  }

  hasRhpPole(tol = 1e-9) {
    return this.poles().some((p) => p.re > tol);
  }
}
