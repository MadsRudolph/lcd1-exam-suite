// spike/solvers/plotdata.js
// Pure compute layer for the plotting feature. In: a NumericTF. Out: plain
// data objects. No DOM, no rendering — fully unit-testable.
import { Complex } from "../numeric/complex.js";
import { logspace } from "../numeric/margins.js";

export { logspace };

/** Default decade range: two decades either side of the pole/zero magnitudes. */
function autoFreqRange(tf) {
  const mags = [...tf.poles(), ...tf.zeros()].map((c) => c.abs()).filter((m) => m > 1e-9);
  if (!mags.length) return [-2, 3];
  return [Math.log10(Math.min(...mags)) - 2, Math.log10(Math.max(...mags)) + 2];
}

/** Continuous phase (radians) — removes the +/-2pi jumps atan2 introduces. */
function unwrap(phase) {
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

export function bodeData(tf, opts = {}) {
  const [a, b] = opts.wMin != null && opts.wMax != null
    ? [Math.log10(opts.wMin), Math.log10(opts.wMax)]
    : autoFreqRange(tf);
  const n = opts.n != null ? opts.n : 600;
  const omega = logspace(a, b, n);
  const magDb = [];
  const phaseRaw = [];
  for (const w of omega) {
    const G = tf.evalAt(new Complex(0, w));
    const mag = G.abs();
    magDb.push(mag > 1e-12 ? 20 * Math.log10(mag) : -240); // floor instead of -Infinity at a jw-axis zero
    phaseRaw.push(G.arg());
  }
  const phaseDeg = unwrap(phaseRaw).map((p) => (p * 180) / Math.PI);
  return { omega, magDb, phaseDeg };
}

export function nyquistData(tf, opts = {}) {
  const [a, b] = opts.wMin != null && opts.wMax != null
    ? [Math.log10(opts.wMin), Math.log10(opts.wMax)]
    : autoFreqRange(tf);
  const n = opts.n || 800;
  const cap = opts.cap || 1e3;
  const omega = logspace(a, b, n);
  const re = [];
  const im = [];
  for (const w of omega) {
    const G = tf.evalAt(new Complex(0, w));
    let x = G.re;
    let y = G.im;
    const m = Math.hypot(x, y);
    if (m > cap) { x = (x / m) * cap; y = (y / m) * cap; } // keep integrators on-screen
    re.push(x);
    im.push(y);
  }
  return { re, im, omega };
}
