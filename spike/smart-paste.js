// Smart Paste: offline exam-question parser and router.
// JS port of lcd1-solver/lcd_solver/ui/smart_paste.py (pure parsing logic only;
// the PyQt widget is dropped). Detects transfer functions, spec constraints and
// multiple-choice options from pasted text via deterministic regex + keywords,
// then routes to the right solver. Solver names match the Python for parity.
import { parseTf } from "./numeric/parse.js";

const DASHES = { "−": "-", "–": "-", "—": "-", "‐": "-", "‑": "-", "‒": "-", "―": "-", "⁃": "-" };
const TF_CHARS = new Set("0123456789sKPj.+-*/()^ \t".split(""));

const normalizeDashes = (text) => text.replace(/[−–—‐‑‒―⁃]/g, (c) => DASHES[c] || "-");

function extractNumber(text, pattern, flags = "i") {
  const m = new RegExp(pattern, flags).exec(text);
  if (m) {
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) return v;
  }
  return null;
}

// ---- transfer-function extraction --------------------------------------
const TF_LABEL = "(?:G_?ol|G|L|P|H|T)\\s*\\(\\s*s\\s*\\)";

function takeExpr(s) {
  const out = [];
  for (const ch of s.trim()) {
    if (TF_CHARS.has(ch)) out.push(ch);
    else break;
  }
  return out.join("").replace(/^[ .\t]+|[ .\t]+$/g, "");
}

function looksLikeMath(s) {
  if (!/^[\s0-9sKPj.+\-*/()^]+$/.test(s)) return false;
  return /\d/.test(s) || s.includes("s");
}

function splitFlattenedFraction(cand) {
  if (cand.includes("/")) return cand;
  let m = /\)\s+\(/.exec(cand); // (a) factored numerator
  let num, den;
  if (m) {
    num = cand.slice(0, m.index + 1).trim();
    den = cand.slice(m.index + m[0].length - 1).trim();
  } else if (/^\d+(?:\.\d+)?\s+\(/.test(cand)) {
    // (b) constant numerator over a parenthesised product
    m = /^(\d+(?:\.\d+)?)\s+(\(.+)$/.exec(cand);
    num = m[1];
    den = m[2];
  } else {
    // (c) polynomial restart at the s^2 term
    m = /\s+(s(?:[2-9]|\*\*|\^))/.exec(cand);
    if (!(m && m.index > 0)) return cand;
    num = cand.slice(0, m.index).trim();
    den = cand.slice(m.index).trim();
  }
  return num && den ? `(${num})/(${den})` : cand;
}

function finalizeTf(candIn) {
  let cand = candIn.trim().replace(/\.+$/, "").trim();
  if (!cand) return null;
  // Drop a leading proportional gain factor.
  cand = cand.replace(/^\s*K_?[Pp]?\s*\*?\s*\//, "1/");
  cand = cand.replace(/^\s*K_?[Pp]?\s*\*\s*/, "");
  cand = splitFlattenedFraction(cand);
  // Flattened superscripts: s3 -> s**3 (digit must hug the s).
  cand = cand.replace(/(?<![A-Za-z_])s(\d+)/g, "s**$1");
  try {
    const G = parseTf(cand); // throws on unknown symbols (e.g. residual K)
    void G;
  } catch {
    return null;
  }
  return cand;
}

export function extractTf(textIn) {
  const text = normalizeDashes(textIn);
  const lines = text.split(/\r?\n/);

  // Inline: label = <expr on the same line>.
  let m = new RegExp(TF_LABEL + "\\s*=[ \\t]*(\\S[^\\n]*)", "i").exec(text);
  if (m) {
    const tf = finalizeTf(takeExpr(m[1]));
    if (tf) return tf;
  }

  // Multi-line: label '=' at end of a line, expression on following lines.
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(TF_LABEL + "\\s*=\\s*$", "i").test(lines[i].trim())) {
      const mathLines = [];
      for (const nxt of lines.slice(i + 1)) {
        const s = nxt.trim();
        if (!s) continue;
        if (looksLikeMath(s)) {
          mathLines.push(s);
          if (mathLines.length >= 2) break;
        } else break;
      }
      if (mathLines.length >= 2) {
        const tf = finalizeTf(`(${mathLines[0]})/(${mathLines[1]})`);
        if (tf) return tf;
      }
      if (mathLines.length === 1) {
        const tf = finalizeTf(mathLines[0]);
        if (tf) return tf;
      }
    }
  }

  // Generic fraction anywhere.
  m = /([A-Za-z0-9_]+\s*\/\s*\([^\n]+\))/.exec(text);
  if (m) {
    const tf = finalizeTf(takeExpr(m[1]));
    if (tf) return tf;
  }
  return null;
}

// ---- options ------------------------------------------------------------
function valueFrom(bodyIn) {
  let body = bodyIn.split(/\s\((?=[A-Za-z])/)[0];
  body = body.split(/\b(?:correct|wrong|false|true)\b/i)[0];
  const m = /(-?\d+(?:\.\d+)?)\s*(dB)?/i.exec(body);
  if (!m) return null;
  return m[1] + (m[2] ? " dB" : "");
}

export function extractOptions(textIn) {
  const text = normalizeDashes(textIn);
  // Strategy 1: inline labels "a) .. b) .." on one line.
  const inline = [...text.matchAll(/(?:(?<=\s)|^)([a-eA-E1-9])[)\.\:]\s+(.*?)(?=(?:\s+[a-eA-E1-9][)\.\:]\s)|$)/g)];
  const vals1 = inline.map((mm) => valueFrom(mm[2])).filter(Boolean);
  if (vals1.length >= 3) return vals1.join("\n");

  // Strategy 2: one option per line.
  const vals = [];
  for (const ln of text.split(/\r?\n/)) {
    const s = ln.trim();
    if (!s || /^(options|facit|answer|figure|page|solution|correct|wrong)\b/i.test(s)) continue;
    const m = /^[\(\[]?([a-eA-E1-9])[)\.\:\-]\s*(.+)$/.exec(s);
    if (m) {
      const v = valueFrom(m[2]);
      if (v) vals.push(v);
      continue;
    }
    if (s.length <= 26 && /^[a-z_]{0,8}\s*[=≈]?\s*-?\d+(?:\.\d+)?\s*(?:db|rad\/s|deg|°|%)?$/i.test(s)) {
      const v = valueFrom(s);
      if (v) vals.push(v);
    }
  }
  return vals.join("\n");
}

// ---- spec / parameter extraction ---------------------------------------
function extractTargetPM(text) {
  const pats = [
    "\\b(?:pm|phase margin|gamma_m|\\u03b3_?m)\\b[^0-9\\-]{0,12}=\\s*(\\d+(?:\\.\\d+)?)",
    "phase margin\\b[^0-9\\-]{0,12}(\\d+(?:\\.\\d+)?)\\s*(?:deg|degrees|\\u00b0)",
    "\\b(?:pm|gamma_m|\\u03b3_?m)\\b\\s*=\\s*(\\d+(?:\\.\\d+)?)",
    "phase margin\\b[^0-9\\-]{0,20}(\\d+(?:\\.\\d+)?)",
  ];
  for (const p of pats) {
    const v = extractNumber(text, p);
    if (v !== null) return v;
  }
  return null;
}

function piLeadUnknown(text) {
  const low = text.toLowerCase();
  if (/parameter\s*(?:β|beta)/.test(low) || /value of\s*(?:β|beta)/.test(low) ||
      /(?:β|beta)\s+of the lag/.test(low) || (low.includes("lag") && /\b(?:β|beta)\b/.test(low))) {
    return "beta";
  }
  if (/(?:α|alpha)\s+and\s+k_?p/.test(low) || /k_?p\s+and\s+(?:α|alpha)/.test(low)) return "design";
  if (/proportional gain\s*k_?p/.test(low) || /\bk_?p\b[^.\n]*\bis\b/.test(low) || /gain\s*k_?p\b/.test(low)) return "KP";
  if (/value of\s*n_?i/.test(low) || /\bn_?i\b\s*\?/.test(low)) return "Ni";
  return null;
}

function extractPiLead(text) {
  let wc = extractNumber(text, "\\b(?:omega_c|\\u03c9_?c|w_?c)\\b\\s*=\\s*(\\d+(?:\\.\\d+)?)");
  if (wc === null) wc = extractNumber(text, "\\|G(?:ol)?\\(\\s*(?:j\\s*\\*?\\s*)?(\\d+(?:\\.\\d+)?)(?:\\s*\\*?\\s*j)?\\s*\\)\\|\\s*=\\s*1");
  if (wc === null) wc = extractNumber(text, "crossover\\s+frequency\\b\\D{0,18}?(\\d+(?:\\.\\d+)?)\\s*rad");
  const td = extractNumber(text, "(\\d+(?:\\.\\d+)?)\\s*\\*?\\s*s\\s*\\+\\s*1\\s*\\)?\\s*/\\s*\\(?\\s*(?:\\u03b1|alpha|a)\\s*\\*?\\s*\\1\\s*\\*?\\s*s");
  let pm = extractNumber(text, "\\b(?:gamma_m|\\u03b3_?m)\\b\\s*=\\s*(\\d+(?:\\.\\d+)?)");
  if (pm === null) pm = extractTargetPM(text);
  const phiG = extractNumber(text, "\\b(?:phi_g|\\u03c6_?g)\\b\\s*=\\s*(-?\\d+(?:\\.\\d+)?)");

  const inputs = {};
  const unknown = piLeadUnknown(text);
  if (unknown) inputs.unknown = unknown;
  if (wc !== null) inputs.omega_c = String(wc);
  if (td !== null) inputs.tau_d = String(td);
  if (pm !== null) inputs.gamma_M_deg = pm;
  if (phiG !== null) inputs.phi_G_deg = String(phiG);
  if (unknown !== "alpha" && unknown !== "design") {
    const alpha = extractNumber(text, "(?:\\u03b1|alpha)\\s*=\\s*(\\d+(?:\\.\\d+)?)");
    if (alpha !== null) inputs.alpha = String(alpha);
  }
  const ni = extractNumber(text, "\\bN_?i\\b\\s*=\\s*(?:[^=\\n]*=\\s*)?(\\d+(?:\\.\\d+)?)");
  if (ni !== null) inputs.N_i = ni;
  if (unknown === "KP" || unknown === "design") {
    const plant = extractTf(text);
    if (plant) inputs.G = plant;
  }
  return inputs;
}

function askedMetric(low) {
  if (low.includes("damped frequency") || /\b(?:w_?d|omega_?d)\b/.test(low)) return "omega_d";
  if (low.includes("natural frequency") || /\b(?:w_?n|omega_?n)\b/.test(low)) return "omega_n";
  if (/\bgain\s+k\b/.test(low) || /value[^.]*\bof\s+k\b/.test(low)) return "K";
  if (low.includes("damping") || low.includes("zeta") || low.includes("ζ")) return "zeta";
  if (low.includes("peak time") || /\bt_?p\b/.test(low)) return "t_p";
  if (low.includes("settling")) return "t_s_2pct";
  if (low.includes("rise time")) return "t_r";
  if (low.includes("bandwidth") || low.includes("omega_bw")) return "omega_BW";
  if (low.includes("overshoot") || /\bm_?p\b/.test(low)) return "Mp";
  return null;
}

function extractPGain(text) {
  const pats = [
    "P-?\\s*controller\\s+with\\s+(?:a\\s+)?(?:gain\\s+)?K_?P?\\s*=\\s*(\\d+(?:\\.\\d+)?)",
    "K_?P\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s+is\\s+applied",
    "(?:gain|controller)\\s+K_?P?\\s*=\\s*(\\d+(?:\\.\\d+)?)",
  ];
  for (const p of pats) {
    const v = extractNumber(text, p);
    if (v !== null) return v;
  }
  return null;
}

function extractEssInputs(text) {
  const inputs = {};
  const ess = extractNumber(text, "\\be_?ss?\\b\\s*(?:=|is|of)?\\s*(\\d*\\.\\d+|\\d+)");
  if (ess !== null) inputs.ess_target = ess;
  const m = /G\s*\(\s*0\s*\)\s*=\s*(-?\d+(?:\.\d+)?)\s*(dB)?/i.exec(text);
  if (m) {
    inputs.G0 = parseFloat(m[1]);
    inputs.G0_unit = m[2] ? "dB" : "linear";
  }
  return inputs;
}

function extract2ndOrderSpec(text) {
  let overshoot = extractNumber(text, "(\\d+(?:\\.\\d+)?)\\s*%\\s*overshoot");
  if (overshoot === null) overshoot = extractNumber(text, "overshoot\\D*(\\d+(?:\\.\\d+)?)\\s*%");
  if (overshoot === null) overshoot = extractNumber(text, "\\b(?:m_?p)\\b\\s*=\\s*(\\d+(?:\\.\\d+)?)");
  if (overshoot !== null) {
    const val = overshoot > 1.0 ? overshoot / 100.0 : overshoot;
    return { given_kind: "Mp", given_value: val };
  }
  const zeta = extractNumber(text, "\\b(?:zeta|\\u03b6|damping (?:ratio|factor))\\b\\D*(\\d+(?:\\.\\d+)?)");
  if (zeta !== null) return { given_kind: "zeta", given_value: zeta };
  return {};
}

// ---- the router ---------------------------------------------------------
export function parseQuestion(textIn) {
  const text = normalizeDashes(textIn);
  const low = text.toLowerCase();
  const options = extractOptions(text);

  // 1. ODE -> TF (P1)
  if (/\bodes?\b/.test(low) || low.includes("differential equation") ||
      /\by\s*\(\d+\)\s*\(t\)/.test(low) || /[̈̇]y|y['′]{1,3}/.test(text)) {
    return { solver_function: "solve_ode_to_tf", inputs: {}, options };
  }
  // 2. State-space -> TF (P1)
  if (low.includes("state matrix") || low.includes("state-space") || low.includes("state space")) {
    return { solver_function: "solve_state_space_to_tf", inputs: {}, options };
  }
  // 3. Feedforward (P7)
  if (low.includes("feedforward") || low.includes("feed-forward") || low.includes("feed forward") ||
      low.includes("proper-fast") || /\bf_?d\s*\(s\)/.test(low)) {
    const n = extractNumber(text, "\\b(\\d+)\\s+(?:first-order\\s+lags|lags)");
    const inputs = n ? { n_lags: Math.trunc(n) } : {};
    return { solver_function: "pick_feedforward_form", inputs, options };
  }
  // 4. PI-Lead / Lead design (P6)
  if (low.includes("pi-lead") || low.includes("pi lead") || low.includes("p-lead") || low.includes("lead part") ||
      low.includes("lead controller") || low.includes("lead-lag") || low.includes("phase budget") ||
      /\bc_?d\s*\(s\)/.test(low) ||
      (low.includes("lead") && (low.includes("crossover") || text.includes("α") || low.includes("alpha")))) {
    const inputs = extractPiLead(text);
    const routing = { solver_function: "solve_pi_lead", inputs, options };
    let mk = { beta: "beta", KP: "K_P", Ni: "N_i" }[inputs.unknown];
    if (mk === undefined && low.includes("magnitude") && low.includes("lead")) mk = "M_D";
    if (mk) routing.match_key = mk;
    return routing;
  }
  // 5. Proportional controller for a target phase margin (P6)
  const hasPM = /phase margin/.test(low) || /\bpm\b/.test(low) || low.includes("gamma_m") || text.includes("γ");
  const wantsGain = /\bgain\s+k/.test(low) || /\bk_?p\b/.test(low) || low.includes("proportional") || /\bp[- ]controller/.test(low);
  if (hasPM && wantsGain) {
    const plant = extractTf(text);
    const pm = extractTargetPM(text);
    const inputs = {};
    if (plant) inputs.G = plant;
    if (pm !== null) inputs.target_PM_deg = pm;
    return { solver_function: "solve_P_for_PM", inputs, options, match_key: "K_P" };
  }
  // 6. Closed-loop stable-K range (P3)
  if (/stable\s+for/.test(low) || low.includes("range of k") ||
      /values\s+of\s+k\b[^.]*\bstable/.test(low) || /\bstable\b[^.]*\bvalues\s+of\s+k/.test(low) ||
      ((low.includes("closed loop") || low.includes("closed-loop")) && low.includes("stable") && !low.includes("overshoot"))) {
    const plant = extractTf(text);
    if (plant) return { solver_function: "solve_stable_K_range", inputs: { G: plant }, options };
  }
  // 7. Generic loop margins (P3)
  if (low.includes("margin") && (low.includes("gain crossover") || low.includes("phase crossover") || /\b(?:gm|pm)\b/.test(low))) {
    const plant = extractTf(text);
    return { solver_function: "solve_margins", inputs: plant ? { G: plant } : {}, options };
  }
  // 8. Bode composition (P2)
  if (low.includes("bode") && (low.includes("slope") || low.includes("corners"))) {
    return { solver_function: "compose_tf_from_bode", inputs: {}, options };
  }
  // 9. Nested steady state (P7)
  if (low.includes("nested") || low.includes("inner loop") || low.includes("outer loop") || low.includes("two_kp_same")) {
    return { solver_function: "solve_nested_ess", inputs: {}, options };
  }
  // 10. Block reduction (P1)
  if (low.includes("block diagram") || low.includes("dsl") || low.includes("feedback(")) {
    return { solver_function: "reduce_block_diagram", inputs: {}, options };
  }
  // 11. Closed-loop 2nd order (P4)
  if (low.includes("overshoot") || low.includes("damping ratio") || low.includes("damping factor") ||
      low.includes("damped frequency") || low.includes("omega_d") || low.includes("omega_n") ||
      low.includes("natural frequency") || low.includes("second order") || low.includes("second-order") ||
      /\bt_?p\b/.test(low) || low.includes("settling") || low.includes("peak time")) {
    const cl = extractTf(text) || "K / (s**2 + 2*s + K)";
    const inputs = { closed_loop_str: cl };
    Object.assign(inputs, extract2ndOrderSpec(text));
    const routing = { solver_function: "solve_closed_loop_2nd_order", inputs, options };
    const mk = askedMetric(low);
    if (mk) routing.match_key = mk;
    return routing;
  }
  // 12. Steady-state error (P5)
  if (low.includes("steady-state error") || low.includes("steady state error") ||
      low.includes("system type") || /\be_?ss\b/.test(low)) {
    const plant = extractTf(text);
    if (plant) {
      const gain = extractPGain(text);
      const gIn = gain !== null && gain !== 1.0 ? `${gain}*(${plant})` : plant;
      const routing = { solver_function: "solve_ess_table", inputs: { G: gIn }, options };
      if (low.includes("step") && !low.includes("ramp") && !low.includes("parabol")) routing.match_key = "ess_step";
      return routing;
    }
    return { solver_function: "solve_KP_from_ess", inputs: extractEssInputs(text), options };
  }
  // 13. Fallback: any TF -> margins
  const plant = extractTf(text);
  if (plant) return { solver_function: "solve_margins", inputs: { G: plant }, options };

  return null;
}
