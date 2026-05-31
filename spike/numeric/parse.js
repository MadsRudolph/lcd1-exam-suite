// parse_tf: parse a rational expression in `s` into a NumericTF.
// Mirrors lcd_solver/tf_input.parse_tf (sympy parse + cancel + fraction).
// Grammar (explicit operators only, like sympy's default — no implicit multiply):
//   expr  := term (('+'|'-') term)*
//   term  := unary (('*'|'/') unary)*
//   unary := ('+'|'-') unary | power
//   power := atom ('**' unary)?      (exponent must be an integer constant)
//   atom  := number | 's' | '(' expr ')'
import { NumericTF } from "./tf.js";
import { polyAdd, polySub, polyMul, polyPow, polyTrim } from "./poly.js";

// ---- Rational = { num: Poly, den: Poly } (highest-degree-first) ----
const R = (num, den = [1]) => ({ num, den });
const CONST = (k) => R([k], [1]);
const S = R([1, 0], [1]);

const rAdd = (a, b) => R(polyAdd(polyMul(a.num, b.den), polyMul(b.num, a.den)), polyMul(a.den, b.den));
const rSub = (a, b) => R(polySub(polyMul(a.num, b.den), polyMul(b.num, a.den)), polyMul(a.den, b.den));
const rMul = (a, b) => R(polyMul(a.num, b.num), polyMul(a.den, b.den));
const rDiv = (a, b) => R(polyMul(a.num, b.den), polyMul(a.den, b.num));

function rPow(a, n) {
  if (n < 0) return rPow(R(a.den, a.num), -n);
  return R(polyPow(a.num, n), polyPow(a.den, n));
}

function isConst(r) {
  return r.num.length === 1 && r.den.length === 1;
}
function constValue(r) {
  return r.num[0] / r.den[0];
}

// ---- tokenizer ----
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "*" && src[i + 1] === "*") {
      toks.push({ t: "**" });
      i += 2;
      continue;
    }
    if (ch === "^") {
      // accept caret as exponent too (common in pasted exam text)
      toks.push({ t: "**" });
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      toks.push({ t: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        // allow a sign only as part of an exponent (e.g. 1e-3)
        if ((src[j] === "e" || src[j] === "E") && (src[j + 1] === "+" || src[j + 1] === "-")) j++;
        j++;
      }
      toks.push({ t: "num", v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      const name = src.slice(i, j);
      if (name !== "s") {
        throw new Error(`'${src}' contains unknown symbol '${name}'; only 's' is allowed.`);
      }
      toks.push({ t: "s" });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' in '${src}'`);
  }
  toks.push({ t: "eof" });
  return toks;
}

// ---- recursive-descent parser ----
function makeParser(toks) {
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (t) => {
    if (peek().t !== t) throw new Error(`Expected '${t}' but got '${peek().t}'`);
    return next();
  };

  function parseExpr() {
    let node = parseTerm();
    while (peek().t === "+" || peek().t === "-") {
      const op = next().t;
      const rhs = parseTerm();
      node = op === "+" ? rAdd(node, rhs) : rSub(node, rhs);
    }
    return node;
  }

  // Tokens that begin a new atom — used to detect implicit multiplication
  // (e.g. "0.7(s+0.5)", "5s", "s(s+3)") the way sympy's
  // implicit_multiplication_application transform does.
  const startsAtom = (t) => t === "num" || t === "s" || t === "(";

  function parseTerm() {
    let node = parseUnary();
    for (;;) {
      const t = peek().t;
      if (t === "*" || t === "/") {
        next();
        const rhs = parseUnary();
        node = t === "*" ? rMul(node, rhs) : rDiv(node, rhs);
      } else if (startsAtom(t)) {
        // implicit multiplication: two adjacent factors with no operator
        const rhs = parsePower();
        node = rMul(node, rhs);
      } else break;
    }
    return node;
  }

  function parseUnary() {
    if (peek().t === "+") {
      next();
      return parseUnary();
    }
    if (peek().t === "-") {
      next();
      return rMul(CONST(-1), parseUnary());
    }
    return parsePower();
  }

  function parsePower() {
    const base = parseAtom();
    if (peek().t === "**") {
      next();
      const exp = parseUnary();
      if (!isConst(exp)) throw new Error("Exponent must be a constant");
      const k = constValue(exp);
      if (!Number.isInteger(k)) throw new Error(`Exponent must be an integer, got ${k}`);
      return rPow(base, k);
    }
    return base;
  }

  function parseAtom() {
    const tk = peek();
    if (tk.t === "num") {
      next();
      return CONST(tk.v);
    }
    if (tk.t === "s") {
      next();
      return S;
    }
    if (tk.t === "(") {
      next();
      const inner = parseExpr();
      expect(")");
      return inner;
    }
    throw new Error(`Unexpected token '${tk.t}'`);
  }

  const result = parseExpr();
  expect("eof");
  return result;
}

export function parseTf(expr) {
  const rational = makeParser(tokenize(expr));
  const num = polyTrim(rational.num);
  const den = polyTrim(rational.den);
  return new NumericTF(num, den);
}
