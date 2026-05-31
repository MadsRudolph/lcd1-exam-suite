// Inverse-Laplace time response via partial-fraction residues.
// Distinct poles only: y(t) = Σ r_k e^{p_k t}, r_k = N(p_k)/D'(p_k).
import { Complex } from "../numeric/complex.js";
import { horner } from "../numeric/roots.js";
import { polyMul, polyTrim } from "../numeric/poly.js";
import { NumericTF } from "../numeric/tf.js";

const TOL = 1e-9;

// Derivative of a highest-degree-first polynomial.
function polyDeriv(a) {
  const n = a.length - 1;
  if (n <= 0) return [0];
  return a.slice(0, -1).map((c, i) => c * (n - i));
}

/**
 * Partial-fraction time response of Y(s) = num/den (strictly proper, distinct poles).
 * Returns { terms: [{ pole: Complex, residue: Complex }], finalValue }.
 */
export function timeResponse(Ys) {
  const num = polyTrim(Ys.num.slice());
  const den = polyTrim(Ys.den.slice());
  const poles = Ys.poles();

  // Reject repeated poles (residue formula divides by D'(p)=0).
  for (let i = 0; i < poles.length; i++) {
    for (let j = i + 1; j < poles.length; j++) {
      if (poles[i].sub(poles[j]).abs() < 1e-6) {
        throw new Error("repeated poles not supported — needs distinct poles");
      }
    }
  }

  const dprime = polyDeriv(den);
  const terms = poles.map((p) => ({
    pole: p,
    residue: horner(num, p).div(horner(dprime, p)),
  }));

  // Final value theorem: lim t->inf y(t).
  let finalValue;
  const rhp = poles.some((p) => p.re > TOL);
  const originPoles = poles.filter((p) => p.abs() < TOL);
  if (rhp) {
    finalValue = NaN; // diverges
  } else if (originPoles.length === 0) {
    finalValue = 0; // all strictly LHP -> decays to 0
  } else if (originPoles.length === 1) {
    // single pole at origin: final value = its residue (real)
    finalValue = terms.find((t) => t.pole.abs() < TOL).residue.re;
  } else {
    finalValue = NaN; // double integrator -> ramp, diverges
  }
  return { terms, finalValue };
}

/** Step response of a plant G: y(t) for Y(s) = G(s)/s. */
export function stepResponse(G) {
  const Ys = new NumericTF(G.num.slice(), polyMul(G.den, [1, 0])); // den * s
  return timeResponse(Ys);
}

export { polyDeriv };
