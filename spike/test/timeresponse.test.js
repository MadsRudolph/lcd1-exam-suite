// Inverse-Laplace time response via partial-fraction residues (distinct poles).
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxAbs } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";
import { timeResponse, stepResponse } from "../solvers/timeresponse.js";

function residueAt(terms, re, im = 0) {
  const t = terms.find((x) => Math.abs(x.pole.re - re) < 1e-6 && Math.abs(x.pole.im - im) < 1e-6);
  assert.ok(t, `no term at pole ${re}+${im}j`);
  return t.residue;
}

// Y(s) = 1/(s(s+2))  ->  y(t) = 0.5 - 0.5 e^{-2t},  final value 0.5
test("step-type response 1/(s(s+2))", () => {
  const r = timeResponse(parseTf("1/(s*(s+2))"));
  approxAbs(residueAt(r.terms, 0).re, 0.5, 1e-6, "res@0");
  approxAbs(residueAt(r.terms, -2).re, -0.5, 1e-6, "res@-2");
  approxAbs(r.finalValue, 0.5, 1e-6, "final");
});

// step response of G=1/(s+2): same as above
test("stepResponse of 1/(s+2) has final value 0.5", () => {
  const r = stepResponse(parseTf("1/(s+2)"));
  approxAbs(r.finalValue, 0.5, 1e-6, "final");
});

// Response of G=1/(s+1) to u=2e^{-3t}: Y=2/((s+1)(s+3)) -> e^{-t}-e^{-3t}, final 0
test("decaying input response 2/((s+1)(s+3))", () => {
  const r = timeResponse(parseTf("2/((s+1)*(s+3))"));
  approxAbs(residueAt(r.terms, -1).re, 1.0, 1e-6, "res@-1");
  approxAbs(residueAt(r.terms, -3).re, -1.0, 1e-6, "res@-3");
  approxAbs(r.finalValue, 0.0, 1e-6, "final");
});

test("repeated poles are reported as a limitation, not a crash", () => {
  assert.throws(() => timeResponse(parseTf("1/(s+1)**2")), /repeated|distinct/i);
});
