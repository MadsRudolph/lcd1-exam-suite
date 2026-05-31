// spike/solvers/plotdata.js
// Pure compute layer for the plotting feature. In: a NumericTF. Out: plain
// data objects. No DOM, no rendering — fully unit-testable.
import { Complex } from "../numeric/complex.js";
import { logspace, solveMargins } from "../numeric/margins.js";
import { dominantSettling, bandwidth, analyzeStability, characterizeTf } from "./analysis.js";

const tryOr = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

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
  const n = opts.n != null ? opts.n : 800;
  const cap = opts.cap != null ? opts.cap : 1e3;
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

function linspace(a, b, n) {
  const out = [];
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out.push(a + i * step);
  return out;
}

export function stepData(tf, opts = {}) {
  const d0 = tf.den[0];
  const a = tf.den.map((c) => c / d0);            // monic den: [1, a1, ..., an]
  const num = tf.num.map((c) => c / d0);
  const order = a.length - 1;

  const n = opts.n != null ? opts.n : 600;
  let tMax = opts.tMax;
  if (tMax == null) {
    try { tMax = dominantSettling(tf).t_s_2pct * 1.3; } catch { tMax = 10; }
    tMax = Math.min(Math.max(tMax, 0.5), 200);
  }
  const t = linspace(0, tMax, n);

  if (order === 0) {                              // pure gain
    const g = num[num.length - 1] || 0;
    return { t, y: t.map(() => g) };
  }

  const b = new Array(order + 1).fill(0);         // num padded to [b0, b1, ..., bn]
  for (let i = 0; i < num.length; i++) b[order - (num.length - 1) + i] = num[i];
  const D = b[0];                                 // direct feedthrough (0 if strictly proper)
  const beta = [];                                // beta_k = b_k - D*a_k, k=1..order
  for (let k = 1; k <= order; k++) beta[k] = b[k] - D * a[k];

  const deriv = (x, u) => {                        // controllable canonical form
    const dx = new Array(order);
    for (let i = 0; i < order - 1; i++) dx[i] = x[i + 1];
    let s = 0;
    for (let k = 1; k <= order; k++) s += a[k] * x[order - k];
    dx[order - 1] = -s + u;
    return dx;
  };
  const output = (x, u) => {
    let yk = D * u;
    for (let k = 1; k <= order; k++) yk += beta[k] * x[order - k];
    return yk;
  };

  let x = new Array(order).fill(0);
  const dt = tMax / (n - 1);
  const u = 1;                                    // unit step
  const y = [output(x, u)];
  for (let i = 1; i < n; i++) {
    const k1 = deriv(x, u);
    const k2 = deriv(x.map((xi, j) => xi + (dt / 2) * k1[j]), u);
    const k3 = deriv(x.map((xi, j) => xi + (dt / 2) * k2[j]), u);
    const k4 = deriv(x.map((xi, j) => xi + dt * k3[j]), u);
    x = x.map((xi, j) => xi + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    let yk = output(x, u);
    if (!Number.isFinite(yk)) yk = y[i - 1]; // guard against blow-up overflow
    y.push(yk);
  }
  return { t, y };
}

export function poleZeroData(tf) {
  const map = (c) => ({ re: c.re, im: c.im });
  return { poles: tf.poles().map(map), zeros: tf.zeros().map(map) };
}

/**
 * Marker/readout values for the three plots, reusing the existing solvers.
 * Every field may be null when not applicable; the renderer omits missing markers.
 */
export function plotAnnotations(tf) {
  const margins = tryOr(() => solveMargins(tf));
  const bw = tryOr(() => bandwidth(tf));
  const stab = tryOr(() => analyzeStability(tf, 1));
  const ch = tryOr(() => characterizeTf(tf));

  const bode = margins ? {
    GM_dB: Number.isFinite(margins.GM) ? 20 * Math.log10(margins.GM) : Infinity,
    PM_deg: Number.isFinite(margins.PM_deg) ? margins.PM_deg : null,
    omega_pc: Number.isFinite(margins.omega_pc) ? margins.omega_pc : null,
    omega_gc: Number.isFinite(margins.omega_gc) ? margins.omega_gc : null,
    omega_BW: bw,
  } : { omega_BW: bw };

  const nyquist = stab ? {
    stable: stab.stable,
    closedLoopRhpPoles: stab.closedLoopRhpPoles,
    encirclements: stab.encirclements,
  } : null;

  let step = null;
  if (ch) {
    const m = ch.metrics;
    step = {
      finalValue: Number.isFinite(ch.dc_gain) ? ch.dc_gain : null,
      overshootPct: m ? m.Mp * 100 : null,
      peakTime: m ? m.t_p : null,
      settling2pct: m ? m.t_s_2pct : null,
    };
  }
  return { bode, nyquist, step };
}
