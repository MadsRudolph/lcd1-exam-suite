// Float polynomial helpers. Coefficients are highest-degree-first.
// e.g. [1, 5, 6] = s^2 + 5s + 6.

// Hard cap on polynomial degree. Exam transfer functions are degree <= ~8; this
// is the central guard that stops `(s+1)**1e8`-style inputs (and long implicit
// products) from expanding into a giant array that would freeze the renderer.
export const MAX_DEGREE = 1024;

export function polyTrim(a) {
  let i = 0;
  while (i < a.length - 1 && Math.abs(a[i]) < 1e-12) i++;
  return a.slice(i);
}

export function polyAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  for (let i = 0; i < a.length; i++) out[n - a.length + i] += a[i];
  for (let i = 0; i < b.length; i++) out[n - b.length + i] += b[i];
  return out;
}

export function polyScale(a, k) {
  return a.map((c) => c * k);
}

export function polySub(a, b) {
  return polyAdd(a, polyScale(b, -1));
}

export function polyMul(a, b) {
  if (a.length + b.length - 2 > MAX_DEGREE) {
    throw new Error(`polynomial degree limit exceeded (max ${MAX_DEGREE})`);
  }
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] += a[i] * b[j];
    }
  }
  return out;
}

export function polyPow(a, n) {
  let out = [1];
  for (let i = 0; i < n; i++) out = polyMul(out, a);
  return out;
}

/** Number of trailing (lowest-degree) coefficients that are ~0 = order of s factor. */
export function trailingZeros(a, tol = 1e-9) {
  let n = 0;
  for (let i = a.length - 1; i > 0; i--) {
    if (Math.abs(a[i]) < tol) n++;
    else break;
  }
  return n;
}
