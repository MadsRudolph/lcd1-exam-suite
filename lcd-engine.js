// LCD1 engine for the Electron app. Two entry points used by the UI:
//   routeQuestion(text)  -> { fn, inputs, options, match_key }  (Smart Paste pre-fill)
//   runSolver(fn, inputs, optionsText, matchKey) -> normalized result
// Both sit on the parity-verified solver modules in ./spike.
import { parseTf } from "./spike/numeric/parse.js";
import { solveMargins, solveStableKRange } from "./spike/solvers/p3.js";
import { solve2ndOrder, solveKForSpec, solveClosedLoop2ndOrder } from "./spike/solvers/p4.js";
import { solveKPFromEss, solveEssTable } from "./spike/solvers/p5.js";
import { solvePiLead, solvePForPM, solvePiLeadDesign, solveLagBeta } from "./spike/solvers/p6.js";
import { solveNestedEss, pickFeedforwardForm } from "./spike/solvers/p7.js";
import { bandwidth, dominantSettling, analyzeStability, characterizeTf } from "./spike/solvers/analysis.js";
import { buildPlotData } from "./spike/solvers/plotdata.js";
import { solveOdeToTf, solveStateSpaceToTf } from "./spike/solvers/p1.js";
import { composeTfFromBode } from "./spike/solvers/p2.js";
import { parseQuestion } from "./spike/smart-paste.js";
import { matchOptions, applyStableRangeMatch } from "./spike/match.js";
import { symbolicEquivTest } from "./symbolic/equiv.js";
import { parseExprToTF } from "./symbolic/parse-expr.js";
import { order as symOrder, systemType, staticGain } from "./symbolic/analysis.js";
import { essStep, essRamp, essDisturbanceStep } from "./symbolic/ess.js";
import { solveForSymbol } from "./symbolic/solve-symbol.js";
import { linearizeFirstOrder } from "./symbolic/linearize.js";
import { feedback } from "./symbolic/combinators.js";
import { renderSymTF } from "./symbolic/render.js";
import { formByFn } from "./lcd-forms.js";

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

// ---- routing (Smart Paste pre-fill) ----
export function routeQuestion(text) {
  const r = parseQuestion(text);
  if (!r) return null;
  return { fn: r.solver_function, inputs: r.inputs || {}, options: r.options || "", match_key: r.match_key || null };
}

// ---- core solve ----
export function runSolver(fn, inp = {}, optionsText = "", matchKey = null) {
  const form = formByFn(fn);
  const out = {
    ok: true, fn, prettyName: form ? `${form.pattern} · ${form.title.replace(/^P\d+ — /, "")}` : fn,
    resultKind: form ? form.resultKind : "NUMBER", dictKeys: form ? form.dictMatchKeys : null,
    latex: null, summary: [], options: null, note: null,
  };
  try {
    switch (fn) {
      case "solve_ode_to_tf": {
        const G = solveOdeToTf(flist(inp.y_coeffs), flist(inp.u_coeffs));
        tfResult(out, G);
        break;
      }
      case "solve_state_space_to_tf": {
        const G = solveStateSpaceToTf(fmatrix(inp.A), fmatrix(inp.B), fmatrix(inp.C), fmatrix(inp.D));
        tfResult(out, G);
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
        dictResult(out, r, matchKey || "zeta", optionsText);
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
        dictResult(out, solveEssTable(parseTf(inp.G)), matchKey || "ess_step", optionsText);
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
        const polesStr = c.poles.map((p) => `${plain(p.re)}${p.im >= 0 ? "+" : "-"}${plain(Math.abs(p.im))}j`).join(", ");
        out.summary = [["poles", polesStr], ["DC gain", plain(c.dc_gain)],
          ["y(0⁺) step (init. value)", plain(c.initial_value)],
          ["y(∞) step (final value)", plain(c.dc_gain)]];
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
        const G = linearizeFirstOrder({
          f: inp.f,
          stateVar: (inp.stateVar || "x").trim(),
          inputVar: (inp.inputVar || "u").trim(),
          point: parsePoint(inp.point),
        });
        const rendered = renderSymTF(G);
        out.latex = rendered.toKaTeX();
        out.summary = [["G(s)", rendered.toFormulaString()]];
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
  out.summary = [["poles", G.poles().map((p) => `${plain(p.re)}${p.im >= 0 ? "+" : "-"}${plain(Math.abs(p.im))}j`).join(", ")]];
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
