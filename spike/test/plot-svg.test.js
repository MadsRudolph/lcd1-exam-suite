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
