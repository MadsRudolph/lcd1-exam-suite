// Type-aware multiple-choice option matching.
// JS port of lcd1-solver/lcd_solver/match.py (+ form_builder.apply_stable_range_match).
// A solver result {value, kind} is matched against the user's pasted options.
// kind ∈ "NUMBER" | "DICT" | "TF" | "PICK".
import { parseTf } from "./numeric/parse.js";

const DB_SUFFIX = /^\s*(.+?)\s*dB\s*$/i;

// Strip a leading multiple-choice enumerator: "1.", "2)", "(3)", "[4]", "a.",
// "b)", "(c)". Digit markers must be followed by ")"/":"/"]" or a "." + space, so
// a decimal answer like "0.4" is never mistaken for an enumerator.
function stripEnumerator(s) {
  const letter = s.replace(/^\s*[(\[]?\s*[a-eA-E]\s*[).:\-\]]\s*/, "");
  if (letter !== s) return letter;
  return s.replace(/^\s*[(\[]?\s*\d{1,2}\s*(?:[):\]]\s*|\.\s+)/, "");
}

// Strip a leading quantity label: "K =", "GM =", "K_P=", "α =", "γ_M:", "ζ ≈".
function stripLabel(s) {
  return s.replace(/^\s*[A-Za-zΑ-Ωα-ω][A-Za-zΑ-Ωα-ω0-9_]*\s*[=≈:]\s*/, "");
}

// Pull the first numeric token (with an optional dB / unit) out of any leftover
// text, e.g. "GM 7.6 dB, PM 23" → 7.6 dB. Last resort after the strict parse.
function firstNumber(s) {
  const m = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(dB)?/i.exec(s);
  if (!m) throw new Error(`no number in: ${s}`);
  return m[2] ? 10 ** (Number(m[1]) / 20) : Number(m[1]);
}

const UNIT_SUFFIX = /\s*(?:rad\/s|rad|deg|°|%|hz|sec|s)\s*$/i;

/**
 * Parse a multiple-choice option to the number it represents. Tolerant of the
 * way exam options are actually written: a leading enumerator ("1.", "a)"), a
 * quantity label ("K =", "GM ="), a trailing unit ("dB", "rad/s", "°", "%"), and
 * plain fractions / products. '5', 'b) K_P = 8.4', '-7.9588 dB', '4.3 %',
 * '1/2', 'pi/4' all parse. Throws only on genuinely number-free text.
 */
export function parseNumber(rawIn) {
  let raw = stripLabel(stripEnumerator(String(rawIn).trim())).trim();
  const m = DB_SUFFIX.exec(raw);
  if (m) {
    try { return 10 ** (evalNumeric(m[1]) / 20); } catch { /* fall through */ }
  }
  try { return evalNumeric(raw); } catch { /* try unit-stripped / first-token */ }
  const noUnit = raw.replace(UNIT_SUFFIX, "").trim();
  try { return evalNumeric(noUnit); } catch { /* fall through */ }
  return firstNumber(raw);
}

function evalNumeric(s) {
  let t = s.trim().replace(/\bpi\b/gi, String(Math.PI));
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
  // simple a/b or a*b of plain numbers (exam options never need more)
  const frac = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const prod = /^(-?\d+(?:\.\d+)?)\s*\*\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (prod) return Number(prod[1]) * Number(prod[2]);
  const n = Number(t);
  if (!Number.isNaN(n)) return n;
  throw new Error(`unparseable number: ${s}`);
}

const splitLines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function matchNumber(target, lines) {
  const options = lines.map((ln) => {
    try {
      const val = parseNumber(ln);
      const denom = Math.abs(target) > 1e-12 ? Math.abs(target) : 1.0;
      return { raw_text: ln, parsed: val, distance: Math.abs(val - target) / denom, flag: "no_match", note: "" };
    } catch {
      return { raw_text: ln, parsed: null, distance: null, flag: "unparseable", note: "" };
    }
  });
  const parseable = options.filter((o) => o.distance !== null);
  if (parseable.length) {
    const winner = parseable.reduce((a, b) => (b.distance < a.distance ? b : a));
    // Only crown a confident match when the closest option is actually close.
    // Otherwise the computed value disagrees with every option (usually a wrong
    // input) and a falsely confident "match" would be misleading.
    if (winner.distance <= MATCH_TOL) {
      winner.flag = "match";
      for (const o of parseable) if (o !== winner && o.distance < 0.01) o.flag = "also_plausible";
    } else {
      winner.note = `closest, but ${(winner.distance * 100).toFixed(0)}% off`;
    }
  }
  return options;
}

// A computed value within this relative distance of an option counts as a match.
// Exam options are rounded (typically <5% off the exact answer); a far larger gap
// means the inputs are wrong, not that this is the answer.
export const MATCH_TOL = 0.15;

function matchDictAuto(dict, lines) {
  const items = Object.entries(dict).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v),
  );
  if (!items.length) return lines.map((ln) => ({ raw_text: ln, parsed: null, distance: null, flag: "no_match", note: "" }));
  const TIGHT = 0.01;
  const SOFT = 0.05;
  const options = lines.map((ln) => {
    let val;
    try {
      val = parseNumber(ln);
    } catch {
      return { raw_text: ln, parsed: null, distance: null, flag: "unparseable", note: "" };
    }
    const scored = items
      .map(([k, t]) => [k, Math.abs(val - t) / (Math.abs(t) > 1e-12 ? Math.abs(t) : 1.0)])
      .sort((a, b) => a[1] - b[1]);
    const [bestKey, bestDist] = scored[0];
    const near = scored.filter(([, d]) => d < SOFT);
    const note = near.length
      ? "near: " + near.map(([k, d]) => `${k} (Δ=${(d * 100).toFixed(1)}%)`).join(", ")
      : `closest: ${bestKey} (Δ=${(bestDist * 100).toFixed(1)}%)`;
    return { raw_text: ln, parsed: val, distance: bestDist, flag: "no_match", note };
  });
  const parseable = options.filter((o) => o.distance !== null);
  const tight = parseable.filter((o) => o.distance < TIGHT);
  if (tight.length === 1) {
    tight[0].flag = "match";
    tight[0].note = "match — " + tight[0].note;
  } else if (tight.length > 1) {
    for (const o of tight) {
      o.flag = "also_plausible";
      o.note = "ambiguous — " + o.note;
    }
  }
  for (const o of parseable) if (o.flag === "no_match" && o.distance < SOFT) o.flag = "also_plausible";
  return options;
}

function scaleTf(tf) {
  const num = tf.num ?? tf[0];
  const den = tf.den ?? tf[1];
  const d0 = den[0];
  return { num: num.map((c) => c / d0), den: den.map((c) => c / d0) };
}

function matchTf(target, lines) {
  const T = scaleTf(target);
  return lines.map((ln) => {
    let opt;
    try {
      opt = scaleTf(parseTf(ln));
    } catch {
      return { raw_text: ln, parsed: null, distance: null, flag: "unparseable", note: "" };
    }
    const eq =
      opt.num.length === T.num.length &&
      opt.den.length === T.den.length &&
      opt.num.every((c, i) => Math.abs(c - T.num[i]) < 1e-6) &&
      opt.den.every((c, i) => Math.abs(c - T.den[i]) < 1e-6);
    return { raw_text: ln, parsed: ln, distance: null, flag: eq ? "match" : "no_match", note: "" };
  });
}

export function matchOptions(result, optionsText, matchKey = null) {
  const lines = splitLines(optionsText);
  switch (result.kind) {
    case "NUMBER":
      return matchNumber(Number(result.value), lines);
    case "TF":
      return matchTf(result.value, lines);
    case "DICT":
      if (matchKey == null || matchKey === "" || matchKey === "auto") return matchDictAuto(result.value, lines);
      return matchNumber(Number(result.value[matchKey]), lines);
    case "PICK":
      return lines.map((ln) => ({ raw_text: ln, parsed: null, distance: null, flag: "no_match", note: "" }));
    default:
      throw new Error(`unknown kind ${result.kind}`);
  }
}

const INF = (x) => (/-?\s*(?:inf\w*|∞)/i.test(x) ? (/-/.test(x) ? -Infinity : Infinity) : Number(x));

// Parse a stability-range option into an interval [lo, hi], or null if the option
// is a single value (handled by membership instead). Recognises "(a, b)", "[a,b]",
// "a < K < b", "a ≤ K ≤ b", "0<K<8", "K > a", "K ≥ a", "K < b".
export function parseInterval(textIn) {
  const t = stripEnumerator(String(textIn).trim()).replace(/\s+/g, " ").trim();
  let m = /^[A-Za-zΑ-Ωα-ω_]*\s*[∈]?\s*[(\[]\s*(-?\d+(?:\.\d+)?|-?\s*(?:inf\w*|∞))\s*,\s*(\d+(?:\.\d+)?|\s*(?:inf\w*|∞))\s*[)\]]$/i.exec(t);
  if (m) return [INF(m[1]), INF(m[2])];
  m = /(-?\d+(?:\.\d+)?)\s*<=?\s*[A-Za-zΑ-Ωα-ω_]+\s*<=?\s*(-?\d+(?:\.\d+)?)/.exec(t);
  if (m) return [Number(m[1]), Number(m[2])];
  m = /[A-Za-zΑ-Ωα-ω_]+\s*(?:>=?|≥)\s*(-?\d+(?:\.\d+)?)/.exec(t);
  if (m) return [Number(m[1]), Infinity];
  m = /[A-Za-zΑ-Ωα-ω_]+\s*(?:<=?|≤)\s*(-?\d+(?:\.\d+)?)/.exec(t);
  if (m) return [-Infinity, Number(m[1])];
  return null;
}

const fmtB = (x) => (x === Infinity ? "∞" : x === -Infinity ? "-∞" : String(x));
const sameBound = (a, b) => (a === b) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.03 * Math.max(1, Math.abs(b)));

/**
 * Flag the option(s) consistent with a computed stable-K interval (low, high).
 * Two option shapes occur in exams and both are handled: a range like "0 < K < 8"
 * (matched when its bounds equal the computed interval) and a single candidate
 * gain like "K_P = 50" (matched when it falls inside the interval).
 * Mutates + returns options.
 */
export function applyStableRangeMatch(solverFunction, raw, options) {
  if (solverFunction !== "solve_stable_K_range") return options;
  if (!(Array.isArray(raw) && raw.length === 2)) return options;
  const [low, high] = [Number(raw[0]), Number(raw[1])];
  for (const opt of options) {
    const iv = parseInterval(opt.raw_text);
    if (iv) {
      const ok = sameBound(iv[0], low) && sameBound(iv[1], high);
      opt.flag = ok ? "match" : "no_match";
      opt.note = ok
        ? `matches stable range (${fmtB(low)}, ${fmtB(high)})`
        : `range (${fmtB(iv[0])}, ${fmtB(iv[1])}) ≠ (${fmtB(low)}, ${fmtB(high)})`;
      continue;
    }
    let val;
    try {
      val = parseNumber(opt.raw_text);
    } catch {
      opt.flag = "unparseable";
      continue;
    }
    const inside = low < val && val < high;
    opt.flag = inside ? "match" : "no_match";
    opt.note = (inside ? "inside" : "outside") + ` stable range (${fmtB(low)}, ${fmtB(high)})`;
  }
  return options;
}
