// General-TF analysis: bandwidth, dominant-pole settling, Nyquist stability,
// and characterizeTf (used by the Block Diagram -> LCD1 bridge).
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel, approxAbs } from "../lib/assert.js";
import { parseTf } from "../numeric/parse.js";
import { bandwidth, dominantSettling, analyzeStability, characterizeTf, initialValue } from "../solvers/analysis.js";

test("initial value (E25 Q17): bi-proper TF → leading-coefficient ratio 1.5", () => {
  // y(0+) = lim_{s→∞} G(s); deg(num)=deg(den)=3, leading coeffs 1.5/1
  approxRel(initialValue(parseTf("(1.5*s**3+2*s**2+3*s-1)/(s**3+2*s**2+3*s+1)")), 1.5, 1e-9, "y(0+)");
});

test("initial value: strictly-proper TF → 0", () => {
  approxAbs(initialValue(parseTf("5/(s**2+2*s+10)")), 0, 1e-12, "y(0+)");
});

test("initial value is reported by characterizeTf", () => {
  const c = characterizeTf(parseTf("(2*s+1)/(s+1)"));
  approxRel(c.initial_value, 2.0, 1e-9, "y(0+)=2");
});

test("bandwidth of 1/(s+1) is 1 rad/s", () => {
  approxRel(bandwidth(parseTf("1/(s+1)")), 1.0, 1e-3, "BW");
});

test("bandwidth of 1/(s+2) is 2 rad/s", () => {
  approxRel(bandwidth(parseTf("1/(s+2)")), 2.0, 1e-3, "BW");
});

test("dominant-pole settling of 1/((s+1)(s+10))", () => {
  const r = dominantSettling(parseTf("1/((s+1)*(s+10))"));
  approxAbs(r.dominant_pole.re, -1, 1e-6, "dominant");
  approxRel(r.t_s_2pct, 4.0, 1e-6, "t_s_2pct");
  approxRel(r.t_s_5pct, 3.0, 1e-6, "t_s_5pct");
});

test("Nyquist/closed-loop stability of RHP plant", () => {
  const G = parseTf("(s+10)/((s-1)*(s+5))"); // 1 RHP pole at +1
  const stableK = analyzeStability(G, 1.0);
  assert.equal(stableK.openLoopRhpPoles, 1);
  assert.equal(stableK.closedLoopRhpPoles, 0);
  assert.equal(stableK.stable, true);
  const unstableK = analyzeStability(G, 0.1); // below K_min=0.5
  assert.equal(unstableK.stable, false);
  assert.ok(unstableK.closedLoopRhpPoles >= 1);
});

test("characterizeTf extracts zeta/omega_n for a 2nd-order TF", () => {
  const c = characterizeTf(parseTf("1/(s**2+2*s+2)"));
  assert.equal(c.is_second_order, true);
  approxRel(c.zeta, 0.70710678, 1e-4, "zeta");
  approxRel(c.omega_n, Math.SQRT2, 1e-4, "omega_n");
  approxRel(c.metrics.Mp_pct, 4.32, 5e-2, "Mp_pct"); // zeta=0.707 -> ~4.3%
});

test("characterizeTf on a non-2nd-order TF reports poles only", () => {
  const c = characterizeTf(parseTf("1/((s+1)*(s+2)*(s+3))"));
  assert.equal(c.is_second_order, false);
  assert.equal(c.poles.length, 3);
});
