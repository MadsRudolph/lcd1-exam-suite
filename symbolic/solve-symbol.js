// Solve a single-unknown equation for one symbol (§2.6). Handles the static
// (s-free) rational equations the exams pose — a/(1+a)=2/3, 1/(1+0.4·K1)=0.4 —
// by moving everything to one side, clearing denominators, and solving the
// resulting polynomial in the unknown. Linear and quadratic unknowns are solved
// in closed form; the result is exact (a RatFunc for linear, a list for quadratic).
import { parseExprToTF } from "./parse-expr.js";
import { MPoly } from "./mpoly.js";
import { RatFunc } from "./ratfunc.js";
import { Rational } from "./rational.js";

// Parse "lhs = rhs" (or a single expression assumed = 0) into a SymTF residual.
function residual(equation) {
  const sides = String(equation).split("=");
  if (sides.length > 2) throw new Error(`solveForSymbol: more than one '=' in '${equation}'`);
  const lhs = parseExprToTF(sides[0]);
  const rhs = sides.length === 2 ? parseExprToTF(sides[1]) : null;
  return rhs ? lhs.sub(rhs) : lhs;
}

// Solve `equation` for `symbol`. Returns { exact, value } where value is a RatFunc
// (linear) or an array of RatFuncs (quadratic), and exact is a decimal string for
// quick display. Throws if the equation depends on s or the unknown degree > 2.
export function solveForSymbol(equation, symbol) {
  const E = residual(equation).simplify();
  if (E.num.length > 1) throw new Error("solveForSymbol: equation depends on s (dynamic), not supported");
  const Nm = E.num[0]; // multivariate polynomial that must vanish

  const coeffs = Nm.toUnivariate(symbol); // index = power of `symbol`, entries MPoly in the rest
  const deg = coeffs.length - 1;

  if (deg <= 0) throw new Error(`solveForSymbol: '${symbol}' does not appear in the equation`);

  if (deg === 1) {
    const A = coeffs[1], B = coeffs[0]; // A·x + B = 0  →  x = −B/A
    const value = new RatFunc(B.neg(), A);
    return { value, exact: ratFuncDecimal(value) };
  }

  if (deg === 2) {
    // Only solved when fully numeric (all other symbols absent): a·x²+b·x+c=0.
    const [c, b, a] = coeffs;
    if (!a.isConstant() || !b.isConstant() || !c.isConstant())
      throw new Error("solveForSymbol: quadratic with remaining symbols not supported");
    const av = a.constantValue(), bv = b.constantValue(), cv = c.constantValue();
    const disc = bv.mul(bv).sub(Rational.of(4).mul(av).mul(cv));
    const d = Number(disc.num) / Number(disc.den);
    if (d < 0) return { value: [], exact: "no real solution" };
    const sq = Math.sqrt(d);
    const A2 = Number(av.num) / Number(av.den), B2 = Number(bv.num) / Number(bv.den);
    const roots = [(-B2 + sq) / (2 * A2), (-B2 - sq) / (2 * A2)];
    return { value: roots, exact: roots.map((r) => String(Number(r.toPrecision(6)))).join(", ") };
  }

  throw new Error(`solveForSymbol: degree ${deg} in '${symbol}' not supported`);
}

// Decimal of a constant RatFunc, else its symbolic string.
function ratFuncDecimal(rf) {
  if (rf.num.isConstant() && rf.den.isConstant()) {
    const n = rf.num.constantValue(), d = rf.den.constantValue();
    const x = Number(n.num) * Number(d.den) / (Number(n.den) * Number(d.num));
    return String(Number(x.toPrecision(6)));
  }
  return `${rf.num.toString()}${rf.den.equals(MPoly.ONE) ? "" : ` / (${rf.den.toString()})`}`;
}
