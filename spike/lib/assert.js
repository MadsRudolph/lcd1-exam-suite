// Parity assertion helpers mirroring pytest.approx semantics used by the LCD1 oracle.
import assert from "node:assert/strict";

/** assert |actual - expected| <= rel*|expected| (pytest.approx rel=...) */
export function approxRel(actual, expected, rel, msg = "") {
  const tol = Math.abs(rel * expected);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} expected ${actual} ≈ ${expected} (rel ${rel}, tol ${tol})`,
  );
}

/** assert |actual - expected| <= abs (pytest.approx abs=...) */
export function approxAbs(actual, expected, abs, msg = "") {
  assert.ok(
    Math.abs(actual - expected) <= abs,
    `${msg} expected ${actual} ≈ ${expected} (abs ${abs})`,
  );
}
