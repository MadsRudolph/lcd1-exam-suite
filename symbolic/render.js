// Render a polynomial-in-s (array of MPoly, index = power) collected by descending power.
function renderPoly(coeffs) {
    const parts = [];
    for (let p = coeffs.length - 1; p >= 0; p--) {
        const m = coeffs[p];
        if (m.isZero()) continue;
        const isSum = m.terms.size > 1;
        const coeffStr = m.toString();                 // collected, may start with "-", may be multi-term
        const sVar = p === 0 ? "" : (p === 1 ? "s" : `s^${p}`);

        let neg, termStr;
        if (p > 0 && isSum) {
            // multi-term coefficient on s^k: parenthesise WITH its internal signs; don't hoist.
            neg = false;
            termStr = `(${coeffStr})${sVar}`;
        } else if (p > 0 && coeffStr === "1") {
            neg = false; termStr = sVar;               // 1*s^k -> s^k
        } else if (p > 0 && coeffStr === "-1") {
            neg = true;  termStr = sVar;               // -1*s^k -> -s^k
        } else {
            // constant term (any), or single-term non-unit coefficient on s^k:
            // safe to hoist a leading '-' as the join sign (no parentheses involved).
            neg = coeffStr.startsWith("-");
            const body = neg ? coeffStr.slice(1) : coeffStr;
            termStr = `${body}${sVar}`;
        }
        parts.push({ neg, termStr });
    }
    if (parts.length === 0) return "0";
    let out = "";
    parts.forEach((p, i) => {
        if (i === 0) out = (p.neg ? "-" : "") + p.termStr;
        else out += (p.neg ? " - " : " + ") + p.termStr;
    });
    return out;
}

// A polynomial-in-s is "atomic" (needs no parens in a fraction) iff it is a single
// term: exactly one non-zero s-power whose coefficient is a single monomial (e.g. K, 2K, 3s).
function polyIsAtomic(coeffs) {
    const nonzero = coeffs.filter(m => !m.isZero());
    return nonzero.length === 1 && nonzero[0].terms.size === 1;
}

export function renderSymTF(tf) {
    const numText = renderPoly(tf.num);
    const denIsOne = tf.den.length === 1 && tf.den[0].isConstant() && tf.den[0].constantValue().isOne();
    const denText = renderPoly(tf.den);
    const numForFrac = polyIsAtomic(tf.num) ? numText : `(${numText})`;
    return {
        toFormulaString() {
            return denIsOne ? numText : `${numForFrac} / (${denText})`;
        },
        toKaTeX() {
            return denIsOne ? numText : `\\frac{${numText}}{${denText}}`;
        },
    };
}
