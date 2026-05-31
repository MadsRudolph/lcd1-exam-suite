// plot-svg.js
// Pure SVG plotting. In: data objects + options. Out: an SVG markup string.
// No DOM and no solver/app imports, so it runs and is testable under node --test.

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const COL = { axis: "#64748b", grid: "rgba(148,163,184,0.18)", text: "#94a3b8", fg: "#e2e8f0" };

/** Build the value->pixel scale for one axis. log = base-10 log scale. */
function makeScale(values, lo, hi, log) {
  const v = (x) => (log ? Math.log10(x) : x);
  let min = Math.min(...values.filter(Number.isFinite).map(v));
  let max = Math.max(...values.filter(Number.isFinite).map(v));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) { min -= 1; max += 1; }
  return { to: (x) => (v(x) - min) / (max - min) * (hi - lo) + lo, min, max };
}

/**
 * Generic line plot. opts:
 *   series: [{ x[], y[], color, dash? }]
 *   xScale: 'linear'|'log'  (y is always linear; pass dB pre-computed)
 *   xLabel, yLabel, title, width, height
 *   markers: [{ x, y, label, color }]   point markers + label
 *   hlines:  [{ y, color }]               horizontal reference lines
 *   vlines:  [{ x, color }]               vertical reference lines
 *   readout: ["line one", "line two"]    text box, top-left
 */
export function linePlot(opts) {
  const W = opts.width || 460, H = opts.height || 280;
  const m = { l: 52, r: 16, t: opts.title ? 26 : 12, b: 38 };
  const pl = m.l, pr = W - m.r, pt = m.t, pb = H - m.b;
  const log = opts.xScale === "log";

  const allX = opts.series.flatMap((s) => s.x).concat((opts.vlines || []).map((v) => v.x));
  const allY = opts.series.flatMap((s) => s.y).concat((opts.hlines || []).map((h) => h.y));
  const sx = makeScale(allX, pl, pr, log);
  const sy = makeScale(allY, pb, pt, false);
  const px = (x) => sx.to(x);
  const py = (y) => sy.to(y);

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, sans-serif">`];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`);
  if (opts.title) parts.push(`<text x="${W / 2}" y="16" fill="${COL.fg}" font-size="12" text-anchor="middle">${escapeXml(opts.title)}</text>`);

  for (let i = 0; i <= 5; i++) {
    const gx = pl + (pr - pl) * i / 5;
    const gy = pt + (pb - pt) * i / 5;
    parts.push(`<line x1="${gx}" y1="${pt}" x2="${gx}" y2="${pb}" stroke="${COL.grid}"/>`);
    parts.push(`<line x1="${pl}" y1="${gy}" x2="${pr}" y2="${gy}" stroke="${COL.grid}"/>`);
    const xv = sx.min + (sx.max - sx.min) * i / 5;
    const yv = sy.min + (sy.max - sy.min) * (1 - i / 5);
    const xlab = log ? `10^${xv.toFixed(1)}` : fmtTick(xv);
    parts.push(`<text x="${gx}" y="${pb + 14}" fill="${COL.text}" font-size="9" text-anchor="middle">${escapeXml(xlab)}</text>`);
    parts.push(`<text x="${pl - 6}" y="${gy + 3}" fill="${COL.text}" font-size="9" text-anchor="end">${fmtTick(yv)}</text>`);
  }
  parts.push(`<rect x="${pl}" y="${pt}" width="${pr - pl}" height="${pb - pt}" fill="none" stroke="${COL.axis}"/>`);
  if (opts.xLabel) parts.push(`<text x="${(pl + pr) / 2}" y="${H - 4}" fill="${COL.text}" font-size="10" text-anchor="middle">${escapeXml(opts.xLabel)}</text>`);
  if (opts.yLabel) parts.push(`<text x="12" y="${(pt + pb) / 2}" fill="${COL.text}" font-size="10" text-anchor="middle" transform="rotate(-90 12 ${(pt + pb) / 2})">${escapeXml(opts.yLabel)}</text>`);

  for (const v of opts.vlines || []) parts.push(`<line x1="${px(v.x)}" y1="${pt}" x2="${px(v.x)}" y2="${pb}" stroke="${escapeXml(v.color || "#f59e0b")}" stroke-dasharray="4 3"/>`);
  for (const h of opts.hlines || []) parts.push(`<line x1="${pl}" y1="${py(h.y)}" x2="${pr}" y2="${py(h.y)}" stroke="${escapeXml(h.color || "#f59e0b")}" stroke-dasharray="4 3"/>`);

  for (const s of opts.series) {
    const pts = [];
    for (let i = 0; i < s.x.length; i++) {
      const X = px(s.x[i]), Y = py(s.y[i]);
      if (Number.isFinite(X) && Number.isFinite(Y)) pts.push(`${X.toFixed(2)},${Y.toFixed(2)}`);
    }
    const stroke = escapeXml(s.color || "#60a5fa");
    const dash = s.dash ? ` stroke-dasharray="${escapeXml(s.dash)}"` : "";
    parts.push(`<polyline fill="none" stroke="${stroke}" stroke-width="1.6"${dash} points="${pts.join(" ")}"/>`);
  }

  for (const mk of opts.markers || []) {
    const X = px(mk.x), Y = py(mk.y);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
    parts.push(`<circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r="3" fill="${escapeXml(mk.color || "#10b981")}"/>`);
    if (mk.label) parts.push(`<text x="${(X + 5).toFixed(2)}" y="${(Y - 5).toFixed(2)}" fill="${COL.fg}" font-size="9">${escapeXml(mk.label)}</text>`);
  }

  (opts.readout || []).forEach((line, i) => {
    parts.push(`<text x="${pl + 6}" y="${pt + 13 + i * 12}" fill="${COL.fg}" font-size="10" font-family="monospace">${escapeXml(line)}</text>`);
  });

  parts.push(`</svg>`);
  return parts.join("");
}

function fmtTick(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-2 || a >= 1e4)) return v.toExponential(1);
  return String(Number(v.toFixed(2)));
}

export function bodePlot(data, ann = {}) {
  const mag = linePlot({
    series: [{ x: data.omega, y: data.magDb, color: "#60a5fa" }],
    xScale: "log", yLabel: "Magnitude (dB)", title: "Bode Diagram",
    width: 460, height: 180,
    vlines: [
      ...(ann.omega_gc ? [{ x: ann.omega_gc, color: "#10b981" }] : []),
      ...(ann.omega_pc ? [{ x: ann.omega_pc, color: "#f59e0b" }] : []),
      ...(ann.omega_BW ? [{ x: ann.omega_BW, color: "#a78bfa" }] : []),
    ],
    readout: [
      ann.GM_dB != null ? `GM ${fmt(ann.GM_dB)} dB` : null,
      ann.PM_deg != null ? `PM ${fmt(ann.PM_deg)} deg` : null,
      ann.omega_BW != null ? `BW ${fmt(ann.omega_BW)} rad/s` : null,
    ].filter(Boolean),
  });
  const ph = linePlot({
    series: [{ x: data.omega, y: data.phaseDeg, color: "#60a5fa" }],
    xScale: "log", xLabel: "Frequency (rad/s)", yLabel: "Phase (deg)",
    width: 460, height: 160,
    vlines: ann.omega_gc ? [{ x: ann.omega_gc, color: "#10b981" }] : [],
  });
  return `<div>${mag}${ph}</div>`;
}

export function nyquistPlot(data, ann = {}) {
  const verdict = ann.stable == null ? [] : [ann.stable ? "stable" : "unstable",
    ann.encirclements != null ? `encirclements ${ann.encirclements}` : null].filter(Boolean);
  return linePlot({
    series: [
      { x: data.re, y: data.im, color: "#60a5fa" },
      { x: data.re, y: data.im.map((v) => -v), color: "#60a5fa", dash: "4 3" },
    ],
    xScale: "linear", xLabel: "Re", yLabel: "Im", title: "Nyquist",
    width: 320, height: 320,
    markers: [{ x: -1, y: 0, label: "-1", color: "#ef4444" }],
    readout: verdict,
  });
}

export function stepPlot(data, ann = {}) {
  const markers = [];
  if (ann.peakTime != null && ann.finalValue != null && ann.overshootPct != null) {
    markers.push({ x: ann.peakTime, y: ann.finalValue * (1 + ann.overshootPct / 100), label: `Mp ${fmt(ann.overshootPct)}%` });
  }
  return linePlot({
    series: [{ x: data.t, y: data.y, color: "#c0392b" }],
    xScale: "linear", xLabel: "Time (s)", yLabel: "Amplitude", title: "Step Response",
    width: 460, height: 260,
    hlines: ann.finalValue != null ? [{ y: ann.finalValue, color: "#64748b" }] : [],
    vlines: ann.settling2pct != null ? [{ x: ann.settling2pct, color: "#a78bfa" }] : [],
    markers,
    readout: [
      ann.overshootPct != null ? `overshoot ${fmt(ann.overshootPct)}%` : null,
      ann.peakTime != null ? `t_p ${fmt(ann.peakTime)} s` : null,
      ann.settling2pct != null ? `t_s ${fmt(ann.settling2pct)} s` : null,
      ann.finalValue != null ? `final ${fmt(ann.finalValue)}` : null,
    ].filter(Boolean),
  });
}

export function poleZeroPlot(data) {
  const xs = [...data.poles, ...data.zeros].map((c) => c.re).concat([0]);
  const ys = [...data.poles, ...data.zeros].map((c) => c.im).concat([0]);
  return linePlot({
    series: [{ x: xs, y: ys, color: "transparent" }],
    xScale: "linear", xLabel: "Real", yLabel: "Imag", title: "Pole-Zero Map",
    width: 320, height: 280,
    markers: [
      ...data.poles.map((p) => ({ x: p.re, y: p.im, label: "x", color: "#ef4444" })),
      ...data.zeros.map((z) => ({ x: z.re, y: z.im, label: "o", color: "#10b981" })),
    ],
    vlines: [{ x: 0, color: "#64748b" }],
    hlines: [{ y: 0, color: "#64748b" }],
  });
}

function fmt(x) {
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x == null || Number.isNaN(x)) return "-";
  return String(Number(x.toPrecision(3)));
}
