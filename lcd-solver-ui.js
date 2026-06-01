// LCD1 Solver mode: a floating switcher + a full-screen panel overlaid on the
// Block Diagram Reducer. System-centric: you give one G(s) and the board
// auto-computes the read-outs, plots and design goals. Smart Paste pulls the
// G(s) and options out of a pasted exam question to fill that box for you — it
// never commits to a single answer.
import { formsInGroup } from "./lcd-forms.js";
import { runSolver, analyzeNumeric, analyzeSymbolic, isSymbolicTf, smartPaste, normalizeTfInput } from "./lcd-engine.js";
import { combineTf, matlabForPlot } from "./lcd-tf-helpers.js";
import { parseExprToTF } from "./symbolic/parse-expr.js";
import { setHandoff } from "./lcd-handoff.js";
import { solveBlockDiagram } from "./solver.js";
import { bodePlot, nyquistPlot, stepPlot, poleZeroPlot } from "./plot-svg.js";
import { buildPlotData } from "./spike/solvers/plotdata.js";
import { parseTf } from "./spike/numeric/parse.js";
import { attachHover } from "./plot-interact.js";
import { matchOptions } from "./spike/match.js";

const VERSION = "v1.2.1";

// Solvers offered when a G(s) arrives from the Block Diagram, with the open/closed-loop hint.
const BRIDGE_CHOICES = [
  { fn: "solve_margins", label: "Margins (GM/PM)", note: "open-loop" },
  { fn: "solve_stable_K_range", label: "Stable-K range", note: "open-loop" },
  { fn: "solve_ess_table", label: "Steady-state error", note: "open-loop" },
  { fn: "solve_P_for_PM", label: "P-for-PM", note: "open-loop" },
  { fn: "solve_pi_lead", label: "PI-Lead design", note: "open-loop" },
  { fn: "analyze_stability", label: "Closed-loop stability", note: "open-loop" },
  { fn: "characterize", label: "Characterize (ζ, ωₙ, step)", note: "closed-loop" },
  { fn: "bandwidth", label: "Bandwidth", note: "closed-loop" },
  { fn: "dominant_settling", label: "Settling time", note: "closed-loop" },
];

const FLAG = {
  match: { c: "#10b981", t: "✓ match" },
  also_plausible: { c: "#f59e0b", t: "≈ plausible" },
  no_match: { c: "var(--text-secondary,#94a3b8)", t: "" },
  unparseable: { c: "#ef4444", t: "? unparseable" },
};
const BORDER = "var(--border-color,#334155)";
const TXT = "var(--text-primary,#f8fafc)";
const SUB = "var(--text-secondary,#94a3b8)";

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => (k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v)));
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function katex(target, latex, display = true) {
  try { window.katex ? window.katex.render(latex, target, { throwOnError: false, displayMode: display }) : (target.textContent = latex); }
  catch { target.textContent = latex; }
}

let state = {};

function card(k, v) {
  const c = el("div", { style: `background:#101a2e;border:1px solid #2c3a55;border-radius:9px;padding:9px 11px;` });
  c.append(el("div", { style: `color:${SUB};font-size:11px;` }, k));
  const val = el("div", { style: `color:${TXT};font:600 15px 'JetBrains Mono';margin-top:2px;` }); val.textContent = v;
  c.append(val);
  return c;
}
const numFmt = (x, dp = 4) => (x == null || (typeof x === "number" && Number.isNaN(x)) ? "—" : x === Infinity ? "∞" : x === -Infinity ? "-∞" : String(Number(x.toPrecision(dp))));

function sectionLabel(t) {
  return el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.6px;margin-top:6px;` }, t);
}

// One matched-option row: green ✓ for a confident match, amber for plausible.
function optionRow(o) {
  const matched = o.flag === "match";
  const plausible = o.flag === "also_plausible";
  const border = matched ? "rgba(16,185,129,0.4)" : plausible ? "rgba(251,191,36,0.4)" : BORDER;
  const bg = matched ? "rgba(16,185,129,0.08)" : "transparent";
  const row = el("div", { style: `display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:7px;border:1px solid ${border};background:${bg};font:12px 'JetBrains Mono';` });
  const v = el("span", {}); v.textContent = o.raw_text;
  const tag = el("span", { style: `color:${matched ? "#10b981" : plausible ? "#fbbf24" : SUB};font:600 11px 'Outfit';` });
  tag.textContent = matched ? "✓ match" : plausible ? "≈ plausible" : (o.note || "");
  row.append(v, tag);
  return row;
}

// The dictionary key a design goal solves for, so its result can be matched
// against the pasted options. PI-Lead's answer depends on the chosen unknown.
function goalMatchKey(form, inp) {
  if (form.fn === "solve_pi_lead") return { beta: "beta", KP: "K_P", Ni: "N_i", alpha: "alpha", design: "K_P" }[inp.unknown] || "auto";
  if (form.fn === "solve_P_for_PM") return "K_P";
  return form.resultKind === "DICT" ? "auto" : null;
}

function analyzeAndRender() {
  // Forgive how the TF was typed (unicode, "G(s) =", s²…) before parsing/routing.
  const src = normalizeTfInput(state.sysBox.value);
  // Options extracted by Smart Paste are consumed once, by whichever board the
  // current G(s) renders; manual keystrokes leave them null so nothing is clobbered.
  const pendingOpts = state.pendingOptions || null;
  state.pendingOptions = null;
  state.board.innerHTML = "";
  state.echo.textContent = "";
  if (!src) return;

  if (isSymbolicTf(src)) { renderSymbolicBoard(src, pendingOpts); return; }

  const a = analyzeNumeric(src);
  if (a.error) { state.echo.innerHTML = `<span style="color:#ef4444">could not read: ${a.error}</span> <span style="color:${SUB}">— see “Syntax” under the box.</span>`; return; }
  state.echo.textContent = `interpreted as  G(s) = ${a.interpreted}`;

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;" });
  const dcText = a.dcGain === Infinity ? "∞" : `${numFmt(a.dcGain)}  ·  ${numFmt(a.dcGain_dB)} dB`;
  grid.append(
    card("DC gain", dcText),
    card("type / order", `${a.type} / ${a.order}`),
    card("poles", a.poles || "—"),
    card("zeros", a.zeros || "none"),
    card("GM", a.margins ? (Number.isFinite(a.margins.GM) ? `${numFmt(a.margins.GM)}  ·  ${numFmt(a.margins.GM_dB)} dB` : "∞") : "—"),
    card("PM (°)", a.margins ? numFmt(a.margins.PM_deg) : "—"),
    card("ω_c / ω_π", a.margins ? `${numFmt(a.margins.omega_gc)} / ${numFmt(a.margins.omega_pc)}` : "—"),
    card("ess step / ramp", a.ess ? `${numFmt(a.ess.ess_step)} / ${numFmt(a.ess.ess_ramp)}` : "—"),
    card("y(0⁺) / y(∞)", `${numFmt(a.initialValue)} / ${a.finalValue === Infinity ? "∞" : numFmt(a.finalValue)}`),
    card("bandwidth", numFmt(a.bandwidth)),
    card("settling t_s", a.settling == null ? "—" : `${numFmt(a.settling)} s`),
    card("stable?", a.stable == null ? "—" : a.stable ? "yes" : "no"),
  );
  state.board.append(sectionLabel("Read-outs · auto-computed"), grid);

  renderPlotsInto(state.board, src);   // implemented in Task 5
  renderDesignStrip(state.board, src); // implemented in Task 6

  const matchWrap = el("div", { style: "margin-top:8px;display:flex;flex-direction:column;gap:6px;" });
  const sel = el("select", { style: `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:6px;font:12px 'Inter';width:max-content;` });
  const quantities = {
    "DC gain (dB)": a.dcGain_dB, "PM (°)": a.margins?.PM_deg, "GM (dB)": a.margins?.GM_dB,
    "ω_c": a.margins?.omega_gc, "DC gain (linear)": a.dcGain, "bandwidth": a.bandwidth,
  };
  // Only offer read-outs that are a finite number to match against (an integrator
  // plant has ∞ DC gain / GM, which would just error on "Match").
  Object.keys(quantities).filter((k) => Number.isFinite(quantities[k])).forEach((k) => sel.append(el("option", { value: k }, k)));
  // Pasted "X dB" options are linearised by the parser, so a dB read-out must be
  // matched in the linear domain — otherwise "6 dB" (≈2.0) would be compared
  // against the dB number 6.02 and the wrong option would win.
  const matchTarget = (k) => (/\(dB\)/.test(k) ? (k.startsWith("DC gain") ? a.dcGain : a.margins?.GM) : quantities[k]);
  const optsTa = el("textarea", { rows: "3", placeholder: "paste the 5 options, one per line", style: `background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:12px 'JetBrains Mono';` });
  if (pendingOpts) optsTa.value = pendingOpts;
  state.optsTa = optsTa; // shared with the design goals so they can flag the answer too
  const mbtn = el("button", { style: "background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:7px 12px;font:600 12px 'Outfit';cursor:pointer;width:max-content;" }, "Match options");
  const mout = el("div", { style: "display:flex;flex-direction:column;gap:5px;" });
  mbtn.onclick = () => {
    const target = matchTarget(sel.value);
    mout.innerHTML = "";
    if (target == null || !Number.isFinite(target)) { mout.innerHTML = `<span style="color:#f59e0b">that read-out isn't a finite number to match.</span>`; return; }
    const opts = matchOptions({ value: target, kind: "NUMBER" }, optsTa.value.trim());
    opts.forEach((o) => mout.append(optionRow(o)));
  };
  matchWrap.append(sectionLabel("Match the exam's options against a read-out"), sel, optsTa, mbtn, mout);
  state.board.append(matchWrap);
}

function renderPlotsInto(parent, src) {
  let pd;
  try { pd = buildPlotData(parseTf(src)); } catch { return; }
  parent.append(sectionLabel("Plots · overlay the exam figure to verify"));
  parent.append(renderPlotPanel(pd, "Bode", src));
}

function renderDesignStrip(parent, src) {
  const goals = formsInGroup("design");
  if (!goals.length) return;
  parent.append(sectionLabel("Design · pick a goal, reuse the G above"));
  const wrap = el("div", { style: `background:#0e1830;border:1px solid ${BORDER};border-radius:10px;padding:11px;display:flex;flex-direction:column;gap:9px;` });
  const chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  const body = el("div", {});
  wrap.append(chips, body);
  for (const f of goals) {
    const chip = el("button", { style:
      `background:#172033;color:${TXT};border:1px solid #3b4a66;border-radius:8px;padding:6px 10px;font:600 12px 'Outfit';cursor:pointer;` },
      f.title.replace(/^P\d+ — |^Analysis — /, ""));
    chip.onclick = () => showGoal(f, body, src);
    chips.append(chip);
  }
  parent.append(wrap);
}

function showGoal(form, body, src) {
  body.innerHTML = "";
  const inputs = new Map();
  for (const fld of form.fields) {
    if (fld.name === "G") continue; // injected from the dashboard
    const row = el("div", { style: "display:flex;flex-direction:column;gap:3px;margin-top:6px;" });
    row.append(el("label", { style: `color:${SUB};font:500 12px 'Inter';` }, fld.label));
    let input;
    if (fld.kind === "dropdown") {
      input = el("select", { style: `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:7px;` });
      (fld.options || []).forEach((o) => input.append(el("option", { value: o }, o)));
      if (fld.default) input.value = fld.default;
    } else {
      input = el("input", { type: "text", value: fld.default || "", placeholder: fld.placeholder || "", style: `background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:13px 'JetBrains Mono';` });
    }
    inputs.set(fld.name, input);
    row.append(input); body.append(row);
  }
  const go = el("button", { style: "margin-top:9px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:8px;padding:9px 14px;font:600 12px 'Outfit';cursor:pointer;" }, "Solve");
  const out = el("div", { style: `margin-top:9px;color:${TXT};` });
  go.onclick = () => {
    const inp = { G: src };
    for (const [k, el2] of inputs) inp[k] = el2.value;
    // Reuse the options the student pasted (or Smart Paste pulled in) so the goal
    // can flag which one its answer matches — not just print the number.
    const optionsText = (state.optsTa && state.optsTa.value.trim()) || "";
    const res = runSolver(form.fn, inp, optionsText, goalMatchKey(form, inp));
    out.innerHTML = "";
    if (!res.ok) { out.innerHTML = `<span style="color:#f59e0b">${res.note || "could not solve"}</span>`; return; }
    if (res.latex) katex(out, res.latex, false);
    if (res.summary) {
      const t = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font:12px 'JetBrains Mono';margin-top:6px;" });
      res.summary.forEach(([k, v]) => { t.append(el("div", { style: `color:${SUB};` }, k), el("div", { style: `color:${TXT};` }, String(v))); });
      out.append(t);
    }
    if (res.options && res.options.length) {
      const ow = el("div", { style: "margin-top:9px;display:flex;flex-direction:column;gap:5px;" });
      ow.append(sectionLabel("Which pasted option this matches"));
      res.options.forEach((o) => ow.append(optionRow(o)));
      out.append(ow);
    }
    if (res.note) out.append(el("div", { style: `margin-top:7px;color:#fcd34d;font:12px 'Inter';` }, res.note));
  };
  body.append(go, out);
}

function renderSymbolicBoard(src, pendingOpts = null) {
  const a = analyzeSymbolic(src);
  if (a.error) { state.echo.innerHTML = `<span style="color:#ef4444">could not read: ${a.error}</span>`; return; }
  state.echo.textContent = a.interpreted ? `interpreted as  G(s) = ${a.interpreted}` : "symbolic input";

  const sysGrid = el("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;" });
  sysGrid.append(
    card("y(0⁺) (initial value)", a.initialValue ?? "—"),
    card("y(∞) = G(0) (final value)", a.dcGain ?? "—"),
    card("type / order", `${a.type ?? "—"} / ${a.order ?? "—"}`),
  );
  state.board.append(sectionLabel("As a system G(s)"), sysGrid);

  if (a.loopHeavy) {
    state.board.append(sectionLabel("As a loop gain L(s)"));
    state.board.append(el("div", { style: `color:${SUB};font:12px 'Inter';font-style:italic;` },
      "Closed-loop and ess are skipped here — too many parameters to simplify instantly. Drop one of the symbols (or use the dedicated Symbolic loop analysis tool) if you need them."));
  } else {
    const loopGrid = el("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;" });
    loopGrid.append(
      card("closed-loop T = L/(1+L)", a.closedLoop || "—"),
      card("K₀ = lim sᴺ·L", a.K0 || "—"),
      card("ess step / ramp", `${a.essStep ?? "—"} / ${a.essRamp ?? "—"}`),
    );
    state.board.append(sectionLabel("As a loop gain L(s)"), loopGrid);
  }

  state.board.append(sectionLabel("Check the exam's options · paste one per line"));
  const ta = el("textarea", { rows: "4", placeholder: "K/(s^2+a*s+K)\n...", style:
    `width:100%;background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:9px;font:12px 'JetBrains Mono';` });
  if (pendingOpts) ta.value = pendingOpts;
  const btn = el("button", { style: "margin-top:7px;background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.45);border-radius:8px;padding:8px 12px;font:600 12px 'Outfit';cursor:pointer;" }, "Check which option is equal");
  const out = el("div", { style: "margin-top:8px;display:flex;flex-direction:column;gap:5px;" });
  btn.onclick = () => {
    const res = runSolver("symbolic_equiv", { ref: src }, ta.value.trim(), null);
    out.innerHTML = "";
    (res.options || []).forEach((o) => {
      const row = el("div", { style: `display:flex;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:7px;border:1px solid ${o.flag === "match" ? "rgba(16,185,129,0.4)" : BORDER};background:${o.flag === "match" ? "rgba(16,185,129,0.08)" : "rgba(30,41,59,0.25)"};font:12px 'JetBrains Mono';` });
      const v = el("span", {}); v.textContent = o.raw_text;
      const tag = el("span", { style: `color:${o.flag === "match" ? "#10b981" : SUB};font:600 11px 'Outfit';` }); tag.textContent = o.flag === "match" ? "✓ equal" : o.flag === "unparseable" ? "? unparseable" : "not equal";
      row.append(v, tag); out.append(row);
    });
  };
  state.board.append(ta, btn, out);
}

// Reset the page: empty the system box, the read-out board, the echo line, the
// Smart Paste box, and hide any "from the block diagram" chooser.
function clearAll() {
  if (state.sysBox) { state.sysBox.value = ""; state.growSys && state.growSys(); }
  if (state.board) state.board.innerHTML = "";
  if (state.echo) state.echo.textContent = "";
  if (state.chooser) state.chooser.style.display = "none";
  if (state.pasteBox) state.pasteBox.value = "";
  if (state.pasteHint) state.pasteHint.innerHTML = "";
  state.pendingOptions = null;
}

// Collapsible "paste a whole exam question" box. It pulls the transfer function
// and the multiple-choice options out of the (often garbled) pasted text, drops
// the G(s) into the system box so the whole board computes, and shows a
// non-committal hint about the question type. It never flags an answer — a
// mis-read can't masquerade as a confident wrong option.
function buildSmartPaste() {
  const wrap = el("div", { style: "margin-top:2px;" });
  const toggle = el("button", { style:
    `background:rgba(16,185,129,0.12);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:6px 11px;font:600 12px 'Outfit';cursor:pointer;` },
    "📋 Paste an exam question");
  const panel = el("div", { style: `display:none;margin-top:8px;background:#0e1830;border:1px solid ${BORDER};border-radius:10px;padding:12px;` });
  toggle.onclick = () => {
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    toggle.textContent = open ? "▾ Paste an exam question" : "📋 Paste an exam question";
    if (open) ta.focus();
  };
  const ta = el("textarea", { rows: "5", placeholder:
    "Paste the full question — garbled PDF copy is fine. The transfer function and the answer options are pulled out automatically.", style:
    `width:100%;box-sizing:border-box;resize:vertical;background:rgba(15,23,42,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:10px;font:13px/1.4 'JetBrains Mono',monospace;` });
  const hint = el("div", { style: "margin-top:9px;display:flex;flex-direction:column;gap:7px;min-height:14px;" });
  panel.append(ta, hint);
  wrap.append(toggle, panel);

  let timer = null;
  const fire = () => runSmartPaste(ta.value, hint);
  // Debounce typing; a paste lands as one input event, so it feels instant.
  ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(fire, 150); });

  state.pasteBox = ta; state.pasteHint = hint;
  // Let the Guide page open this box pre-filled with a sample question.
  state.openPaste = (text) => {
    panel.style.display = "block";
    toggle.textContent = "▾ Paste an exam question";
    ta.value = text;
    runSmartPaste(text, hint);
  };
  return wrap;
}

// Run Smart Paste on the pasted text: fill the system box (which drives the
// whole dashboard), stash the options for the board to pre-fill, and render the
// guidance line. No answer is ever chosen here.
function runSmartPaste(text, hintEl) {
  hintEl.innerHTML = "";
  if (!text.trim()) return;
  const r = smartPaste(text);
  state.pendingOptions = r.options || null;
  if (r.tf) {
    state.sysBox.value = normalizeTf(r.tf);
    state.growSys();
    analyzeAndRender(); // consumes pendingOptions into the rendered board
  }
  renderPasteHint(hintEl, r);
}

const SOURCE_NOTE = {
  tf: "Read G(s) straight from the question and dropped it in the system box.",
  loop: "Read the loop gain into the system box — the design gain K is set to 1, so find it with the P-for-PM / Margins / Stable-K tools.",
  ode: "Built G(s) from the ODE and dropped it in the system box.",
  "closed-loop": "Read the closed-loop TF into the system box, keeping its parameters symbolic.",
};

function renderPasteHint(hintEl, r) {
  const line = (txt, color, accent) => {
    const d = el("div", { style:
      `font:12px/1.45 'Inter';color:${color};background:${accent};border:1px solid ${color}33;border-radius:8px;padding:7px 10px;` });
    d.textContent = txt;
    return d;
  };
  if (r.source) hintEl.append(line(`✓ ${SOURCE_NOTE[r.source]}`, "#6ee7b7", "rgba(16,185,129,0.08)"));
  if (r.intent) hintEl.append(line(`This looks like a ${r.intent.label} question. ${r.intent.hint}`, "#a5b4fc", "rgba(99,102,241,0.08)"));
  if (r.options) {
    const opts = r.options.split("\n").filter(Boolean);
    const where = r.tf ? " — also filled into the matcher below" : "";
    hintEl.append(line(`Found ${opts.length} answer option${opts.length === 1 ? "" : "s"}: ${opts.join(",  ")}${where}.`, "#94a3b8", "rgba(148,163,184,0.08)"));
  }
  if (r.note) hintEl.append(line(r.note, "#fcd34d", "rgba(245,158,11,0.08)"));
}

// Collapsible visual numerator-over-denominator editor. Lets the student write
// each part on its own line (no parenthesis juggling), see a live fraction
// preview and validity check, then insert/copy the one-line TF the solver reads.
function buildTfWidget() {
  const wrap = el("div", { style: "margin-top:2px;" });
  const toggle = el("button", { style:
    `background:rgba(99,102,241,0.12);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:6px 11px;font:600 12px 'Outfit';cursor:pointer;` },
    "✚ Build a transfer function");
  const panel = el("div", { style: `display:none;margin-top:8px;background:#0e1830;border:1px solid ${BORDER};border-radius:10px;padding:12px;` });
  toggle.onclick = () => {
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    toggle.textContent = open ? "▾ Build a transfer function" : "✚ Build a transfer function";
  };

  const mkField = (ph) => el("input", { type: "text", placeholder: ph, style:
    `width:100%;box-sizing:border-box;background:rgba(15,23,42,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px 10px;font:14px 'JetBrains Mono';text-align:center;` });
  const numIn = mkField("numerator   e.g.  K   or   s+1");
  const denIn = mkField("denominator  e.g.  s*(s+a)   or   (s+2)*(s+3)");
  const bar = el("div", { style: `height:2px;background:${TXT};opacity:.6;margin:7px 0;border-radius:2px;` });
  const fracCol = el("div", { style: "display:flex;flex-direction:column;flex:1;min-width:0;" });
  fracCol.append(numIn, bar, denIn);
  const preview = el("div", { style: `min-width:110px;display:flex;align-items:center;justify-content:center;color:#a5b4fc;font:14px 'JetBrains Mono';padding:0 6px;` });
  const top = el("div", { style: "display:flex;align-items:center;gap:12px;" });
  top.append(fracCol, preview);

  const status = el("div", { style: "margin-top:8px;font:12px 'JetBrains Mono';min-height:16px;" });
  const row = el("div", { style: "display:flex;gap:8px;margin-top:9px;" });
  const insertBtn = el("button", { style: "background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:8px;padding:8px 14px;font:600 12px 'Outfit';cursor:pointer;" }, "↧ Insert into G(s)");
  const copyBtn = el("button", { style: `background:rgba(30,41,59,0.7);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px 14px;font:600 12px 'Outfit';cursor:pointer;` }, "⧉ Copy");
  row.append(insertBtn, copyBtn);
  panel.append(top, status, row);
  wrap.append(toggle, panel);

  const toLatex = (s) => s.replace(/\*\*/g, "^").replace(/\*/g, " \\cdot ");
  const combinedNow = () => combineTf(numIn.value || "", denIn.value || "");
  const refresh = () => {
    const n = numIn.value.trim(), d = denIn.value.trim();
    katex(preview, `\\dfrac{${toLatex(n || "?")}}{${toLatex(d || "?")}}`, false);
    if (!n || !d) { status.textContent = "enter a numerator and a denominator"; status.style.color = SUB; return; }
    const combined = combinedNow();
    try {
      parseExprToTF(combined);
      const sym = isSymbolicTf(combined);
      status.innerHTML = `<span style="color:#10b981">✓ valid · ${sym ? "symbolic" : "numeric"}</span>  <span style="color:${SUB}">→ ${combined}</span>`;
    } catch (e) {
      status.innerHTML = `<span style="color:#ef4444">✗ ${e.message}</span>`;
    }
  };
  numIn.addEventListener("input", refresh);
  denIn.addEventListener("input", refresh);
  refresh();

  insertBtn.onclick = () => {
    const n = numIn.value.trim(), d = denIn.value.trim();
    if (!n || !d) return;
    const combined = combinedNow();
    try { parseExprToTF(combined); } catch { return; }
    state.sysBox.value = combined;
    state.growSys();
    state.analyzeAndRender();
    panel.style.display = "none";
    toggle.textContent = "✚ Build a transfer function";
  };
  copyBtn.onclick = async () => {
    const combined = combinedNow();
    try { await navigator.clipboard.writeText(combined); copyBtn.textContent = "✓ Copied"; }
    catch { copyBtn.textContent = "✗ Failed"; }
    setTimeout(() => { copyBtn.textContent = "⧉ Copy"; }, 1400);
  };
  return wrap;
}

// A compact, collapsible syntax reference that sits under the System box, so
// when an expression doesn't compile the rules (and clickable examples) are
// right there. Examples load straight into the box.
function buildSyntaxHelp() {
  const wrap = el("div", { style: "margin-top:6px;" });
  const toggle = el("button", { style:
    `background:transparent;color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:5px 10px;font:600 11px 'Outfit';cursor:pointer;` },
    "ⓘ Syntax");
  const panel = el("div", { style: `display:none;margin-top:8px;background:#0e1830;border:1px solid ${BORDER};border-radius:10px;padding:12px;` });
  toggle.onclick = () => {
    const open = panel.style.display === "none";
    panel.style.display = open ? "block" : "none";
    toggle.textContent = open ? "▾ Syntax" : "ⓘ Syntax";
  };
  const rule = (html) => el("div", { style: `color:${SUB};font:400 12px/1.55 'Inter';margin:3px 0;` }, html);
  panel.append(
    rule("<b>Operators:</b> <code>*</code> multiply, <code>/</code> divide, <code>**</code> or <code>^</code> power, parentheses to group."),
    rule("<b>Implied ×:</b> you can write <code>(s+2)(s+3)</code>, <code>5s</code>, <code>s(s+1)</code> — no <code>*</code> needed."),
    rule("<b>Variable:</b> only <code>s</code>. Keep parameters as letters — <code>K</code>, <code>a</code>, <code>tau</code> — for the symbolic board."),
    rule("<b>Forgiving:</b> a leading <code>G(s) =</code>, a unicode minus <code>−</code>, <code>×</code>/<code>·</code>, and <code>s²</code> are all accepted automatically."),
  );
  const exLabel = el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;` }, "Examples — click to load");
  const exRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  for (const tf of ["12/((s+2)*(s+3))", "1/(s+1)**3", "25/(s**2+3*s+25)", "K/(s*(s+a))"]) {
    const b = el("button", { style: `background:rgba(99,102,241,0.14);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:5px 9px;font:600 11px 'JetBrains Mono';cursor:pointer;` }, tf);
    b.onclick = () => { state.sysBox.value = tf; state.growSys(); analyzeAndRender(); };
    exRow.append(b);
  }
  panel.append(exLabel, exRow);
  wrap.append(toggle, panel);
  return wrap;
}

// The interactive "How this app works" page. Collapsible sections with KaTeX
// formulas and "Try it" buttons that load real examples straight into the
// solver (via the state hooks set up in init).
function buildGuide() {
  const inner = el("div", { style: "max-width:880px;margin:0 auto;padding:0 24px;display:flex;flex-direction:column;gap:16px;" });

  const head = el("div", {});
  head.append(el("h1", { style: `margin:0;color:${TXT};font:800 26px 'Outfit',sans-serif;` }, "📖 How this app works"));
  head.append(el("p", { style: `margin:8px 0 0;color:${SUB};font:400 14px/1.6 'Inter',sans-serif;` },
    "One offline window for the DTU 34722 exam. Two tools — <b>draw a block diagram</b> or <b>paste/type a transfer function</b> — both lead to the flagged multiple-choice answer. Click any example below to load it straight into the solver."));
  inner.append(head);

  // Collapsible section card.
  const section = (title, subtitle, open = false) => {
    const wrap = el("div", { style: `background:#0e1830;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;` });
    const hd = el("button", { style: "width:100%;text-align:left;background:transparent;border:none;cursor:pointer;padding:14px 16px;display:flex;flex-direction:column;gap:3px;" });
    const row = el("div", { style: `color:${TXT};font:700 15px 'Outfit';display:flex;justify-content:space-between;align-items:center;gap:10px;` });
    row.append(el("span", {}, title));
    const caret = el("span", { style: `color:${SUB};font:600 13px;` }, open ? "▾" : "▸");
    row.append(caret);
    hd.append(row);
    if (subtitle) hd.append(el("div", { style: `color:${SUB};font:400 12px 'Inter';` }, subtitle));
    const body = el("div", { style: `padding:0 16px 16px;display:${open ? "flex" : "none"};flex-direction:column;gap:10px;` });
    hd.onclick = () => { const o = body.style.display === "none"; body.style.display = o ? "flex" : "none"; caret.textContent = o ? "▾" : "▸"; };
    wrap.append(hd, body);
    wrap._body = body;
    return wrap;
  };
  const p = (html) => el("p", { style: `margin:0;color:${SUB};font:400 13px/1.6 'Inter';` }, html);
  const formula = (latex) => { const d = el("div", { style: "margin:2px 0;color:#cbd5e1;" }); katex(d, latex, true); return d; };
  const chipRow = () => el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;" });
  const chip = (label, onClick, green = false) => {
    const c = green ? ["#6ee7b7", "rgba(16,185,129,0.16)", "rgba(16,185,129,0.4)"] : ["#a5b4fc", "rgba(99,102,241,0.16)", "rgba(99,102,241,0.4)"];
    const b = el("button", { style: `background:${c[1]};color:${c[0]};border:1px solid ${c[2]};border-radius:999px;padding:7px 13px;font:600 12px 'Outfit',monospace;cursor:pointer;` }, label);
    b.onclick = onClick;
    return b;
  };
  const loadG = (tf) => () => { state.setMode("lcd"); state.setG(null, tf); };

  // 1 — big picture
  const s1 = section("The big picture", "From a problem to the answer in four steps", true);
  s1._body.append(
    p("1. <b>Get a transfer function</b> — draw the block diagram and reduce it, or type/paste G(s) directly."),
    p("2. <b>Read the auto-computed results</b> — margins, poles, type/order, steady-state error, plots — they update live as you type."),
    p("3. <b>Use a design or analysis tool</b> when the question asks for a gain K, a controller, a value at a frequency, or a time response."),
    p("4. <b>Match the multiple-choice options</b> — paste them and the matching one is flagged ✓."),
  );
  inner.append(s1);

  // 2 — block diagram
  const s2 = section("◧ Block Diagram mode", "Draw a loop and reduce it to one transfer function");
  s2._body.append(
    p("Add Input / Output / Block / Sum / Disturbance from the sidebar and wire them up (hold <b>Shift</b> while dragging a wire to make a feedback tap). Set each block's value — numbers or symbols like K, a, τ — pick the Source and Sink, then <b>Solve Loop</b>."),
    p("You get the simplified G(s), the open-loop L(s), the closed-loop Y/R, the disturbance response and the poles. Press <b>∑ Use in LCD1 Solver</b> to send the result to the solver."),
  );
  const r2 = chipRow(); r2.append(chip("Open Block Diagram mode →", () => state.setMode("bdr"), true));
  s2._body.append(r2);
  inner.append(s2);

  // 3 — one box
  const s3 = section("∑ LCD1 Solver — one box for everything", "Type a G(s); the whole board computes live");
  s3._body.append(p("The System box takes numeric or symbolic transfer functions. Click one to load it:"));
  const r3 = chipRow();
  r3.append(
    chip("12/((s+2)*(s+3))", loadG("12/((s+2)*(s+3))")),
    chip("1/(s+1)**3", loadG("1/(s+1)**3")),
    chip("K/(s*(s+a))", loadG("K/(s*(s+a))")),
  );
  s3._body.append(r3, p("The first is type-0 (read its DC gain and margins), the second shows the stable-K range and an 8× gain margin, and the third keeps K and a symbolic — the board then reports the closed-loop, type, order and ess <i>in symbols</i> and checks which option is algebraically equal."));
  inner.append(s3);

  // 4 — smart paste
  const s4 = section("📋 Smart Paste — paste a whole exam question", "It pulls out the transfer function and the options for you");
  s4._body.append(p("Paste a question straight from the PDF — garbled copy is fine. Smart Paste repairs the text, extracts G(s) and drops it in the box, lists the answer options, and hints at the question type. It <b>never auto-picks an answer</b>, so a mis-read can't masquerade as a confident wrong option."));
  const sample = "A closed-loop system has a loop transfer function G(s) = K s(s + 2.1) and the Bode plot in Fig.3. What is the gain K so that the phase margin is PM = 40 degrees?\n1. K = 0.1\n2. K = 8.4\n3. K = 77.5\n4. K = 18.5";
  const r4 = chipRow(); r4.append(chip("Try a sample question →", () => { state.setMode("lcd"); state.openPaste(sample); }, true));
  s4._body.append(r4);
  inner.append(s4);

  // 5 — reading off plots
  const s5 = section("Reading values off a plot", "Convert what you read into parameters — the formulas the tools use");
  s5._body.append(
    p("<b>Overshoot → damping.</b> Read the peak and steady values; with M<sub>p</sub> = (peak − steady)/steady:"),
    formula("\\zeta = \\dfrac{-\\ln M_p}{\\sqrt{\\pi^2 + \\ln^2 M_p}}"),
    p("<b>Period → frequency.</b> Read the oscillation period T off the time axis:"),
    formula("\\omega_d = \\dfrac{2\\pi}{T}, \\qquad \\omega_n = \\dfrac{\\omega_d}{\\sqrt{1-\\zeta^2}}"),
    p("<b>Final value.</b> The steady-state value or error without an inverse Laplace transform:"),
    formula("y(\\infty) = \\lim_{s\\to 0} sF(s)"),
    p("The <i>From a step-response plot</i> and <i>Initial / final value</i> calculators do these for you, and <i>Evaluate G(jω)</i> gives |G| and ∠G at any frequency — e.g. the plant phase φ<sub>G</sub> at ω<sub>c</sub> that a controller design needs."),
  );
  const r5 = chipRow(); r5.append(chip("Load 25/(s**2+3*s+25) and explore the tools →", loadG("25/(s**2+3*s+25)")));
  s5._body.append(r5);
  inner.append(s5);

  // 6 — matching options
  const s6 = section("Matching the multiple-choice options", "Green ✓ confident, amber ≈ plausible — never a blind guess");
  s6._body.append(p("Paste the options into the matcher (or let Smart Paste fill them). The read-outs, the design goals and the calculators all compare their result to your options and flag the match. Magnitudes given in dB are matched in the right units, and an answer that is close to nothing stays unflagged rather than guessing."));
  inner.append(s6);

  // 7 — updates
  const s7 = section("Keeping it updated", "Self-updates from GitHub; fully offline otherwise");
  s7._body.append(p("Click <b>Check for Updates</b> in the Block Diagram sidebar — it runs git pull, rebuilds and reloads, so new features appear without re-downloading. Nothing else ever touches the internet."));
  inner.append(s7);

  // Disclaimer — always visible, deliberately not collapsible.
  const disc = el("div", { style: "background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.4);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;" });
  disc.append(el("div", { style: "color:#fcd34d;font:700 15px 'Outfit';" }, "⚠️ Disclaimer — exam rules are your responsibility"));
  disc.append(el("p", { style: `margin:0;color:${SUB};font:400 13px/1.6 'Inter';` },
    "This is a free, educational study aid provided <b>as is</b>, with no guarantee its results are correct. Whether any tool or aid may be used in an exam, test or assignment is decided solely by the rules of your course, examiner and institution — and those rules vary and change."));
  disc.append(el("p", { style: `margin:0;color:${SUB};font:400 13px/1.6 'Inter';` },
    "It is <b>your own responsibility</b> to confirm from the official rules and the examiner whether using this (or any aid) is permitted in your specific assessment. Using it where it is not allowed is entirely at your own risk. The author accepts <b>no responsibility or liability</b> for any consequences of anyone's use or misuse of this tool."));
  inner.append(disc);

  return inner;
}

function init() {
  // ---- floating switcher ----
  const bar = el("div", { style:
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:4px;" +
    `background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid ${BORDER};border-radius:999px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4);` });
  const mkTab = (t) => el("button", { style:
    `border:none;background:transparent;color:${SUB};font:600 12px/1 'Outfit',sans-serif;padding:8px 16px;border-radius:999px;cursor:pointer;transition:all .15s;` }, t);
  const tabBDR = mkTab("◧ Block Diagram"), tabLCD = mkTab("∑ LCD1 Solver"), tabGuide = mkTab("📖 Guide");
  const ver = el("span", { title: "App version (updates on Check for Updates)", style:
    `align-self:center;color:${SUB};font:600 10px 'Outfit',sans-serif;padding:0 8px 0 4px;opacity:.7;` }, VERSION);
  bar.append(tabBDR, tabLCD, tabGuide, ver);
  document.body.appendChild(bar);

  // ---- panel ----
  const panel = el("div", { id: "lcd-panel", style:
    "position:fixed;inset:0;z-index:900;display:none;grid-template-columns:1fr;" +
    "background:var(--bg-primary,#0f172a);padding:60px 0 0 0;overflow:hidden;" });

  // left column (scrolls)
  const left = el("div", { style: `padding:20px 24px;overflow:auto;display:flex;flex-direction:column;gap:14px;` });

  // header — title on the left, a Clear-the-page action on the right
  const header = el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:12px;" });
  header.append(el("h2", { style: `margin:0;color:${TXT};font:700 16px 'Outfit',sans-serif;` }, "∑ LCD1 Solver"));
  const clearBtn = el("button", { title: "clear the system input and all read-outs", style:
    `background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:6px 12px;font:600 12px 'Outfit';cursor:pointer;` },
    "✕ Clear");
  clearBtn.onclick = () => clearAll();
  header.append(clearBtn);
  left.append(header);

  // Smart Paste — drop a whole exam question and let it fill the system box.
  left.append(buildSmartPaste());

  // Smart TF builder — a collapsible visual numerator-over-denominator editor.
  left.append(buildTfWidget());

  // system input — one box for everything
  const sysBox = el("textarea", { id: "lcd-sys", rows: "1", placeholder: "G(s) = e.g.  12/((s+2)*(s+3))   or   K/(s*(s+a))", style:
    `width:100%;box-sizing:border-box;resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;` +
    `background:rgba(15,23,42,0.6);color:${TXT};border:1px solid #3b82f6;border-radius:10px;padding:12px 14px;font:15px/1.4 'JetBrains Mono',monospace;` });
  // Grow the box to fit the whole expression instead of scrolling inside one row.
  const growSys = () => { sysBox.style.height = "auto"; sysBox.style.height = `${sysBox.scrollHeight}px`; };
  const echo = el("div", { id: "lcd-echo", style: `margin-top:7px;font:12px 'JetBrains Mono';color:#6ee7b7;min-height:16px;` });
  left.append(el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "System — one box for everything"));
  left.append(sysBox, echo);
  left.append(buildSyntaxHelp());
  const board = el("div", { id: "lcd-board", style: "display:flex;flex-direction:column;gap:12px;margin-top:6px;" });
  left.append(board);

  const calcWrap = el("div", { style: "margin-top:14px;" });
  calcWrap.append(el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.6px;` }, "Calculators (not based on one G)"));
  const calcChips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;" });
  const calcBody = el("div", {});
  for (const f of formsInGroup("calc")) {
    const chip = el("button", { style: `background:#172033;color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:6px 10px;font:600 11px 'Outfit';cursor:pointer;` }, f.title.replace(/^P\d+ — |^Analysis — /, ""));
    chip.onclick = () => showGoal(f, calcBody, "");
    calcChips.append(chip);
  }
  calcWrap.append(calcChips, calcBody);
  left.append(calcWrap);

  state.sysBox = sysBox; state.echo = echo; state.board = board; state.growSys = growSys;
  sysBox.addEventListener("input", () => { growSys(); analyzeAndRender(); });
  state.analyzeAndRender = analyzeAndRender;

  panel.append(left);
  document.body.appendChild(panel);

  // ---- guide page (full-screen overlay, scrolls) ----
  const guide = el("div", { id: "lcd-guide", style:
    "position:fixed;inset:0;z-index:900;display:none;overflow:auto;" +
    "background:var(--bg-primary,#0f172a);padding:70px 0 48px 0;" });
  guide.append(buildGuide());
  document.body.appendChild(guide);

  // ---- behaviour ----
  const appContainer = document.querySelector(".app-container");
  const ACTIVE = "linear-gradient(135deg,#3b82f6,#6366f1)";
  // Accepts a mode string ('bdr'|'lcd'|'guide'); true/false kept for old callers.
  const setMode = (m) => {
    const mode = m === true ? "lcd" : m === false ? "bdr" : m;
    panel.style.display = mode === "lcd" ? "grid" : "none";
    guide.style.display = mode === "guide" ? "block" : "none";
    if (appContainer) appContainer.style.visibility = mode === "bdr" ? "visible" : "hidden";
    for (const [tab, name] of [[tabBDR, "bdr"], [tabLCD, "lcd"], [tabGuide, "guide"]]) {
      tab.style.background = mode === name ? ACTIVE : "transparent";
      tab.style.color = mode === name ? "#fff" : SUB;
    }
    if (mode === "guide") guide.scrollTop = 0;
  };
  tabBDR.onclick = () => setMode("bdr");
  tabLCD.onclick = () => setMode("lcd");
  tabGuide.onclick = () => setMode("guide");
  setMode("bdr");

  // ---- Block Diagram -> LCD1 bridge ----
  state.setMode = setMode;
  const chooser = el("div", { id: "lcd-from-diagram", style:
    `display:none;flex-direction:column;gap:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:12px;` });
  left.prepend(chooser);
  state.chooser = chooser;
  state.setG = (fn, tf) => { state.sysBox.value = tf; state.growSys(); analyzeAndRender(); };
  state.setRef = (tf) => { state.sysBox.value = tf; state.growSys(); analyzeAndRender(); };
  state.setL = (tf) => { state.sysBox.value = tf; state.growSys(); analyzeAndRender(); };

  window.LCDBridge = {
    onSolved: (result, canvas) => mountUseButton(result, canvas),
    onSolveFailed: () => { const b = document.getElementById("use-in-lcd-btn"); if (b) b.style.display = "none"; },
  };
}

// Place/refresh the "Use in LCD1 Solver" button in the Block Diagram reduce panel.
function mountUseButton(result, canvas) {
  const host = document.getElementById("copy-actions-container") || document.getElementById("tf-output");
  if (!host) return;
  let btn = document.getElementById("use-in-lcd-btn");
  if (!btn) {
    btn = el("button", { id: "use-in-lcd-btn", class: "btn-copy", title: "Send this G(s) to the LCD1 Solver",
      style: "background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:6px;padding:4px 10px;font:600 11px 'Outfit';cursor:pointer;" },
      "∑ Use in LCD1 Solver →");
    host.appendChild(btn);
  }
  btn.style.display = "inline-block";
  btn.onclick = () => doDiagramHandoff(result, canvas);
}

// Distinct alphabetic symbols (other than s) across the block values.
function symbolsInCanvas(canvas) {
  const set = new Set();
  for (const n of canvas.nodes) {
    if (n.type !== "block" || !n.value) continue;
    for (const m of String(n.value).matchAll(/[A-Za-z_]\w*/g)) {
      if (m[0] !== "s") set.add(m[0]);
    }
  }
  return [...set];
}

function normalizeTf(s) {
  return s.replace(/\^/g, "**");
}

function doDiagramHandoff(result, canvas) {
  // Hand off the *simplified symbolic* TF. The chooser lets you either test it
  // against answer options as-is (parameters kept symbolic) or analyze it
  // numerically — only the numeric routes ask you to plug in values.
  const symbolic = result.finalTransferFunction.toFormulaString();
  const symbols = symbolsInCanvas(canvas);
  enterFromDiagram(symbolic, { canvas, symbols });
}

// Route a numeric solver: if the diagram still has symbolic blocks, ask for
// values and re-reduce numerically first; otherwise use the TF directly.
function routeNumeric(fn, symbolicTf) {
  const { canvas, symbols } = state.bridgeCtx || { symbols: [] };
  if (!symbols || symbols.length === 0) {
    state.setG(fn, normalizeTf(symbolicTf));
    state.chooser.style.display = "none";
    return;
  }
  showSubstitutionModal(symbols, (values) => {
    const numericNodes = canvas.nodes.map((n) => {
      if (n.type !== "block" || !n.value) return n;
      let v = String(n.value);
      for (const sym of symbols) v = v.replace(new RegExp(`\\b${sym}\\b`, "g"), `(${values[sym]})`);
      return { ...n, value: v };
    });
    try {
      const num = solveBlockDiagram(numericNodes, canvas.connections);
      state.setG(fn, normalizeTf(num.finalTransferFunction.toFormulaString()));
      state.chooser.style.display = "none";
    } catch (e) {
      alert(`Could not reduce with those values: ${e.message}`);
    }
  });
}

function showSubstitutionModal(symbols, onConfirm) {
  const overlay = el("div", { style:
    "position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);" });
  const card = el("div", { style:
    `background:var(--bg-primary,#0f172a);border:1px solid ${BORDER};border-radius:12px;padding:20px;min-width:320px;display:flex;flex-direction:column;gap:12px;` });
  card.append(el("div", { style: `color:${TXT};font:700 14px 'Outfit';` }, "Give each block a numeric value"));
  card.append(el("div", { style: `color:${SUB};font:12px 'Inter';` }, "The diagram still has symbolic blocks. Enter numbers (or expressions in s) to analyze it."));
  const inputs = {};
  for (const sym of symbols) {
    const row = el("div", { style: "display:flex;align-items:center;gap:10px;" });
    row.append(el("label", { style: `color:${TXT};font:600 13px 'JetBrains Mono';min-width:48px;` }, `${sym} =`));
    const inp = el("input", { type: "text", placeholder: "e.g. 5 or 1/(s+2)", style:
      `flex:1;background:rgba(30,41,59,0.5);color:${TXT};border:1px solid ${BORDER};border-radius:6px;padding:7px;font:13px 'JetBrains Mono';` });
    inputs[sym] = inp;
    row.append(inp);
    card.append(row);
  }
  const btns = el("div", { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:4px;" });
  const cancel = el("button", { style: `background:rgba(30,41,59,0.7);color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:8px 14px;font:600 12px 'Outfit';cursor:pointer;` }, "Cancel");
  const ok = el("button", { style: "background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:8px;padding:8px 16px;font:600 12px 'Outfit';cursor:pointer;" }, "Use it →");
  cancel.onclick = () => overlay.remove();
  ok.onclick = () => {
    const values = {};
    for (const sym of symbols) {
      const v = inputs[sym].value.trim();
      if (!v) { inputs[sym].style.borderColor = "#ef4444"; return; }
      values[sym] = v;
    }
    overlay.remove();
    onConfirm(values);
  };
  btns.append(cancel, ok);
  card.append(btns);
  overlay.append(card);
  document.body.appendChild(overlay);
  inputs[symbols[0]].focus();
}

function enterFromDiagram(tf, ctx = { symbols: [] }) {
  setHandoff(tf);
  state.bridgeCtx = ctx;
  state.setMode(true);
  renderChooser(tf);
}

function renderChooser(tf) {
  const c = state.chooser;
  c.innerHTML = "";
  c.style.display = "flex";
  c.append(el("div", { style: `color:${TXT};font:600 12px 'Outfit';` }, "From the block diagram:"));
  const tfEl = el("div", { style: `color:#a5b4fc;font:12px 'JetBrains Mono';overflow-x:auto;` }); tfEl.textContent = `G(s) = ${tf}`;
  c.append(tfEl);

  // Symbolic path — keep K, a, … symbolic and test multiple-choice answers.
  c.append(el("div", { style: `color:${SUB};font:11px 'Inter';margin-top:2px;` }, "Test answer options without plugging in numbers:"));
  const symChips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  const symChip = el("button", { title: "keep parameters symbolic and test exam answers for algebraic equality", style:
    `background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.45);border-radius:999px;padding:7px 13px;font:600 11px 'Outfit';cursor:pointer;` },
    "∑ Test against answer options");
  symChip.onclick = () => { state.setRef(tf); c.style.display = "none"; };
  const dashChip = el("button", { title: "treat this as the loop gain L and show closed-loop, type, order, K₀ and ess together", style:
    `background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.45);border-radius:999px;padding:7px 13px;font:600 11px 'Outfit';cursor:pointer;` },
    "∑ Loop answers (closed-loop · type · ess)");
  dashChip.onclick = () => { state.setL(tf); c.style.display = "none"; };
  symChips.append(symChip, dashChip);
  c.append(symChips);

  // Numeric path — the existing analysis solvers.
  c.append(el("div", { style: `color:${SUB};font:11px 'Inter';margin-top:6px;` }, "Or analyze it numerically:"));
  const chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  for (const ch of BRIDGE_CHOICES) {
    const chip = el("button", { title: `treats G as ${ch.note}`, style:
      `background:rgba(30,41,59,0.7);color:${TXT};border:1px solid ${BORDER};border-radius:999px;padding:6px 11px;font:600 11px 'Outfit';cursor:pointer;` });
    chip.textContent = `${ch.label} · ${ch.note}`;
    chip.onclick = () => routeNumeric(ch.fn, tf);
    chips.append(chip);
  }
  c.append(chips);
}

// Tabbed Step | Bode | Nyquist | Pole-Zero panel from a buildPlotData() object.
// An optional image overlay lets the student drop the exam's own plot behind the
// generated one and fade between them to confirm a reconstructed G(s) matches.
function renderPlotPanel(pd, defaultTab = "Step", src = "") {
  const wrap = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
  const tabs = el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;" });
  let currentTab = defaultTab;

  // image overlay behind the SVG, controlled from the tab row
  const fileBtn = el("label", { title: "load a screenshot of the exam's plot to compare against",
    style: `background:rgba(30,41,59,0.6);color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:6px 10px;font:600 11px 'Outfit';cursor:pointer;` }, "⧉ Overlay exam plot");
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none;" });
  fileBtn.append(fileInput);
  const opacity = el("input", { type: "range", min: "0", max: "100", value: "45", title: "overlay opacity",
    style: "display:none;width:90px;accent-color:#6366f1;" });
  const clearBtn = el("button", { title: "remove overlay", style:
    `display:none;background:transparent;color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:6px 9px;font:600 11px 'Outfit';cursor:pointer;` }, "✕");

  const view = el("div", { style: "position:relative;overflow-x:auto;" });
  const imgLayer = el("img", { alt: "", style:
    "position:absolute;inset:0;width:100%;height:auto;opacity:0.45;display:none;pointer-events:none;z-index:0;" });
  const svgLayer = el("div", { style: "position:relative;z-index:1;" });
  view.append(imgLayer, svgLayer);

  const views = {
    Step: () => stepPlot(pd.step, pd.annotations.step || {}),
    Bode: () => bodePlot(pd.bode, pd.annotations.bode || {}),
    Nyquist: () => nyquistPlot(pd.nyquist, pd.annotations.nyquist || {}),
    "Pole-Zero": () => poleZeroPlot(pd.poleZero),
  };
  const show = (name) => {
    currentTab = name;
    svgLayer.innerHTML = views[name](); // generated SVG string — safe, no user markup
    attachHover(svgLayer, pd);
    [...tabs.querySelectorAll("button[data-tab]")].forEach((b) => { b.style.opacity = b.dataset.tab === name ? "1" : "0.55"; });
  };
  for (const name of Object.keys(views)) {
    const b = el("button", { "data-tab": name, style:
      `background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);` +
      `border-radius:8px;padding:6px 12px;font:600 11px 'Outfit';cursor:pointer;` }, name);
    b.onclick = () => show(name);
    tabs.append(b);
  }

  // Copy runnable, commented MATLAB that reproduces the tab currently in view.
  const mlBtn = el("button", { title: "copy MATLAB code that draws this plot",
    style: `background:rgba(245,158,11,0.14);color:#fcd34d;border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:6px 10px;font:600 11px 'Outfit';cursor:pointer;` },
    "⧉ Copy MATLAB");
  mlBtn.onclick = async () => {
    const code = matlabForPlot(src, currentTab);
    try { await navigator.clipboard.writeText(code); mlBtn.textContent = "✓ Copied"; }
    catch { mlBtn.textContent = "✗ Copy failed"; }
    setTimeout(() => { mlBtn.textContent = "⧉ Copy MATLAB"; }, 1400);
  };
  tabs.append(mlBtn, fileBtn, opacity, clearBtn);

  fileInput.onchange = () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      imgLayer.src = reader.result;
      imgLayer.style.display = "block";
      opacity.style.display = "inline-block";
      clearBtn.style.display = "inline-block";
    };
    reader.readAsDataURL(f);
  };
  opacity.oninput = () => { imgLayer.style.opacity = String(Number(opacity.value) / 100); };
  clearBtn.onclick = () => {
    imgLayer.removeAttribute("src"); imgLayer.style.display = "none";
    opacity.style.display = "none"; clearBtn.style.display = "none"; fileInput.value = "";
  };

  wrap.append(tabs, view);
  show(views[defaultTab] ? defaultTab : "Step");
  return wrap;
}


if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
