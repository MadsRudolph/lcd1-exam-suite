// LCD1 Solver mode for the merged app. Self-contained: builds a floating mode
// switcher + a full-screen LCD1 panel overlaid on the Block Diagram Reducer,
// so BDR's layout is untouched. Wires the paste-zone to the LCD1 engine.
import { solveQuestion } from "./lcd-engine.js";

const SAMPLE = `A closed-loop system has a loop transfer function L(s) = K/(s(s+3)(s+10)).
What is the gain K so that the phase margin is PM = 40 degrees?
1. K = 19.5
2. K = 44
3. K = 88`;

const FLAG_STYLE = {
  match: { color: "#10b981", label: "✓ match" },
  also_plausible: { color: "#f59e0b", label: "≈ plausible" },
  no_match: { color: "var(--text-secondary)", label: "" },
  unparseable: { color: "#ef4444", label: "? unparseable" },
};

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => (k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v)));
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function renderKatex(target, latex) {
  if (window.katex) {
    try {
      window.katex.render(latex, target, { throwOnError: false, displayMode: true });
      return;
    } catch { /* fall through to text */ }
  }
  target.textContent = latex;
}

function init() {
  // ---- floating mode switcher ----
  const bar = el("div", { id: "mode-switcher", style:
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:4px;" +
    "background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid var(--border-color,#334155);" +
    "border-radius:999px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4);" });
  const mkTab = (label) => el("button", { class: "mode-tab", style:
    "border:none;background:transparent;color:var(--text-secondary,#94a3b8);font:600 12px/1 'Outfit',sans-serif;" +
    "padding:8px 16px;border-radius:999px;cursor:pointer;transition:all .15s;" }, label);
  const tabBDR = mkTab("◧ Block Diagram");
  const tabLCD = mkTab("∑ LCD1 Solver");
  bar.append(tabBDR, tabLCD);
  document.body.appendChild(bar);

  // ---- LCD1 full-screen panel (overlay) ----
  const panel = el("div", { id: "lcd-panel", style:
    "position:fixed;inset:0;z-index:900;display:none;grid-template-columns:1fr 1fr;gap:0;" +
    "background:var(--bg-primary,#0f172a);padding:64px 0 0 0;" });

  // left: paste zone
  const left = el("div", { style: "display:flex;flex-direction:column;padding:24px;gap:14px;border-right:1px solid var(--border-color,#334155);overflow:auto;" });
  left.append(
    el("h2", { style: "margin:0;color:var(--text-primary,#e2e8f0);font:700 18px 'Outfit',sans-serif;" }, "★ Smart Paste — Exam Question"),
    el("p", { style: "margin:0;color:var(--text-secondary,#94a3b8);font:400 12px 'Inter',sans-serif;line-height:1.5;" },
      "Paste a full exam question (prompt + multiple-choice options). Garbled PDF copy-paste is handled. The solver routes it, computes the answer, and flags the matching option."),
  );
  const ta = el("textarea", { id: "lcd-input", placeholder: "Paste exam question here…", style:
    "flex:1;min-height:280px;resize:vertical;background:rgba(30,41,59,0.4);color:var(--text-primary,#e2e8f0);" +
    "border:1px solid var(--border-color,#334155);border-radius:10px;padding:14px;font:13px/1.5 'JetBrains Mono',monospace;" });
  const btnRow = el("div", { style: "display:flex;gap:10px;" });
  const solveBtn = el("button", { id: "lcd-solve", style:
    "flex:1;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border:none;border-radius:10px;" +
    "padding:12px;font:600 13px 'Outfit',sans-serif;cursor:pointer;" }, "Solve & Match Options");
  const sampleBtn = el("button", { id: "lcd-sample", style:
    "background:rgba(30,41,59,0.6);color:var(--text-secondary,#94a3b8);border:1px solid var(--border-color,#334155);" +
    "border-radius:10px;padding:12px 16px;font:600 12px 'Outfit',sans-serif;cursor:pointer;" }, "Try a sample");
  btnRow.append(solveBtn, sampleBtn);
  left.append(ta, btnRow);

  // right: results
  const right = el("div", { id: "lcd-results", style: "padding:24px;overflow:auto;display:flex;flex-direction:column;gap:16px;" });
  right.append(el("div", { id: "lcd-results-body", style: "color:var(--text-secondary,#94a3b8);font:13px 'Inter',sans-serif;" },
    "<div style='text-align:center;margin-top:60px;font-style:italic;'>Results will appear here.</div>"));

  panel.append(left, right);
  document.body.appendChild(panel);

  // ---- mode toggling ----
  const appContainer = document.querySelector(".app-container");
  const setMode = (mode) => {
    const lcd = mode === "lcd";
    panel.style.display = lcd ? "grid" : "none";
    if (appContainer) appContainer.style.visibility = lcd ? "hidden" : "visible";
    for (const [tab, active] of [[tabLCD, lcd], [tabBDR, !lcd]]) {
      tab.style.background = active ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "transparent";
      tab.style.color = active ? "#fff" : "var(--text-secondary,#94a3b8)";
    }
  };
  tabBDR.onclick = () => setMode("bdr");
  tabLCD.onclick = () => setMode("lcd");
  setMode("bdr");

  // ---- solving ----
  const body = right.querySelector("#lcd-results-body");
  const doSolve = () => {
    const res = solveQuestion(ta.value.trim());
    renderResults(body, res);
  };
  solveBtn.onclick = doSolve;
  sampleBtn.onclick = () => { ta.value = SAMPLE; doSolve(); };
}

function renderResults(body, res) {
  body.innerHTML = "";
  if (!res.ok) {
    body.append(el("div", { style: "color:#ef4444;font:13px 'Inter';" }, res.note || "Could not parse."));
    return;
  }
  // routed badge
  body.append(el("div", { style:
    "display:inline-block;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);" +
    "border-radius:999px;padding:5px 12px;font:600 11px 'Outfit';" }, res.prettyName));

  // main result card
  if (res.latex) {
    const card = el("div", { class: "section-card", style:
      "background:rgba(30,41,59,0.35);border:1px solid var(--border-color,#334155);border-radius:12px;padding:18px;" });
    card.append(el("div", { style: "color:var(--text-secondary,#94a3b8);font:600 11px 'Outfit';margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;" }, "Result"));
    const math = el("div", { style: "color:var(--text-primary,#e2e8f0);overflow-x:auto;" });
    renderKatex(math, res.latex);
    card.append(math);
    body.append(card);
  }

  // summary table
  if (res.summary && res.summary.length) {
    const tbl = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font:13px 'JetBrains Mono',monospace;" });
    for (const [k, v] of res.summary) {
      const key = el("div", { style: "color:var(--text-secondary,#94a3b8);" });
      try { window.katex ? window.katex.render(k, key, { throwOnError: false, displayMode: false }) : (key.textContent = k); }
      catch { key.textContent = k; }
      tbl.append(key, el("div", { style: "color:var(--text-primary,#e2e8f0);" }, String(v)));
    }
    body.append(tbl);
  }

  // options with flags
  if (res.options && res.options.length) {
    body.append(el("div", { style: "color:var(--text-secondary,#94a3b8);font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;margin-top:6px;" }, "Options"));
    const list = el("div", { style: "display:flex;flex-direction:column;gap:6px;" });
    for (const o of res.options) {
      const st = FLAG_STYLE[o.flag] || FLAG_STYLE.no_match;
      const row = el("div", { style:
        `display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;` +
        `border:1px solid ${o.flag === "match" ? "rgba(16,185,129,0.4)" : "var(--border-color,#334155)"};` +
        `background:${o.flag === "match" ? "rgba(16,185,129,0.08)" : "rgba(30,41,59,0.25)"};font:13px 'JetBrains Mono';` });
      row.append(
        el("span", { style: `color:${st.color};` }, o.raw_text),
        el("span", { style: `color:${st.color};font:600 11px 'Outfit';` }, st.label + (o.note ? `  ${o.note}` : "")),
      );
      list.append(row);
    }
    body.append(list);
  }

  if (res.note) {
    body.append(el("div", { style: "color:#f59e0b;font:13px 'Inter';line-height:1.5;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;" }, res.note));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
