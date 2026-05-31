// LCD1 Solver mode: a floating switcher + a full-screen panel overlaid on the
// Block Diagram Reducer. Form-centric: every solver shows its editable fields,
// and Smart Paste *pre-fills* the matching form (you review/correct, then solve).
import { formsInGroup } from "./lcd-forms.js";
import { runSolver, analyzeNumeric, analyzeSymbolic, isSymbolicTf } from "./lcd-engine.js";
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

function analyzeAndRender() {
  const src = state.sysBox.value.trim();
  state.board.innerHTML = "";
  state.echo.textContent = "";
  if (!src) return;

  if (isSymbolicTf(src)) { renderSymbolicBoard(src); return; }

  const a = analyzeNumeric(src);
  if (a.error) { state.echo.innerHTML = `<span style="color:#ef4444">could not read: ${a.error}</span>`; return; }
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
  Object.keys(quantities).forEach((k) => sel.append(el("option", { value: k }, k)));
  const optsTa = el("textarea", { rows: "3", placeholder: "paste the 5 options, one per line", style: `background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:12px 'JetBrains Mono';` });
  const mbtn = el("button", { style: "background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:7px 12px;font:600 12px 'Outfit';cursor:pointer;width:max-content;" }, "Match options");
  const mout = el("div", { style: "display:flex;flex-direction:column;gap:5px;" });
  mbtn.onclick = () => {
    const target = quantities[sel.value];
    mout.innerHTML = "";
    if (target == null || !Number.isFinite(target)) { mout.innerHTML = `<span style="color:#f59e0b">that read-out isn't a finite number to match.</span>`; return; }
    const opts = matchOptions({ value: target, kind: "NUMBER" }, optsTa.value.trim());
    opts.forEach((o) => {
      const row = el("div", { style: `display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-radius:7px;border:1px solid ${o.flag === "match" ? "rgba(16,185,129,0.4)" : BORDER};font:12px 'JetBrains Mono';` });
      const v = el("span", {}); v.textContent = o.raw_text;
      const tag = el("span", { style: `color:${o.flag === "match" ? "#10b981" : SUB};` }); tag.textContent = o.flag === "match" ? "✓ match" : (o.note || "");
      row.append(v, tag); mout.append(row);
    });
  };
  matchWrap.append(sectionLabel("Match the exam's options against a read-out"), sel, optsTa, mbtn, mout);
  state.board.append(matchWrap);
}

function renderPlotsInto(parent, src) {
  let pd;
  try { pd = buildPlotData(parseTf(src)); } catch { return; }
  parent.append(sectionLabel("Plots · overlay the exam figure to verify"));
  parent.append(renderPlotPanel(pd, "Bode"));
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
    const res = runSolver(form.fn, inp, "", null);
    out.innerHTML = "";
    if (!res.ok) { out.innerHTML = `<span style="color:#f59e0b">${res.note || "could not solve"}</span>`; return; }
    if (res.latex) katex(out, res.latex, false);
    if (res.summary) {
      const t = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font:12px 'JetBrains Mono';margin-top:6px;" });
      res.summary.forEach(([k, v]) => { t.append(el("div", { style: `color:${SUB};` }, k), el("div", { style: `color:${TXT};` }, String(v))); });
      out.append(t);
    }
  };
  body.append(go, out);
}

function renderSymbolicBoard(src) {
  const a = analyzeSymbolic(src);
  if (a.error) { state.echo.innerHTML = `<span style="color:#ef4444">could not read: ${a.error}</span>`; return; }
  state.echo.innerHTML = `<span style="color:#6ee7b7">symbolic input — showing closed-loop &amp; steady-state in symbols</span>`;
  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;" });
  grid.append(
    card("closed-loop T = L/(1+L)", a.closedLoop || "—"),
    card("type / order", `${a.type ?? "—"} / ${a.order ?? "—"}`),
    card("K₀ = lim sᴺ·L", a.K0 || "—"),
    card("ess step / ramp", `${a.essStep ?? "—"} / ${a.essRamp ?? "—"}`),
  );
  state.board.append(sectionLabel("Symbolic read-outs"), grid);

  state.board.append(sectionLabel("Check the exam's options · paste one per line"));
  const ta = el("textarea", { rows: "4", placeholder: "K/(s^2+a*s+K)\n...", style:
    `width:100%;background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:9px;font:12px 'JetBrains Mono';` });
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

function init() {
  // ---- floating switcher ----
  const bar = el("div", { style:
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:4px;" +
    `background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid ${BORDER};border-radius:999px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4);` });
  const mkTab = (t) => el("button", { style:
    `border:none;background:transparent;color:${SUB};font:600 12px/1 'Outfit',sans-serif;padding:8px 16px;border-radius:999px;cursor:pointer;transition:all .15s;` }, t);
  const tabBDR = mkTab("◧ Block Diagram"), tabLCD = mkTab("∑ LCD1 Solver");
  const ver = el("span", { title: "App version (updates on Check for Updates)", style:
    `align-self:center;color:${SUB};font:600 10px 'Outfit',sans-serif;padding:0 8px 0 4px;opacity:.7;` }, VERSION);
  bar.append(tabBDR, tabLCD, ver);
  document.body.appendChild(bar);

  // ---- panel ----
  const panel = el("div", { id: "lcd-panel", style:
    "position:fixed;inset:0;z-index:900;display:none;grid-template-columns:1fr;" +
    "background:var(--bg-primary,#0f172a);padding:60px 0 0 0;overflow:hidden;" });

  // left column (scrolls)
  const left = el("div", { style: `padding:20px 24px;overflow:auto;display:flex;flex-direction:column;gap:14px;` });

  // header
  left.append(el("h2", { style: `margin:0;color:${TXT};font:700 16px 'Outfit',sans-serif;` }, "∑ LCD1 Solver"));

  // system input — one box for everything
  const sysBox = el("textarea", { id: "lcd-sys", rows: "1", placeholder: "G(s) = e.g.  12/((s+2)*(s+3))   or   K/(s*(s+a))", style:
    `width:100%;resize:none;background:rgba(15,23,42,0.6);color:${TXT};border:1px solid #3b82f6;border-radius:10px;padding:12px 14px;font:15px 'JetBrains Mono',monospace;` });
  const echo = el("div", { id: "lcd-echo", style: `margin-top:7px;font:12px 'JetBrains Mono';color:#6ee7b7;min-height:16px;` });
  left.append(el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "System — one box for everything"));
  left.append(sysBox, echo);
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

  state.sysBox = sysBox; state.echo = echo; state.board = board;
  sysBox.addEventListener("input", () => analyzeAndRender());
  state.analyzeAndRender = analyzeAndRender;

  panel.append(left);
  document.body.appendChild(panel);

  // ---- behaviour ----
  const appContainer = document.querySelector(".app-container");
  const setMode = (lcd) => {
    panel.style.display = lcd ? "grid" : "none";
    if (appContainer) appContainer.style.visibility = lcd ? "hidden" : "visible";
    tabLCD.style.background = lcd ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "transparent";
    tabLCD.style.color = lcd ? "#fff" : SUB;
    tabBDR.style.background = lcd ? "transparent" : "linear-gradient(135deg,#3b82f6,#6366f1)";
    tabBDR.style.color = lcd ? SUB : "#fff";
  };
  tabBDR.onclick = () => setMode(false);
  tabLCD.onclick = () => setMode(true);
  setMode(false);

  // ---- Block Diagram -> LCD1 bridge ----
  state.setMode = setMode;
  const chooser = el("div", { id: "lcd-from-diagram", style:
    `display:none;flex-direction:column;gap:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:12px;` });
  left.prepend(chooser);
  state.chooser = chooser;
  state.setG = (fn, tf) => { state.sysBox.value = tf; analyzeAndRender(); };
  state.setRef = (tf) => { state.sysBox.value = tf; analyzeAndRender(); };
  state.setL = (tf) => { state.sysBox.value = tf; analyzeAndRender(); };

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
function renderPlotPanel(pd, defaultTab = "Step") {
  const wrap = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
  const tabs = el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;" });

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
  tabs.append(fileBtn, opacity, clearBtn);

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
