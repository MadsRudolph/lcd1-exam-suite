// Interactive Bode Lab — the DOM-free maths behind placing poles/zeros on the
// s-plane. Checks the textbook break-frequency behaviour, the 0 dB at ω=1
// normalisation, integrator phase, and the readable G(s) string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxAbs } from "../lib/assert.js";
import { Complex } from "../numeric/complex.js";
import { evalPZ, bodeFromPZ, tfStringFromPZ, tfExprFromPZ, polyFromRoots, numericTfFromRoots, PRESETS } from "../solvers/bodelab.js";
import { parseTf } from "../numeric/parse.js";

test("single real pole: −3 dB and −45° at its break frequency", () => {
  // G = 1/(s+100). At ω=100: |G| = 1/(100√2), ∠G = −45°.
  const G = evalPZ([[-100, 0]], [], new Complex(0, 100));
  approxAbs(G.abs(), 1 / (100 * Math.SQRT2), 1e-9, "|G(j100)|");
  approxAbs((G.arg() * 180) / Math.PI, -45, 1e-6, "∠G(j100)");
});

test("single real pole is −3 dB below DC at the break (relative)", () => {
  const dc = evalPZ([[-100, 0]], [], new Complex(0, 0)).abs();   // 1/100
  const brk = evalPZ([[-100, 0]], [], new Complex(0, 100)).abs(); // 1/(100√2)
  approxAbs(20 * Math.log10(brk / dc), -3.0103, 1e-3, "drop at break");
});

test("a zero mirrors a pole: +45° at its break", () => {
  // G = (s+10). At ω=10: ∠ = +45°.
  const G = evalPZ([], [[-10, 0]], new Complex(0, 10));
  approxAbs((G.arg() * 180) / Math.PI, 45, 1e-6, "∠ zero");
});

test("normalisation puts 0 dB at ω=1", () => {
  // autoFreqRange for a pole at 100 spans 1e0…1e4, so omega[0] === 1.
  const d = bodeFromPZ([[-100, 0]], [], { normalize: true });
  approxAbs(d.omega[0], 1, 1e-9, "first omega");
  approxAbs(d.magDb[0], 0, 1e-9, "0 dB at ω=1");
});

test("turning normalisation off keeps the true gain", () => {
  // |G(j1)| for 1/(s+100) ≈ 1/100 → ≈ −40 dB, not 0. logspace(-1,1,3) = [0.1,1,10].
  const d = bodeFromPZ([[-100, 0]], [], { normalize: false, wMin: 0.1, wMax: 10, n: 3 });
  approxAbs(d.omega[1], 1, 1e-9, "middle omega is 1");
  approxAbs(d.magDb[1], 20 * Math.log10(1 / Math.hypot(100, 1)), 1e-9, "true |G(j1)|");
});

test("PI preset behaves like an integrator: phase −90° → 0°", () => {
  // PI = pole at origin + zero at −10  ⇒  (s+10)/s.
  const { poles, zeros } = PRESETS["PI"];
  const d = bodeFromPZ(poles, zeros, {});
  approxAbs(d.phaseDeg[0], -90, 1.0, "low-frequency phase ≈ −90°");
  approxAbs(d.phaseDeg[d.phaseDeg.length - 1], 0, 1.0, "high-frequency phase ≈ 0°");
});

test("tfStringFromPZ writes a readable Lead factor", () => {
  // Lead = pole −100, zero −10  ⇒  (s+10) / (s+100).
  assert.equal(tfStringFromPZ([{ re: -100, im: 0 }], [{ re: -10, im: 0 }]), "(s+10) / (s+100)");
});

test("tfStringFromPZ pairs conjugate roots into a real quadratic", () => {
  // Notch zeros ±100j ⇒ numerator (s²+10000).
  const { poles, zeros } = PRESETS["Notch"];
  const s = tfStringFromPZ(poles, zeros);
  assert.match(s, /\(s²\+10000\)/);
});

test("empty placement is the unit transfer function", () => {
  assert.equal(tfStringFromPZ([], []), "1 / 1");
});

test("every preset evaluates to finite Bode data", () => {
  for (const [name, { poles, zeros }] of Object.entries(PRESETS)) {
    const d = bodeFromPZ(poles, zeros, { n: 64 });
    assert.ok(d.magDb.every(Number.isFinite), `${name} magnitude finite`);
    assert.ok(d.phaseDeg.every(Number.isFinite), `${name} phase finite`);
  }
});

// ── roots → real-coefficient TF (the analysis/bridge path) ──────────────────

test("polyFromRoots: real roots multiply into a monic polynomial", () => {
  // (s+100)(s+10) = s^2 + 110s + 1000
  assert.deepEqual(polyFromRoots([{ re: -100, im: 0 }, { re: -10, im: 0 }]), [1, 110, 1000]);
});

test("polyFromRoots: a conjugate pair becomes a real quadratic", () => {
  // (s+10+100j)(s+10-100j) = s^2 + 20s + 10100
  const c = polyFromRoots([{ re: -10, im: 100 }, { re: -10, im: -100 }]);
  assert.equal(c.length, 3);
  approxAbs(c[0], 1, 1e-9); approxAbs(c[1], 20, 1e-9); approxAbs(c[2], 10100, 1e-9);
});

test("polyFromRoots: an unpaired complex root has no real polynomial", () => {
  assert.equal(polyFromRoots([{ re: -10, im: 100 }]), null);
});

test("numericTfFromRoots applies the gain to the numerator", () => {
  // K=2, zero −10, poles −100 & −10  ⇒  2(s+10) / (s^2+110s+1000)
  const r = numericTfFromRoots([{ re: -100, im: 0 }, { re: -10, im: 0 }], [{ re: -10, im: 0 }], 2);
  assert.ok(r.ok);
  assert.deepEqual(r.tf.num, [2, 20]);
  assert.deepEqual(r.tf.den, [1, 110, 1000]);
});

test("numericTfFromRoots flags an unpaired complex root", () => {
  const r = numericTfFromRoots([{ re: -10, im: 100 }], [], 1);
  assert.equal(r.ok, false);
});

test("tfExprFromPZ round-trips through parseTf with the right precedence", () => {
  // The classic trap: '(s+5)/(s+100)(s+10)' would parse as ((s+5)/(s+100))*(s+10).
  // tfExprFromPZ must fully parenthesise the denominator product.
  const expr = tfExprFromPZ([{ re: -100, im: 0 }, { re: -10, im: 0 }], [{ re: -5, im: 0 }], 2);
  const tf = parseTf(expr);
  const ref = numericTfFromRoots([{ re: -100, im: 0 }, { re: -10, im: 0 }], [{ re: -5, im: 0 }], 2).tf;
  assert.deepEqual(tf.num, ref.num);
  assert.deepEqual(tf.den, ref.den);
});

test("tfExprFromPZ round-trips a conjugate-pair (quadratic) system", () => {
  const { poles, zeros } = PRESETS["Notch"];
  const expr = tfExprFromPZ(poles, zeros, 1);
  const tf = parseTf(expr);
  const ref = numericTfFromRoots(poles, zeros, 1).tf;
  // compare up to a common scale (both should already be monic-num here)
  assert.deepEqual(tf.den.map((c) => Number(c.toPrecision(8))), ref.den.map((c) => Number(c.toPrecision(8))));
  assert.deepEqual(tf.num.map((c) => Number(c.toPrecision(8))), ref.num.map((c) => Number(c.toPrecision(8))));
});

test("tfExprFromPZ returns null for an unpaired complex root", () => {
  assert.equal(tfExprFromPZ([{ re: -10, im: 100 }], [], 1), null);
});

test("a placed integrator+lead (PI) gives ω_c via the real TF path", () => {
  // PI = (s+10)/s with K=1; this is exactly what the lab feeds the solver.
  const r = numericTfFromRoots(PRESETS["PI"].poles, PRESETS["PI"].zeros, 1);
  assert.ok(r.ok);
  assert.deepEqual(r.tf.num, [1, 10]);
  assert.deepEqual(r.tf.den, [1, 0]);
});
