// P2 — Bode read-off composition. JS port of lcd1-solver/lcd_solver/solvers/p2_bode.py.
// Matplotlib figure output is intentionally omitted (CLI/UI renders separately).
import { polyMul } from "../numeric/poly.js";
import { NumericTF } from "../numeric/tf.js";

function factorKind(deltaSlope, phaseDelta) {
  const pz = deltaSlope < 0 ? "pole" : "zero";
  const side =
    pz === "pole"
      ? phaseDelta < 0
        ? "LHP"
        : "RHP"
      : phaseDelta > 0
        ? "LHP"
        : "RHP";
  return { pz, side };
}

const key = (w) => Math.round(w * 1e9) / 1e9;

/**
 * Build a candidate G(s) from a Bode read-off.
 * Returns { poles, zeros, gain, dc_gain_linear, tf } where poles/zeros are real
 * pole/zero locations and tf is a NumericTF.
 */
export function composeTfFromBode({ dc_gain_dB, corners, phase_events } = {}) {
  const phaseAt = new Map();
  for (const [w, dphi] of phase_events) {
    phaseAt.set(key(w), (phaseAt.get(key(w)) || 0) + dphi);
  }

  const grouped = new Map();
  for (const [w, ds] of corners) {
    grouped.set(key(w), (grouped.get(key(w)) || 0) + ds);
  }

  const poles = [];
  const zeros = [];
  for (const [w, totalSlope] of grouped) {
    const nUnits = Math.floor(Math.abs(totalSlope) / 20);
    if (nUnits === 0) continue;
    const phaseDelta = phaseAt.has(w)
      ? phaseAt.get(w)
      : -90 * nUnits * (totalSlope < 0 ? 1 : -1);
    const { pz, side } = factorKind(totalSlope / nUnits, phaseDelta / nUnits);
    const loc = side === "RHP" ? +w : -w;
    const target = pz === "pole" ? poles : zeros;
    for (let i = 0; i < nUnits; i++) target.push(loc);
  }

  // num = prod(s - z), den = prod(s - p)
  let num = [1];
  for (const z of zeros) num = polyMul(num, [1, -z]);
  let den = [1];
  for (const p of poles) den = polyMul(den, [1, -p]);

  // Static gain so |G(0)| matches dc_gain_dB.
  const dcTarget = 10 ** (dc_gain_dB / 20);
  const numAt0 = num[num.length - 1];
  const denAt0 = den[den.length - 1];
  const dcNow = Math.abs(numAt0 / denAt0);
  const gain = dcNow === 0 || !Number.isFinite(dcNow) ? dcTarget : dcTarget / dcNow;

  const numScaled = num.map((c) => c * gain);
  const tf = new NumericTF(numScaled, den);
  return {
    poles,
    zeros,
    gain,
    dc_gain_linear: numScaled[numScaled.length - 1] / denAt0,
    tf,
  };
}
