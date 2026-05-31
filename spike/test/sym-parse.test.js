import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExprToTF } from "../../symbolic/parse-expr.js";

const str = (tf) => `${tf.num.map(m => m.toString()).join(",")} | ${tf.den.map(m => m.toString()).join(",")}`;

test("number, variable, s", () => {
  assert.equal(str(parseExprToTF("2")), "2 | 1");
  assert.equal(str(parseExprToTF("a")), "a | 1");
  assert.equal(str(parseExprToTF("s")), "0,1 | 1");
});

test("K/(s+1)", () => {
  assert.equal(str(parseExprToTF("K/(s+1)")), "K | 1,1");
});

test("1/s and implicit multiplication 2s", () => {
  assert.equal(str(parseExprToTF("1/s")), "1 | 0,1");
  assert.equal(str(parseExprToTF("2s")), "0,2 | 1");
});

test("power and product (s+1)(s+2) -> s^2+3s+2", () => {
  const r = parseExprToTF("(s+1)(s+2)");
  assert.equal(r.num.map(m => m.toString()).join(","), "2,3,1");
  assert.equal(r.den.map(m => m.toString()).join(","), "1");
});

test("10/(s^2+2s)", () => {
  assert.equal(str(parseExprToTF("10/(s^2+2s)")), "10 | 0,2,1");
});

test("malformed input throws", () => {
  assert.throws(() => parseExprToTF("K/("));
});

test("unary minus", () => {
  assert.equal(str(parseExprToTF("-K")), "-K | 1");
  assert.equal(str(parseExprToTF("-2")), "-2 | 1");
  assert.equal(str(parseExprToTF("-K/(s+1)")), "-K | 1,1");
  // binary minus still works
  assert.equal(str(parseExprToTF("s-1")), "-1,1 | 1");
});

test("rejects malformed numbers and non-integer exponents", () => {
  assert.throws(() => parseExprToTF("1..2"));
  assert.throws(() => parseExprToTF("s^2.5"));
});
