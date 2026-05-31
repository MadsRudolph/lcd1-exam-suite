// Unit tests for the numeric core (Complex, NumericTF G(jw) eval, root-finding).
// Hand-computed expected values — the foundation P3/P6 margins build on.
import { test } from "node:test";
import { approxAbs } from "../lib/assert.js";
import { Complex } from "../numeric/complex.js";
import { NumericTF } from "../numeric/tf.js";
import { roots } from "../numeric/roots.js";

test("complex multiply", () => {
  const z = new Complex(1, 2).mul(new Complex(3, 4)); // (1+2i)(3+4i) = -5+10i
  approxAbs(z.re, -5, 1e-12, "re");
  approxAbs(z.im, 10, 1e-12, "im");
});

test("complex reciprocal and abs", () => {
  const z = new Complex(1, 1).inv(); // 1/(1+i) = 0.5 - 0.5i
  approxAbs(z.re, 0.5, 1e-12, "re");
  approxAbs(z.im, -0.5, 1e-12, "im");
  approxAbs(new Complex(3, 4).abs(), 5, 1e-12, "abs");
});

test("evaluate G(s)=1/(s+1) at s=j1", () => {
  // 1/(1+j) = 0.5 - 0.5j, |G| = 1/sqrt(2)
  const G = new NumericTF([1], [1, 1]);
  const v = G.evalAt(new Complex(0, 1));
  approxAbs(v.re, 0.5, 1e-12, "re");
  approxAbs(v.im, -0.5, 1e-12, "im");
  approxAbs(v.abs(), 1 / Math.SQRT2, 1e-12, "mag");
});

test("roots of s^2 + 3s + 2 = {-1, -2}", () => {
  const r = roots([1, 3, 2]).map((c) => c.re).sort((a, b) => a - b);
  approxAbs(r[0], -2, 1e-9, "root0");
  approxAbs(r[1], -1, 1e-9, "root1");
});

test("roots of (s+1)^3 = triple -1", () => {
  // Durand-Kerner converges only linearly on multiple roots, so a degenerate
  // cubic resolves to ~1e-5 (distinct roots hit 1e-9). Far tighter than the
  // 1e-2..5e-2 tolerances the downstream margin/stability work relies on.
  const r = roots([1, 3, 3, 1]);
  for (const c of r) {
    approxAbs(c.re, -1, 1e-5, "re");
    approxAbs(c.im, 0, 1e-5, "im");
  }
});
