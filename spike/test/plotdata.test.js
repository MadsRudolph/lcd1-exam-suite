// spike/test/plotdata.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTf } from "../numeric/parse.js";
import { logspace, bodeData } from "../solvers/plotdata.js";

test("logspace spans the decades inclusively", () => {
  const xs = logspace(0, 2, 3);
  assert.equal(xs.length, 3);
  assert.ok(Math.abs(xs[0] - 1) < 1e-9);
  assert.ok(Math.abs(xs[1] - 10) < 1e-9);
  assert.ok(Math.abs(xs[2] - 100) < 1e-9);
});

test("bodeData magnitude at low omega approaches the DC gain", () => {
  const tf = parseTf("10/((s+2)*(s+5))"); // DC gain = 10/10 = 1 -> 0 dB
  const { omega, magDb, phaseDeg } = bodeData(tf, { wMin: 1e-3, wMax: 1e3, n: 400 });
  assert.equal(omega.length, 400);
  assert.equal(magDb.length, 400);
  assert.equal(phaseDeg.length, 400);
  assert.ok(Math.abs(magDb[0] - 0) < 0.1, `low-omega mag ${magDb[0]} ~ 0 dB`);
});

test("bodeData phase is unwrapped (monotone for a 2-pole lag)", () => {
  const tf = parseTf("1/((s+1)*(s+10))");
  const { phaseDeg } = bodeData(tf, { wMin: 1e-2, wMax: 1e3, n: 500 });
  for (let i = 1; i < phaseDeg.length; i++) {
    assert.ok(phaseDeg[i] - phaseDeg[i - 1] < 5, "no +360 unwrap jump");
  }
  assert.ok(phaseDeg[phaseDeg.length - 1] < -170, "approaches -180 deg");
});

import { nyquistData } from "../solvers/plotdata.js";

test("nyquistData starts near the DC gain on the real axis", () => {
  const tf = parseTf("2/((s+1)*(s+2))"); // G(0) = 2/2 = 1
  const { re, im, omega } = nyquistData(tf, { wMin: 1e-3, wMax: 1e3, n: 600 });
  assert.equal(re.length, omega.length);
  assert.ok(Math.abs(re[0] - 1) < 0.05, `Re at low omega ${re[0]} ~ 1`);
  assert.ok(Math.abs(im[0]) < 0.05, `Im at low omega ${im[0]} ~ 0`);
});

test("nyquistData caps the magnitude for an integrator", () => {
  const tf = parseTf("1/(s*(s+1))"); // |G| -> infinity as omega -> 0
  const { re, im } = nyquistData(tf, { wMin: 1e-4, wMax: 1e3, n: 600, cap: 1000 });
  for (let i = 0; i < re.length; i++) {
    assert.ok(Math.hypot(re[i], im[i]) <= 1000 + 1e-6, "magnitude capped");
  }
});

import { stepData } from "../solvers/plotdata.js";

test("stepData final value equals the DC gain for a stable TF", () => {
  const tf = parseTf("5/((s+1)*(s+2))"); // DC gain = 5/2 = 2.5
  const { t, y } = stepData(tf, { tMax: 12, n: 600 });
  assert.equal(t.length, y.length);
  assert.ok(Math.abs(y[y.length - 1] - 2.5) < 0.02, `final ${y[y.length - 1]} ~ 2.5`);
});

test("stepData overshoot of a known 2nd-order matches Mp", () => {
  // zeta=0.3, wn=5 -> Mp = exp(-pi*zeta/sqrt(1-zeta^2)) ~ 0.372, final value 1
  const tf = parseTf("25/(s**2+3*s+25)");
  const { y } = stepData(tf, { tMax: 4, n: 1000 });
  const peak = Math.max(...y);
  assert.ok(Math.abs(peak - 1.372) < 0.03, `peak ${peak} ~ 1.372`);
});

test("stepData handles a pure first-order lag", () => {
  const tf = parseTf("1/(s+1)"); // y(t) = 1 - e^-t, y(1) ~ 0.632
  const { t, y } = stepData(tf, { tMax: 6, n: 600 });
  const i1 = t.findIndex((tt) => tt >= 1);
  assert.ok(Math.abs(y[i1] - 0.632) < 0.02, `y(1) ${y[i1]} ~ 0.632`);
});
