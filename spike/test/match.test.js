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
