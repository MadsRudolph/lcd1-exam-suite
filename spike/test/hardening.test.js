// Adversarial-input hardening: the parser/solvers must fail fast and cleanly,
// never hang or produce silent garbage, on malicious or malformed input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTf } from "../numeric/parse.js";
import { solveStateSpaceToTf } from "../solvers/p1.js";

test("huge exponent is rejected, not expanded (DoS guard)", () => {
  const t = Date.now();
  assert.throws(() => parseTf("(s+1)**100000000"), /degree/i);
  assert.ok(Date.now() - t < 1000, "must fail fast, not hang");
});

test("huge product degree is rejected", () => {
  assert.throws(() => parseTf("(s**500)*(s**600)"), /degree/i);
});

test("zero denominator is rejected", () => {
  assert.throws(() => parseTf("1/(s-s)"), /denominator/i);
});

test("deeply nested parens fail cleanly (no uncatchable overflow)", () => {
  const n = 5000;
  assert.throws(() => parseTf("(".repeat(n) + "s" + ")".repeat(n)));
});

test("oversized state-space matrix is rejected", () => {
  const n = 200;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? -1 : 0)));
  const B = Array.from({ length: n }, () => [1]);
  const C = [Array.from({ length: n }, () => 1)];
  assert.throws(() => solveStateSpaceToTf(A, B, C, [[0]]), /too large|dimension/i);
});

test("normal transfer functions still parse", () => {
  assert.doesNotThrow(() => parseTf("900/((0.25*s+1)*(s**2+50*s+3000))"));
  assert.doesNotThrow(() => parseTf("(s+1)**6"));
});
