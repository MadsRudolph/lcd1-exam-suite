// spike/solvers/bodelab.js
// Pure compute layer for the interactive Bode Lab. In: lists of pole/zero
// complex roots placed on the s-plane. Out: plain Bode data objects. No DOM,
// no rendering — fully unit-testable.
//
// The transfer function is read straight off the placed roots:
//   G(s) = K · ∏(s − zᵢ) / ∏(s − pⱼ)
// evaluated at s = jω. K is fixed by a normalisation so |G(j·1)| = 1 (0 dB at
// ω = 1) — this matches the reference simulator, which shows the *shape* of the
// response rather than an absolute gain (you set gain separately in a design).

import { Complex } from "../numeric/complex.js";
import { logspace } from "../numeric/margins.js";
import { polyMul } from "../numeric/poly.js";
import { NumericTF } from "../numeric/tf.js";

// Example pole/zero layouts, mirrored from the reference simulator. Each is a
// plain {poles, zeros} of [re, im] pairs so it is JSON-trivial and DOM-free.
export const PRESETS = {
  "LPF 1-pole":  { poles: [[-100, 0]],                 zeros: [] },
  "LPF 2-pole":  { poles: [[-100, 100], [-100, -100]], zeros: [] },
  "HPF 1-pole":  { poles: [[-100, 0]],                 zeros: [[0, 0]] },
  "HPF 2-pole":  { poles: [[-100, 100], [-100, -100]], zeros: [[0, 0], [0, 0]] },
  "Notch":       { poles: [[-10, 100], [-10, -100]],   zeros: [[0, 100], [0, -100]] },
  "Lead":        { poles: [[-100, 0]],                 zeros: [[-10, 0]] },
  "Lag":         { poles: [[-1, 0]],                   zeros: [[-10, 0]] },
  "PI":          { poles: [[0, 0]],                    zeros: [[-10, 0]] },
  "Lead-Lag":    { poles: [[-100, 0], [-1, 0]],        zeros: [[-10, 0], [-10, 0]] },
  "PI+LPF":      { poles: [[0, 0], [-500, 0]],         zeros: [[-10, 0]] },
};

/** [re, im] pair (or {re, im}) → a Complex. */
function toC(p) {
  if (p instanceof Complex) return p;
  if (Array.isArray(p)) return new Complex(p[0], p[1]);
  return new Complex(p.re, p.im);
}

/** G(s) = ∏(s − zᵢ) / ∏(s − pⱼ) at a single complex s (gain 1). */
export function evalPZ(poles, zeros, s) {
  let num = new Complex(1, 0);
  for (const z of zeros) num = num.mul(s.sub(toC(z)));
  let den = new Complex(1, 0);
  for (const p of poles) den = den.mul(s.sub(toC(p)));
  return num.div(den);
}

/** Continuous phase (radians) — removes the ±2π jumps atan2 introduces. */
function unwrap(phase) {
  if (!phase.length) return phase;
  const out = [phase[0]];
  let offset = 0;
  for (let i = 1; i < phase.length; i++) {
    const d = phase[i] - phase[i - 1];
    if (d > Math.PI) offset -= 2 * Math.PI;
    else if (d < -Math.PI) offset += 2 * Math.PI;
    out.push(phase[i] + offset);
  }
  return out;
}

/** Two decades either side of the placed root magnitudes (default 1e-2…1e4). */
function autoFreqRange(poles, zeros) {
  const mags = [...poles, ...zeros].map((p) => toC(p).abs()).filter((m) => m > 1e-9);
  if (!mags.length) return [-2, 4];
  return [Math.log10(Math.min(...mags)) - 2, Math.log10(Math.max(...mags)) + 2];
}

/**
 * Bode data from placed poles/zeros.
 *   opts.wMin, opts.wMax : explicit decade endpoints (rad/s)
 *   opts.n               : number of samples (default 600)
 *   opts.normalize       : scale so |G(j·1)| = 1 → 0 dB at ω=1 (default true)
 * Returns { omega, magDb, phaseDeg, gain }.
 */
export function bodeFromPZ(poles, zeros, opts = {}) {
  const P = poles.map(toC), Z = zeros.map(toC);
  const [a, b] = opts.wMin != null && opts.wMax != null
    ? [Math.log10(opts.wMin), Math.log10(opts.wMax)]
    : autoFreqRange(P, Z);
  const n = opts.n != null ? opts.n : 600;
  const normalize = opts.normalize !== false;
  const omega = logspace(a, b, n);

  let gain = 1;
  if (normalize) {
    const ref = evalPZ(P, Z, new Complex(0, 1)).abs(); // |G(j1)|
    gain = ref > 1e-30 ? 1 / ref : 1;
  }

  const magDb = [];
  const phaseRaw = [];
  for (const w of omega) {
    const G = evalPZ(P, Z, new Complex(0, w));
    const mag = G.abs() * gain;
    magDb.push(mag > 1e-15 ? 20 * Math.log10(mag) : -300); // floor at a jω-axis zero
    phaseRaw.push(G.arg());
  }
  const phaseDeg = unwrap(phaseRaw).map((p) => (p * 180) / Math.PI);
  return { omega, magDb, phaseDeg, gain };
}

const fmt = (x) => {
  const v = Number(x.toFixed(1));
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/** Render a placed root as a readable factor: (s+100), (s−10), (s²+20s+10100). */
function factor(c) {
  const z = toC(c);
  if (Math.abs(z.im) < 1e-9) {
    if (Math.abs(z.re) < 1e-9) return "s";
    return `(s${z.re < 0 ? "+" : "−"}${fmt(Math.abs(z.re))})`;
  }
  // a complex root contributes, with its conjugate, s² − 2·Re·s + |·|²
  const b = -2 * z.re, c2 = z.re * z.re + z.im * z.im;
  const bs = Math.abs(b) < 1e-9 ? "" : `${b < 0 ? "−" : "+"}${fmt(Math.abs(b))}s`;
  return `(s²${bs}+${fmt(c2)})`;
}

/**
 * A human-readable G(s) = num/den string from the placed roots. Complex roots
 * are paired with their conjugate into a real quadratic when both are present;
 * an unpaired complex root is shown as its linear factor with a j term.
 */
export function tfStringFromPZ(poles, zeros) {
  const group = (roots) => {
    const used = new Array(roots.length).fill(false);
    const parts = [];
    for (let i = 0; i < roots.length; i++) {
      if (used[i]) continue;
      const r = toC(roots[i]);
      if (Math.abs(r.im) > 1e-9) {
        // find an unused conjugate
        let j = -1;
        for (let k = i + 1; k < roots.length; k++) {
          if (used[k]) continue;
          const o = toC(roots[k]);
          if (Math.abs(o.re - r.re) < 1e-6 && Math.abs(o.im + r.im) < 1e-6) { j = k; break; }
        }
        if (j >= 0) { used[i] = used[j] = true; parts.push(factor(r)); continue; }
      }
      used[i] = true;
      parts.push(Math.abs(r.im) < 1e-9 ? factor(r) : `(s−(${fmt(r.re)}${r.im < 0 ? "−" : "+"}${fmt(Math.abs(r.im))}j))`);
    }
    return parts;
  };
  const num = zeros.length ? group(zeros).join("") : "1";
  const den = poles.length ? group(poles).join("") : "1";
  return `${num} / ${den}`;
}

// ── roots → real-coefficient transfer function ──────────────────────────────
// The Bode Lab keeps the placed roots as the source of truth. To get the exact
// margins/step/Nyquist the Solver tab shows, we turn them into a real polynomial
// (highest-degree-first) and hand that to the same NumericTF / buildPlotData
// pipeline — no string round-trip, so no parser-precedence pitfalls.

/**
 * Multiply (s − rᵢ) factors into a real coefficient array. Real roots give a
 * linear factor; a complex root is paired with its conjugate into a real
 * quadratic s² − 2·Re·s + |·|². Returns null if a complex root is left without
 * a conjugate partner (no real-coefficient TF exists for it).
 */
export function polyFromRoots(rootList) {
  const R = rootList.map(toC);
  const used = new Array(R.length).fill(false);
  let coeffs = [1];
  for (let i = 0; i < R.length; i++) {
    if (used[i]) continue;
    const r = R[i];
    if (Math.abs(r.im) < 1e-9) { used[i] = true; coeffs = polyMul(coeffs, [1, -r.re]); continue; }
    let j = -1;
    for (let k = i + 1; k < R.length; k++) {
      if (used[k]) continue;
      const o = R[k];
      if (Math.abs(o.re - r.re) < 1e-6 && Math.abs(o.im + r.im) < 1e-6) { j = k; break; }
    }
    if (j < 0) return null; // unpaired complex root → not a real system
    used[i] = used[j] = true;
    coeffs = polyMul(coeffs, [1, -2 * r.re, r.re * r.re + r.im * r.im]);
  }
  return coeffs;
}

/**
 * Build a NumericTF from placed roots: G(s) = K · ∏(s−zᵢ) / ∏(s−pⱼ).
 * Returns { ok:true, tf } when the roots form a real system, else
 * { ok:false, reason } (an unpaired complex root).
 */
export function numericTfFromRoots(poles, zeros, K = 1) {
  const num = polyFromRoots(zeros);
  const den = polyFromRoots(poles);
  if (num == null || den == null) return { ok: false, reason: "unpaired complex root" };
  return { ok: true, tf: new NumericTF(num.map((c) => c * K), den) };
}

// Compact number for an expression: trims float fuzz, never emits "-0".
function numStr(x) {
  const v = Number(x.toPrecision(12));
  return Object.is(v, -0) ? "0" : String(v);
}

// Real factor strings for an expression: "s", "(s+100)", "(s*s+20*s+10100)".
// Uses s*s (not s**2) so the result parses regardless of power syntax. Returns
// null on an unpaired complex root.
function factorExprs(rootList) {
  const R = rootList.map(toC);
  const used = new Array(R.length).fill(false);
  const parts = [];
  for (let i = 0; i < R.length; i++) {
    if (used[i]) continue;
    const r = R[i];
    if (Math.abs(r.im) < 1e-9) {
      used[i] = true;
      if (Math.abs(r.re) < 1e-9) parts.push("s");
      else parts.push(`(s${r.re < 0 ? "+" : "-"}${numStr(Math.abs(r.re))})`);
      continue;
    }
    let j = -1;
    for (let k = i + 1; k < R.length; k++) {
      if (used[k]) continue;
      const o = R[k];
      if (Math.abs(o.re - r.re) < 1e-6 && Math.abs(o.im + r.im) < 1e-6) { j = k; break; }
    }
    if (j < 0) return null;
    used[i] = used[j] = true;
    const b = -2 * r.re, c = r.re * r.re + r.im * r.im;
    let t = "(s*s";
    if (Math.abs(b) > 1e-12) t += `${b < 0 ? "-" : "+"}${numStr(Math.abs(b))}*s`;
    t += `+${numStr(c)})`;
    parts.push(t);
  }
  return parts;
}

/**
 * A parseable G(s) expression from the placed roots and gain K — explicit `*`
 * and a fully-parenthesised denominator so parseTf() reads it unambiguously
 * (implicit multiply after `/` would otherwise mis-associate). Returns null on
 * an unpaired complex root.
 */
export function tfExprFromPZ(poles, zeros, K = 1) {
  const zf = factorExprs(zeros);
  const pf = factorExprs(poles);
  if (zf == null || pf == null) return null;
  const numAtoms = [];
  if (Math.abs(K - 1) > 1e-12 || zf.length === 0) numAtoms.push(numStr(K));
  numAtoms.push(...zf);
  const numStrFull = numAtoms.length === 1 ? numAtoms[0] : `(${numAtoms.join("*")})`;
  const denStrFull = pf.length === 0 ? "1" : pf.length === 1 ? pf[0] : `(${pf.join("*")})`;
  return `${numStrFull}/${denStrFull}`;
}
