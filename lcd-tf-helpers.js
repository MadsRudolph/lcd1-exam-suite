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

// The app's parser allows implicit multiplication (5s, 2s, (s+2)(s+3), s(s+2)),
// but MATLAB rejects it ("Unexpected 's'. Check for missing multiplication
// operator."). Insert an explicit '*' at every juxtaposition boundary so the
// emitted code runs. '**' is first folded to MATLAB's '^'.
export function toMatlabExpr(src) {
  return String(src)
    .trim()
    .replace(/\*\*/g, "^")
    .replace(/\)\s*\(/g, ")*(")                  // (…)(…)  -> (…)*(…)
    .replace(/([0-9.])\s*([A-Za-z(])/g, "$1*$2") // 2s, 1.5s, 2(  -> 2*s, 1.5*s, 2*(
    .replace(/\)\s*([A-Za-z0-9.])/g, ")*$1")     // )s, )2  -> )*s, )*2
    .replace(/([A-Za-z_]\w*)\s*\(/g, "$1*(");    // s(…), a(…)  -> s*(…), a*(…)
}

// Per-tab MATLAB that both draws the plot and reports the same quantities the
// solver annotates (margins, crossovers, bandwidth, transient metrics, the
// s-plane grid) — using MATLAB's own analysis commands so the snippet is
// self-contained and recomputes everything from G.
const PLOT_BLOCK = {
  Step: [
    "% Step response with transient metrics",
    "step(G);",
    "grid on;",
    "% overshoot, peak time and settling time (matches the solver's read-outs)",
    "S = stepinfo(G);",
    "fprintf('Overshoot  = %.4g %%\\n', S.Overshoot);",
    "fprintf('Peak time  = %.4g s\\n', S.PeakTime);",
    "fprintf('Settling t = %.4g s (2%%)\\n', S.SettlingTime);",
  ],
  Bode: [
    "% Bode plot drawn with gain/phase margins and crossover frequencies marked",
    "margin(G);",
    "grid on;",
    "% numeric margins, crossovers and bandwidth",
    "[Gm, Pm, Wpc, Wgc] = margin(G);",
    "fprintf('GM = %.4g dB at w_pi = %.4g rad/s (phase crossover)\\n', 20*log10(Gm), Wpc);",
    "fprintf('PM = %.4g deg at w_c  = %.4g rad/s (gain crossover)\\n', Pm, Wgc);",
    "fprintf('Bandwidth  = %.4g rad/s\\n', bandwidth(G));",
  ],
  Nyquist: [
    "% Nyquist plot; the -1 point sets the gain/phase margins",
    "nyquist(G);",
    "grid on;",
    "[Gm, Pm] = margin(G);",
    "fprintf('GM = %.4g dB, PM = %.4g deg\\n', 20*log10(Gm), Pm);",
  ],
  "Pole-Zero": [
    "% Pole-zero map with the damping / natural-frequency grid",
    "pzmap(G);",
    "sgrid;",
    "% poles (stable when every real part is < 0) and zeros",
    "disp('poles ='); disp(pole(G));",
    "disp('zeros ='); disp(zero(G));",
  ],
};

// Commented MATLAB that rebuilds G(s) and reproduces the currently shown plot
// together with the quantities the solver displays. Symbolic parameters get a
// commented assignment block so the snippet runs once real values are filled in.
export function matlabForPlot(src, tab) {
  const block = PLOT_BLOCK[tab] || PLOT_BLOCK.Bode;
  const matlabSrc = toMatlabExpr(src);
  const syms = tfSymbols(matlabSrc);
  const lines = ["% Transfer function G(s)"];
  if (syms.length) {
    lines.push("% set your parameter values");
    for (const sym of syms) lines.push(`${sym} = 1;`);
  }
  lines.push("s = tf('s');", `G = ${matlabSrc};`, "", ...block);
  return lines.join("\n");
}
