// Polynomial root-finding over the complex plane.
// Durand–Kerner (Weierstrass) iteration, with closed-form fast paths for deg 1/2.
// Coefficients are highest-degree-first (python-control / numpy convention).
import { Complex } from "./complex.js";

function trimLeading(coeffs) {
  let i = 0;
  while (i < coeffs.length - 1 && coeffs[i] === 0) i++;
  return coeffs.slice(i);
}

// Evaluate polynomial (highest-degree-first) at complex z via Horner.
function horner(coeffs, z) {
  let acc = new Complex(0, 0);
  for (const c of coeffs) {
    acc = acc.mul(z).add(new Complex(c, 0));
  }
  return acc;
}

export function roots(rawCoeffs) {
  const coeffs = trimLeading(rawCoeffs.slice());
  const n = coeffs.length - 1; // degree
  if (n <= 0) return [];

  if (n === 1) {
    return [new Complex(-coeffs[1] / coeffs[0], 0)];
  }
  if (n === 2) {
    const [a, b, c] = coeffs;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      return [
        new Complex((-b + sq) / (2 * a), 0),
        new Complex((-b - sq) / (2 * a), 0),
      ];
    }
    const sq = Math.sqrt(-disc);
    return [
      new Complex(-b / (2 * a), sq / (2 * a)),
      new Complex(-b / (2 * a), -sq / (2 * a)),
    ];
  }

  // Normalise to monic for Durand–Kerner stability.
  const lead = coeffs[0];
  const monic = coeffs.map((c) => c / lead);

  // Initial guesses spread around a circle (classic 0.4+0.9i seed powers).
  const seed = new Complex(0.4, 0.9);
  let z = [];
  let p = new Complex(1, 0);
  for (let i = 0; i < n; i++) {
    z.push(p);
    p = p.mul(seed);
  }

  for (let iter = 0; iter < 500; iter++) {
    let maxDelta = 0;
    const next = z.slice();
    for (let i = 0; i < n; i++) {
      let denom = new Complex(1, 0);
      for (let j = 0; j < n; j++) {
        if (j !== i) denom = denom.mul(z[i].sub(z[j]));
      }
      const corr = horner(monic, z[i]).div(denom);
      next[i] = z[i].sub(corr);
      maxDelta = Math.max(maxDelta, corr.abs());
    }
    z = next;
    if (maxDelta < 1e-14) break;
  }
  return z;
}

export { horner };
