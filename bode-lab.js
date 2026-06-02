// bode-lab.js
// Interactive Bode Lab: place poles (×) and zeros (○) on the s-plane by mouse
// and watch the Bode magnitude/phase update live — with the SAME hover read-off
// and gain/phase-margin annotations as the Solver tab. The placed roots are the
// source of truth; they are turned into a real NumericTF (spike/solvers/bodelab.js)
// and fed through the suite's own bodeData / margins / bodePlot / attachHover so
// the lab plot is identical in behaviour to the rest of the app.
//
// Bridges: a system can move between all three tabs — Block Diagram → Bode Lab
// and Solver ⇄ Bode Lab (Diagram → Solver already exists), so the lab is part of
// the workflow, not a dead end.
import {
  bodeFromPZ, tfStringFromPZ, tfExprFromPZ, numericTfFromRoots, PRESETS,
} from "./spike/solvers/bodelab.js";
import { bodePlot } from "./plot-svg.js";
import { attachHover } from "./plot-interact.js";
import { bodeData } from "./spike/solvers/plotdata.js";
import { solveMargins } from "./spike/numeric/margins.js";
import { bandwidth } from "./spike/solvers/analysis.js";

const NS = "http://www.w3.org/2000/svg";
const TXT = "var(--text-primary,#f8fafc)";
const SUB = "var(--text-secondary,#94a3b8)";
const BORDER = "var(--border-color,#334155)";
const POLE = "#ef4444"; // red ×
const ZERO = "#10b981"; // teal/green ○

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => (k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v)));
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function cssVar(name, fallback) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function fmtTick(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-2 || a >= 1e4)) return v.toExponential(0);
  return String(Number(v.toFixed(a < 1 ? 2 : 0)));
}
const fmtNum = (x) => (x == null || Number.isNaN(x) ? "—" : x === Infinity ? "∞" : x === -Infinity ? "-∞" : String(Number(x.toPrecision(3))));

// s-plane pixel geometry (the SVG user-space box is fixed; data↔pixel mapping
// uses the live view window so zoom/pan just change the window, not the box).
const SP = { W: 440, H: 440, l: 46, r: 14, t: 26, b: 34 };
SP.pw = SP.W - SP.l - SP.r;
SP.ph = SP.H - SP.t - SP.b;

export function buildBodeLab(opts = {}) {
  // ── state ────────────────────────────────────────────────────────────────
  const st = {
    poles: [],
    zeros: [],
    K: 1,
    view: { xmin: -300, xmax: 300, ymin: -300, ymax: 300 },
    drag: null,   // { kind:'pole'|'zero', idx, ox, oy }
    pan: null,    // { ux, uy, view }
  };

  // ── coordinate mapping (data ↔ pixel within current view) ──────────────────
  const px = (re) => SP.l + (re - st.view.xmin) / (st.view.xmax - st.view.xmin) * SP.pw;
  const py = (im) => SP.t + SP.ph - (im - st.view.ymin) / (st.view.ymax - st.view.ymin) * SP.ph;
  const invX = (X) => st.view.xmin + (X - SP.l) / SP.pw * (st.view.xmax - st.view.xmin);
  const invY = (Y) => st.view.ymin + (SP.t + SP.ph - Y) / SP.ph * (st.view.ymax - st.view.ymin);

  // client mouse → SVG user-space coords (viewBox is "0 0 W H")
  const toUser = (e) => {
    const r = splane.getBoundingClientRect();
    return { ux: (e.clientX - r.left) / r.width * SP.W, uy: (e.clientY - r.top) / r.height * SP.H };
  };

  function hitTest(re, im) {
    const span = Math.max(st.view.xmax - st.view.xmin, st.view.ymax - st.view.ymin);
    const tol = span * 0.04;
    let best = null, bestD = tol;
    st.poles.forEach((p, i) => { const d = Math.hypot(p.re - re, p.im - im); if (d < bestD) { bestD = d; best = { kind: "pole", idx: i }; } });
    st.zeros.forEach((z, i) => { const d = Math.hypot(z.re - re, z.im - im); if (d < bestD) { bestD = d; best = { kind: "zero", idx: i }; } });
    return best;
  }

  function fitView() {
    const pts = [...st.poles, ...st.zeros];
    if (!pts.length) { st.view = { xmin: -300, xmax: 300, ymin: -300, ymax: 300 }; return; }
    const re = pts.map((p) => p.re), im = pts.map((p) => p.im);
    const cx = (Math.max(...re) + Math.min(...re)) / 2, cy = (Math.max(...im) + Math.min(...im)) / 2;
    const half = Math.max(Math.max(...re) - Math.min(...re), Math.max(...im) - Math.min(...im), 20) * 0.7 + 50;
    st.view = { xmin: cx - half, xmax: cx + half, ymin: cy - half, ymax: cy + half };
  }

  // ── s-plane SVG (markup rebuilt on each change; the element & its listeners
  // persist so we only swap innerHTML) ──────────────────────────────────────
  const splane = document.createElementNS(NS, "svg");
  splane.setAttribute("viewBox", `0 0 ${SP.W} ${SP.H}`);
  splane.setAttribute("width", "100%");
  splane.style.cssText = "max-width:480px;background:var(--inset,rgba(15,23,42,0.6));border:1px solid " + BORDER + ";border-radius:12px;cursor:crosshair;touch-action:none;";

  function renderSplane() {
    const grid = cssVar("--plot-grid", "rgba(148,163,184,0.18)");
    const axis = cssVar("--plot-axis", "#64748b");
    const text = cssVar("--plot-text", "#94a3b8");
    const v = st.view;
    const p = [];
    // stable region (Re<0) shading, clamped to the plot box
    const xZero = Math.max(SP.l, Math.min(SP.l + SP.pw, px(0)));
    if (xZero > SP.l) p.push(`<rect x="${SP.l}" y="${SP.t}" width="${(xZero - SP.l).toFixed(1)}" height="${SP.ph}" fill="rgba(16,185,129,0.08)"/>`);
    // grid + ticks (8 divisions)
    for (let i = 0; i <= 8; i++) {
      const gx = SP.l + SP.pw * i / 8, gy = SP.t + SP.ph * i / 8;
      p.push(`<line x1="${gx.toFixed(1)}" y1="${SP.t}" x2="${gx.toFixed(1)}" y2="${SP.t + SP.ph}" stroke="${grid}"/>`);
      p.push(`<line x1="${SP.l}" y1="${gy.toFixed(1)}" x2="${SP.l + SP.pw}" y2="${gy.toFixed(1)}" stroke="${grid}"/>`);
      const xv = v.xmin + (v.xmax - v.xmin) * i / 8;
      const yv = v.ymax - (v.ymax - v.ymin) * i / 8;
      p.push(`<text x="${gx.toFixed(1)}" y="${SP.t + SP.ph + 13}" fill="${text}" font-size="8" text-anchor="middle" font-family="monospace">${fmtTick(xv)}</text>`);
      p.push(`<text x="${SP.l - 5}" y="${(gy + 3).toFixed(1)}" fill="${text}" font-size="8" text-anchor="end" font-family="monospace">${fmtTick(yv)}</text>`);
    }
    // axes: jω axis (Re=0) is the stability boundary → solid green; real axis grey
    if (px(0) >= SP.l && px(0) <= SP.l + SP.pw) p.push(`<line x1="${px(0).toFixed(1)}" y1="${SP.t}" x2="${px(0).toFixed(1)}" y2="${SP.t + SP.ph}" stroke="${ZERO}" stroke-width="1.3"/>`);
    if (py(0) >= SP.t && py(0) <= SP.t + SP.ph) p.push(`<line x1="${SP.l}" y1="${py(0).toFixed(1)}" x2="${SP.l + SP.pw}" y2="${py(0).toFixed(1)}" stroke="${axis}"/>`);
    p.push(`<rect x="${SP.l}" y="${SP.t}" width="${SP.pw}" height="${SP.ph}" fill="none" stroke="${axis}"/>`);
    p.push(`<text x="${SP.l + SP.pw / 2}" y="${SP.H - 3}" fill="${text}" font-size="9" text-anchor="middle">Real  σ  [rad/s]</text>`);
    p.push(`<text x="12" y="${SP.t + SP.ph / 2}" fill="${text}" font-size="9" text-anchor="middle" transform="rotate(-90 12 ${SP.t + SP.ph / 2})">Imag  jω  [rad/s]</text>`);
    p.push(`<text x="${SP.l + SP.pw / 2}" y="16" fill="${cssVar("--plot-fg", "#e2e8f0")}" font-size="10" text-anchor="middle" font-weight="bold">S-plane — left-click pole · right-click zero · drag move · dbl-click delete</text>`);
    // markers (clipped to the box)
    const clip = `clip-path="url(#splaneClip)"`;
    p.push(`<clipPath id="splaneClip"><rect x="${SP.l}" y="${SP.t}" width="${SP.pw}" height="${SP.ph}"/></clipPath>`);
    for (const pole of st.poles) {
      const X = px(pole.re), Y = py(pole.im), r = 8;
      p.push(`<g ${clip}><line x1="${(X - r).toFixed(1)}" y1="${(Y - r).toFixed(1)}" x2="${(X + r).toFixed(1)}" y2="${(Y + r).toFixed(1)}" stroke="${POLE}" stroke-width="2.6"/><line x1="${(X - r).toFixed(1)}" y1="${(Y + r).toFixed(1)}" x2="${(X + r).toFixed(1)}" y2="${(Y - r).toFixed(1)}" stroke="${POLE}" stroke-width="2.6"/></g>`);
    }
    for (const zero of st.zeros) {
      const X = px(zero.re), Y = py(zero.im);
      p.push(`<circle ${clip} cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="7" fill="none" stroke="${ZERO}" stroke-width="2.4"/>`);
    }
    // legend chips
    let lx = SP.l + 4;
    if (st.poles.length) { p.push(`<text x="${lx}" y="${SP.t + 14}" fill="${POLE}" font-size="11" font-family="monospace">×</text><text x="${lx + 12}" y="${SP.t + 14}" fill="${text}" font-size="9">poles (${st.poles.length})</text>`); lx += 78; }
    if (st.zeros.length) { p.push(`<text x="${lx}" y="${SP.t + 14}" fill="${ZERO}" font-size="11" font-family="monospace">○</text><text x="${lx + 12}" y="${SP.t + 14}" fill="${text}" font-size="9">zeros (${st.zeros.length})</text>`); }
    splane.innerHTML = p.join("");
  }

  // ── live Bode panels — reuse the suite's own bodePlot + attachHover so the
  // hover crosshair read-off and the ω_c / ω_π / GM / PM / BW annotations are
  // identical to the Solver tab ──────────────────────────────────────────────
  const bodeHost = el("div", { style: "min-width:300px;flex:1;" });
  const metaLine = el("div", { style: `font:12px 'JetBrains Mono';margin-top:4px;color:${SUB};` });

  function renderBode() {
    if (!st.poles.length && !st.zeros.length) {
      bodeHost.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:360px;color:${SUB};border:1px dashed ${BORDER};border-radius:12px;font:13px 'Inter';">place a pole or zero (or pick a preset) to see the Bode plot</div>`;
      tfLine.innerHTML = `<span style="color:${SUB}">G(s) will appear here.</span>`;
      metaLine.textContent = "";
      sendBtn.disabled = true; sendBtn.style.opacity = "0.5";
      return;
    }
    const conv = numericTfFromRoots(st.poles, st.zeros, st.K);
    let bode, ann = {}, note = "";
    if (conv.ok) {
      const tf = conv.tf;
      bode = bodeData(tf);
      try { const m = solveMargins(tf);
        if (Number.isFinite(m.GM_dB)) ann.GM_dB = m.GM_dB;
        if (Number.isFinite(m.PM_deg)) ann.PM_deg = m.PM_deg;
        if (Number.isFinite(m.omega_gc)) ann.omega_gc = m.omega_gc;
        if (Number.isFinite(m.omega_pc)) ann.omega_pc = m.omega_pc;
      } catch { /* no margins for this system */ }
      try { const bw = bandwidth(tf); if (Number.isFinite(bw)) ann.omega_BW = bw; } catch { /* no bandwidth */ }
      const expr = tfExprFromPZ(st.poles, st.zeros, st.K);
      tfLine.innerHTML = `<span style="color:${SUB}">G(s) = </span><span style="color:var(--accent-blue,#a5b4fc)">${esc(tfStringFromPZ(st.poles, st.zeros))}</span>${Math.abs(st.K - 1) > 1e-9 ? `<span style="color:${SUB}">   (×K=${fmtNum(st.K)})</span>` : ""}`;
      metaLine.innerHTML =
        `ω_c (gain xover): <b style="color:#10b981">${fmtNum(ann.omega_gc)}</b>   ` +
        `ω_π (phase xover): <b style="color:#f59e0b">${fmtNum(ann.omega_pc)}</b>   ` +
        `GM: <b style="color:${TXT}">${fmtNum(ann.GM_dB)} dB</b>   ` +
        `PM: <b style="color:${TXT}">${fmtNum(ann.PM_deg)}°</b>   ` +
        `BW: <b style="color:#a78bfa">${fmtNum(ann.omega_BW)}</b>`;
      sendBtn.disabled = !expr; sendBtn.style.opacity = expr ? "1" : "0.5";
    } else {
      // an unpaired complex root → not a real system; still show the magnitude/
      // phase via direct G(jω) evaluation, but margins need a real conjugate pair.
      bode = bodeFromPZ(st.poles, st.zeros, { normalize: false });
      note = "⚠ A complex root has no conjugate partner. Place complex roots in ± pairs (mirror across the real axis) for a real system with gain/phase margins.";
      tfLine.innerHTML = `<span style="color:var(--warn,#fcd34d)">${esc(note)}</span>`;
      metaLine.textContent = "";
      sendBtn.disabled = true; sendBtn.style.opacity = "0.5";
    }
    bodeHost.innerHTML = bodePlot(bode, ann); // generated SVG string — safe, no user markup
    attachHover(bodeHost, { bode });
  }

  function redraw() { renderSplane(); renderBode(); }

  // ── interaction ────────────────────────────────────────────────────────────
  splane.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const { ux, uy } = toUser(e);
    if (ux < SP.l || ux > SP.l + SP.pw || uy < SP.t || uy > SP.t + SP.ph) return;
    st.zeros.push({ re: invX(ux), im: invY(uy) });
    redraw();
  });
  splane.addEventListener("dblclick", (e) => {
    const { ux, uy } = toUser(e);
    const hit = hitTest(invX(ux), invY(uy));
    if (hit) { (hit.kind === "pole" ? st.poles : st.zeros).splice(hit.idx, 1); redraw(); }
  });
  splane.addEventListener("mousedown", (e) => {
    const { ux, uy } = toUser(e);
    const re = invX(ux), im = invY(uy);
    if (e.button === 1) { e.preventDefault(); st.pan = { ux, uy, view: { ...st.view } }; return; }
    if (e.button !== 0) return; // right handled by contextmenu
    if (ux < SP.l || ux > SP.l + SP.pw || uy < SP.t || uy > SP.t + SP.ph) return;
    const hit = hitTest(re, im);
    if (hit) {
      const ref = (hit.kind === "pole" ? st.poles : st.zeros)[hit.idx];
      st.drag = { ...hit, ox: re - ref.re, oy: im - ref.im };
    } else {
      st.poles.push({ re, im }); // left-click on empty → add pole
      redraw();
    }
  });
  window.addEventListener("mousemove", (e) => {
    if (st.pan) {
      const { ux, uy } = toUser(e);
      const dx = (ux - st.pan.ux) / SP.pw * (st.pan.view.xmax - st.pan.view.xmin);
      const dy = (uy - st.pan.uy) / SP.ph * (st.pan.view.ymax - st.pan.view.ymin);
      st.view = { xmin: st.pan.view.xmin - dx, xmax: st.pan.view.xmax - dx, ymin: st.pan.view.ymin + dy, ymax: st.pan.view.ymax + dy };
      renderSplane();
      return;
    }
    if (!st.drag) return;
    const { ux, uy } = toUser(e);
    const tgt = (st.drag.kind === "pole" ? st.poles : st.zeros)[st.drag.idx];
    tgt.re = invX(ux) - st.drag.ox;
    tgt.im = invY(uy) - st.drag.oy;
    redraw();
  });
  window.addEventListener("mouseup", () => { st.drag = null; st.pan = null; });
  splane.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { ux, uy } = toUser(e);
    const cx = invX(ux), cy = invY(uy);
    const f = e.deltaY < 0 ? 0.8 : 1 / 0.8;
    st.view = {
      xmin: cx + (st.view.xmin - cx) * f, xmax: cx + (st.view.xmax - cx) * f,
      ymin: cy + (st.view.ymin - cy) * f, ymax: cy + (st.view.ymax - cy) * f,
    };
    renderSplane();
  }, { passive: false });

  // ── controls (presets, gain, bridge, clear) ─────────────────────────────────
  const controls = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;align-items:center;" });
  for (const [label, data] of Object.entries(PRESETS)) {
    const b = el("button", { style: `background:var(--panel-strong,#172033);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:6px 10px;font:600 11px 'Outfit';cursor:pointer;` }, label);
    b.onclick = () => {
      st.poles = data.poles.map(([re, im]) => ({ re, im }));
      st.zeros = data.zeros.map(([re, im]) => ({ re, im }));
      st.K = 1; kIn.value = "1";
      fitView();
      redraw();
    };
    controls.append(b);
  }
  const fitB = el("button", { style: `background:var(--panel-strong,#172033);color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:6px 12px;font:600 11px 'Outfit';cursor:pointer;` }, "⤢ Fit");
  fitB.onclick = () => { fitView(); redraw(); };
  const clearB = el("button", { style: "background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:6px 12px;font:600 11px 'Outfit';cursor:pointer;" }, "✕ Clear All");
  clearB.onclick = () => { st.poles = []; st.zeros = []; st.K = 1; kIn.value = "1"; st.view = { xmin: -300, xmax: 300, ymin: -300, ymax: 300 }; redraw(); };
  controls.append(fitB, clearB);

  // gain + send-to-solver row
  const actionRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:2px;" });
  actionRow.append(el("label", { style: `color:${SUB};font:600 11px 'Outfit';` }, "Gain K ="));
  const kIn = el("input", { type: "number", step: "any", value: "1", style: `width:90px;background:var(--inset,rgba(15,23,42,0.6));color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:6px 8px;font:13px 'JetBrains Mono';` });
  kIn.addEventListener("input", () => { const v = parseFloat(kIn.value); st.K = Number.isFinite(v) ? v : 1; renderBode(); });
  actionRow.append(kIn);
  const sendBtn = el("button", { title: "send this G(s) to the LCD1 Solver", style: "background:rgba(99,102,241,0.18);color:var(--accent-blue,#a5b4fc);border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:7px 12px;font:600 12px 'Outfit';cursor:pointer;" }, "∑ Send to LCD1 Solver →");
  sendBtn.onclick = () => {
    const expr = tfExprFromPZ(st.poles, st.zeros, st.K);
    if (expr && typeof opts.onSendToSolver === "function") opts.onSendToSolver(expr);
  };
  actionRow.append(sendBtn);

  // ── assemble ───────────────────────────────────────────────────────────────
  const inner = el("div", { style: "max-width:1080px;margin:0 auto;padding:0 24px;display:flex;flex-direction:column;gap:14px;" });
  const head = el("div", {});
  head.append(el("h1", { style: `margin:0;color:${TXT};font:800 24px 'Outfit',sans-serif;` }, "🎛 Bode Lab — interactive pole/zero placement"));
  head.append(el("p", { style: `margin:8px 0 0;color:${SUB};font:400 13px/1.6 'Inter',sans-serif;` },
    "Place poles and zeros on the s-plane and watch the Bode magnitude & phase respond — with the same hover read-off and gain/phase-margin lines as the Solver. Each pole bends the magnitude −20 dB/dec and adds −90° past its break frequency ω = |p|; each zero does the opposite. Scale the loop gain K to move the gain-crossover ω_c. Use the bridges to carry the system to the Solver, or pull a solved G(s) in from the diagram."));
  inner.append(head);

  inner.append(el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.6px;` }, "Presets"));
  inner.append(controls);
  inner.append(actionRow);

  const stage = el("div", { style: "display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;" });
  const spCol = el("div", { style: "display:flex;flex-direction:column;gap:8px;flex:0 0 auto;" });
  spCol.append(splane);
  const hint = el("div", { style: `color:${SUB};font:400 11px/1.5 'Inter';max-width:480px;` });
  hint.innerHTML = "Left-click empty = add pole · Right-click = add zero · Drag = move · Double-click = delete · Scroll = zoom · Middle-drag = pan · Hover the Bode curve to read values";
  spCol.append(hint);
  const bodeCol = el("div", { style: "display:flex;flex-direction:column;gap:4px;flex:1;min-width:300px;" });
  bodeCol.append(bodeHost, metaLine);
  stage.append(spCol, bodeCol);
  inner.append(stage);
  const tfLine = el("div", { style: "font:13px 'JetBrains Mono';margin-top:2px;" });
  inner.append(tfLine);

  redraw();

  // ── public API for the bridges ──────────────────────────────────────────────
  return {
    el: inner,
    redraw,
    /** Load a system from elsewhere (Solver / diagram). Roots may be Complex or {re,im}. */
    setSystem(poles = [], zeros = [], K = 1) {
      st.poles = poles.map((p) => ({ re: p.re, im: p.im }));
      st.zeros = zeros.map((z) => ({ re: z.re, im: z.im }));
      st.K = Number.isFinite(K) ? K : 1;
      kIn.value = String(st.K);
      fitView();
      redraw();
    },
    /** The current placed system as a parseable G(s) expression (or null). */
    getExpr() { return tfExprFromPZ(st.poles, st.zeros, st.K); },
  };
}
