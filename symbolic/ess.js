// Symbolic steady-state error (§2.5). Works from a loop gain L(s) = C·G·H (the
// return ratio, with any feedback gain already folded in), so the error constants
// and ess come out in the literal parameters — e.g. 1/(1+Kp·b·c). Also covers the
// error to a disturbance injected at a named node, given that node's path Gd(s) to
// the output and the loop gain around it.
import { SymTF } from "./symtf.js";
import { MPoly } from "./mpoly.js";
import { RatFunc } from "./ratfunc.js";

const S = new SymTF([MPoly.ZERO, MPoly.ONE], [MPoly.ONE]); // s

// lim_{s→0} F(s): Infinity if F has a pole at the origin, else the finite RatFunc
// F(0) (which is RatFunc.ZERO when F has a zero at the origin).
export function limitAtZero(F) {
  const g = F.simplify();
  if (g.den[0].isZero()) return Infinity;
  return new RatFunc(g.num[0], g.den[0]);
}

// Static error constants Kp, Kv, Ka = lim s^k·L for k = 0,1,2.
export function errorConstants(L) {
  return {
    Kp: limitAtZero(L),
    Kv: limitAtZero(S.mul(L)),
    Ka: limitAtZero(S.mul(S).mul(L)),
  };
}

// Steady-state error to a unit step on the reference: 1/(1+Kp) (→ 0 for type ≥ 1).
export function essStep(L) {
  const Kp = limitAtZero(L);
  if (Kp === Infinity) return RatFunc.ZERO;
  return RatFunc.ONE.div(RatFunc.ONE.add(Kp));
}

// Steady-state error to a unit ramp: 1/Kv (∞ for type 0, → 0 for type ≥ 2).
export function essRamp(L) {
  const Kv = limitAtZero(S.mul(L));
  if (Kv === Infinity) return RatFunc.ZERO;
  if (Kv.isZero()) return Infinity;
  return RatFunc.ONE.div(Kv);
}

// Steady-state error to a unit parabola: 1/Ka.
export function essParabola(L) {
  const Ka = limitAtZero(S.mul(S).mul(L));
  if (Ka === Infinity) return RatFunc.ZERO;
  if (Ka.isZero()) return Infinity;
  return RatFunc.ONE.div(Ka);
}

// Steady-state error from a unit-step disturbance injected at a named node. Gd is
// the transfer function from the injection point to the output with the loop open;
// L is the loop gain seen at that point. With negative feedback the output is
// Y_d = Gd/(1+L)·D and the error contribution is e = −Y_d, so for a unit step
// e_dss = −lim_{s→0} Gd/(1+L). Returns a RatFunc (or Infinity).
export function essDisturbanceStep({ Gd, L }) {
  const closed = Gd.div(SymTF.one().add(L));
  const v = limitAtZero(closed);
  if (v === Infinity) return Infinity;
  return v.neg();
}
