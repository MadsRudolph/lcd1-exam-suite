// Limit/structure theorems on a symbolic transfer function (§2.4):
// order, system type (pole-at-origin multiplicity), and the finite static gain
// constant K0 = lim_{s→0} s^N·G that the numeric engine can't give (it returns
// NaN for any integrator). All operate on the simplified form.
import { RatFunc } from "./ratfunc.js";

// Degree of the denominator in s.
export function order(tf) {
  const g = tf.simplify();
  return g.den.length - 1;
}

// System type N = multiplicity of the s = 0 pole = number of leading (lowest-power)
// zero coefficients of the denominator, once common s-factors are cancelled.
export function systemType(tf) {
  const g = tf.simplify();
  let n = 0;
  while (n < g.den.length && g.den[n].isZero()) n++;
  return n;
}

// Finite static gain K0 = lim_{s→0} s^N·G with N = type. Returns a RatFunc in the
// remaining parameters. For a type-N loop gain this is the position (N=0),
// velocity (N=1) or acceleration (N=2) error constant.
export function staticGain(tf) {
  const g = tf.simplify();
  const N = systemType(g);
  return new RatFunc(g.num[0], g.den[N]);
}

// DC gain G(0). Finite only for a type-0 system; an integrator (type ≥ 1) has
// infinite DC gain, reported as null.
export function dcGain(tf) {
  const g = tf.simplify();
  if (systemType(g) > 0) return null;
  return new RatFunc(g.num[0], g.den[0]);
}
