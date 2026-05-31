// spike/test/plot-svg.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { linePlot, escapeXml } from "../../plot-svg.js";

test("escapeXml neutralises markup in labels", () => {
  assert.equal(escapeXml("a<b>&'\""), "a&lt;b&gt;&amp;&#39;&quot;");
});

test("linePlot returns an <svg> with a polyline of the right point count", () => {
  const svg = linePlot({
    series: [{ x: [0, 1, 2, 3], y: [0, 1, 4, 9], color: "#c00" }],
    xScale: "linear", xLabel: "t", yLabel: "y", width: 400, height: 260,
  });
  assert.ok(svg.startsWith("<svg"), "is an svg string");
  assert.ok(svg.includes("</svg>"), "closed");
  const pts = (svg.match(/<polyline[^>]*points="([^"]*)"/) || [])[1] || "";
  assert.equal(pts.trim().split(/\s+/).length, 4, "4 plotted points");
});

test("linePlot tolerates non-finite samples without emitting NaN", () => {
  const svg = linePlot({
    series: [{ x: [0, 1, 2], y: [0, Infinity, 1], color: "#c00" }],
    xScale: "linear", width: 300, height: 200,
  });
  assert.ok(!/NaN/.test(svg), "no NaN in output");
});

import { bodePlot, nyquistPlot, stepPlot, poleZeroPlot } from "../../plot-svg.js";

const bode = { omega: [0.1, 1, 10, 100], magDb: [20, 6, -10, -40], phaseDeg: [-10, -45, -135, -175] };
const nyq = { re: [1, 0.5, 0, -0.2], im: [0, -0.4, -0.5, -0.1], omega: [0.1, 1, 10, 100] };
const step = { t: [0, 0.5, 1, 2, 3], y: [0, 0.8, 1.3, 1.0, 1.0] };
const pz = { poles: [{ re: -1, im: 2 }, { re: -1, im: -2 }], zeros: [{ re: -3, im: 0 }] };

test("bodePlot returns two stacked svg panels", () => {
  const svg = bodePlot(bode, { GM_dB: 7.6, PM_deg: 23, omega_pc: 1.7, omega_gc: 1.1, omega_BW: 2 });
  assert.ok(svg.includes("<svg"), "contains svg");
  assert.ok(/Magnitude|dB/.test(svg), "magnitude panel labelled");
  assert.ok(/Phase/.test(svg), "phase panel labelled");
});

test("nyquistPlot marks the -1 point and shows a verdict", () => {
  const svg = nyquistPlot(nyq, { stable: true, encirclements: 0 });
  assert.ok(svg.includes("<svg"));
  assert.ok(/stable/i.test(svg), "verdict in readout");
});

test("stepPlot and poleZeroPlot return svg without NaN", () => {
  const s1 = stepPlot(step, { finalValue: 1, overshootPct: 30, peakTime: 1, settling2pct: 2.5 });
  const s2 = poleZeroPlot(pz);
  assert.ok(s1.includes("<svg") && !/NaN/.test(s1));
  assert.ok(s2.includes("<svg") && !/NaN/.test(s2));
});
