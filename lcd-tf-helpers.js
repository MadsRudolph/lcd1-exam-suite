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
// Each block: draw the plot, print the numeric read-outs to the terminal, then
// add labelled dashed reference lines (or markers) whose legend explains what
// they represent — mirroring the solver's on-plot legend.
const PLOT_BLOCK = {
  Step: [
    "% Step response — metrics to the terminal, legend explains the dashed lines",
    "figure;",
    "step(G);",
    "grid on;",
    "hold on;",
    "S = stepinfo(G);",
    "yf = dcgain(G);",
    "fprintf('Overshoot = %.4g %%\\n', S.Overshoot);",
    "fprintf('Peak time = %.4g s\\n', S.PeakTime);",
    "fprintf('Settling time (2%%) = %.4g s\\n', S.SettlingTime);",
    "fprintf('Final value = %.4g\\n', yf);",
    "h1 = yline(yf, '--', 'DisplayName', 'final value');",
    "h2 = xline(S.SettlingTime, '--', 'Color', [0.66 0.49 0.93], 'DisplayName', 't_s (2% settling)');",
    "legend([h1 h2], 'Location', 'southeast');",
    "hold off;",
  ],
  Bode: [
    "% Bode plot — margins to the terminal, legend explains the dashed lines",
    "figure;",
    "bode(G);",
    "grid on;",
    "[Gm, Pm, Wpc, Wgc] = margin(G);",
    "fprintf('GM = %.4g dB at w_pi = %.4g rad/s (phase crossover)\\n', 20*log10(Gm), Wpc);",
    "fprintf('PM = %.4g deg at w_c = %.4g rad/s (gain crossover)\\n', Pm, Wgc);",
    "fprintf('Bandwidth = %.4g rad/s\\n', bandwidth(G));",
    "h1 = xline(Wgc, '--', 'Color', [0.06 0.72 0.51], 'DisplayName', '\\omega_c (gain crossover)');",
    "h2 = xline(Wpc, '--', 'Color', [0.96 0.62 0.04], 'DisplayName', '\\omega_\\pi (phase crossover)');",
    "legend([h1 h2], 'Location', 'best');",
  ],
  Nyquist: [
    "% Nyquist plot — margins to the terminal, legend marks the -1 point",
    "figure;",
    "nyquist(G);",
    "grid on;",
    "hold on;",
    "[Gm, Pm] = margin(G);",
    "fprintf('GM = %.4g dB, PM = %.4g deg\\n', 20*log10(Gm), Pm);",
    "h1 = plot(-1, 0, 'r+', 'MarkerSize', 10, 'LineWidth', 1.5, 'DisplayName', '-1 critical point');",
    "legend(h1, 'Location', 'best');",
    "hold off;",
  ],
  "Pole-Zero": [
    "% Pole-zero map — poles/zeros to the terminal, legend marks the jw axis",
    "figure;",
    "pzmap(G);",
    "sgrid;",
    "hold on;",
    "fprintf('poles =\\n'); disp(pole(G));",
    "fprintf('zeros =\\n'); disp(zero(G));",
    "h1 = xline(0, '--', 'Color', [0.06 0.72 0.51], 'DisplayName', 'j\\omega axis (stability boundary)');",
    "legend(h1, 'Location', 'best');",
    "hold off;",
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

// ---- MATLAB reference snippets ------------------------------------------------
// For the symbolic question types the JS engine deliberately doesn't rebuild
// (inverse-Laplace y(t), higher-order/transcendental linearization, parameter
// stability), emit ready-to-run MATLAB instead. Reference, not a solver.

// Like toMatlabExpr but preserves function calls: it does NOT rewrite name( into
// name*( (that would corrupt sin(…) / sqrt(…) / exp(…)).
function toMatlabFunc(src) {
  return String(src)
    .trim()
    .replace(/\*\*/g, "^")
    .replace(/\)\s*\(/g, ")*(")
    .replace(/([0-9.])\s*([A-Za-z(])/g, "$1*$2")
    .replace(/\)\s*([A-Za-z0-9.])/g, ")*$1");
}

function parsePointMap(pt) {
  const m = {};
  for (const part of String(pt || "").split(",")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) m[k.trim()] = v.trim();
  }
  return m;
}

// y(t) = L^{-1}{ G(s)·U(s) }, plus the initial/final-value theorems.
export function matlabTimeResponse(Gsrc, inputKind = "step", customU = "") {
  const G = toMatlabExpr(Gsrc);
  const U_std = { step: "1/s", ramp: "1/s^2", impulse: "1", none: "1" };
  const U = customU && customU.trim() ? toMatlabExpr(customU) : (U_std[inputKind] || "1/s");
  const syms = tfSymbols(G).filter((x) => x !== "t");
  const lines = ["% Time-domain response  y(t) = ilaplace( G(s) * U(s) )", "syms s t"];
  if (syms.length) { lines.push("% set parameter values:"); for (const k of syms) lines.push(`${k} = 1;`); }
  lines.push(
    `G = ${G};`,
    `U = ${U};            % step=1/s, ramp=1/s^2, impulse=1; or e.g. laplace(2*exp(-3*t))`,
    "Y = G*U;",
    "y = ilaplace(Y, s, t);   % the answer (may print in sinh/cosh form — equivalent to exponentials)",
    "% y = rewrite(y, 'exp');  % optional: force the exponential form (needs a healthy Symbolic Toolbox)",
    "disp('y(t) ='), pretty(y)",
    "fprintf('y(inf) = %s\\n', char(limit(s*Y, s, 0)));   % final-value theorem",
    "fprintf('y(0+)  = %s\\n', char(limit(s*Y, s, inf)));  % initial-value theorem"
  );
  return lines.join("\n");
}

// First-order linearization xdot = f(x,u) -> G(s) = dX/dU. Handles sin/sqrt/exp
// (symbolic diff); the trailing comment gives the state-space recipe for a
// higher-order ODE.
export function matlabLinearize(f, stateVar = "x", inputVar = "u", point = "") {
  const F = toMatlabFunc(f);
  const pm = parsePointMap(point);
  const sv = pm[stateVar] !== undefined ? pm[stateVar] : stateVar;
  const iv = pm[inputVar] !== undefined ? pm[inputVar] : inputVar;
  return [
    "% Linearize  xdot = f(x,u)  about an operating point  ->  G(s) = dX/dU",
    `syms ${stateVar} ${inputVar} s`,
    `f = ${F};`,
    `A = double(subs(diff(f, ${stateVar}), [${stateVar} ${inputVar}], [${sv} ${iv}]));`,
    `B = double(subs(diff(f, ${inputVar}), [${stateVar} ${inputVar}], [${sv} ${iv}]));`,
    "G = B/(s - A);",
    "disp('A ='), disp(A), disp('B ='), disp(B), pretty(G)",
    "% Higher-order ODE? write it as xdot = f([x1;x2],u), then:",
    "%   A = double(subs(jacobian(f,[x1 x2]), [x1 x2 u], [x10 x20 u0]));",
    "%   B = double(subs(jacobian(f,u),        [x1 x2 u], [x10 x20 u0]));",
    "%   G = tf(ss(A,B,[1 0],0));"
  ].join("\n");
}

// Stability region of a system in a literal parameter (e.g. a state-matrix entry).
export function matlabParamStability(expr, param = "w") {
  const E = expr && expr.trim() ? expr.trim() : "[-1 1; 2 -w]";
  const lines = [`syms ${param} s`];
  if (E.includes("[")) {
    lines.push(
      `A = ${E};        % state matrix containing ${param}`,
      "p = charpoly(A, s);",
      "disp('characteristic polynomial:'), disp(collect(p, s))",
      `sol = solve(real(eig(A)) < 0, ${param}, 'ReturnConditions', true);`,
      "disp(sol.conditions)   % the stability region"
    );
  } else {
    lines.push(
      `p = ${toMatlabFunc(E)};        % characteristic polynomial in s`,
      "disp('characteristic polynomial:'), disp(collect(p, s))",
      "% Routh-Hurwitz: 2nd order s^2+a1 s+a0 stable iff a1>0 & a0>0;",
      "%               3rd order adds a2*a1 > a0.  Solve those inequalities for the parameter."
    );
  }
  return lines.join("\n");
}
