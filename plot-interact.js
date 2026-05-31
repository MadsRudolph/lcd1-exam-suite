// plot-interact.js
// Hover read-off for the transfer-function plots. The pure helpers map between
// pixel and data coordinates; attachHover() (added later) wires the crosshair +
// tooltip onto an injected SVG using the data the UI already has.

export function parsePlotbox(s) {
  const [x, y, w, h] = String(s).split(",").map(Number);
  return { x, y, w, h };
}

/** Pixel x -> data x (un-logs when isLog). */
export function invertX(px, box, xDomain, isLog) {
  const t = (px - box.x) / box.w;
  const v = xDomain[0] + t * (xDomain[1] - xDomain[0]);
  return isLog ? 10 ** v : v;
}

/** Data x -> pixel x. */
export function projectX(dataX, box, xDomain, isLog) {
  const v = isLog ? Math.log10(dataX) : dataX;
  return box.x + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * box.w;
}

/** Data y -> pixel y (axis inverted: yDomain[0] at the bottom, [1] at the top). */
export function projectY(dataY, box, yDomain) {
  const t = (dataY - yDomain[0]) / (yDomain[1] - yDomain[0]);
  return box.y + box.h - t * box.h;
}

/** Index of the sample in xs closest to target. */
export function nearestByX(xs, target) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Index of the point closest to (tx, ty). */
export function nearest2D(xs, ys, tx, ty) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - tx) ** 2 + (ys[i] - ty) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const NS = "http://www.w3.org/2000/svg";
const fmt = (x, d = 3) => (Number.isFinite(x) ? String(Number(x.toPrecision(d))) : "—");

/** Wire hover read-off onto every plot <svg> inside rootEl, using pd's data arrays. */
export function attachHover(rootEl, pd) {
  rootEl.querySelectorAll("svg[data-kind]").forEach((svg) => {
    const kind = svg.getAttribute("data-kind");
    const box = parsePlotbox(svg.getAttribute("data-plotbox") || "0,0,1,1");
    const isLog = svg.getAttribute("data-xscale") === "log";
    const xDomain = (svg.getAttribute("data-xdomain") || "0,1").split(",").map(Number);
    const yDomain = (svg.getAttribute("data-ydomain") || "0,1").split(",").map(Number);
    const vb = (svg.getAttribute("viewBox") || "0 0 1 1").split(/\s+/).map(Number); // [0,0,W,H]

    const series = pickSeries(kind, pd);
    if (!series || !series.x || !series.x.length) return;

    const clear = () => svg.querySelectorAll(".hov").forEach((n) => n.remove());

    svg.addEventListener("mouseleave", clear);
    svg.addEventListener("mousemove", (e) => {
      clear();
      const r = svg.getBoundingClientRect();
      const ux = (e.clientX - r.left) / r.width * vb[2];  // client -> user units
      const uy = (e.clientY - r.top) / r.height * vb[3];
      if (ux < box.x || ux > box.x + box.w || uy < box.y || uy > box.y + box.h) return;

      let i, cx, cy, lines, vline = false;
      if (kind === "step" || kind === "bode-mag" || kind === "bode-phase") {
        const dx = invertX(ux, box, xDomain, isLog);
        i = nearestByX(series.x, dx);
        cx = projectX(series.x[i], box, xDomain, isLog);
        cy = projectY(series.y[i], box, yDomain);
        vline = true;
        lines = series.tip(i);
      } else { // nyquist / polezero: nearest 2D point
        const dataX = invertX(ux, box, xDomain, false);
        const dataY = yDomain[0] + (1 - (uy - box.y) / box.h) * (yDomain[1] - yDomain[0]);
        i = nearest2D(series.x, series.y, dataX, dataY);
        if (i == null) return;
        cx = projectX(series.x[i], box, xDomain, false);
        cy = projectY(series.y[i], box, yDomain);
        lines = series.tip(i);
        if (!lines) return;
      }
      drawCrosshair(svg, box, cx, cy, vline, lines);
    });
  });
}

function pickSeries(kind, pd) {
  if (kind === "step") return { x: pd.step.t, y: pd.step.y, tip: (i) => [`t=${fmt(pd.step.t[i])}`, `y=${fmt(pd.step.y[i])}`] };
  if (kind === "bode-mag") return { x: pd.bode.omega, y: pd.bode.magDb, tip: bodeTip(pd) };
  if (kind === "bode-phase") return { x: pd.bode.omega, y: pd.bode.phaseDeg, tip: bodeTip(pd) };
  if (kind === "nyquist") return { x: pd.nyquist.re, y: pd.nyquist.im, tip: (i) => [`ω=${fmt(pd.nyquist.omega[i])}`, `Re=${fmt(pd.nyquist.re[i])}`, `Im=${fmt(pd.nyquist.im[i])}`] };
  if (kind === "polezero") {
    const pts = [...pd.poleZero.poles.map((p) => ({ ...p, t: "pole" })), ...pd.poleZero.zeros.map((z) => ({ ...z, t: "zero" }))];
    return {
      x: pts.map((p) => p.re), y: pts.map((p) => p.im),
      tip: (i) => { const p = pts[i]; return [`${p.t} ${fmt(p.re)}${p.im >= 0 ? "+" : ""}${fmt(p.im)}j`]; },
    };
  }
  return null;
}
const bodeTip = (pd) => (i) => [`ω=${fmt(pd.bode.omega[i])}`, `|G|=${fmt(pd.bode.magDb[i])} dB`, `∠G=${fmt(pd.bode.phaseDeg[i])}°`];

function drawCrosshair(svg, box, cx, cy, vline, lines) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "hov");
  g.setAttribute("pointer-events", "none");
  if (vline) {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", cx); l.setAttribute("x2", cx);
    l.setAttribute("y1", box.y); l.setAttribute("y2", box.y + box.h);
    l.setAttribute("stroke", "#94a3b8"); l.setAttribute("stroke-dasharray", "3 3");
    g.appendChild(l);
  }
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("cx", cx); dot.setAttribute("cy", cy); dot.setAttribute("r", "3.5");
  dot.setAttribute("fill", "#fbbf24");
  g.appendChild(dot);
  const padX = 6, lineH = 12, w = 96, h = lines.length * lineH + 6;
  let tx = cx + 8, ty = cy - h - 6;
  if (tx + w > box.x + box.w) tx = cx - w - 8;
  if (ty < box.y) ty = cy + 8;
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("x", tx); rect.setAttribute("y", ty); rect.setAttribute("width", w); rect.setAttribute("height", h);
  rect.setAttribute("rx", "4"); rect.setAttribute("fill", "rgba(2,6,23,0.92)"); rect.setAttribute("stroke", "#334155");
  g.appendChild(rect);
  lines.forEach((s, k) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", tx + padX); t.setAttribute("y", ty + 13 + k * lineH);
    t.setAttribute("fill", "#e2e8f0"); t.setAttribute("font-size", "10"); t.setAttribute("font-family", "monospace");
    t.textContent = s;
    g.appendChild(t);
  });
  svg.appendChild(g);
}
