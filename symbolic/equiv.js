// Symbolic transfer-function equivalence. Decides whether candidate answers are
// algebraically equal to a reference expression, using the exact CAS: two TFs are
// equal iff (reference − candidate) simplifies to exactly zero. This catches
// answers written in a different-but-equal form (expanded, reordered, or scaled
// by a constant) that a coefficient-by-coefficient comparison would miss.
import { parseExprToTF } from "./parse-expr.js";
import { renderSymTF } from "./render.js";

// Accept the wider syntax people actually type. The numeric solver and the
// block-diagram echo use '**' for powers; the CAS parser wants '^'. '·' (middle
// dot) shows up when pasting rendered output. Both rewrites are no-ops on the
// CAS's own '^'/'*' output, so normalizing is always safe.
function normalizeExpr(src) {
  return String(src).replace(/\*\*/g, "^").replace(/·/g, "*");
}

// Reduce a raw multiple-choice line to the bare expression: drop a leading option
// label ("a)", "(b)", "c.") and, if the line names the result ("T(s) = …"), keep
// only the right-hand side.
export function stripOptionLabel(line) {
  let t = String(line).trim();
  t = t.replace(/^\(?\s*[A-Za-z]\s*[).]\s*/, "");
  const eq = t.lastIndexOf("=");
  if (eq !== -1) t = t.slice(eq + 1);
  return t.trim();
}

function parseExpr(src) {
  return parseExprToTF(normalizeExpr(src));
}

// Test each option line for algebraic equality with refExpr.
// Returns:
//   { ok:false, error }                          — reference itself won't parse
//   { ok:true, canonicalFormula, canonicalLatex,
//     options: [{ raw_text, flag, note }] }       — flag ∈ match | no_match | unparseable
export function symbolicEquivTest(refExpr, optionLines) {
  let ref;
  try {
    ref = parseExpr(refExpr);
  } catch (e) {
    return { ok: false, error: `Could not read the reference expression: ${e.message}` };
  }

  const simplified = ref.simplify();
  const rendered = renderSymTF(simplified);

  const lines = Array.isArray(optionLines)
    ? optionLines
    : String(optionLines).split(/\r?\n/);

  const options = [];
  for (const rawLine of lines) {
    const raw_text = String(rawLine).trim();
    if (!raw_text) continue;
    const expr = stripOptionLabel(raw_text);
    let cand;
    try {
      cand = parseExpr(expr);
    } catch {
      options.push({ raw_text, flag: "unparseable", note: "" });
      continue;
    }
    // Equality is a zero-polynomial test on the cross-multiplied numerator
    // (n1·d2 − n2·d1 ≡ 0), NOT a canonical reduction. This deliberately avoids
    // SymTF.simplify()'s multivariate GCD, which can blow up on the *non-zero*
    // difference of two different 5–7-symbol rational functions (the reference
    // vs. a wrong option) and would freeze the synchronous app. The canonical
    // form shown for the reference is simplified once, separately, above.
    const equal = ref.sub(cand).isZero();
    options.push({
      raw_text,
      flag: equal ? "match" : "no_match",
      note: equal ? "" : "not equivalent",
    });
  }

  return {
    ok: true,
    canonicalFormula: rendered.toFormulaString(),
    canonicalLatex: rendered.toKaTeX(),
    options,
  };
}
