// spike/solvers/plotdata.js
// Pure compute layer for the plotting feature. In: a NumericTF. Out: plain
// data objects. No DOM, no rendering — fully unit-testable.
import { Complex } from "../numeric/complex.js";

/** n points geometrically spaced from 10^a to 10^b (inclusive). */
export function logspace(a, b, n) {
  if (n < 2) return [10 ** a];
  const out = [];
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out.push(10 ** (a + i * step));
  return out;
}

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
  const n = opts.n || 600;
  const omega = logspace(a, b, n);
  const magDb = [];
  const phaseRaw = [];
  for (const w of omega) {
    const G = tf.evalAt(new Complex(0, w));
    magDb.push(20 * Math.log10(G.abs()));
    phaseRaw.push(G.arg());
  }
  const phaseDeg = unwrap(phaseRaw).map((p) => (p * 180) / Math.PI);
  return { omega, magDb, phaseDeg };
}
