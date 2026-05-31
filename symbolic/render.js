// Render a polynomial-in-s (array of MPoly, index = power) collected by descending power.
function renderPoly(coeffs, mode) {
    // mode: "text" | "katex"
    const parts = [];
    for (let p = coeffs.length - 1; p >= 0; p--) {
        const m = coeffs[p];
        if (m.isZero()) continue;
        const isSum = m.terms.size > 1;
        let coeffStr = m.toString();                  // collected, e.g. "a + 1", "2K", "1", "-3"
        const sVar = p === 0 ? "" : (p === 1 ? "s" : `s^${p}`);

        // sign extraction for joining
        let neg = coeffStr.startsWith("-");
        let body = neg ? coeffStr.slice(1) : coeffStr;

        let termStr;
        if (p === 0) {
            termStr = body;                            // constant term shows its coefficient
        } else if (body === "1") {
            termStr = sVar;                            // 1*s^k -> s^k
        } else if (isSum) {
            termStr = `(${body})${sVar}`;              // (a+1)s
        } else {
            termStr = `${body}${sVar}`;                // 2Ks, 3s
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

export function renderSymTF(tf) {
    const numText = renderPoly(tf.num, "text");
    const denIsOne = tf.den.length === 1 && tf.den[0].isConstant() && tf.den[0].constantValue().isOne();
    const denText = renderPoly(tf.den, "text");
    return {
        toFormulaString() {
            return denIsOne ? numText : `${numText} / (${denText})`;
        },
        toKaTeX() {
            return denIsOne ? numText : `\\frac{${numText}}{${denText}}`;
        },
    };
}
