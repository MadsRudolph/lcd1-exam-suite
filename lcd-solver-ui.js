// LCD1 Solver mode: a floating switcher + a full-screen panel overlaid on the
// Block Diagram Reducer. Form-centric: every solver shows its editable fields,
// and Smart Paste *pre-fills* the matching form (you review/correct, then solve).
import { FORMS, formByFn } from "./lcd-forms.js";
import { runSolver, routeQuestion } from "./lcd-engine.js";
import { setHandoff, consumeHandoff } from "./lcd-handoff.js";
import { solveBlockDiagram } from "./solver.js";

const VERSION = "v1.2.0";

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

const SAMPLE = `A P-controller with gain KP is applied and the loop is closed with unit feedback.
If the steady state error ess = 0.555, the proportional gain KP is approximately:
a) KP = 1
b) KP = 2
c) KP = 2.5
d) KP = 0.4
G(0) = -7.9588 dB`;

const FLAG = {
  match: { c: "#10b981", t: "✓ match" },
  also_plausible: { c: "#f59e0b", t: "≈ plausible" },
  no_match: { c: "var(--text-secondary,#94a3b8)", t: "" },
  unparseable: { c: "#ef4444", t: "? unparseable" },
};
const BORDER = "var(--border-color,#334155)";
const TXT = "var(--text-primary,#e2e8f0)";
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

let state = { form: null, fields: new Map(), matchKey: null, optionsEl: null, resultsEl: null };

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
    "position:fixed;inset:0;z-index:900;display:none;grid-template-columns:minmax(420px,1fr) 1fr;" +
    "background:var(--bg-primary,#0f172a);padding:60px 0 0 0;overflow:hidden;" });

  // left column (scrolls)
  const left = el("div", { style: `padding:20px 24px;overflow:auto;border-right:1px solid ${BORDER};display:flex;flex-direction:column;gap:14px;` });

  // Smart Paste section
  left.append(el("h2", { style: `margin:0;color:${TXT};font:700 16px 'Outfit',sans-serif;` }, "∑ LCD1 Solver"));
  left.append(el("p", { style: `margin:0;color:${SUB};font:400 12px 'Inter';line-height:1.5;` },
    "Pick a solver and fill the fields — values you read off a graph (φ_G, G(0), …) go straight in. Or paste a question to <b>pre-fill</b> the form, then check it before solving."));

  const ta = el("textarea", { id: "lcd-input", placeholder: "Optional: paste an exam question to auto-fill the form…", style:
    `min-height:90px;resize:vertical;background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:10px;padding:10px;font:12px/1.5 'JetBrains Mono',monospace;` });
  const pasteRow = el("div", { style: "display:flex;gap:8px;" });
  const pasteBtn = el("button", { style: `flex:1;background:rgba(99,102,241,0.18);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:9px;font:600 12px 'Outfit';cursor:pointer;` }, "Parse & fill form ↓");
  const sampleBtn = el("button", { style: `background:rgba(30,41,59,0.6);color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:9px 14px;font:600 12px 'Outfit';cursor:pointer;` }, "Sample");
  pasteRow.append(pasteBtn, sampleBtn);
  left.append(ta, pasteRow);

  // solver picker
  left.append(el("div", { style: `height:1px;background:${BORDER};margin:4px 0;` }));
  const pickerLabel = el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "Solver");
  const picker = el("select", { id: "lcd-picker", style:
    `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:9px;font:13px 'Inter';cursor:pointer;` });
  const groups = {};
  for (const f of FORMS) {
    const g = groups[f.pattern] || (groups[f.pattern] = el("optgroup", { label: f.pattern }));
    g.append(el("option", { value: f.fn }, f.title.replace(/^P\d+ — /, "") + " — " + f.variant));
  }
  Object.values(groups).forEach((g) => picker.append(g));
  left.append(pickerLabel, picker);

  const explain = el("div", { style: `color:${SUB};font:400 11px 'Inter';line-height:1.5;font-style:italic;` });
  left.append(explain);

  // form fields container
  const formBox = el("div", { id: "lcd-form", style: "display:flex;flex-direction:column;gap:10px;" });
  left.append(formBox);

  // options
  const optLabel = el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;margin-top:4px;` }, "Multiple-choice options (one per line)");
  const optEl = el("textarea", { placeholder: "2\n0.4\n2.5", style:
    `min-height:64px;resize:vertical;background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:9px;font:12px/1.5 'JetBrains Mono',monospace;` });
  left.append(optLabel, optEl);
  state.optionsEl = optEl;

  // match-against (DICT) + solve
  const matchWrap = el("div", { id: "lcd-matchwrap", style: "display:none;flex-direction:column;gap:4px;" });
  const matchLabel = el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "Match options against");
  const matchSel = el("select", { id: "lcd-matchkey", style: `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:13px 'Inter';cursor:pointer;` });
  matchWrap.append(matchLabel, matchSel);
  left.append(matchWrap);

  const solveBtn = el("button", { style:
    "background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:10px;padding:12px;font:600 13px 'Outfit';cursor:pointer;margin-top:4px;" }, "Solve & Match Options");
  left.append(solveBtn);

  // right column (results)
  const right = el("div", { style: "padding:24px;overflow:auto;" });
  const results = el("div", { id: "lcd-results", style: `color:${SUB};font:13px 'Inter';display:flex;flex-direction:column;gap:14px;` },
    "<div style='text-align:center;margin-top:60px;font-style:italic;'>Fill a form (or paste a question) and solve.</div>");
  right.append(results);
  state.resultsEl = results;

  panel.append(left, right);
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

  const selectForm = (fn) => { picker.value = fn; renderForm(formByFn(fn), formBox, explain, matchWrap, matchSel); };
  picker.onchange = () => selectForm(picker.value);
  solveBtn.onclick = solve;
  matchSel.onchange = () => { state.matchKey = matchSel.value; solve(); };
  pasteBtn.onclick = () => doPaste(ta.value, selectForm, optEl, matchSel, matchWrap);
  sampleBtn.onclick = () => { ta.value = SAMPLE; doPaste(SAMPLE, selectForm, optEl, matchSel, matchWrap); };

  // ---- Block Diagram -> LCD1 bridge ----
  state.setMode = setMode;
  state.selectForm = selectForm;
  const chooser = el("div", { id: "lcd-from-diagram", style:
    `display:none;flex-direction:column;gap:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:12px;` });
  left.prepend(chooser);
  state.chooser = chooser;
  state.setG = (fn, tf) => {
    selectForm(fn);
    const gField = state.fields.get("G");
    if (gField) gField.value = tf;
    solve();
  };

  window.LCDBridge = {
    onSolved: (result, canvas) => mountUseButton(result, canvas),
    onSolveFailed: () => { const b = document.getElementById("use-in-lcd-btn"); if (b) b.style.display = "none"; },
  };

  selectForm(FORMS[0].fn);
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
  const symbols = symbolsInCanvas(canvas);
  if (symbols.length === 0) {
    enterFromDiagram(normalizeTf(result.finalTransferFunction.toFormulaString()));
    return;
  }
  // Symbolic: ask for numeric values, substitute into block values, re-solve numerically.
  showSubstitutionModal(symbols, (values) => {
    const numericNodes = canvas.nodes.map((n) => {
      if (n.type !== "block" || !n.value) return n;
      let v = String(n.value);
      for (const sym of symbols) v = v.replace(new RegExp(`\\b${sym}\\b`, "g"), `(${values[sym]})`);
      return { ...n, value: v };
    });
    try {
      const num = solveBlockDiagram(numericNodes, canvas.connections);
      enterFromDiagram(normalizeTf(num.finalTransferFunction.toFormulaString()));
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

function enterFromDiagram(tf) {
  setHandoff(tf);
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
  c.append(el("div", { style: `color:${SUB};font:11px 'Inter';` }, "What do you want to do with it?"));
  const chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;" });
  for (const ch of BRIDGE_CHOICES) {
    const chip = el("button", { title: `treats G as ${ch.note}`, style:
      `background:rgba(30,41,59,0.7);color:${TXT};border:1px solid ${BORDER};border-radius:999px;padding:6px 11px;font:600 11px 'Outfit';cursor:pointer;` });
    chip.textContent = `${ch.label} · ${ch.note}`;
    chip.onclick = () => { const handoff = consumeHandoff() || tf; state.setG(ch.fn, handoff); c.style.display = "none"; };
    chips.append(chip);
  }
  c.append(chips);
}

function renderForm(form, box, explain, matchWrap, matchSel) {
  state.form = form;
  state.fields = new Map();
  state.matchKey = form.dictMatchKeys ? form.dictMatchKeys[0] : null;
  box.innerHTML = "";
  explain.textContent = form.explanation || "";

  for (const f of form.fields) {
    const row = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
    row.append(el("label", { title: f.tooltip || "", style: `color:${SUB};font:500 12px 'Inter';` }, f.label));
    let input;
    if (f.kind === "dropdown") {
      input = el("select", { title: f.tooltip || "", style: `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:13px 'Inter';` });
      for (const o of f.options) input.append(el("option", { value: o }, o));
      if (f.default) input.value = f.default;
    } else {
      input = el("input", { type: "text", title: f.tooltip || "", placeholder: f.placeholder || "", value: f.default || "", style:
        `background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:9px;font:13px 'JetBrains Mono',monospace;` });
    }
    state.fields.set(f.name, input);
    row.append(input);
    box.append(row);
  }

  // match-against dropdown for DICT solvers
  if (form.dictMatchKeys) {
    matchSel.innerHTML = "";
    for (const k of form.dictMatchKeys) matchSel.append(el("option", { value: k }, k));
    matchSel.value = state.matchKey;
    matchWrap.style.display = "flex";
  } else {
    matchWrap.style.display = "none";
  }
}

function gather() {
  const inp = {};
  for (const [name, input] of state.fields) inp[name] = input.value;
  return inp;
}

function solve() {
  if (!state.form) return;
  const res = runSolver(state.form.fn, gather(), state.optionsEl.value.trim(), state.matchKey);
  renderResults(state.resultsEl, res);
}

function doPaste(text, selectForm, optEl, matchSel, matchWrap) {
  if (!text.trim()) return;
  const r = routeQuestion(text);
  if (!r) { renderResults(state.resultsEl, { ok: false, note: "Could not match this question to a solver. Pick one manually and fill the fields." }); return; }
  selectForm(r.fn);
  // fill fields that the form has
  for (const [name, input] of state.fields) {
    if (r.inputs[name] !== undefined && r.inputs[name] !== null) input.value = String(r.inputs[name]);
  }
  if (r.options) optEl.value = r.options;
  if (r.match_key && state.form.dictMatchKeys && state.form.dictMatchKeys.includes(r.match_key)) {
    state.matchKey = r.match_key; matchSel.value = r.match_key;
  }
  solve();
}

function renderResults(body, res) {
  body.innerHTML = "";
  if (!res.ok) {
    body.append(el("div", { style: `color:#f59e0b;font:13px 'Inter';line-height:1.5;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;` }, res.note || "Could not solve."));
    return;
  }
  body.append(el("div", { style:
    `display:inline-block;align-self:flex-start;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:999px;padding:5px 12px;font:600 11px 'Outfit';` }, res.prettyName));

  if (res.latex) {
    const card = el("div", { style: `background:rgba(30,41,59,0.35);border:1px solid ${BORDER};border-radius:12px;padding:18px;` });
    card.append(el("div", { style: `color:${SUB};font:600 11px 'Outfit';margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;` }, "Result"));
    const m = el("div", { style: `color:${TXT};overflow-x:auto;` });
    katex(m, res.latex, true);
    card.append(m);
    body.append(card);
  }

  if (res.summary && res.summary.length) {
    body.append(el("div", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "All computed values"));
    const tbl = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font:13px 'JetBrains Mono';" });
    for (const [k, v] of res.summary) {
      const key = el("div", { style: `color:${res.matchedKey === k ? "#10b981" : SUB};` }); key.textContent = k;
      tbl.append(key, el("div", { style: `color:${TXT};` }, String(v)));
    }
    body.append(tbl);
  }

  if (res.options && res.options.length) {
    body.append(el("div", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;margin-top:4px;` }, "Options"));
    const list = el("div", { style: "display:flex;flex-direction:column;gap:6px;" });
    for (const o of res.options) {
      const st = FLAG[o.flag] || FLAG.no_match;
      const row = el("div", { style:
        `display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;` +
        `border:1px solid ${o.flag === "match" ? "rgba(16,185,129,0.4)" : BORDER};background:${o.flag === "match" ? "rgba(16,185,129,0.08)" : "rgba(30,41,59,0.25)"};font:13px 'JetBrains Mono';` });
      // textContent (NOT innerHTML) — o.raw_text is user-pasted; never inject it as markup.
      const valSpan = el("span", { style: `color:${st.c};` }); valSpan.textContent = o.raw_text;
      const tagSpan = el("span", { style: `color:${st.c};font:600 11px 'Outfit';` }); tagSpan.textContent = st.t + (o.note ? `  ${o.note}` : "");
      row.append(valSpan, tagSpan);
      list.append(row);
    }
    body.append(list);
  }

  if (res.note) body.append(el("div", { style: `color:#f59e0b;font:13px 'Inter';line-height:1.5;` }, res.note));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
