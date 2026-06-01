// Parity port of lcd1-solver/tests/test_match.py + apply_stable_range_match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel } from "../lib/assert.js";
import { matchOptions, applyStableRangeMatch } from "../match.js";

test("number match picks closest", () => {
  const o = matchOptions({ value: 2.0, kind: "NUMBER" }, "5\n2.0\n0.4\n0.555");
  assert.deepEqual(o.map((x) => x.flag), ["no_match", "match", "no_match", "no_match"]);
});

test("number match accepts dB suffix", () => {
  const o = matchOptions({ value: 0.4, kind: "NUMBER" }, "-7.9588 dB\n0.5\n2.0");
  assert.equal(o[0].flag, "match");
  approxRel(o[0].parsed, 0.4, 1e-3, "parsed");
});

test("number match flags closest within set", () => {
  const o = matchOptions({ value: 1.57, kind: "NUMBER" }, "1.55\n1.57\n1.60\n2.0");
  assert.equal(o[1].flag, "match");
  assert.equal(o[0].flag, "no_match");
});

test("dict match uses selected key", () => {
  const o = matchOptions({ value: { K_P: 2.0, omega_c: 25.0 }, kind: "DICT" }, "1.0\n2.0\n3.0", "K_P");
  assert.equal(o[1].flag, "match");
});

test("unparseable option is flagged", () => {
  const o = matchOptions({ value: 2.0, kind: "NUMBER" }, "2.0\ngibberish");
  assert.equal(o[0].flag, "match");
  assert.equal(o[1].flag, "unparseable");
});

test("far-off computed value crowns NO match (avoids false confidence)", () => {
  // Q19 case: computed 1.20 vs options {3.4154, 10.67, 36, 0.293, -10.67}.
  // Nearest is 0.293 but ~75% off -> must NOT be flagged "match".
  const o = matchOptions({ value: 1.2004, kind: "NUMBER" }, "3.4154\n10.67\n36\n0.293\n-10.67");
  assert.ok(!o.some((x) => x.flag === "match"), "nothing should be crowned a match");
});

test("stable-range flags in-range option (90, inf)", () => {
  const opts = ["100", "0.02", "-0.0111"].map((t) => ({ raw_text: t, flag: "no_match" }));
  applyStableRangeMatch("solve_stable_K_range", [90.0, Infinity], opts);
  assert.deepEqual(opts.map((o) => o.flag), ["match", "no_match", "no_match"]);
});

test("stable-range bounded interval (0, 43)", () => {
  const opts = ["25", "45", "-1"].map((t) => ({ raw_text: t, flag: "no_match" }));
  applyStableRangeMatch("solve_stable_K_range", [0.0, 43.0], opts);
  assert.deepEqual(opts.map((o) => o.flag), ["match", "no_match", "no_match"]);
});

// --- tolerant parsing of options as actually written on exams ---------------

test("number match strips enumerators and quantity labels", () => {
  // F22 Q6 / S21 Q6 style: "n. K = value".
  const o = matchOptions({ value: 8.4, kind: "NUMBER" }, "1. K = 0.1\n2. K = 8.4\n3. K = 77.5");
  assert.deepEqual(o.map((x) => x.flag), ["no_match", "match", "no_match"]);
});

test("number match strips letter enumerators and is unit-tolerant", () => {
  // F22 Q17 style "e) 0.5"; and overshoot "4.3 %".
  const a = matchOptions({ value: 0.5073, kind: "NUMBER" }, "a) 0.032\nb) 2\nd) 1.13\ne) 0.5");
  assert.equal(a[3].flag, "match");
  const b = matchOptions({ value: 4.32, kind: "NUMBER" }, "1. 4.3 %\n2. 12.0 %\n3. 5.1 %");
  assert.equal(b[0].flag, "match");
});

test("decimal answers are never eaten as enumerators", () => {
  // "0.4" must parse as 0.4, not "0." + "4".
  const o = matchOptions({ value: 0.4, kind: "NUMBER" }, "0.4\n0.8");
  assert.equal(o[0].parsed, 0.4);
  assert.equal(o[0].flag, "match");
});

test("dict match tolerates enumerated/labelled options", () => {
  const o = matchOptions({ value: { K_P: 2.0, omega_c: 25.0 }, kind: "DICT" }, "a. K_P = 1.0\nb. K_P = 2.0\nc. K_P = 3.0", "K_P");
  assert.equal(o[1].flag, "match");
});

test("stable-range matches a range-shaped option (0 < K < 8)", () => {
  const opts = ["1. K >= 8", "2. -1 < K < 6", "3. 0 < K < 8", "4. K > -10"]
    .map((t) => ({ raw_text: t, flag: "no_match" }));
  applyStableRangeMatch("solve_stable_K_range", [0.0, 8.0], opts);
  assert.deepEqual(opts.map((o) => o.flag), ["no_match", "no_match", "match", "no_match"]);
});

test("stable-range range option distinguishes near distractors (0<K<90 vs 0<K<98)", () => {
  const opts = ["0<K<90", "0<K<14", "0<K<98", "K>0"]
    .map((t) => ({ raw_text: t, flag: "no_match" }));
  applyStableRangeMatch("solve_stable_K_range", [0.0, 90.0], opts);
  assert.deepEqual(opts.map((o) => o.flag), ["match", "no_match", "no_match", "no_match"]);
});

test("stable-range still matches a single in-range candidate (K_P = 50)", () => {
  const opts = ["a) K_P = 50", "b) 0.0222 < K_P < 1", "c) K_P = 0.0222"]
    .map((t) => ({ raw_text: t, flag: "no_match" }));
  applyStableRangeMatch("solve_stable_K_range", [45.0, Infinity], opts);
  assert.equal(opts[0].flag, "match");
  assert.equal(opts[1].flag, "no_match");
});
