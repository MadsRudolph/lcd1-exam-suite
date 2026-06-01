// Pure, DOM-free helpers shared by the LCD1 Solver UI and its tests:
//   combineTf  — glue a numerator and denominator into the one-line TF syntax
//                the solver understands, parenthesizing only where needed.
//   matlabForPlot — emit runnable, commented MATLAB that reproduces a plot.

// Operators that appear at the top level (paren-depth 0) of an expression.
// Leading/after-operator '+'/'-' are unary signs, not additive operators.
function topLevelOps(src) {
  const ops = new Set();
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && "+-*/".includes(c)) {
      if (c === "+" || c === "-") {
        const prev = src.slice(0, i).trimEnd().slice(-1);
        if (prev === "" || "+-*/(".includes(prev)) continue; // unary sign
      }
      ops.add(c);
    }
  }
  return ops;
}

// A numerator only needs wrapping when an additive '+'/'-' would bind looser
// than the division; a denominator needs wrapping for ANY top-level operator,
// since 'num/a*b' parses as '(num/a)*b' and 'num/a+b' as '(num/a)+b'.
export function combineTf(num, den) {
  const n = String(num).trim();
  const d = String(den).trim();
  const nOps = topLevelOps(n);
  const dOps = topLevelOps(d);
  const wrapN = nOps.has("+") || nOps.has("-") ? `(${n})` : n;
  const wrapD = dOps.size > 0 ? `(${d})` : d;
  return `${wrapN}/${wrapD}`;
}

// Distinct alphabetic parameters in a TF string (everything but the Laplace 's').
export function tfSymbols(src) {
  const set = new Set();
  for (const m of String(src).matchAll(/[A-Za-z_]\w*/g)) if (m[0] !== "s") set.add(m[0]);
  return [...set];
}

const PLOT_CMD = {
  Step: { comment: "Step response", cmd: "step(G);" },
  Bode: { comment: "Bode magnitude and phase", cmd: "bode(G);" },
  Nyquist: { comment: "Nyquist plot", cmd: "nyquist(G);" },
  "Pole-Zero": { comment: "Pole-zero map", cmd: "pzmap(G);" },
};

// Commented MATLAB that rebuilds G(s) and draws the currently shown plot.
// Symbolic parameters get a commented assignment block so the snippet runs
// once the student fills in real values.
export function matlabForPlot(src, tab) {
  const plot = PLOT_CMD[tab] || PLOT_CMD.Bode;
  const matlabSrc = String(src).trim().replace(/\*\*/g, "^");
  const syms = tfSymbols(matlabSrc);
  const lines = ["% Transfer function G(s)"];
  if (syms.length) {
    lines.push("% set your parameter values");
    for (const sym of syms) lines.push(`${sym} = 1;`);
  }
  lines.push("s = tf('s');", `G = ${matlabSrc};`, "", `% ${plot.comment}`, plot.cmd, "grid on;");
  return lines.join("\n");
}
