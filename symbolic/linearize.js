// Linearization of a first-order nonlinear state equation ẋ = f(x,u) at an
// operating point, returning the small-signal transfer function (§2.7).
//
// G(s) = ΔX/ΔU = (∂f/∂u)|₀ / (s − (∂f/∂x)|₀).
//
// f must be a polynomial/rational expression in the state and input symbols (and
// any literal parameters). Symbolic partial derivatives use the quotient rule on
// the multivariate-polynomial numerator/denominator; the operating point fixes the
// state and input symbols (numerically) while every other parameter stays literal,
// so a plant linearized at (x̄,ū) yields e.g. c·b/(s+a). Transcendental
// nonlinearities (sin, exp, √) are out of scope — see cas-engine-requirements §2.7.
import { parseExprToTF } from "./parse-expr.js";
import { SymTF } from "./symtf.js";
import { MPoly } from "./mpoly.js";
import { RatFunc } from "./ratfunc.js";

// f as a RatFunc (in all symbols) from its string form. Must be s-free.
function parseStatic(expr) {
  const tf = parseExprToTF(expr);
  if (tf.num.length > 1 || tf.den.length > 1)
    throw new Error("linearize: f must not depend on the Laplace variable s");
  return new RatFunc(tf.num[0], tf.den[0]);
}

// ∂(N/D)/∂v via the quotient rule.
function partialRatFunc(rf, v) {
  const N = rf.num, D = rf.den;
  return new RatFunc(N.partial(v).mul(D).sub(N.mul(D.partial(v))), D.mul(D));
}

// Substitute the operating point (numeric for the listed vars) into a RatFunc.
function atPoint(rf, point) {
  return new RatFunc(rf.num.substitute(point), rf.den.substitute(point));
}

// Build the small-signal TF B/(s − A) from RatFunc coefficients A, B. Requires A, B
// to be polynomial (denominator 1) — true once the operating point is substituted.
function firstOrderTF(A, B) {
  if (!A.den.equals(MPoly.ONE) || !B.den.equals(MPoly.ONE))
    throw new Error("linearize: non-polynomial Jacobian at the operating point");
  return new SymTF([B.num], [A.num.neg(), MPoly.ONE]).simplify(); // B / (s − A)
}

// linearize ẋ = f(x,u). point maps the state and input symbols to their operating
// values (numbers); other symbols stay literal. Returns the simplified SymTF.
export function linearizeFirstOrder({ f, stateVar, inputVar, point = {} }) {
  const F = parseStatic(f);
  const A = atPoint(partialRatFunc(F, stateVar), point);
  const B = atPoint(partialRatFunc(F, inputVar), point);
  return firstOrderTF(A, B);
}
