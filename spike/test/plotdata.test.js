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
