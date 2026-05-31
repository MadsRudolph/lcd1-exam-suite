// Bode/Nyquist margin primitives on a NumericTF, replacing python-control's
// margin()/evalfr() for the LCD1 stability + design solvers.
import { Complex } from "./complex.js";

function logspace(a, b, n) {
  const out = new Array(n);
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = 10 ** (a + i * step);
  return out;
}

const Gjw = (tf, w) => tf.evalAt(new Complex(0, w));

/** Refine a bracketed root of f(w)=0 by bisection. */
function bisect(f, lo, hi, iters = 100) {
  let flo = f(lo);
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    const fmid = f(mid);
    if (fmid === 0 || hi - lo < 1e-15 * mid) return mid;
    if ((flo < 0) === (fmid < 0)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Negative-real-axis crossings of the Nyquist plot G(jw), ascending |x|.
 * Mirrors p3_stability._nyquist_neg_real_crossings: includes the DC value G(0)
 * when it is real-negative (the omega->0 crossing an unstable plant relies on).
 */
export function negRealCrossings(tf, omegas = logspace(-3, 5, 4000)) {
  const xs = [];
  const dc = tf.dcGain();
  if (Number.isFinite(dc) && dc < 0) xs.push(dc);

  let prev = Gjw(tf, omegas[0]);
  for (let i = 1; i < omegas.length; i++) {
    const cur = Gjw(tf, omegas[i]);
    if (prev.im === 0 || prev.im * cur.im < 0) {
      const wcross = bisect((w) => Gjw(tf, w).im, omegas[i - 1], omegas[i]);
      const re = Gjw(tf, wcross).re;
      if (re < 0) xs.push(re);
    }
    prev = cur;
  }
  return xs.sort((a, b) => Math.abs(a) - Math.abs(b));
}

/** Gain margin = 1/|x_binding| at the phase crossover (negative-real crossing). */
function gainMargin(tf, omegas = logspace(-3, 5, 4000)) {
  // Skip the DC entry: GM uses finite-frequency phase crossovers.
  const dc = tf.dcGain();
  const crossings = negRealCrossings(tf, omegas).filter(
    (x) => !(Number.isFinite(dc) && dc < 0 && x === dc),
  );
  if (!crossings.length) return { GM: Infinity, omega_pc: NaN };
  // Binding crossover = largest |x| (smallest GM).
  const x = crossings.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  return { GM: 1 / Math.abs(x) };
}

/** Phase crossover frequency: smallest w where Im G(jw)=0 with Re<0. */
function phaseCrossoverFreq(tf, omegas = logspace(-3, 5, 4000)) {
  let prev = Gjw(tf, omegas[0]);
  for (let i = 1; i < omegas.length; i++) {
    const cur = Gjw(tf, omegas[i]);
    if (prev.im === 0 || prev.im * cur.im < 0) {
      const w = bisect((x) => Gjw(tf, x).im, omegas[i - 1], omegas[i]);
      if (Gjw(tf, w).re < 0) return w;
    }
    prev = cur;
  }
  return NaN;
}

/** Gain crossover frequency: smallest w where |G(jw)|=1. */
function gainCrossoverFreq(tf, omegas = logspace(-3, 5, 4000)) {
  let prev = Gjw(tf, omegas[0]).abs() - 1;
  for (let i = 1; i < omegas.length; i++) {
    const cur = Gjw(tf, omegas[i]).abs() - 1;
    if (prev === 0 || prev * cur < 0) {
      return bisect((x) => Gjw(tf, x).abs() - 1, omegas[i - 1], omegas[i]);
    }
    prev = cur;
  }
  return NaN;
}

export function solveMargins(tf) {
  const omegas = logspace(-3, 5, 4000);
  const { GM } = gainMargin(tf, omegas);
  const omega_pc = phaseCrossoverFreq(tf, omegas);
  const omega_gc = gainCrossoverFreq(tf, omegas);

  let PM_deg = Infinity;
  if (Number.isFinite(omega_gc)) {
    const phase = (Gjw(tf, omega_gc).arg() * 180) / Math.PI;
    PM_deg = 180 + phase;
  }
  return {
    GM,
    GM_dB: GM > 0 && Number.isFinite(GM) ? 20 * Math.log10(GM) : -Infinity,
    PM_deg,
    omega_pc,
    omega_gc,
  };
}

export { logspace, Gjw, bisect };
