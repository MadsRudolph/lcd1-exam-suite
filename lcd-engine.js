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
import { solveOdeToTf, solveStateSpaceToTf } from "./spike/solvers/p1.js";
import { composeTfFromBode } from "./spike/solvers/p2.js";
import { parseQuestion } from "./spike/smart-paste.js";
import { matchOptions, applyStableRangeMatch } from "./spike/match.js";
import { formByFn } from "./lcd-forms.js";

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
      case "solve_stable_K_range": {
        const { low, high } = solveStableKRange(parseTf(inp.G));
        out.latex = `K \\in (${fmt(low)},\\ ${fmt(high)})`;
        out.summary = [["K_low", plain(low)], ["K_high", plain(high)]];
        out.options = flagRange([low, high], optionsText);
        break;
      }
      case "solve_margins": {
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
