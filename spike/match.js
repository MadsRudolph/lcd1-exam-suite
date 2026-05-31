// Type-aware multiple-choice option matching.
// JS port of lcd1-solver/lcd_solver/match.py (+ form_builder.apply_stable_range_match).
// A solver result {value, kind} is matched against the user's pasted options.
// kind ∈ "NUMBER" | "DICT" | "TF" | "PICK".
import { parseTf } from "./numeric/parse.js";

const DB_SUFFIX = /^\s*(.+?)\s*dB\s*$/i;

/** Parse '5', '-7.9588 dB', '1/2', 'pi/4' to a float; throws on junk. */
export function parseNumber(rawIn) {
  const raw = String(rawIn).trim();
  const m = DB_SUFFIX.exec(raw);
  if (m) return 10 ** (evalNumeric(m[1]) / 20);
  return evalNumeric(raw);
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
    winner.flag = "match";
    for (const o of parseable) if (o !== winner && o.distance < 0.01) o.flag = "also_plausible";
  }
  return options;
}

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

/** Flag options inside a stable-K interval (low, high). Mutates + returns options. */
export function applyStableRangeMatch(solverFunction, raw, options) {
  if (solverFunction !== "solve_stable_K_range") return options;
  if (!(Array.isArray(raw) && raw.length === 2)) return options;
  const [low, high] = [Number(raw[0]), Number(raw[1])];
  for (const opt of options) {
    let val;
    try {
      val = parseNumber(opt.raw_text);
    } catch {
      continue;
    }
    const inside = low < val && val < high;
    opt.flag = inside ? "match" : "no_match";
    opt.note = (inside ? "inside" : "outside") + ` stable range (${low}, ${high})`;
  }
  return options;
}
