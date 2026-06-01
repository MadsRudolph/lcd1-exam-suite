# Transfer-function Plots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plot the unit step response, Bode diagram, Nyquist plot, and pole-zero map of any transfer function, annotated with exam values, entirely in the offline JS app.

**Architecture:** Three separated layers — `spike/solvers/plotdata.js` (pure compute → data objects), `plot-svg.js` (pure render → SVG *strings*, no DOM so it's Node-testable), and UI glue in `lcd-forms.js`/`lcd-engine.js`/`lcd-solver-ui.js` (a dedicated "Plot transfer function" form plus contextual buttons on TF-bearing results).

**Tech Stack:** Pure ES modules, zero new deps. `node --test` (run from `spike/`). KaTeX + hand-built SVG for the UI. esbuild bundle (`npm run build`).

**Conventions:** Windows-first, `PAGER=cat`. Commits read like a human wrote them — NO AI attribution. Keep `npm test` green. `bundle.js` is gitignored; rebuild with `npm run build`.

---

## File structure

| File | Responsibility |
|---|---|
| `spike/solvers/plotdata.js` (create) | Pure compute: `logspace`, `bodeData`, `nyquistData`, `stepData`, `poleZeroData`, `plotAnnotations`. In → `NumericTF`, out → plain objects. No DOM. |
| `plot-svg.js` (create, repo root) | Pure render: `linePlot` + `bodePlot`/`nyquistPlot`/`stepPlot`/`poleZeroPlot`. In → data objects, out → SVG string. No solver/app imports. |
| `spike/test/plotdata.test.js` (create) | Parity tests for the compute layer. |
| `spike/test/plot-svg.test.js` (create) | Structural tests for the SVG strings. |
| `lcd-forms.js` (modify) | Register the `plot_tf` form. |
| `lcd-engine.js` (modify) | `plot_tf` case in `runSolver`; attach `tf` string to TF-bearing results. |
| `lcd-solver-ui.js` (modify) | Render the tabbed plot panel and the contextual `[Step][Bode][Nyquist]` buttons. |

---

## Task 1: `logspace` + `bodeData`

**Files:**
- Create: `spike/solvers/plotdata.js`
- Test: `spike/test/plotdata.test.js`

- [ ] **Step 1: Write the failing test**

```js
// spike/test/plotdata.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTf } from "../numeric/parse.js";
import { logspace, bodeData } from "../solvers/plotdata.js";

test("logspace spans the decades inclusively", () => {
  const xs = logspace(0, 2, 3);
  assert.equal(xs.length, 3);
  assert.ok(Math.abs(xs[0] - 1) < 1e-9);
  assert.ok(Math.abs(xs[1] - 10) < 1e-9);
  assert.ok(Math.abs(xs[2] - 100) < 1e-9);
});

test("bodeData magnitude at low omega approaches the DC gain", () => {
  const tf = parseTf("10/((s+2)*(s+5))"); // DC gain = 10/10 = 1 -> 0 dB
  const { omega, magDb, phaseDeg } = bodeData(tf, { wMin: 1e-3, wMax: 1e3, n: 400 });
  assert.equal(omega.length, 400);
  assert.equal(magDb.length, 400);
  assert.equal(phaseDeg.length, 400);
  assert.ok(Math.abs(magDb[0] - 0) < 0.1, `low-omega mag ${magDb[0]} ~ 0 dB`);
});

test("bodeData phase is unwrapped (monotone for a 2-pole lag)", () => {
  const tf = parseTf("1/((s+1)*(s+10))");
  const { phaseDeg } = bodeData(tf, { wMin: 1e-2, wMax: 1e3, n: 500 });
  for (let i = 1; i < phaseDeg.length; i++) {
    assert.ok(phaseDeg[i] - phaseDeg[i - 1] < 5, "no +360 unwrap jump");
  }
  assert.ok(phaseDeg[phaseDeg.length - 1] < -170, "approaches -180 deg");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: FAIL — `Cannot find module '../solvers/plotdata.js'`.

- [ ] **Step 3: Implement `logspace` + `bodeData`**

```js
// spike/solvers/plotdata.js
// Pure compute layer for the plotting feature. In: a NumericTF. Out: plain
// data objects. No DOM, no rendering — fully unit-testable.
import { Complex } from "../numeric/complex.js";

/** n points geometrically spaced from 10^a to 10^b (inclusive). */
export function logspace(a, b, n) {
  if (n < 2) return [10 ** a];
  const out = [];
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out.push(10 ** (a + i * step));
  return out;
}

/** Default decade range: two decades either side of the pole/zero magnitudes. */
function autoFreqRange(tf) {
  const mags = [...tf.poles(), ...tf.zeros()].map((c) => c.abs()).filter((m) => m > 1e-9);
  if (!mags.length) return [-2, 3];
  return [Math.log10(Math.min(...mags)) - 2, Math.log10(Math.max(...mags)) + 2];
}

/** Continuous phase (radians) — removes the +/-2pi jumps atan2 introduces. */
function unwrap(phase) {
  const out = [phase[0]];
  let offset = 0;
  for (let i = 1; i < phase.length; i++) {
    const d = phase[i] - phase[i - 1];
    if (d > Math.PI) offset -= 2 * Math.PI;
    else if (d < -Math.PI) offset += 2 * Math.PI;
    out.push(phase[i] + offset);
  }
  return out;
}

export function bodeData(tf, opts = {}) {
  const [a, b] = opts.wMin != null && opts.wMax != null
    ? [Math.log10(opts.wMin), Math.log10(opts.wMax)]
    : autoFreqRange(tf);
  const n = opts.n || 600;
  const omega = logspace(a, b, n);
  const magDb = [];
  const phaseRaw = [];
  for (const w of omega) {
    const G = tf.evalAt(new Complex(0, w));
    magDb.push(20 * Math.log10(G.abs()));
    phaseRaw.push(G.arg());
  }
  const phaseDeg = unwrap(phaseRaw).map((p) => (p * 180) / Math.PI);
  return { omega, magDb, phaseDeg };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add spike/solvers/plotdata.js spike/test/plotdata.test.js
git commit -m "Add Bode plot data (magnitude/phase sweep) for any TF"
```

---

## Task 2: `nyquistData`

**Files:**
- Modify: `spike/solvers/plotdata.js`
- Test: `spike/test/plotdata.test.js`

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/plotdata.test.js
import { nyquistData } from "../solvers/plotdata.js";

test("nyquistData starts near the DC gain on the real axis", () => {
  const tf = parseTf("2/((s+1)*(s+2))"); // G(0) = 2/2 = 1
  const { re, im, omega } = nyquistData(tf, { wMin: 1e-3, wMax: 1e3, n: 600 });
  assert.equal(re.length, omega.length);
  assert.ok(Math.abs(re[0] - 1) < 0.05, `Re at low omega ${re[0]} ~ 1`);
  assert.ok(Math.abs(im[0]) < 0.05, `Im at low omega ${im[0]} ~ 0`);
});

test("nyquistData caps the magnitude for an integrator", () => {
  const tf = parseTf("1/(s*(s+1))"); // |G| -> infinity as omega -> 0
  const { re, im } = nyquistData(tf, { wMin: 1e-4, wMax: 1e3, n: 600, cap: 1000 });
  for (let i = 0; i < re.length; i++) {
    assert.ok(Math.hypot(re[i], im[i]) <= 1000 + 1e-6, "magnitude capped");
  }
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: FAIL — `nyquistData` is not exported.

- [ ] **Step 3: Implement `nyquistData`**

```js
// append to spike/solvers/plotdata.js
export function nyquistData(tf, opts = {}) {
  const [a, b] = opts.wMin != null && opts.wMax != null
    ? [Math.log10(opts.wMin), Math.log10(opts.wMax)]
    : autoFreqRange(tf);
  const n = opts.n || 800;
  const cap = opts.cap || 1e3;
  const omega = logspace(a, b, n);
  const re = [];
  const im = [];
  for (const w of omega) {
    const G = tf.evalAt(new Complex(0, w));
    let x = G.re;
    let y = G.im;
    const m = Math.hypot(x, y);
    if (m > cap) { x = (x / m) * cap; y = (y / m) * cap; } // keep integrators on-screen
    re.push(x);
    im.push(y);
  }
  return { re, im, omega };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add spike/solvers/plotdata.js spike/test/plotdata.test.js
git commit -m "Add Nyquist plot data (G(jw) locus) with integrator capping"
```

---

## Task 3: `stepData` (RK4 state-space simulation)

**Files:**
- Modify: `spike/solvers/plotdata.js`
- Test: `spike/test/plotdata.test.js`

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/plotdata.test.js
import { stepData } from "../solvers/plotdata.js";

test("stepData final value equals the DC gain for a stable TF", () => {
  const tf = parseTf("5/((s+1)*(s+2))"); // DC gain = 5/2 = 2.5
  const { t, y } = stepData(tf, { tMax: 12, n: 600 });
  assert.equal(t.length, y.length);
  assert.ok(Math.abs(y[y.length - 1] - 2.5) < 0.02, `final ${y[y.length - 1]} ~ 2.5`);
});

test("stepData overshoot of a known 2nd-order matches Mp", () => {
  // zeta=0.3, wn=5 -> Mp = exp(-pi*zeta/sqrt(1-zeta^2)) ~ 0.372, final value 1
  const tf = parseTf("25/(s**2+3*s+25)");
  const { y } = stepData(tf, { tMax: 4, n: 1000 });
  const peak = Math.max(...y);
  assert.ok(Math.abs(peak - 1.372) < 0.03, `peak ${peak} ~ 1.372`);
});

test("stepData handles a pure first-order lag", () => {
  const tf = parseTf("1/(s+1)"); // y(t) = 1 - e^-t, y(1) ~ 0.632
  const { t, y } = stepData(tf, { tMax: 6, n: 600 });
  const i1 = t.findIndex((tt) => tt >= 1);
  assert.ok(Math.abs(y[i1] - 0.632) < 0.02, `y(1) ${y[i1]} ~ 0.632`);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: FAIL — `stepData` is not exported.

- [ ] **Step 3: Implement `stepData`**

Realize the (proper) TF in controllable canonical form and integrate the unit-step
response with RK4. Handles distinct/repeated/complex poles and unstable systems.

```js
// append to spike/solvers/plotdata.js
import { dominantSettling } from "./analysis.js";

function linspace(a, b, n) {
  const out = [];
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out.push(a + i * step);
  return out;
}

export function stepData(tf, opts = {}) {
  const d0 = tf.den[0];
  const a = tf.den.map((c) => c / d0);            // monic den: [1, a1, ..., an]
  const num = tf.num.map((c) => c / d0);
  const order = a.length - 1;

  const n = opts.n || 600;
  let tMax = opts.tMax;
  if (tMax == null) {
    try { tMax = dominantSettling(tf).t_s_2pct * 1.3; } catch { tMax = 10; }
    tMax = Math.min(Math.max(tMax, 0.5), 200);
  }
  const t = linspace(0, tMax, n);

  if (order === 0) {                              // pure gain
    const g = num[num.length - 1] || 0;
    return { t, y: t.map(() => g) };
  }

  const b = new Array(order + 1).fill(0);         // num padded to [b0, b1, ..., bn]
  for (let i = 0; i < num.length; i++) b[order - (num.length - 1) + i] = num[i];
  const D = b[0];                                 // direct feedthrough (0 if strictly proper)
  const beta = [];                                // beta_k = b_k - D*a_k, k=1..order
  for (let k = 1; k <= order; k++) beta[k] = b[k] - D * a[k];

  const deriv = (x, u) => {                        // controllable canonical form
    const dx = new Array(order);
    for (let i = 0; i < order - 1; i++) dx[i] = x[i + 1];
    let s = 0;
    for (let k = 1; k <= order; k++) s += a[k] * x[order - k];
    dx[order - 1] = -s + u;
    return dx;
  };
  const output = (x, u) => {
    let yk = D * u;
    for (let k = 1; k <= order; k++) yk += beta[k] * x[order - k];
    return yk;
  };

  let x = new Array(order).fill(0);
  const dt = tMax / (n - 1);
  const u = 1;                                    // unit step
  const y = [output(x, u)];
  for (let i = 1; i < n; i++) {
    const k1 = deriv(x, u);
    const k2 = deriv(x.map((xi, j) => xi + (dt / 2) * k1[j]), u);
    const k3 = deriv(x.map((xi, j) => xi + (dt / 2) * k2[j]), u);
    const k4 = deriv(x.map((xi, j) => xi + dt * k3[j]), u);
    x = x.map((xi, j) => xi + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    let yk = output(x, u);
    if (!Number.isFinite(yk)) yk = y[i - 1]; // guard against blow-up overflow
    y.push(yk);
  }
  return { t, y };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add spike/solvers/plotdata.js spike/test/plotdata.test.js
git commit -m "Add step-response data via RK4 state-space simulation (any proper TF)"
```

---

## Task 4: `poleZeroData` + `plotAnnotations`

**Files:**
- Modify: `spike/solvers/plotdata.js`
- Test: `spike/test/plotdata.test.js`

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/plotdata.test.js
import { poleZeroData, plotAnnotations } from "../solvers/plotdata.js";

test("poleZeroData returns poles and zeros as {re,im}", () => {
  const tf = parseTf("(s+3)/((s+1)*(s+2))");
  const { poles, zeros } = poleZeroData(tf);
  assert.equal(poles.length, 2);
  assert.equal(zeros.length, 1);
  assert.ok(Math.abs(zeros[0].re + 3) < 1e-6, "zero at -3");
});

test("plotAnnotations is null-safe and fills what it can", () => {
  const tf = parseTf("25/(s**2+3*s+25)"); // stable 2nd-order
  const ann = plotAnnotations(tf);
  assert.ok(ann.step && Math.abs(ann.step.finalValue - 1) < 1e-6, "step final value");
  assert.ok(ann.step.overshootPct > 30, "overshoot ~37%");
  assert.ok(ann.nyquist && typeof ann.nyquist.stable === "boolean", "stability verdict");
  // an always-stable closed TF has no finite PM crossover; must not throw
  assert.doesNotThrow(() => plotAnnotations(parseTf("1/(s+1)")));
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: FAIL — `poleZeroData` / `plotAnnotations` not exported.

- [ ] **Step 3: Implement `poleZeroData` + `plotAnnotations`**

```js
// append to spike/solvers/plotdata.js
import { solveMargins } from "../numeric/margins.js";
import { bandwidth, analyzeStability, characterizeTf } from "./analysis.js";

const tryOr = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export function poleZeroData(tf) {
  const map = (c) => ({ re: c.re, im: c.im });
  return { poles: tf.poles().map(map), zeros: tf.zeros().map(map) };
}

/**
 * Marker/readout values for the three plots, reusing the existing solvers.
 * Every field may be null when not applicable; the renderer omits missing markers.
 */
export function plotAnnotations(tf) {
  const margins = tryOr(() => solveMargins(tf));
  const bw = tryOr(() => bandwidth(tf));
  const stab = tryOr(() => analyzeStability(tf, 1));
  const ch = tryOr(() => characterizeTf(tf));

  const bode = margins ? {
    GM_dB: Number.isFinite(margins.GM) ? 20 * Math.log10(margins.GM) : Infinity,
    PM_deg: margins.PM_deg,
    omega_pc: margins.omega_pc,
    omega_gc: margins.omega_gc,
    omega_BW: bw,
  } : { omega_BW: bw };

  const nyquist = stab ? {
    stable: stab.stable,
    closedLoopRhpPoles: stab.closedLoopRhpPoles,
    encirclements: stab.encirclements,
  } : null;

  let step = null;
  if (ch) {
    const m = ch.metrics;
    step = {
      finalValue: Number.isFinite(ch.dc_gain) ? ch.dc_gain : null,
      overshootPct: m ? m.Mp * 100 : null,
      peakTime: m ? m.t_p : null,
      settling2pct: m ? m.t_s_2pct : null,
    };
  }
  return { bode, nyquist, step };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add spike/solvers/plotdata.js spike/test/plotdata.test.js
git commit -m "Add pole-zero data and plot annotations (reusing existing solvers)"
```

---

## Task 5: `linePlot` SVG primitive

**Files:**
- Create: `plot-svg.js`
- Test: `spike/test/plot-svg.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: FAIL — `Cannot find module '../../plot-svg.js'`.

- [ ] **Step 3: Implement `linePlot`**

```js
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
 *   hlines:  [{ y, label, color }]       horizontal reference lines
 *   vlines:  [{ x, label, color }]       vertical reference lines
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

  // gridlines + ticks (5 each)
  for (let i = 0; i <= 5; i++) {
    const gx = pl + (pr - pl) * i / 5;
    const gy = pt + (pb - pt) * i / 5;
    parts.push(`<line x1="${gx}" y1="${pt}" x2="${gx}" y2="${pb}" stroke="${COL.grid}"/>`);
    parts.push(`<line x1="${pl}" y1="${gy}" x2="${pr}" y2="${gy}" stroke="${COL.grid}"/>`);
    const xv = sx.min + (sx.max - sx.min) * i / 5;
    const yv = sy.min + (sy.max - sy.min) * (1 - i / 5);
    const xlab = log ? `10^${xv.toFixed(1)}` : fmtTick(xv);
    parts.push(`<text x="${gx}" y="${pb + 14}" fill="${COL.text}" font-size="9" text-anchor="middle">${xlab}</text>`);
    parts.push(`<text x="${pl - 6}" y="${gy + 3}" fill="${COL.text}" font-size="9" text-anchor="end">${fmtTick(yv)}</text>`);
  }
  // axes box
  parts.push(`<rect x="${pl}" y="${pt}" width="${pr - pl}" height="${pb - pt}" fill="none" stroke="${COL.axis}"/>`);
  if (opts.xLabel) parts.push(`<text x="${(pl + pr) / 2}" y="${H - 4}" fill="${COL.text}" font-size="10" text-anchor="middle">${escapeXml(opts.xLabel)}</text>`);
  if (opts.yLabel) parts.push(`<text x="12" y="${(pt + pb) / 2}" fill="${COL.text}" font-size="10" text-anchor="middle" transform="rotate(-90 12 ${(pt + pb) / 2})">${escapeXml(opts.yLabel)}</text>`);

  for (const v of opts.vlines || []) parts.push(`<line x1="${px(v.x)}" y1="${pt}" x2="${px(v.x)}" y2="${pb}" stroke="${v.color || "#f59e0b"}" stroke-dasharray="4 3"/>`);
  for (const h of opts.hlines || []) parts.push(`<line x1="${pl}" y1="${py(h.y)}" x2="${pr}" y2="${py(h.y)}" stroke="${h.color || "#f59e0b"}" stroke-dasharray="4 3"/>`);

  for (const s of opts.series) {
    const pts = [];
    for (let i = 0; i < s.x.length; i++) {
      const X = px(s.x[i]), Y = py(s.y[i]);
      if (Number.isFinite(X) && Number.isFinite(Y)) pts.push(`${X.toFixed(2)},${Y.toFixed(2)}`);
    }
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : "";
    parts.push(`<polyline fill="none" stroke="${s.color || "#60a5fa"}" stroke-width="1.6"${dash} points="${pts.join(" ")}"/>`);
  }

  for (const mk of opts.markers || []) {
    const X = px(mk.x), Y = py(mk.y);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
    parts.push(`<circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r="3" fill="${mk.color || "#10b981"}"/>`);
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
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plot-svg.js spike/test/plot-svg.test.js
git commit -m "Add linePlot SVG primitive (pure, string output, axes/grid/markers)"
```

---

## Task 6: Plot composers (`bodePlot`, `nyquistPlot`, `stepPlot`, `poleZeroPlot`)

**Files:**
- Modify: `plot-svg.js`
- Test: `spike/test/plot-svg.test.js`

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/plot-svg.test.js
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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: FAIL — composers not exported.

- [ ] **Step 3: Implement the composers**

```js
// append to plot-svg.js
export function bodePlot(data, ann = {}) {
  const mag = linePlot({
    series: [{ x: data.omega, y: data.magDb, color: "#60a5fa" }],
    xScale: "log", yLabel: "Magnitude (dB)", title: "Bode Diagram",
    width: 460, height: 180,
    hlines: ann.omega_BW != null ? [] : [],
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
      { x: data.re, y: data.im.map((v) => -v), color: "#60a5fa", dash: "4 3" }, // mirror -omega
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
  // reuse linePlot's frame by drawing invisible bounds, then overlay markers
  const base = linePlot({
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
  return base;
}

function fmt(x) {
  if (x === Infinity) return "inf";
  if (x == null || Number.isNaN(x)) return "-";
  return String(Number(x.toPrecision(3)));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plot-svg.js spike/test/plot-svg.test.js
git commit -m "Add Bode/Nyquist/step/pole-zero plot composers with annotations"
```

---

## Task 7: Engine wiring — `plot_tf` solver + form registration

**Files:**
- Modify: `lcd-engine.js` (imports near line 5-16; `runSolver` switch near line 68)
- Modify: `lcd-forms.js` (Analysis form block, near the `characterize`/`bandwidth` entries ~line 138)
- Test: `spike/test/plotdata.test.js` (engine-level dataset shape)

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/plotdata.test.js
import { buildPlotData } from "../solvers/plotdata.js";

test("buildPlotData returns all four datasets plus annotations", () => {
  const tf = parseTf("25/(s**2+3*s+25)");
  const pd = buildPlotData(tf);
  assert.ok(pd.bode.omega.length > 10, "bode");
  assert.ok(pd.nyquist.re.length > 10, "nyquist");
  assert.ok(pd.step.t.length > 10, "step");
  assert.ok(pd.poleZero.poles.length === 2, "pole-zero");
  assert.ok(pd.annotations.step.overshootPct > 30, "annotations");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd spike && node --test test/plotdata.test.js`
Expected: FAIL — `buildPlotData` not exported.

- [ ] **Step 3a: Add `buildPlotData` aggregator**

```js
// append to spike/solvers/plotdata.js
export function buildPlotData(tf) {
  return {
    bode: bodeData(tf),
    nyquist: nyquistData(tf),
    step: stepData(tf),
    poleZero: poleZeroData(tf),
    annotations: plotAnnotations(tf),
  };
}
```

- [ ] **Step 3b: Register the form** in `lcd-forms.js` (add to the Analysis group)

```js
  {
    pattern: "Analysis", title: "Plot transfer function", variant: "step · Bode · Nyquist · pole-zero", fn: "plot_tf",
    resultKind: "INFO",
    fields: [{ name: "G", label: "G(s)", kind: "tf", placeholder: "25/(s**2+3*s+25)", tooltip: "Any transfer function to plot: step response, Bode, Nyquist and pole-zero map." }],
    explanation: "Draws the unit step response, Bode diagram, Nyquist plot and pole-zero map of the transfer function, annotated with the key values.",
  },
```

- [ ] **Step 3c: Add the `plot_tf` case** in `lcd-engine.js` `runSolver` (after the `analyze_stability` case). Also import `buildPlotData`.

```js
// lcd-engine.js — add to the imports from ./spike/solvers/plotdata.js
import { buildPlotData } from "./spike/solvers/plotdata.js";
```

```js
// lcd-engine.js — inside runSolver's switch, e.g. after the analysis cases
      case "plot_tf": {
        const G = parseTf(inp.G);
        out.tf = inp.G;            // string echo for contextual buttons
        out.plotData = buildPlotData(G);
        out.summary = [["poles", G.poles().map((p) => `${p.re.toPrecision(4)}${p.im >= 0 ? "+" : ""}${p.im.toPrecision(4)}j`).join(", ")]];
        break;
      }
```

- [ ] **Step 4: Run the dataset test + full suite**

Run: `cd spike && node --test test/plotdata.test.js` → PASS (11 tests)
Run: `cd .. && npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add spike/solvers/plotdata.js lcd-forms.js lcd-engine.js spike/test/plotdata.test.js
git commit -m "Wire plot_tf solver + form: buildPlotData feeds the engine result"
```

---

## Task 8: UI — render the tabbed plot panel

**Files:**
- Modify: `lcd-solver-ui.js` (`renderResults`, near line 437; imports at top)

> No DOM test harness exists for the UI (consistent with the rest of the app); verify in the running app.

- [ ] **Step 1: Import the renderers** at the top of `lcd-solver-ui.js`

```js
import { bodePlot, nyquistPlot, stepPlot, poleZeroPlot } from "./plot-svg.js";
```

- [ ] **Step 2: Add a plot-panel renderer** near the other helpers in `lcd-solver-ui.js`

```js
// Tabbed Step | Bode | Nyquist | Pole-Zero panel from a buildPlotData() object.
function renderPlotPanel(pd) {
  const wrap = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
  const tabs = el("div", { style: "display:flex;gap:6px;" });
  const view = el("div", { style: "overflow-x:auto;" });
  const views = {
    Step: () => stepPlot(pd.step, pd.annotations.step || {}),
    Bode: () => bodePlot(pd.bode, pd.annotations.bode || {}),
    Nyquist: () => nyquistPlot(pd.nyquist, pd.annotations.nyquist || {}),
    "Pole-Zero": () => poleZeroPlot(pd.poleZero),
  };
  const show = (name) => {
    view.innerHTML = views[name](); // generated SVG string — safe, no user markup
    [...tabs.children].forEach((b) => { b.style.opacity = b.textContent === name ? "1" : "0.55"; });
  };
  for (const name of Object.keys(views)) {
    const b = el("button", { style:
      `background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);` +
      `border-radius:8px;padding:6px 12px;font:600 11px 'Outfit';cursor:pointer;` }, name);
    b.onclick = () => show(name);
    tabs.append(b);
  }
  wrap.append(tabs, view);
  show("Step");
  return wrap;
}
```

- [ ] **Step 3: Call it from `renderResults`** — add just before the closing of the function (after the options block)

```js
  if (res.plotData) body.append(renderPlotPanel(res.plotData));
```

- [ ] **Step 4: Build and verify in the app**

Run: `npm run build`
Then `npm start`, switch to **∑ LCD1 Solver**, pick **Plot transfer function**, enter `25/(s**2+3*s+25)`, Solve.
Expected: a tabbed panel; Step shows ~37% overshoot with markers; Bode shows GM/PM; Nyquist marks −1 with a "stable" verdict; Pole-Zero shows the conjugate pair.

- [ ] **Step 5: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Render the tabbed Step/Bode/Nyquist/pole-zero panel in the solver UI"
```

---

## Task 9: UI — contextual `[Step] [Bode] [Nyquist]` buttons on TF results

**Files:**
- Modify: `lcd-engine.js` (attach `out.tf` in TF-bearing cases: `characterize`, `solve_margins`, `bandwidth`, `analyze_stability`)
- Modify: `lcd-solver-ui.js` (`renderResults`)

- [ ] **Step 1: Attach the TF string** in `lcd-engine.js` for the TF-bearing solvers. In each of the `characterize`, `solve_margins`, `bandwidth`, and `analyze_stability` cases, add this line right after the `parseTf(inp.G)` call:

```js
        out.tf = inp.G;
```

- [ ] **Step 2: Render the buttons** — in `lcd-solver-ui.js` `renderResults`, after the plot-panel line, add:

```js
  if (res.tf && !res.plotData) {
    const bar = el("div", { style: "display:flex;gap:6px;margin-top:6px;" });
    const view = el("div", { style: "overflow-x:auto;margin-top:6px;" });
    const make = (label, fn) => {
      const b = el("button", { style:
        `background:rgba(30,41,59,0.5);color:#a5b4fc;border:1px solid ${BORDER};` +
        `border-radius:8px;padding:6px 12px;font:600 11px 'Outfit';cursor:pointer;` }, label);
      b.onclick = () => {
        try {
          const pd = buildPlotData(parseTf(res.tf));
          view.innerHTML = fn(pd);
        } catch (e) { view.textContent = "Could not plot: " + e.message; }
      };
      return b;
    };
    bar.append(
      make("Step", (pd) => stepPlot(pd.step, pd.annotations.step || {})),
      make("Bode", (pd) => bodePlot(pd.bode, pd.annotations.bode || {})),
      make("Nyquist", (pd) => nyquistPlot(pd.nyquist, pd.annotations.nyquist || {})),
    );
    body.append(bar, view);
  }
```

- [ ] **Step 3: Import `buildPlotData` and `parseTf`** at the top of `lcd-solver-ui.js` (if not already imported)

```js
import { buildPlotData } from "./spike/solvers/plotdata.js";
import { parseTf } from "./spike/numeric/parse.js";
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`, then `npm start`. Pick **Characterize TF**, enter `25/(s**2+3*s+25)`, Solve.
Expected: `[Step] [Bode] [Nyquist]` buttons under the result; clicking each renders the plot inline.

- [ ] **Step 5: Commit**

```bash
git add lcd-engine.js lcd-solver-ui.js
git commit -m "Add contextual Step/Bode/Nyquist buttons to transfer-function results"
```

---

## Task 10: Cross-check, full verification, docs

**Files:**
- Test: `spike/test/plotdata.test.js`
- Modify: `docs/stress-test-1-findings.md` (note the new feature)

- [ ] **Step 1: Add a python-control cross-check test** (values already verified for Mock Exam 1)

```js
// append to spike/test/plotdata.test.js — Q10 plant from the mock exam
test("Nyquist verdict matches the known Q10 plant (type-1, 3-pole)", () => {
  const tf = parseTf("10/(s*(s+1)*(s+2))");
  const pd = buildPlotData(tf);
  // closed loop 1+L has RHP roots -> unstable at unity gain (GM<1 for this plant)
  assert.equal(pd.annotations.nyquist.stable, false);
});

test("step final value equals DC gain for the Q12 closed loop", () => {
  const tf = parseTf("11.4461/(s**2+4*s+11.4461)");
  const pd = buildPlotData(tf);
  assert.ok(Math.abs(pd.step.y[pd.step.y.length - 1] - 1) < 0.02);
});
```

- [ ] **Step 2: Run the full suite**

Run: `cd spike && node --test` (or `cd .. && npm test`)
Expected: all green (108 prior + new plot tests).

- [ ] **Step 3: Manual app smoke across edge cases**

Run `npm run build && npm start`. In **Plot transfer function**, try each and confirm no crash + sensible plots:
- stable 2nd-order `25/(s**2+3*s+25)` (overshoot markers)
- integrator `1/(s*(s+1))` (Nyquist capped; Bode mag rises at low ω)
- unstable `1/(s-1)` (step grows; clipped; Nyquist/Bode still draw)
- improper-ish high-order `(s+1)/((s+2)*(s+3)*(s+4))`

- [ ] **Step 4: Note the feature in findings**

Add a short line under the findings doc's fix list:

```markdown
- Added in-app transfer-function plots (step/Bode/Nyquist/pole-zero), annotated,
  computed in the JS engine — see docs/superpowers/specs/2026-05-31-transfer-function-plots-design.md.
```

- [ ] **Step 5: Commit**

```bash
git add spike/test/plotdata.test.js docs/stress-test-1-findings.md
git commit -m "Cross-check plot data against known mock-exam plants; note the feature"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** Bode/Nyquist/step/pole-zero (Tasks 1-6), annotations reusing existing solvers (Task 4), dedicated form (Task 7) + contextual buttons (Task 9), error handling (capping in Tasks 2/3, `try/null` in Task 4, clip guards in the SVG primitive Task 5), tests throughout. All spec sections map to a task.
- **String vs element:** `plot-svg.js` emits SVG **strings** (pure, Node-testable). The UI injects them with `innerHTML` — safe because the content is generated by us and all text labels pass through `escapeXml`. User-pasted text is never injected as markup.
- **Type consistency:** `buildPlotData(tf)` → `{ bode, nyquist, step, poleZero, annotations }`; the same property names are consumed in Tasks 8-9. Annotation field names (`GM_dB`, `PM_deg`, `omega_pc`, `omega_gc`, `omega_BW`, `stable`, `encirclements`, `finalValue`, `overshootPct`, `peakTime`, `settling2pct`) are defined in Task 4 and used unchanged in Task 6.
