// LCD1 engine for the Electron app. Two entry points used by the UI:
//   smartPaste(text)     -> { tf, tfKind, source, options, intent, note }  (Smart Paste)
//   runSolver(fn, inputs, optionsText, matchKey) -> normalized result
// Both sit on the parity-verified solver modules in ./spike.
import { parseTf } from "./spike/numeric/parse.js";
import { roots } from "./spike/numeric/roots.js";
import { polyTrim, polyAdd } from "./spike/numeric/poly.js";
import { solveMargins, solveStableKRange } from "./spike/solvers/p3.js";
import { solve2ndOrder, solveKForSpec, solveClosedLoop2ndOrder } from "./spike/solvers/p4.js";
import { solveKPFromEss, solveEssTable } from "./spike/solvers/p5.js";
import { solvePiLead, solvePForPM, solvePiLeadDesign, solveLagBeta } from "./spike/solvers/p6.js";
import { solveNestedEss, pickFeedforwardForm } from "./spike/solvers/p7.js";
import { bandwidth, dominantSettling, analyzeStability, characterizeTf } from "./spike/solvers/analysis.js";
import { evalFreqPoint, findOmegaForMagDb, findOmegaForPhaseDeg } from "./spike/solvers/freqpoint.js";
import { secondOrderFromReadoff } from "./spike/solvers/plotreadoff.js";
import { valueTheorems } from "./spike/solvers/valuetheorems.js";
import { buildPlotData } from "./spike/solvers/plotdata.js";
import { solveOdeToTf, solveStateSpaceToTf } from "./spike/solvers/p1.js";
import { composeTfFromBode } from "./spike/solvers/p2.js";
import { parseQuestion, extractTf, extractLoopTf, extractClosedLoopTf, extractOde, extractOptions } from "./spike/smart-paste.js";
import { matchOptions, applyStableRangeMatch } from "./spike/match.js";
import { symbolicEquivTest } from "./symbolic/equiv.js";
import { parseExprToTF } from "./symbolic/parse-expr.js";
import { order as symOrder, systemType, staticGain } from "./symbolic/analysis.js";
import { essStep, essRamp, essDisturbanceStep } from "./symbolic/ess.js";
import { solveForSymbol } from "./symbolic/solve-symbol.js";
import { linearizeFirstOrder } from "./symbolic/linearize.js";
import { feedback } from "./symbolic/combinators.js";
import { renderSymTF } from "./symbolic/render.js";
import { RatFunc } from "./symbolic/ratfunc.js";
import { formByFn } from "./lcd-forms.js";
import { matlabTimeResponse, matlabLinearize, matlabParamStability } from "./lcd-tf-helpers.js";

// A RatFunc → readable string (denominator is 1 after normalization for a polynomial).
const ratStr = (rf) => (rf === Infinity ? "∞" : rf.den.isConstant() ? rf.num.toString() : `(${rf.num.toString()}) / (${rf.den.toString()})`);
const ratLatex = (rf) => (rf === Infinity ? "\\infty" : rf.den.isConstant() ? rf.num.toString() : `\\frac{${rf.num.toString()}}{${rf.den.toString()}}`);
// Parse an operating point "x=0, u=2" into { x: "0", u: "2" }.
const parsePoint = (str) => {
  const m = {};
  for (const part of String(str || "").split(",")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) m[k.trim()] = v.trim();
  }
  return m;
};

// ---- formatting ----
const fmt = (x) => {
  if (x === Infinity) return "\\infty";
  if (x === -Infinity) return "-\\infty";
  if (x === null || x === undefined || (typeof x === "number" && Number.isNaN(x))) return "\\text{—}";
  if (typeof x !== "number") return String(x);
  return String(Number(x.toPrecision(6)));
};
const plain = (x) => (typeof x === "number" ? (Number.isFinite(x) ? String(Number(x.toPrecision(6))) : (x > 0 ? "∞" : "-∞")) : String(x));
// Snap floating-point dust (a repeated/origin root computes as e.g. 1.7e-44) to 0
// and format a complex root cleanly: "0", "-2", or "-0.1+0.3j".
const snap = (x) => (Math.abs(x) < 1e-9 ? 0 : x);
const cplxStr = (p) => {
  const re = snap(p.re), im = snap(p.im);
  return im === 0 ? plain(re) : `${plain(re)}${im >= 0 ? "+" : "-"}${plain(Math.abs(im))}j`;
};

function tfLatex(num, den) {
  const term = (coeffs) => {
    const n = coeffs.length - 1;
    const parts = [];
    coeffs.forEach((c, i) => {
      const p = n - i;
      if (Math.abs(c) < 1e-12) return;
      const cc = Number(c.toPrecision(6));
      const mag = Math.abs(cc) === 1 && p !== 0 ? (cc < 0 ? "-" : "") : `${cc}`;
      const mono = p === 0 ? `${cc}` : p === 1 ? `${mag}s` : `${mag}s^{${p}}`;
      parts.push((parts.length && c > 0 ? "+" : "") + mono);
    });
    return parts.join("") || "0";
  };
  return `\\dfrac{${term(num)}}{${term(den)}}`;
}

// ---- field parsing ----
const blank = (v) => v === undefined || v === null || String(v).trim() === "";
const fnum = (v) => (blank(v) ? null : Number(v));
const flist = (v) => String(v).split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
const fmatrix = (v) => JSON.parse(String(v));
const ftuples = (v) => [...String(v).matchAll(/\(([^)]+)\)/g)].map((m) => m[1].split(",").map((x) => Number(x.trim())));

// ---- Smart Paste (assist mode) ----
// Non-committal guidance per detected question family. Smart Paste never
// auto-answers — it points you at the dashboard read-out or goal that solves
// this kind of question, so a mis-route can never surface as a confident
// wrong multiple-choice letter.
const INTENT_GUIDE = {
  solve_margins:               { label: "Gain / phase margins",         hint: "Read GM, PM, ω_c and ω_π straight from the read-outs above." },
  solve_stable_K_range:        { label: "Stable-K range",               hint: "Open the Design strip → “Stable-K range”." },
  solve_P_for_PM:              { label: "P-controller for a target PM", hint: "Open the Design strip → “P for PM” and enter the target phase margin." },
  solve_pi_lead:               { label: "PI-Lead / Lead design",        hint: "Open the Design strip → “PI-Lead” (read φ_G off the Bode phase plot if asked)." },
  solve_closed_loop_2nd_order: { label: "Second-order spec",            hint: "Use the “Closed-loop + 1 spec” calculator, or read ζ / ωₙ from the read-outs." },
  solve_2nd_order:             { label: "Second-order metrics",         hint: "Use the “2nd-order specs” calculator below." },
  solve_ess_table:             { label: "Steady-state error",           hint: "See the “ess step / ramp” read-out above." },
  solve_KP_from_ess:           { label: "K_P from a steady-state error", hint: "Use the “K_P from ess” calculator below." },
  compose_tf_from_bode:        { label: "Bode read-off",                hint: "Use the “Bode read-off” source tool, then overlay the exam figure to check the reconstruction." },
  solve_ode_to_tf:             { label: "ODE → transfer function",      hint: "Built G(s) from the ODE and dropped it above." },
  solve_state_space_to_tf:     { label: "State-space → TF",             hint: "Use the “State-space → TF” source tool (enter A, B, C, D)." },
  reduce_block_diagram:        { label: "Block-diagram reduction",      hint: "Draw it in the Block Diagram mode, then “Use in LCD1 Solver”." },
  pick_feedforward_form:       { label: "Feed-forward form",            hint: "Use the “Feedforward form” calculator below." },
  solve_nested_ess:            { label: "Nested-loop ess",              hint: "Use the “Nested ess” calculator below." },
};

// Pull the computable essence out of a pasted exam question: a transfer
// function to drive the system-centric dashboard, the multiple-choice options,
// and a hint about what kind of question it is. Returns
//   { tf, tfKind, source, options, intent, note }
// where tf is null when the question gives no TF in the text (figure-only or
// conceptual) — the note then explains how to proceed instead of guessing.
export function smartPaste(textIn) {
  const text = String(textIn || "");
  const out = { tf: null, tfKind: null, source: null, options: null, intent: null, note: null };
  if (!text.trim()) return out;

  // 1. Detect the question family (guidance only — never an answer).
  let routed = null;
  try { routed = parseQuestion(text); } catch { routed = null; }
  if (routed && INTENT_GUIDE[routed.solver_function]) {
    out.intent = { fn: routed.solver_function, ...INTENT_GUIDE[routed.solver_function] };
    // "Choose K so Mp ≤ …" is a design (K boundary) question, not a metric read-out —
    // point at the K-for-transient-spec goal rather than the closed-loop calculator.
    if (routed.solver_function === "solve_closed_loop_2nd_order" && routed.match_key === "K") {
      out.intent = { fn: "solve_K_for_spec", label: "K for a transient spec",
        hint: "Open the Design strip → “K for transient spec” and enter the loop gain G(s,K) and the Mp/ζ bound." };
    }
  }

  // 2. Extract a system G(s). Preference: an explicit numeric TF, then a loop
  //    gain written with a design gain K (K normalised to 1), then a TF built
  //    from an ODE, then a symbolic closed-loop TF (keeps K, a, …).
  let tf = guard(() => extractTf(text), null);
  let kind = tf ? "numeric" : null, source = tf ? "tf" : null;
  if (!tf) {
    const loop = guard(() => extractLoopTf(text), null);
    if (loop) { tf = loop; kind = "numeric"; source = "loop"; }
  }
  if (!tf) {
    const ode = guard(() => extractOde(text), null);
    if (ode && ode.y_coeffs) {
      const built = guard(() => {
        const y = ode.y_coeffs.split(",").map(Number);
        const u = (ode.u_coeffs || "1").split(",").map(Number);
        const G = solveOdeToTf(y, u);
        return formatTf(G.num, G.den).replace(/\^/g, "**");
      }, null);
      if (built) { tf = built; kind = "numeric"; source = "ode"; }
    }
  }
  if (!tf) {
    const cl = guard(() => extractClosedLoopTf(text), null);
    if (cl) { tf = cl.replace(/\^/g, "**"); kind = "symbolic"; source = "closed-loop"; }
  }
  out.tf = tf; out.tfKind = kind; out.source = source;

  // 3. Multiple-choice options.
  const opts = guard(() => extractOptions(text), "");
  out.options = opts && opts.trim() ? opts.trim() : null;

  // 4. Fail safe when nothing computable was found (the figure-only / conceptual
  //    case): say so plainly instead of leaving the dashboard blank.
  if (!tf) {
    out.note = out.intent
      ? `This looks like a ${out.intent.label} question, but no transfer function is written in the text — it likely refers to a figure. ${out.intent.hint} Read the value(s) off the plot and type G(s) above, or use the tools below.`
      : "No transfer function or ODE found in the pasted text — this question probably refers to a figure or is conceptual. Read any values off the plot and type G(s) above, or use the calculators below.";
  }
  return out;
}

// Numeric first-order linearization ẋ = f(x,u) about an operating point, for the
// f the symbolic core rejects (sin, cos, tan, √, exp, log). Central differences
// give A = ∂f/∂x and B = ∂f/∂u at the point; the small-signal TF is B/(s − A).
// Only works when the operating point fixes every constant to a number (any
// leftover literal parameter is reported, since a number can't be computed).
const MATH_FUNCS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "exp", "log", "ln", "abs", "sinh", "cosh", "tanh", "pi", "e"]);
function compileExpr(fStr) {
  const expr = String(fStr)
    .replace(/\*\*/g, "^").replace(/\^/g, "**")          // normalise power operator
    .replace(/\bln\b/g, "log")
    .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|exp|log|abs|sinh|cosh|tanh)\b/g, "Math.$1")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/(?<![\w.])e(?![\w])/g, "Math.E");
  return (scope) => {
    const names = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    return Function(...names, `"use strict"; return (${expr});`)(...names.map((n) => scope[n]));
  };
}
function numericLinearize(fStr, stateVar, inputVar, point) {
  const scope = {};
  for (const k of Object.keys(point)) {
    const v = Number(point[k]);
    if (!Number.isNaN(v)) scope[k] = v;
  }
  if (!(stateVar in scope)) return { ok: false, note: `Give a numeric operating-point value for the state ${stateVar} (e.g. ${stateVar}=2).` };
  if (!(inputVar in scope)) return { ok: false, note: `Give a numeric operating-point value for the input ${inputVar} (e.g. ${inputVar}=0).` };
  const ids = new Set((String(fStr).match(/[A-Za-z_]\w*/g) || []));
  for (const id of ids) {
    if (MATH_FUNCS.has(id) || MATH_FUNCS.has(id.toLowerCase())) continue;
    if (id in scope) continue;
    return { ok: false, note: `Linearizing a sin/√/exp expression needs every constant as a number — '${id}' has no value. Substitute the constants and the operating point as numbers, then retry.` };
  }
  let f;
  try { f = compileExpr(fStr); } catch (e) { return { ok: false, note: `Could not read the expression: ${e.message}` }; }
  const at = (over, h) => f({ ...scope, [over]: scope[over] + h });
  const deriv = (over) => {
    const h = Math.max(1e-6, Math.abs(scope[over]) * 1e-6);
    return (at(over, h) - at(over, -h)) / (2 * h);
  };
  let A, B;
  try { A = deriv(stateVar); B = deriv(inputVar); } catch (e) { return { ok: false, note: `Could not evaluate the derivative at the operating point: ${e.message}` }; }
  if (!Number.isFinite(A) || !Number.isFinite(B)) return { ok: false, note: "The derivative is not finite at this operating point (check the values are inside the function's domain)." };
  return { ok: true, A, B };
}

// Cancel real common factors shared by a numerator and denominator (a numeric
// pole/zero cancellation) so a state-space→TF result shows its reduced form,
// e.g. (10s+10)/(s²+2s+1) → 10/(s+1). Synthetic division by each shared real
// root is exact up to float dust; complex common factors (rare here) are left
// alone. Display-only — the parity-tested solver output is untouched.
function deflate(a, r) {
  const out = [a[0]];
  for (let i = 1; i < a.length - 1; i++) out.push(a[i] + r * out[i - 1]);
  return out;
}
function reduceRealCommon(num, den) {
  let n = polyTrim(num.slice()), d = polyTrim(den.slice());
  for (let guard = 0; guard < 16 && n.length > 1 && d.length > 1; guard++) {
    const zr = roots(n).filter((r) => Math.abs(r.im) < 1e-7).map((r) => r.re);
    const pr = roots(d).filter((r) => Math.abs(r.im) < 1e-7).map((r) => r.re);
    let cancelled = false;
    for (const z of zr) {
      const p = pr.find((x) => Math.abs(x - z) <= 1e-6 * (1 + Math.abs(z)));
      if (p !== undefined) { n = deflate(n, z); d = deflate(d, p); cancelled = true; break; }
    }
    if (!cancelled) break;
  }
  return { num: n, den: d };
}

// ---- core solve ----
export function runSolver(fn, inp = {}, optionsText = "", matchKey = null) {
  const form = formByFn(fn);
  const out = {
    ok: true, fn, prettyName: form ? `${form.pattern} · ${form.title.replace(/^P\d+ — /, "")}` : fn,
    resultKind: form ? form.resultKind : "NUMBER", dictKeys: form ? form.dictMatchKeys : null,
    latex: null, summary: [], options: null, note: null,
  };
  // Forgive how the student typed any transfer-function field (unicode, an
  // "G(s) =" label, s² superscripts) before it reaches a parser.
  for (const k of ["G", "F", "G_str", "closed_loop_str", "ref", "L", "Gd"]) {
    if (typeof inp[k] === "string") inp[k] = normalizeTfInput(inp[k]);
  }
  try {
    switch (fn) {
      case "solve_ode_to_tf": {
        const G = solveOdeToTf(flist(inp.y_coeffs), flist(inp.u_coeffs));
        tfResult(out, G);
        out.options = matchTfOpts(G, optionsText);
        break;
      }
      case "solve_state_space_to_tf": {
        let G = solveStateSpaceToTf(fmatrix(inp.A), fmatrix(inp.B), fmatrix(inp.C), fmatrix(inp.D));
        const red = reduceRealCommon(G.num, G.den); // show the reduced TF, e.g. 10/(s+1)
        G = new G.constructor(red.num, red.den);
        tfResult(out, G);
        out.options = matchTfOpts(G, optionsText);
        break;
      }
      case "compose_tf_from_bode": {
        const c = composeTfFromBode({ dc_gain_dB: Number(inp.dc_gain_dB), corners: ftuples(inp.corners), phase_events: ftuples(inp.phase_events) });
        out.latex = tfLatex(c.tf.num, c.tf.den);
        out.summary = [["poles", c.poles.map(plain).join(", ") || "—"], ["zeros", c.zeros.map(plain).join(", ") || "—"], ["DC gain", plain(c.dc_gain_linear)]];
        out.options = matchTfOpts(c.tf, optionsText);
        break;
      }
      case "bode_readoff": {
        const c = composeTfFromBode({ dc_gain_dB: Number(inp.dc_gain_dB), corners: ftuples(inp.corners), phase_events: ftuples(inp.phase_events) });
        const poles = c.tf.poles();
        const order = poles.length;
        const type = poles.filter((p) => p.abs() < 1e-6).length;
        const m = solveMargins(c.tf);
        out.latex = tfLatex(c.tf.num, c.tf.den);
        out.summary = [
          ["type", String(type)],
          ["order", String(order)],
          ["GM", plain(m.GM)],
          ["GM (dB)", Number.isFinite(m.GM) ? plain(m.GM_dB) : "∞"],
          ["PM (°)", plain(m.PM_deg)],
          ["ω_c = ω_gc", plain(m.omega_gc)],
          ["ω_π = ω_pc", plain(m.omega_pc)],
        ];
        out.plotData = buildPlotData(c.tf); // draws the reconstructed Bode to compare with the exam figure
        out.plotDefaultTab = "Bode";
        break;
      }
      case "solve_stable_K_range": {
        const { low, high } = solveStableKRange(parseTf(inp.G));
        out.latex = `K \\in (${fmt(low)},\\ ${fmt(high)})`;
        out.summary = [["K_low", plain(low)], ["K_high", plain(high)]];
        out.options = flagRange([low, high], optionsText);
        break;
      }
      case "solve_margins": {
        out.tf = inp.G;
        dictResult(out, solveMargins(parseTf(inp.G)), matchKey || "GM", optionsText);
        break;
      }
      case "solve_2nd_order": {
        const r = solve2ndOrder({ Mp: fnum(inp.Mp), zeta: fnum(inp.zeta), omega_n: fnum(inp.omega_n), t_p: fnum(inp.t_p), t_s_2pct: fnum(inp.t_s_2pct) });
        // If the options are written as percentages (an overshoot question), match
        // against Mp% rather than the default ζ.
        let mk = matchKey || "zeta";
        if (!matchKey && /%/.test(optionsText) && r.Mp_pct != null) mk = "Mp_pct";
        dictResult(out, r, mk, optionsText);
        break;
      }
      case "solve_closed_loop_2nd_order": {
        const r = solveClosedLoop2ndOrder(inp.closed_loop_str, inp.given_kind, Number(inp.given_value));
        dictResult(out, r, matchKey || "K", optionsText);
        break;
      }
      case "solve_K_for_spec": {
        const K = solveKForSpec(inp.G_str, inp.spec);
        numResult(out, "K", K, optionsText);
        break;
      }
      case "solve_KP_from_ess": {
        const K = solveKPFromEss(Number(inp.G0), inp.G0_unit || "linear", Number(inp.ess_target));
        numResult(out, "K_P", K, optionsText);
        break;
      }
      case "solve_ess_table": {
        const Gess = parseTf(inp.G);
        // Optional P-controller gain K_P (forward or feedback branch): the loop
        // gain becomes K_P·G, so ess_step = 1/(1+K_P·G(0)). NotebookLM-confirmed.
        const Kp = fnum(inp.K_P);
        const Geff = (Kp != null && Kp !== 1) ? new Gess.constructor(Gess.num.map((c) => c * Kp), Gess.den) : Gess;
        dictResult(out, solveEssTable(Geff), matchKey || "ess_step", optionsText);
        break;
      }
      case "close_loop": {
        const L = parseTf(inp.G);
        const Kc = fnum(inp.K) ?? 1;
        // Unity feedback: T = K·L/(1+K·L). With L = num/den, T = K·num/(den + K·num).
        const Knum = L.num.map((c) => c * Kc);
        const red = reduceRealCommon(Knum, polyAdd(L.den, Knum));
        const T = new L.constructor(red.num, red.den);
        const c = characterizeTf(T);
        const stable = !T.poles().some((p) => p.re > 1e-9);
        out.tf = formatTf(T.num, T.den);
        out.latex = `T(s) = ${tfLatex(T.num, T.den)}`;
        out.summary = [
          ["closed-loop T(s)", out.tf],
          ["poles", T.poles().map(cplxStr).join(", ")],
          ["DC gain T(0)", plain(c.dc_gain)],
        ];
        if (c.is_second_order) out.summary.push(["ζ", plain(c.zeta)], ["ω_n", plain(c.omega_n)]);
        out.summary.push(["stable?", stable ? "yes" : "no"]);
        out.options = matchTfOpts(T, optionsText);
        break;
      }
      case "gm_from_crossing": {
        const d = Math.abs(fnum(inp.d));
        if (!d) { out.ok = false; out.note = "Enter the distance |where the Nyquist plot crosses the negative real axis| — e.g. 0.1639."; break; }
        const gm = 1 / d;
        const gm_dB = 20 * Math.log10(gm);
        out.latex = `GM = ${fmt(gm)}\\ (${fmt(gm_dB)}\\text{ dB}),\\quad K_{crit} = ${fmt(gm)}`;
        out.summary = [["GM (linear)", plain(gm)], ["GM (dB)", plain(gm_dB)], ["critical gain K = 1/d", plain(gm)]];
        // Gain margin is conventionally quoted in dB, so flag against the dB value;
        // for a "critical gain" question (options are gains) nothing false-flags and
        // the student reads K = 1/d straight off the summary.
        out.options = optionsText ? matchOptions({ value: gm_dB, kind: "NUMBER" }, optionsText) : null;
        noMatchNote(out);
        break;
      }
      case "solve_pi_lead": {
        piLead(out, inp, optionsText, matchKey);
        break;
      }
      case "solve_P_for_PM": {
        const r = solvePForPM(parseTf(inp.G), Number(inp.target_PM_deg));
        dictResult(out, { K_P: r.K_P, omega_c: r.omega_c }, matchKey || "K_P", optionsText);
        break;
      }
      case "pick_feedforward_form": {
        const ff = pickFeedforwardForm({ n_lags: fnum(inp.n_lags) ?? 3, D_order: fnum(inp.D_order) ?? 2 });
        out.latex = ff.formula_latex;
        out.summary = [["option", ff.option_label], ["filter order", ff.filter_order], ["τ_f bound", ff.tau_f_bound]];
        break;
      }
      case "solve_nested_ess": {
        const K = solveNestedEss({ architecture: inp.architecture, G0: fnum(inp.G0), ess_target: fnum(inp.ess_target), eps1: fnum(inp.eps1), eps2: fnum(inp.eps2), G2_0: fnum(inp.G2_0) });
        numResult(out, inp.architecture === "nested_K1_K2" ? "K_2" : "K_P", K, optionsText);
        break;
      }
      case "characterize": {
        out.tf = inp.G;
        const c = characterizeTf(parseTf(inp.G));
        const polesStr = c.poles.map(cplxStr).join(", ");
        out.summary = [["poles", polesStr], ["DC gain", plain(c.dc_gain)]];
        if (typeof c.dc_gain === "number" && c.dc_gain > 0) {
          out.summary.push(["DC gain (dB)", plain(20 * Math.log10(c.dc_gain))]);
        }
        out.summary.push(
          ["y(0⁺) step (init. value)", plain(c.initial_value)],
          ["y(∞) step (final value)", plain(c.dc_gain)]);
        if (c.is_second_order) {
          out.latex = `\\zeta=${fmt(c.zeta)},\\ \\omega_n=${fmt(c.omega_n)}`;
          out.summary.push(["ζ", plain(c.zeta)], ["ω_n", plain(c.omega_n)]);
          if (c.metrics) for (const [k, v] of Object.entries(c.metrics)) out.summary.push([k, plain(v)]);
        } else {
          out.latex = `\\text{poles: }${polesStr}`;
        }
        break;
      }
      case "bandwidth": {
        out.tf = inp.G;
        numResult(out, "\\omega_{BW}", bandwidth(parseTf(inp.G)), optionsText);
        break;
      }
      case "dominant_settling": {
        const r = dominantSettling(parseTf(inp.G));
        out.latex = `t_s^{2\\%}=${fmt(r.t_s_2pct)},\\ t_s^{5\\%}=${fmt(r.t_s_5pct)}`;
        out.summary = [["dominant pole", `${plain(r.dominant_pole.re)}${r.dominant_pole.im >= 0 ? "+" : "-"}${plain(Math.abs(r.dominant_pole.im))}j`], ["t_s 2%", plain(r.t_s_2pct)], ["t_s 5%", plain(r.t_s_5pct)]];
        break;
      }
      case "analyze_stability": {
        out.tf = inp.G;
        const r = analyzeStability(parseTf(inp.G), fnum(inp.K) ?? 1);
        out.latex = `\\text{${r.stable ? "stable" : "UNSTABLE"}}\\ (Z=${r.closedLoopRhpPoles})`;
        out.summary = [["open-loop RHP poles", r.openLoopRhpPoles], ["closed-loop RHP poles", r.closedLoopRhpPoles], ["stable?", r.stable ? "yes" : "no"]];
        break;
      }
      case "symbolic_analysis": {
        const L = parseExprToTF(inp.L);
        const N = systemType(L);
        const ord = symOrder(L);
        const Tcl = renderSymTF(feedback(L)); // closed-loop T = L/(1+L), unity feedback
        out.latex = `T(s) = ${Tcl.toKaTeX()}`;
        out.summary = [
          ["closed-loop T = L/(1+L)", Tcl.toFormulaString()],
          ["order", String(ord)],
          ["type (N)", String(N)],
          ["K₀ = lim sᴺ·L", ratStr(staticGain(L))],
          ["e_ss (unit step)", ratStr(essStep(L))],
          ["e_ss (unit ramp)", ratStr(essRamp(L))],
        ];
        break;
      }
      case "symbolic_disturbance_ess": {
        const e = essDisturbanceStep({ Gd: parseExprToTF(inp.Gd), L: parseExprToTF(inp.L) });
        out.latex = `e_{d,ss} = ${ratLatex(e)}`;
        out.summary = [["e_dss (unit step)", ratStr(e)]];
        break;
      }
      case "solve_symbol": {
        const sym = (inp.symbol || "").trim();
        const r = solveForSymbol(inp.equation, sym);
        const valStr = Array.isArray(r.value) ? r.exact : ratStr(r.value);
        out.latex = `${sym || "x"} = ${Array.isArray(r.value) ? r.exact : ratLatex(r.value)}`;
        out.summary = [[sym || "x", valStr], ["decimal", r.exact]];
        break;
      }
      case "linearize_tf": {
        const stateVar = (inp.stateVar || "x").trim();
        const inputVar = (inp.inputVar || "u").trim();
        const point = parsePoint(inp.point);
        try {
          // Exact symbolic path: works for polynomial / rational f.
          const G = linearizeFirstOrder({ f: inp.f, stateVar, inputVar, point });
          const rendered = renderSymTF(G);
          out.latex = rendered.toKaTeX();
          out.summary = [["G(s)", rendered.toFormulaString()]];
        } catch (symErr) {
          // f has a transcendental term (sin, √, exp, …) the symbolic core can't
          // differentiate. Fall back to a numeric first-order linearization, which
          // works whenever the operating point fixes every constant to a number.
          const r = numericLinearize(inp.f, stateVar, inputVar, point);
          if (!r.ok) { out.ok = false; out.note = r.note || symErr.message; break; }
          out.latex = `G(s) = ${tfLatex([r.B], [1, -r.A])}`;
          out.summary = [
            ["G(s)", formatTf([r.B], [1, -r.A])],
            [`∂f/∂${stateVar} (pole = ${plain(r.A)})`, plain(r.A)],
            [`∂f/∂${inputVar} (gain)`, plain(r.B)],
          ];
        }
        break;
      }
      case "symbolic_equiv": {
        const r = symbolicEquivTest(inp.ref, optionsText);
        if (!r.ok) { out.ok = false; out.note = r.error; break; }
        out.latex = r.canonicalLatex;
        out.summary = [["simplified", r.canonicalFormula]];
        out.options = r.options;
        out.note = r.options.length
          ? null
          : "Paste the candidate answers in the options box to test them against this TF.";
        break;
      }
      case "plot_tf": {
        const G = parseTf(inp.G);
        out.tf = inp.G;            // string echo for contextual buttons
        out.plotData = buildPlotData(G);
        out.summary = [["poles", G.poles().map((p) => `${p.re.toPrecision(4)}${p.im >= 0 ? "+" : ""}${p.im.toPrecision(4)}j`).join(", ")]];
        break;
      }
      case "evaluate_gjw": {
        const G = parseTf(inp.G);
        out.tf = inp.G;
        const rows = [];
        const w = fnum(inp.omega);
        if (w != null) {
          const p = evalFreqPoint(G, w);
          out.latex = `|G(j${fmt(w)})| = ${fmt(p.mag_dB)}\\text{ dB},\\ \\angle G = ${fmt(p.phase_deg)}^\\circ`;
          rows.push(
            ["|G(jω)| (dB)", plain(p.mag_dB)], ["|G(jω)| (linear)", plain(p.mag)],
            ["∠G(jω) (°)", plain(p.phase_deg)],
            ["G(jω)", `${plain(p.re)} ${p.im >= 0 ? "+" : "-"} ${plain(Math.abs(p.im))}j`],
          );
        }
        const mTarget = fnum(inp.target_mag_dB);
        if (mTarget != null) {
          const wm = findOmegaForMagDb(G, mTarget);
          rows.push([`ω where |G| = ${plain(mTarget)} dB`, Number.isFinite(wm) ? plain(wm) : "—"]);
        }
        const pTarget = fnum(inp.target_phase_deg);
        if (pTarget != null) {
          const wp = findOmegaForPhaseDeg(G, pTarget);
          rows.push([`ω where ∠G = ${plain(pTarget)}°`, Number.isFinite(wp) ? plain(wp) : "—"]);
        }
        if (!rows.length) { out.ok = false; out.note = "Enter a frequency ω, or a target magnitude/phase to solve for ω."; break; }
        out.summary = rows;
        break;
      }
      case "second_order_from_plot": {
        const r = secondOrderFromReadoff(inp);
        if (!Object.keys(r).length) { out.ok = false; out.note = "Enter the steady & peak values (for ζ) and/or a period or peak time (for ω)."; break; }
        out.latex = [r.zeta != null ? `\\zeta=${fmt(r.zeta)}` : null, r.omega_n != null ? `\\omega_n=${fmt(r.omega_n)}` : null].filter(Boolean).join(",\\ ") || null;
        out.summary = [];
        if (r.Mp != null) out.summary.push(["Mp", plain(r.Mp)], ["Mp (%)", plain(r.Mp_pct)]);
        if (r.zeta != null) out.summary.push(["ζ", plain(r.zeta)]);
        if (r.omega_d != null) out.summary.push(["ω_d", plain(r.omega_d)]);
        if (r.omega_n != null) out.summary.push(["ω_n", plain(r.omega_n)]);
        out.options = optionsText ? matchOptions({ value: r.omega_n ?? r.zeta ?? r.Mp, kind: "NUMBER" }, optionsText) : null;
        break;
      }
      case "value_theorems": {
        const F = parseTf(inp.F);
        const r = valueTheorems(F.num, F.den, inp.input || "none");
        out.latex = `y(0^+) = ${fmt(r.initial_value)},\\ y(\\infty) = ${fmt(r.final_value)}`;
        out.summary = [["y(0⁺) — initial value", plain(r.initial_value)], ["y(∞) — final value", plain(r.final_value)]];
        out.options = optionsText ? matchOptions({ value: r.final_value, kind: "NUMBER" }, optionsText) : null;
        break;
      }
      case "matlab_time_response": {
        out.matlab = matlabTimeResponse(inp.Gs, inp.input || "step", inp.U_custom || "");
        out.note = "Run this in MATLAB for the closed-form y(t) (and its initial/final values).";
        break;
      }
      case "matlab_linearize": {
        out.matlab = matlabLinearize(inp.f, (inp.stateVar || "x").trim(), (inp.inputVar || "u").trim(), inp.point || "");
        out.note = "Run this in MATLAB. Handles sin/√/exp; the comment shows the recipe for a higher-order ODE.";
        break;
      }
      case "matlab_param_stability": {
        out.matlab = matlabParamStability(inp.expr, (inp.param || "w").trim());
        out.note = "Run this in MATLAB to get the stability region in the parameter.";
        break;
      }
      default:
        out.ok = false; out.note = `Solver ${fn} not available.`;
    }
  } catch (e) {
    out.ok = false;
    out.note = `Could not solve: ${e.message}`;
  }
  return out;
}

function piLead(out, inp, optionsText, matchKey) {
  const u = inp.unknown || "alpha";
  if (u === "alpha") {
    const a = solvePiLead({ unknown: "alpha", gamma_M_deg: fnum(inp.gamma_M_deg), phi_G_deg: fnum(inp.phi_G_deg), N_i: fnum(inp.N_i) });
    dictResult(out, { alpha: a, M_D: 1 / Math.sqrt(a), M_D_dB: 20 * Math.log10(1 / Math.sqrt(a)) }, matchKey || "alpha", optionsText);
  } else if (u === "Ni") {
    numResult(out, "N_i", solvePiLead({ unknown: "Ni", gamma_M_deg: fnum(inp.gamma_M_deg), phi_G_deg: fnum(inp.phi_G_deg), alpha: fnum(inp.alpha) }), optionsText);
  } else if (u === "KP") {
    numResult(out, "K_P", solvePiLead({ unknown: "KP", G: parseTf(inp.G), gamma_M_deg: fnum(inp.gamma_M_deg), alpha: fnum(inp.alpha), N_i: fnum(inp.N_i) }), optionsText);
  } else if (u === "beta") {
    numResult(out, "\\beta", solveLagBeta({ gamma_M_deg: fnum(inp.gamma_M_deg), phi_G_deg: fnum(inp.phi_G_deg), alpha: fnum(inp.alpha), N_i: fnum(inp.N_i) }).beta, optionsText);
  } else if (u === "design") {
    const d = solvePiLeadDesign({ G: parseTf(inp.G), omega_c: fnum(inp.omega_c), gamma_M_deg: fnum(inp.gamma_M_deg), N_i: fnum(inp.N_i) });
    out.latex = `\\alpha=${fmt(d.alpha)},\\ K_P=${fmt(d.K_P)}`;
    out.summary = [["α", plain(d.alpha)], ["K_P", plain(d.K_P)], ["τ_i", plain(d.tau_i)], ["τ_d", plain(d.tau_d)], ["φ_G (°)", plain(d.phi_G_deg)]];
  }
}

// ---- result + matching helpers ----
function tfResult(out, G) {
  out.latex = tfLatex(G.num, G.den);
  out.summary = [["poles", G.poles().map(cplxStr).join(", ")]];
  try { out.summary.push(["DC gain", plain(G.dcGain())]); } catch { /* integrator */ }
}
function noMatchNote(out) {
  if (out.options && out.options.length && !out.options.some((o) => o.flag === "match" || o.flag === "also_plausible")) {
    out.note = "The computed value isn't close to any listed option — double-check your inputs (units, α, N_i, the read-off values).";
  }
}
function numResult(out, label, value, optionsText) {
  out.latex = `${label} = ${fmt(value)}`;
  out.summary = [[label, plain(value)]];
  out.options = optionsText ? matchOptions({ value, kind: "NUMBER" }, optionsText) : null;
  noMatchNote(out);
}
function dictResult(out, dict, key, optionsText) {
  out.latex = `${key.replace(/_/g, "\\_")} = ${fmt(dict[key])}`;
  out.summary = Object.entries(dict).map(([k, v]) => [k, plain(v)]);
  out.options = optionsText ? matchOptions({ value: dict, kind: "DICT" }, optionsText, key) : null;
  out.matchedKey = key;
  noMatchNote(out);
}
function matchTfOpts(tf, optionsText) {
  return optionsText ? matchOptions({ value: tf, kind: "TF" }, optionsText) : null;
}
function flagRange(range, optionsText) {
  if (!optionsText) return null;
  const opts = optionsText.split("\n").filter(Boolean).map((t) => ({ raw_text: t, flag: "no_match", note: "" }));
  return applyStableRangeMatch("solve_stable_K_range", range, opts);
}

// Clean up a transfer function the way a student actually types or pastes it,
// so it parses: drop a leading "G(s) =" label, turn unicode minus/×/÷ and
// superscripts (s² → s**2) into ASCII, and fix fullwidth parens and odd spaces.
// A no-op on already-valid input, so it's safe to apply everywhere.
const SUPERSCRIPT = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
export function normalizeTfInput(str) {
  let s = String(str ?? "");
  s = s.replace(/^\s*[A-Za-z]{1,3}\s*\(\s*s\s*\)\s*=\s*/, ""); // strip "G(s) =", "L(s)=", …
  s = s.replace(/[−–—‐‑‒―]/g, "-"); // unicode minus / dashes
  s = s.replace(/[×⋅∗·]/g, "*").replace(/÷/g, "/"); // ×, ·, ∗ → *  ÷ → /
  s = s.replace(/（/g, "(").replace(/）/g, ")"); // fullwidth parens
  s = s.replace(/[⁰¹²³⁴-⁹]+/g, (m) => "**" + [...m].map((c) => SUPERSCRIPT[c]).join("")); // s² → s**2
  s = s.replace(/[     ]/g, " "); // exotic spaces → normal
  return s.trim();
}

// ---- dashboard orchestration (re-surfacing the existing solvers) ----

// Highest-degree-first coeff array -> readable "a s^2 + b s + c".
export function formatTf(num, den) {
  const poly = (coeffs) => {
    const n = coeffs.length - 1;
    const parts = [];
    coeffs.forEach((c, i) => {
      const p = n - i;
      if (Math.abs(c) < 1e-12) return;
      const cc = Number(c.toPrecision(6));
      const abscc = Math.abs(cc);
      const mag = abscc === 1 && p !== 0 ? "" : `${abscc}`;
      const unsignedMono = p === 0 ? `${abscc}` : p === 1 ? `${mag}s` : `${mag}s^${p}`;
      if (parts.length === 0) {
        parts.push(cc < 0 ? `-${unsignedMono}` : unsignedMono);
      } else {
        parts.push(cc < 0 ? ` - ${unsignedMono}` : ` + ${unsignedMono}`);
      }
    });
    return parts.join("") || "0";
  };
  const wrap = (s) => (s.includes(" ") ? `(${s})` : s);
  if (den.length === 1) {
    return den[0] === 1 ? poly(num) : `${wrap(poly(num))} / ${den[0]}`;
  }
  const ds = poly(den);
  const ns = poly(num);
  const denStr = ds.includes(" ") ? `(${ds})` : ds;
  return `${wrap(ns)} / ${denStr}`;
}

const cplxList = (arr) =>
  [...arr].sort((a, b) => a.re - b.re || a.im - b.im)
    .map((p) => (Math.abs(p.im) < 1e-9 ? `${Number(p.re.toPrecision(4))}` : `${Number(p.re.toPrecision(4))}${p.im >= 0 ? "+" : "-"}${Number(Math.abs(p.im).toPrecision(4))}j`)).join(", ");

// type N = number of poles at the origin; order = #poles.
function typeOrder(G) {
  const poles = G.poles();
  return { order: poles.length, type: poles.filter((p) => p.abs() < 1e-6).length };
}

const guard = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };

// True when the expression contains a literal parameter (any letter other than s).
export function isSymbolicTf(str) {
  const cleaned = String(str).toLowerCase().replace(/\s+/g, "").replace(/[0-9s^+\-*/().]/g, "");
  return cleaned.length > 0;
}

export function analyzeSymbolic(GstrIn) {
  const Gstr = normalizeTfInput(GstrIn);
  let L;
  try { L = parseExprToTF(Gstr); } catch (e) { return { error: e.message }; }
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  // Like ratStr but omits parens around single-term numerator/denominator.
  const symStr = (rf) => {
    if (rf === Infinity) return "∞";
    const ns = rf.num.toString();
    const ds = rf.den.toString();
    if (rf.den.isConstant()) return ns;
    const needsNParen = ns.includes("+") || ns.includes("-");
    const needsDParen = ds.includes("+") || ds.includes("-");
    return `${needsNParen ? `(${ns})` : ns} / ${needsDParen ? `(${ds})` : ds}`;
  };
  const num = L.num, den = L.den;
  const tN = num.length - 1, tD = den.length - 1;

  // Cheap, simplification-free "system" read-outs (no multivariate GCD) — these
  // are instant on any input and answer the common system questions directly.
  let type = 0; while (type < den.length && den[type].isZero()) type++;
  const out = {
    error: null,
    interpreted: safe(() => renderSymTF(L).toFormulaString()),
    // y(0⁺) = lim_{s→∞}G (leading-coeff ratio); G(0) = y(∞) for a unit step.
    dcGain: safe(() => (den[0].isZero() ? "∞" : symStr(new RatFunc(num[0], den[0])))),
    initialValue: safe(() => (tN < tD ? "0" : tN > tD ? "∞" : symStr(new RatFunc(num[tN], den[tD])))),
    type,
    order: tD,
    closedLoop: null, K0: null, essStep: null, essRamp: null, loopHeavy: false,
  };

  // The "loop gain" read-outs need symbolic simplification (closed loop doubles
  // the degree, then a multivariate GCD runs). That blows up on large, many-
  // parameter TFs and would freeze the synchronous UI on every keystroke — so
  // gate them: only compute when the TF is small enough to stay snappy.
  const nSym = new Set([...num, ...den].flatMap((m) => [...m.vars()])).size;
  if (nSym > 2 && tD > 2) { out.loopHeavy = true; return out; }

  out.closedLoop = safe(() => renderSymTF(feedback(L)).toFormulaString());
  out.K0 = safe(() => symStr(staticGain(L)));
  out.essStep = safe(() => symStr(essStep(L)));
  out.essRamp = safe(() => symStr(essRamp(L)));
  return out;
}

export function analyzeNumeric(GstrIn) {
  const Gstr = normalizeTfInput(GstrIn);
  let G;
  try { G = parseTf(Gstr); } catch (e) { return { error: e.message }; }

  const c = guard(() => characterizeTf(G), {});
  const to = guard(() => typeOrder(G), { order: null, type: null });
  const dc = guard(() => G.dcGain(), null);
  const m = guard(() => solveMargins(G), null);
  const ess = guard(() => solveEssTable(G), null);
  const settle = guard(() => dominantSettling(G), null);

  return {
    error: null,
    interpreted: guard(() => formatTf(G.num, G.den), Gstr),
    dcGain: to.type > 0 ? Infinity : dc,
    dcGain_dB: to.type > 0 ? Infinity : (dc != null && dc > 0 ? 20 * Math.log10(dc) : null),
    type: to.type,
    order: to.order,
    poles: guard(() => cplxList(G.poles()), null),
    zeros: guard(() => cplxList(G.zeros()) || "none", "none") || "none",
    initialValue: c.initial_value ?? null,
    finalValue: to.type > 0 ? Infinity : dc,
    zeta: c.is_second_order ? (c.zeta ?? null) : null,
    omega_n: c.is_second_order ? (c.omega_n ?? null) : null,
    bandwidth: guard(() => bandwidth(G), null),
    settling: settle ? settle.t_s_2pct : null,
    margins: m,
    ess,
    stable: guard(() => !G.poles().some((p) => p.re > 1e-9), null),
  };
}
