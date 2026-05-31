// LCD1 engine for the Electron app. Wraps the parity-verified solver modules
// (in ./spike) behind one solveQuestion(text) call: route -> solve -> match.
import { parseTf } from "./spike/numeric/parse.js";
import { solveMargins, solveStableKRange } from "./spike/solvers/p3.js";
import { solve2ndOrder, solveKForSpec } from "./spike/solvers/p4.js";
import { solveKPFromEss, solveEssTable } from "./spike/solvers/p5.js";
import { solvePiLead, solvePForPM, solvePiLeadDesign, solveLagBeta } from "./spike/solvers/p6.js";
import { solveNestedEss, pickFeedforwardForm } from "./spike/solvers/p7.js";
import { parseQuestion } from "./spike/smart-paste.js";
import { matchOptions, applyStableRangeMatch } from "./spike/match.js";

const PRETTY = {
  solve_stable_K_range: "P3 · Stable-K range",
  solve_margins: "P3 · Gain/phase margins",
  solve_P_for_PM: "P6 · P-controller for phase margin",
  solve_ess_table: "P5 · Steady-state error",
  solve_KP_from_ess: "P5 · K_P from steady-state error",
  solve_pi_lead: "P6 · PI-Lead / Lead-Lag design",
  pick_feedforward_form: "P7 · Feed-forward form",
  solve_nested_ess: "P7 · Nested-loop steady-state error",
  compose_tf_from_bode: "P2 · Bode read-off composition",
  solve_closed_loop_2nd_order: "P4 · Second-order specs",
  solve_ode_to_tf: "P1 · ODE → transfer function",
  solve_state_space_to_tf: "P1 · State-space → transfer function",
  reduce_block_diagram: "P1 · Block-diagram reduction",
};

const fmt = (x) => {
  if (x === Infinity) return "\\infty";
  if (x === -Infinity) return "-\\infty";
  if (Number.isNaN(x)) return "\\text{NaN}";
  if (typeof x !== "number") return String(x);
  return String(Number(x.toPrecision(6)));
};
const numOrNull = (v) => (v === undefined || v === null ? null : Number(v));

function tfLatex(G) {
  const term = (coeffs) => {
    const n = coeffs.length - 1;
    const parts = [];
    coeffs.forEach((c, i) => {
      const p = n - i;
      if (Math.abs(c) < 1e-12) return;
      const cc = Number(c.toPrecision(6));
      const mono = p === 0 ? `${cc}` : p === 1 ? `${cc === 1 ? "" : cc}s` : `${cc === 1 ? "" : cc}s^{${p}}`;
      parts.push((parts.length && c > 0 ? "+" : "") + mono);
    });
    return parts.join("") || "0";
  };
  return `\\dfrac{${term(G.num)}}{${term(G.den)}}`;
}

/**
 * Route + solve a pasted exam question.
 * Returns { ok, routedTo, prettyName, inputs, summary:[[label,latex]], latex, options:[{raw_text,flag,note}], note }.
 */
export function solveQuestion(text) {
  const r = parseQuestion(text);
  if (!r) return { ok: false, note: "Could not match this question to a solver pattern." };

  const out = {
    ok: true,
    routedTo: r.solver_function,
    prettyName: PRETTY[r.solver_function] || r.solver_function,
    inputs: r.inputs,
    summary: [],
    latex: null,
    options: null,
    note: null,
  };
  const i = r.inputs;
  const G = () => parseTf(i.G);

  try {
    switch (r.solver_function) {
      case "solve_stable_K_range": {
        const { low, high } = solveStableKRange(G());
        out.latex = `K \\in (${fmt(low)},\\ ${fmt(high)})`;
        out.summary = [["K_{low}", fmt(low)], ["K_{high}", fmt(high)]];
        out.options = flagStableRange([low, high], r.options);
        break;
      }
      case "solve_margins": {
        const m = solveMargins(G());
        out.latex = `\\mathrm{GM}=${fmt(m.GM)}\\ (${fmt(m.GM_dB)}\\,\\mathrm{dB}),\\quad \\mathrm{PM}=${fmt(m.PM_deg)}^\\circ`;
        out.summary = [["GM", `${fmt(m.GM)} (${fmt(m.GM_dB)} dB)`], ["PM", `${fmt(m.PM_deg)}°`], ["\\omega_{pc}", fmt(m.omega_pc)], ["\\omega_{gc}", fmt(m.omega_gc)]];
        out.options = matchDict(m, "GM", r.options);
        break;
      }
      case "solve_P_for_PM": {
        if (!i.G || i.target_PM_deg === undefined) { out.note = "Need a plant G(s) and a target phase margin."; break; }
        const res = solvePForPM(G(), Number(i.target_PM_deg));
        out.latex = `K_P=${fmt(res.K_P)},\\quad \\omega_c=${fmt(res.omega_c)}`;
        out.summary = [["K_P", fmt(res.K_P)], ["\\omega_c", fmt(res.omega_c)]];
        out.options = matchNum(res.K_P, r.options);
        break;
      }
      case "solve_ess_table": {
        const t = solveEssTable(G());
        out.latex = `\\text{type }${t.type},\\quad e_{ss}^{step}=${fmt(t.ess_step)}`;
        out.summary = [["type", t.type], ["e_{ss} step", fmt(t.ess_step)], ["e_{ss} ramp", fmt(t.ess_ramp)], ["e_{ss} parabola", fmt(t.ess_parabola)]];
        out.options = matchDict(t, r.match_key || "ess_step", r.options);
        break;
      }
      case "solve_KP_from_ess": {
        if (i.G0 === undefined || i.ess_target === undefined) { out.note = "Need G(0) and the target steady-state error in the text."; break; }
        const kp = solveKPFromEss(Number(i.G0), i.G0_unit, Number(i.ess_target));
        out.latex = `K_P=${fmt(kp)}`;
        out.summary = [["K_P", fmt(kp)]];
        out.options = matchNum(kp, r.options);
        break;
      }
      case "solve_pi_lead": {
        solvePiLeadCase(out, i, r);
        break;
      }
      case "pick_feedforward_form": {
        const ff = pickFeedforwardForm({ n_lags: numOrNull(i.n_lags) ?? 3 });
        out.latex = ff.formula_latex;
        out.summary = [["option", ff.option_label], ["filter order", ff.filter_order], ["bound", ff.tau_f_bound]];
        out.options = matchPick(r.options);
        break;
      }
      case "solve_closed_loop_2nd_order": {
        secondOrderCase(out, i, r);
        break;
      }
      case "reduce_block_diagram":
        out.note = "This is a block-diagram reduction — switch to Block Diagram mode and draw it.";
        break;
      case "solve_ode_to_tf":
      case "solve_state_space_to_tf":
        out.note = "Routed to a P1 model solver. Enter the coefficients/matrices directly (text auto-extraction for P1 is pending).";
        break;
      case "solve_nested_ess":
      case "compose_tf_from_bode":
        out.note = "Routed correctly, but this solver needs numeric parameters not present in the prose. Use the direct inputs.";
        break;
      default:
        out.note = `Routed to ${r.solver_function} (not handled).`;
    }
  } catch (e) {
    out.note = `Routed, but could not solve from the given data: ${e.message}`;
  }
  return out;
}

function solvePiLeadCase(out, i, r) {
  const unknown = i.unknown;
  if (unknown === "alpha" && i.phi_G_deg !== undefined) {
    const a = solvePiLead({ unknown: "alpha", gamma_M_deg: numOrNull(i.gamma_M_deg), phi_G_deg: numOrNull(i.phi_G_deg), N_i: numOrNull(i.N_i) });
    out.latex = `\\alpha=${fmt(a)},\\quad M_D=${fmt(1 / Math.sqrt(a))}`;
    out.summary = [["\\alpha", fmt(a)], ["M_D", fmt(1 / Math.sqrt(a))], ["M_D (dB)", fmt(20 * Math.log10(1 / Math.sqrt(a)))]];
    out.options = matchNum(a, r.options);
  } else if (unknown === "Ni") {
    const n = solvePiLead({ unknown: "Ni", gamma_M_deg: numOrNull(i.gamma_M_deg), phi_G_deg: numOrNull(i.phi_G_deg), alpha: numOrNull(i.alpha) });
    out.latex = `N_i=${fmt(n)}`;
    out.summary = [["N_i", fmt(n)]];
    out.options = matchNum(n, r.options);
  } else if (unknown === "KP" && i.G) {
    const kp = solvePiLead({ unknown: "KP", G: parseTf(i.G), gamma_M_deg: numOrNull(i.gamma_M_deg), alpha: numOrNull(i.alpha), N_i: numOrNull(i.N_i) });
    out.latex = `K_P=${fmt(kp)}`;
    out.summary = [["K_P", fmt(kp)]];
    out.options = matchNum(kp, r.options);
  } else if (unknown === "design" && i.G) {
    const d = solvePiLeadDesign({ G: parseTf(i.G), omega_c: numOrNull(i.omega_c), gamma_M_deg: numOrNull(i.gamma_M_deg), N_i: numOrNull(i.N_i) });
    out.latex = `\\alpha=${fmt(d.alpha)},\\ K_P=${fmt(d.K_P)}`;
    out.summary = [["\\alpha", fmt(d.alpha)], ["K_P", fmt(d.K_P)], ["\\tau_i", fmt(d.tau_i)], ["\\tau_d", fmt(d.tau_d)], ["\\phi_G", `${fmt(d.phi_G_deg)}°`]];
  } else if (unknown === "beta" && i.phi_G_deg !== undefined) {
    const b = solveLagBeta({ gamma_M_deg: numOrNull(i.gamma_M_deg), phi_G_deg: numOrNull(i.phi_G_deg), alpha: numOrNull(i.alpha), N_i: numOrNull(i.N_i) });
    out.latex = `\\beta=${fmt(b.beta)}`;
    out.summary = [["\\beta", fmt(b.beta)]];
    out.options = matchNum(b.beta, r.options);
  } else {
    out.note = "PI-Lead routed. Provide φ_G (read off the Bode plot at ω_c) and γ_M to close the phase budget.";
  }
}

function secondOrderCase(out, i, r) {
  // The common form: a closed loop K/(s^2+...+K) with an overshoot/zeta spec asking for K.
  if (i.given_kind === "Mp" && /K/.test(i.closed_loop_str || "")) {
    // Recast K/(s(s+a)) open loop from the closed loop if possible; fall back to spec note.
    out.note = "Second-order K-for-overshoot — use the stable-K / K-for-spec entry with the open-loop plant.";
    return;
  }
  out.note = "Second-order metrics routed. Provide the closed-loop TF and one known metric to fill the table.";
}

// ---- option matching helpers ----
const toResult = (value, kind) => ({ value, kind });
function matchNum(value, optionsText) {
  if (!optionsText) return null;
  return matchOptions(toResult(value, "NUMBER"), optionsText);
}
function matchDict(value, key, optionsText) {
  if (!optionsText) return null;
  return matchOptions(toResult(value, "DICT"), optionsText, key);
}
function matchPick(optionsText) {
  if (!optionsText) return null;
  return matchOptions(toResult(null, "PICK"), optionsText);
}
function flagStableRange(range, optionsText) {
  if (!optionsText) return null;
  const opts = optionsText.split("\n").filter(Boolean).map((t) => ({ raw_text: t, flag: "no_match", note: "" }));
  return applyStableRangeMatch("solve_stable_K_range", range, opts);
}

export { PRETTY };
