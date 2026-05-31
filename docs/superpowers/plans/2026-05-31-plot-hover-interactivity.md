# Plot Hover Read-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover crosshair + value tooltip to the four transfer-function plots (step, Bode, Nyquist, pole-zero).

**Architecture:** Additive. `linePlot` stamps the pixel↔value mapping onto each `<svg>` as `data-*` attributes (composers still return strings). A new `plot-interact.js` holds pure mapping helpers (tested) plus `attachHover(rootEl, pd)` that reads those attrs and the data the UI already has (`pd` from `buildPlotData`), wiring `mousemove`/`mouseleave` to draw a crosshair + tooltip on the live SVG.

**Tech Stack:** Pure ES modules, zero new deps. `node --test` from `spike/`. esbuild bundle.

**Conventions:** Windows-first, `PAGER=cat`. Commits read like a human wrote them — NO AI attribution. Rebuild with `npm run build`.

---

## File structure

| File | Responsibility |
|---|---|
| `plot-svg.js` (modify) | `linePlot` stamps `data-kind`/`data-plotbox`/`data-xscale`/`data-xdomain`/`data-ydomain`; composers pass a `kind` |
| `plot-interact.js` (create) | pure `invertX`/`projectX`/`projectY`/`nearestByX`/`nearest2D` + DOM `attachHover` |
| `spike/test/plot-interact.test.js` (create) | unit tests for the pure helpers |
| `spike/test/plot-svg.test.js` (modify) | assert the mapping attrs are present |
| `lcd-solver-ui.js` (modify) | call `attachHover(view, pd)` after injecting plot SVGs |

---

## Task 1: Stamp the pixel↔value mapping onto each plot SVG

**Files:**
- Modify: `plot-svg.js` — `linePlot` svg opening tag; composers pass `kind`
- Test: `spike/test/plot-svg.test.js`

- [ ] **Step 1: Write the failing test** (append to `spike/test/plot-svg.test.js`):

```js
test("linePlot stamps the mapping attributes when a kind is given", () => {
  const svg = linePlot({
    series: [{ x: [1, 10, 100], y: [0, -6, -20], color: "#c00" }],
    xScale: "log", kind: "bode-mag", width: 460, height: 180,
  });
  assert.ok(/data-kind="bode-mag"/.test(svg), "kind");
  assert.ok(/data-plotbox="[\d.,-]+"/.test(svg), "plotbox");
  assert.ok(/data-xscale="log"/.test(svg), "xscale");
  assert.ok(/data-xdomain="[-\d.,]+"/.test(svg), "xdomain");
  assert.ok(/data-ydomain="[-\d.,]+"/.test(svg), "ydomain");
});

test("composers carry their kind through to the svg", () => {
  const bode = bodePlot({ omega: [1, 10], magDb: [0, -20], phaseDeg: [-90, -180] }, {});
  assert.ok(/data-kind="bode-mag"/.test(bode) && /data-kind="bode-phase"/.test(bode));
  const nyq = nyquistPlot({ re: [1, 0], im: [0, -1], omega: [1, 10] }, {});
  assert.ok(/data-kind="nyquist"/.test(nyq));
  const step = stepPlot({ t: [0, 1], y: [0, 1] }, {});
  assert.ok(/data-kind="step"/.test(step));
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: FAIL — no `data-kind` in output.

- [ ] **Step 3a: Stamp the attributes in `linePlot`.** In `plot-svg.js`, the `linePlot` function builds the opening `<svg …>` tag in `const parts = [...]`. By that point `pl, pr, pt, pb`, `log`, `sx`, `sy` are all computed. Replace the opening-tag push so it includes the mapping attrs:

```js
  const box = `${pl},${pt},${pr - pl},${pb - pt}`;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, sans-serif"` +
    ` data-kind="${escapeXml(opts.kind || "")}" data-plotbox="${box}" data-xscale="${log ? "log" : "linear"}"` +
    ` data-xdomain="${sx.min},${sx.max}" data-ydomain="${sy.min},${sy.max}">`];
```

(If `sx`/`sy`/`box` are referenced before they exist in the current ordering, move this `parts` initialisation to just after `const sy = …` / `clipId` is computed — it must come after the scales are built.)

- [ ] **Step 3b: Pass `kind` from each composer.** In `plot-svg.js`:
  - `bodePlot`: the magnitude `linePlot({...})` gets `kind: "bode-mag"`, the phase `linePlot({...})` gets `kind: "bode-phase"`.
  - `nyquistPlot`: `linePlot({...})` gets `kind: "nyquist"`.
  - `stepPlot`: `linePlot({...})` gets `kind: "step"`.
  - `poleZeroPlot`: `linePlot({...})` gets `kind: "polezero"`.

Add `kind: "<value>",` to each composer's `linePlot` options object.

- [ ] **Step 4: Run, verify it passes**

Run: `cd spike && node --test test/plot-svg.test.js`
Expected: PASS (all prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add plot-svg.js spike/test/plot-svg.test.js
git commit -m "Stamp pixel<->value mapping attributes on each plot SVG"
```

---

## Task 2: Pure mapping helpers

**Files:**
- Create: `plot-interact.js`
- Test: `spike/test/plot-interact.test.js`

- [ ] **Step 1: Write the failing test** (`spike/test/plot-interact.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { invertX, projectX, projectY, nearestByX, nearest2D, parsePlotbox } from "../../plot-interact.js";

const box = { x: 50, y: 10, w: 400, h: 200 };

test("invertX/projectX round-trip on a linear axis", () => {
  const dx = invertX(250, box, [0, 100], false); // mid box -> mid domain
  assert.ok(Math.abs(dx - 50) < 1e-9, `dx ${dx}`);
  assert.ok(Math.abs(projectX(50, box, [0, 100], false) - 250) < 1e-9);
});

test("invertX/projectX round-trip on a log axis", () => {
  const dx = invertX(250, box, [0, 2], true); // mid -> 10^1 = 10
  assert.ok(Math.abs(dx - 10) < 1e-6, `dx ${dx}`);
  assert.ok(Math.abs(projectX(10, box, [0, 2], true) - 250) < 1e-6);
});

test("projectY inverts the axis (min at bottom, max at top)", () => {
  assert.ok(Math.abs(projectY(0, box, [0, 10]) - (box.y + box.h)) < 1e-9); // min -> bottom
  assert.ok(Math.abs(projectY(10, box, [0, 10]) - box.y) < 1e-9);          // max -> top
});

test("nearestByX picks the closest sample", () => {
  assert.equal(nearestByX([1, 10, 100, 1000], 80), 2);
});

test("nearest2D picks the closest point", () => {
  assert.equal(nearest2D([0, 1, 2], [0, 0, 0], 1.9, 0.1), 2);
});

test("parsePlotbox parses the data-plotbox string", () => {
  assert.deepEqual(parsePlotbox("50,10,400,200"), { x: 50, y: 10, w: 400, h: 200 });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd spike && node --test test/plot-interact.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers** (`plot-interact.js`):

```js
// plot-interact.js
// Hover read-off for the transfer-function plots. The pure helpers map between
// pixel and data coordinates; attachHover() wires the crosshair + tooltip onto an
// injected SVG using the data the UI already has.

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

/** Index of the sample in (sorted-ish) xs closest to target. */
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd spike && node --test test/plot-interact.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plot-interact.js spike/test/plot-interact.test.js
git commit -m "Add pure pixel<->data mapping helpers for plot hover"
```

---

## Task 3: `attachHover` — crosshair + tooltip on the live SVG

**Files:**
- Modify: `plot-interact.js` (append the DOM function)

> DOM wiring — no unit harness; verified in-app (Task 5).

- [ ] **Step 1: Append `attachHover`** to `plot-interact.js`:

```js
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
    if (!series) return;

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
        if (!lines) return; // polezero: no marker within reach
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
  // tooltip box, flipped to stay inside the plot
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
```

- [ ] **Step 2: Build**

Run: `npm run build` → expect success (no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add plot-interact.js
git commit -m "Add attachHover: crosshair + value tooltip on plot SVGs"
```

---

## Task 4: Wire hover into the solver UI

**Files:**
- Modify: `lcd-solver-ui.js` — import + two injection sites

- [ ] **Step 1: Import** `attachHover` at the top of `lcd-solver-ui.js`:

```js
import { attachHover } from "./plot-interact.js";
```

- [ ] **Step 2: Wire the tabbed panel.** In `renderPlotPanel`, the `show(name)` function sets `view.innerHTML = views[name]();`. Immediately after that line, add:

```js
    attachHover(view, pd);
```

- [ ] **Step 3: Wire the contextual buttons.** In `renderResults`, the contextual-button block sets `view.innerHTML = fn(pd);` inside each button's `onclick`. Immediately after that line, add:

```js
          attachHover(view, pd);
```

(There is one `view.innerHTML = fn(pd);` in that block — add the call right after it, inside the `try`.)

- [ ] **Step 4: Build and verify in-app**

Run: `npm run build`, then `npm start`. Open **Plot transfer function**, enter `25/(s**2+3*s+25)`, Solve. Hover the Step curve → crosshair + `t=… y=…`; switch to Bode → `ω=… |G|=… dB ∠G=…°`; Nyquist → nearest point with `ω/Re/Im`; Pole-Zero → hover a marker shows `pole …`.

- [ ] **Step 5: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Enable hover read-off on the solver plot panel and buttons"
```

---

## Task 5: Verify + docs

- [ ] **Step 1: Full suite + build**

Run: `npm test` → all green (prior + the new plot-svg and plot-interact tests). `npm run build` → success.

- [ ] **Step 2: Browser-render verification.** Generate the real panel for `25/(s**2+3*s+25)` into an HTML file (importing `buildPlotData` + composers + `attachHover`), open it via a static server, dispatch a synthetic `mousemove` over the Bode panel with `preview_eval`, and screenshot to confirm the crosshair + tooltip appear with sensible values. (This mirrors the verification done for the static plots.) Remove the scratch files afterward — do not commit them.

- [ ] **Step 3: Note the feature** — add a bullet under the fix list in `docs/stress-test-1-findings.md`:

```markdown
- Plots are now interactive: hover any plot for a crosshair + value read-off
  (t/y, ω/|G|/∠G, Re/Im, pole·zero) — see
  docs/superpowers/specs/2026-05-31-plot-hover-interactivity-design.md.
```

- [ ] **Step 4: Commit**

```bash
git add docs/stress-test-1-findings.md
git commit -m "Note interactive plot hover read-off in findings"
```

---

## Self-review notes (reconciled)

- **Spec coverage:** mapping attrs (Task 1), pure helpers tested (Task 2), per-kind crosshair+tooltip incl. Bode showing ω/|G|/∠G and Nyquist nearest-2D (Task 3), UI wiring at both injection sites (Task 4), error handling — cursor-outside-box guard and missing-attrs skip live in `attachHover` (Task 3). All spec sections mapped.
- **Type consistency:** `box` is `{x,y,w,h}` everywhere; `invertX(px, box, xDomain, isLog)`, `projectX(dataX, box, xDomain, isLog)`, `projectY(dataY, box, yDomain)`, `nearestByX(xs, target)`, `nearest2D(xs, ys, tx, ty)` — signatures identical across Tasks 2-3. `pickSeries` returns `{x, y, tip}` consumed uniformly. `data-kind` values (`step`/`bode-mag`/`bode-phase`/`nyquist`/`polezero`) match between Task 1 (stamped) and Task 3 (read).
- **No placeholders:** every step has concrete code or an exact command.
