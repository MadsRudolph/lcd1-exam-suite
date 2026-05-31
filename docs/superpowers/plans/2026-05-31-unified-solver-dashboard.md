# Unified Solver Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 24-form LCD1 Solver dropdown with one system-centric dashboard: type a transfer function once → every read-out is auto-computed and laid out, design tools reuse the same G(s), and the board auto-adapts numeric ↔ symbolic.

**Architecture:** A thin orchestration layer (`analyzeNumeric` / `analyzeSymbolic` in `lcd-engine.js`) calls the existing, parity-verified solver modules — each field in its own try/catch so one failure degrades to `—`. `lcd-solver-ui.js` is rebuilt to render the dashboard from those objects and to wire the design strip / calculators to the existing `runSolver`. The numeric and symbolic engines and the block-diagram reducer are NOT touched.

**Tech Stack:** Pure ES modules, `node:test` for logic, esbuild bundle, in-app verification via the Claude_Preview MCP. Windows-first (`PAGER=cat`).

---

## File structure

- **`lcd-engine.js`** (modify) — add `analyzeNumeric(Gstr)`, `analyzeSymbolic(Gstr)`, `isSymbolicTf(str)`, `formatTf(num, den)`. Keep `runSolver` (reused by the design strip / calculators).
- **`spike/test/dashboard.test.js`** (create) — node tests for the four new functions.
- **`lcd-forms.js`** (modify) — trim `FORMS` to the design-strip goals + 3 standalone calculators + TF-producer "sources"; tag each with a `group` so the UI can place it.
- **`lcd-solver-ui.js`** (modify) — rebuild the left column: one input box + interpreted-as echo + auto board + design strip + symbolic board + calculators + option matcher. Reuse `el`, `katex`, `renderPlotPanel`, `runSolver`. Remove `buildSolverPicker` and the per-form `renderForm` scaffold once the dashboard replaces them.
- **No changes** to `spike/solvers/*`, `spike/numeric/*`, `symbolic/*`, `solver.js`, `math-engine.js`, `canvas.js`.

**Verification convention (this repo):** logic is unit-tested with `node --test`; UI is verified in the live preview (there are no DOM unit tests). UI tasks therefore end with a concrete preview check, then a commit.

---

### Task 1: `analyzeNumeric(Gstr)` + `formatTf` — the numeric orchestration

**Files:**
- Modify: `lcd-engine.js` (add exports near the other helpers)
- Test: `spike/test/dashboard.test.js` (create)

Returns a flat object; **every field is computed in its own try/catch** and falls back to `null` so one failure never breaks the board. Reuses existing imports already in `lcd-engine.js` (`parseTf`, `characterizeTf`, `bandwidth`, `dominantSettling`, `analyzeStability`, `solveMargins`, `solveEssTable`).

- [ ] **Step 1: Write the failing test**

```js
// spike/test/dashboard.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { approxRel } from "../lib/assert.js";
import { analyzeNumeric, formatTf } from "../../lcd-engine.js";

test("formatTf expands a factored TF to a polynomial ratio", () => {
  // 12/((s+2)(s+3)) → "12 / (s^2 + 5s + 6)"
  assert.equal(formatTf([12], [1, 5, 6]).replace(/\s+/g, ""), "12/(s^2+5s+6)");
});

test("analyzeNumeric of 12/((s+2)(s+3)): DC gain 2 / 6.02 dB, type 0, order 2", () => {
  const a = analyzeNumeric("12/((s+2)*(s+3))");
  approxRel(a.dcGain, 2, 1e-9, "dc");
  approxRel(a.dcGain_dB, 6.0206, 1e-3, "dc dB");
  assert.equal(a.type, 0);
  assert.equal(a.order, 2);
  assert.equal(a.poles, "-3, -2");
  assert.equal(a.stable, true);
});

test("analyzeNumeric margins of 1/(s*(s+2.1)) at unit gain are finite PM", () => {
  const a = analyzeNumeric("1/(s*(s+2.1))");
  assert.equal(a.type, 1);
  assert.ok(a.margins && Number.isFinite(a.margins.PM_deg), "PM finite");
});

test("analyzeNumeric is null-safe field-by-field (improper TF doesn't throw)", () => {
  const a = analyzeNumeric("s^3/(s+1)");
  assert.ok(a.error == null, "no top-level error");
  // bandwidth/settling may be null; the call must still return an object
  assert.equal(typeof a, "object");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd spike && node --test test/dashboard.test.js`
Expected: FAIL — `analyzeNumeric`/`formatTf` are not exported.

- [ ] **Step 3: Write the implementation**

Add to `lcd-engine.js` (after the existing helper consts like `ratStr`):

```js
// ---- dashboard orchestration (re-surfacing the existing solvers) ----

// Highest-degree-first coeff array → readable "a s^2 + b s + c".
export function formatTf(num, den) {
  const poly = (coeffs) => {
    const n = coeffs.length - 1;
    const parts = [];
    coeffs.forEach((c, i) => {
      const p = n - i;
      if (Math.abs(c) < 1e-12) return;
      const cc = Number(c.toPrecision(6));
      const mag = Math.abs(cc) === 1 && p !== 0 ? (cc < 0 ? "-" : "") : `${cc}`;
      const mono = p === 0 ? `${cc}` : p === 1 ? `${mag}s` : `${mag}s^${p}`;
      parts.push((parts.length && cc > 0 ? " + " : parts.length ? " " : "") + (cc < 0 && parts.length ? "- " + mono.replace("-", "") : mono));
    });
    return parts.join("") || "0";
  };
  const d = formatDen(den, poly);
  return den.length === 1 ? `${poly(num)}${den[0] === 1 ? "" : ` / ${den[0]}`}` : `${poly(num)} / (${d})`;
}
function formatDen(den, poly) { return poly(den); }

const cplxList = (arr) =>
  arr.map((p) => (Math.abs(p.im) < 1e-9 ? `${Number(p.re.toPrecision(4))}` : `${Number(p.re.toPrecision(4))}${p.im >= 0 ? "+" : "-"}${Number(Math.abs(p.im).toPrecision(4))}j`)).join(", ");

// type N = number of poles at the origin; order = #poles.
function typeOrder(G) {
  const poles = G.poles();
  return { order: poles.length, type: poles.filter((p) => p.abs() < 1e-6).length };
}

const guard = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };

export function analyzeNumeric(Gstr) {
  let G;
  try { G = parseTf(Gstr); } catch (e) { return { error: e.message }; }

  const c = guard(() => characterizeTf(G), {});
  const to = guard(() => typeOrder(G), { order: null, type: null });
  const dc = guard(() => G.dcGain(), null);
  const m = guard(() => solveMargins(G), null);
  const ess = guard(() => solveEssTable(G), null);
  const settle = guard(() => dominantSettling(G), null);

  return {
    error: null,
    interpreted: guard(() => formatTf(G.num, G.den), Gstr),
    dcGain: to.type > 0 ? Infinity : dc,
    dcGain_dB: to.type > 0 ? Infinity : (dc != null && dc > 0 ? 20 * Math.log10(dc) : null),
    type: to.type,
    order: to.order,
    poles: guard(() => cplxList(G.poles()), null),
    zeros: guard(() => cplxList(G.zeros()) || "none", "none") || "none",
    initialValue: c.initial_value ?? null,
    finalValue: to.type > 0 ? Infinity : dc,
    bandwidth: guard(() => bandwidth(G), null),
    settling: settle ? settle.t_s_2pct : null,
    margins: m,
    ess,
    stable: guard(() => !G.poles().some((p) => p.re > 1e-9), null),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd spike && node --test test/dashboard.test.js`
Expected: PASS (4/4 in this file so far).

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test` (from repo root)
Expected: all pass (existing count + new).

- [ ] **Step 6: Commit**

```bash
git add lcd-engine.js spike/test/dashboard.test.js
git commit -m "Add analyzeNumeric orchestration and formatTf echo for the dashboard"
```

---

### Task 2: `analyzeSymbolic(Gstr)` + `isSymbolicTf(str)`

**Files:**
- Modify: `lcd-engine.js`
- Test: `spike/test/dashboard.test.js`

Reuses the CAS imports already in `lcd-engine.js` (`parseExprToTF`, `systemType`, `order as symOrder`, `staticGain`, `essStep`, `essRamp`, `feedback`, `renderSymTF`) and `ratStr`.

- [ ] **Step 1: Write the failing test**

```js
// append to spike/test/dashboard.test.js
import { analyzeSymbolic, isSymbolicTf } from "../../lcd-engine.js";

test("isSymbolicTf detects literal parameters but not s/numbers", () => {
  assert.equal(isSymbolicTf("12/((s+2)*(s+3))"), false);
  assert.equal(isSymbolicTf("K/(s*(s+a))"), true);
  assert.equal(isSymbolicTf("1/(s^2+2*s+10)"), false);
});

test("analyzeSymbolic of K/(s*(s+a)): closed-loop K/(s^2+as+K), type 1", () => {
  const a = analyzeSymbolic("K/(s*(s+a))");
  assert.equal(a.error, null);
  assert.equal(a.closedLoop.replace(/\s+/g, ""), "K/(s^2+as+K)");
  assert.equal(a.type, 1);
  assert.equal(a.order, 2);
  assert.equal(a.essStep, "0");
  assert.equal(a.essRamp.replace(/\s+/g, ""), "a/K");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd spike && node --test test/dashboard.test.js`
Expected: FAIL — `analyzeSymbolic`/`isSymbolicTf` not exported.

- [ ] **Step 3: Write the implementation**

Add to `lcd-engine.js`:

```js
// True when the expression contains a literal parameter (any letter other than s).
export function isSymbolicTf(str) {
  const cleaned = String(str).toLowerCase().replace(/\s+/g, "").replace(/[0-9s^+\-*/().]/g, "");
  return cleaned.length > 0;
}

export function analyzeSymbolic(Gstr) {
  let L;
  try { L = parseExprToTF(Gstr); } catch (e) { return { error: e.message }; }
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  const cl = safe(() => renderSymTF(feedback(L)).toFormulaString());
  return {
    error: null,
    closedLoop: cl,
    type: safe(() => systemType(L)),
    order: safe(() => symOrder(L)),
    K0: safe(() => ratStr(staticGain(L))),
    essStep: safe(() => ratStr(essStep(L))),
    essRamp: safe(() => ratStr(essRamp(L))),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd spike && node --test test/dashboard.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add lcd-engine.js spike/test/dashboard.test.js
git commit -m "Add analyzeSymbolic orchestration and symbolic-TF detection"
```

---

### Task 3: Tag forms with groups; keep only dashboard-relevant ones

**Files:**
- Modify: `lcd-forms.js`

The dashboard hosts the *design goals*, *standalone calculators*, and *TF-source converters* via the existing `runSolver`. Tag each remaining form with a `group` so the UI can place it, and drop the analysis forms the auto-board replaces (`characterize`, `bandwidth`, `dominant_settling`, `analyze_stability`, `plot_tf`, `solve_margins`, `solve_ess_table`, `symbolic_analysis`, `symbolic_equiv`, `symbolic_disturbance_ess`) — those become board/section logic, not dropdown entries.

- [ ] **Step 1: Add a `group` field to each kept form**

In `lcd-forms.js`, for the forms below add `group: "<name>"`:

- Sources (produce a G): `solve_ode_to_tf`, `solve_state_space_to_tf`, `compose_tf_from_bode`, `bode_readoff` → `group: "source"`
- Design goals (reuse G): `solve_margins`-derived `solve_P_for_PM`, `solve_pi_lead`, `solve_stable_K_range`, `solve_K_for_spec` → `group: "design"`
- Calculators (not G-centric): `solve_2nd_order`, `solve_closed_loop_2nd_order`, `solve_KP_from_ess`, `solve_nested_ess` → `group: "calc"`
- Symbolic tools kept reachable from the symbolic board: `solve_symbol`, `linearize_tf` → `group: "calc"`

Leave their `fields`, `fn`, `resultKind` unchanged. Do not delete `formByFn`.

- [ ] **Step 2: Export the groups for the UI**

Add at the bottom of `lcd-forms.js`:

```js
export const formsInGroup = (g) => FORMS.filter((f) => f.group === g);
```

- [ ] **Step 3: Run the suite (forms are data; nothing should break)**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lcd-forms.js
git commit -m "Tag solver forms with dashboard groups (source/design/calc)"
```

---

### Task 4: Dashboard shell — input box, interpreted-as echo, numeric board

**Files:**
- Modify: `lcd-solver-ui.js`

Rebuild the left column. Keep the floating mode switcher and the right-hand results column infrastructure, but replace the Smart-Paste + picker + per-form scaffold with the dashboard. Reuse `el`, `katex`, and import the new engine functions.

- [ ] **Step 1: Import the orchestration**

At the top of `lcd-solver-ui.js`, add:

```js
import { analyzeNumeric, analyzeSymbolic, isSymbolicTf, runSolver } from "./lcd-engine.js";
import { formsInGroup, formByFn } from "./lcd-forms.js";
```

- [ ] **Step 2: Replace the left column build with the dashboard input + board mount**

In `init()`, replace the Smart-Paste section, the solver picker, the form box, the options/match section, and the Solve button with:

```js
  const sysBox = el("textarea", { id: "lcd-sys", rows: "1", placeholder: "G(s) = e.g.  12/((s+2)*(s+3))   or   K/(s*(s+a))", style:
    `width:100%;resize:none;background:rgba(15,23,42,0.6);color:${TXT};border:1px solid #3b82f6;border-radius:10px;padding:12px 14px;font:15px 'JetBrains Mono',monospace;` });
  const echo = el("div", { id: "lcd-echo", style: `margin-top:7px;font:12px 'JetBrains Mono';color:#6ee7b7;min-height:16px;` });
  left.append(el("label", { style: `color:${SUB};font:600 11px 'Outfit';text-transform:uppercase;letter-spacing:.5px;` }, "System — one box for everything"));
  left.append(sysBox, echo);
  const board = el("div", { id: "lcd-board", style: "display:flex;flex-direction:column;gap:12px;margin-top:6px;" });
  left.append(board);

  state.sysBox = sysBox; state.echo = echo; state.board = board;
  sysBox.addEventListener("input", () => analyzeAndRender());
  state.analyzeAndRender = analyzeAndRender;
```

- [ ] **Step 3: Write `analyzeAndRender` + the numeric board renderer**

Add these functions to `lcd-solver-ui.js`:

```js
function card(k, v) {
  const c = el("div", { style: `background:#101a2e;border:1px solid #2c3a55;border-radius:9px;padding:9px 11px;` });
  c.append(el("div", { style: `color:${SUB};font-size:11px;` }, k));
  const val = el("div", { style: `color:${TXT};font:600 15px 'JetBrains Mono';margin-top:2px;` }); val.textContent = v;
  c.append(val);
  return c;
}
const num = (x, dp = 4) => (x == null ? "—" : x === Infinity ? "∞" : x === -Infinity ? "-∞" : String(Number(x.toPrecision(dp))));

function analyzeAndRender() {
  const src = state.sysBox.value.trim();
  state.board.innerHTML = "";
  state.echo.textContent = "";
  if (!src) { state.echo.textContent = ""; return; }

  if (isSymbolicTf(src)) { renderSymbolicBoard(src); return; }

  const a = analyzeNumeric(src);
  if (a.error) { state.echo.innerHTML = `<span style="color:#ef4444">could not read: ${a.error}</span>`; return; }
  state.echo.textContent = `interpreted as  G(s) = ${a.interpreted}`;

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;" });
  const dcText = a.dcGain === Infinity ? "∞" : `${num(a.dcGain)}  ·  ${num(a.dcGain_dB)} dB`;
  grid.append(
    card("DC gain", dcText),
    card("type / order", `${a.type} / ${a.order}`),
    card("poles", a.poles || "—"),
    card("zeros", a.zeros || "none"),
    card("GM", a.margins ? (Number.isFinite(a.margins.GM) ? `${num(a.margins.GM)}  ·  ${num(a.margins.GM_dB)} dB` : "∞") : "—"),
    card("PM (°)", a.margins ? num(a.margins.PM_deg) : "—"),
    card("ω_c / ω_π", a.margins ? `${num(a.margins.omega_gc)} / ${num(a.margins.omega_pc)}` : "—"),
    card("ess step / ramp", a.ess ? `${num(a.ess.ess_step)} / ${num(a.ess.ess_ramp)}` : "—"),
    card("y(0⁺) / y(∞)", `${num(a.initialValue)} / ${a.finalValue === Infinity ? "∞" : num(a.finalValue)}`),
    card("bandwidth", num(a.bandwidth)),
    card("settling t_s", a.settling == null ? "—" : `${num(a.settling)} s`),
    card("stable?", a.stable == null ? "—" : a.stable ? "yes" : "no"),
  );
  state.board.append(sectionLabel("Read-outs · auto-computed"), grid);

  renderPlotsInto(state.board, src);   // Task 5
  renderDesignStrip(state.board, src); // Task 6
}

function sectionLabel(t) {
  return el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.6px;margin-top:6px;` }, t);
}
```

For this task, stub the not-yet-built calls so the file runs:

```js
function renderPlotsInto() {}      // filled in Task 5
function renderDesignStrip() {}    // filled in Task 6
function renderSymbolicBoard() {}  // filled in Task 7
```

- [ ] **Step 4: Remove the now-dead picker/form code path**

Delete `buildSolverPicker`, `renderForm`, `gather`, `doPaste`, the `SAMPLE` constant, and the old `solve()` body. Keep `renderResults`, `renderPlotPanel`, `el`, `katex`, the mode switcher, and the bridge (`state.setG/setRef/setL`, `mountUseButton`, `doDiagramHandoff`, `renderChooser`). Update the bridge setters to write into `state.sysBox` instead of form fields:

```js
  state.setG = (fn, tf) => { state.sysBox.value = tf; analyzeAndRender(); };
  state.setRef = (tf) => { state.sysBox.value = tf; analyzeAndRender(); };
  state.setL = (tf) => { state.sysBox.value = tf; analyzeAndRender(); };
```

- [ ] **Step 5: Build and verify in the preview**

```bash
npm run build
```
Then start the preview (`.claude/launch.json` server "lcd1"), switch to LCD1 Solver, type `12/((s+2)*(s+3))` into the system box, and confirm via `preview_eval` that `#lcd-echo` reads `interpreted as G(s) = 12 / (s^2 + 5s + 6)` and the board shows `DC gain 2 · 6.02 dB`, `type / order 0 / 2`.
Expected: echo + board correct.

- [ ] **Step 6: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Rebuild LCD1 Solver as a system-centric dashboard (input + echo + numeric board)"
```

---

### Task 5: Plots panel into the board

**Files:**
- Modify: `lcd-solver-ui.js`

- [ ] **Step 1: Implement `renderPlotsInto`**

Replace the Task-4 stub with:

```js
function renderPlotsInto(parent, src) {
  let pd;
  try { pd = buildPlotData(parseTf(src)); } catch { return; }
  parent.append(sectionLabel("Plots · overlay the exam figure to verify"));
  parent.append(renderPlotPanel(pd, "Bode"));
}
```

`buildPlotData` and `parseTf` are already imported in `lcd-solver-ui.js`. `renderPlotPanel(pd, defaultTab)` already exists (with the image overlay).

- [ ] **Step 2: Build + preview-verify**

```bash
npm run build
```
In the preview, type `1/(s*(s+2.1))`, confirm a Bode plot renders under "Plots" and the "⧉ Overlay exam plot" control is present.
Expected: plot + overlay control visible.

- [ ] **Step 3: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Render the plot panel (Bode default + overlay) inside the dashboard board"
```

---

### Task 6: Design strip (reuses the current G)

**Files:**
- Modify: `lcd-solver-ui.js`

- [ ] **Step 1: Implement `renderDesignStrip`**

Replace the Task-4 stub. It renders a goal chip per `formsInGroup("design")`; clicking one shows that form's non-`G` fields inline, then runs `runSolver` with the dashboard's G injected into the `G` field.

```js
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
    const input = fld.kind === "dropdown"
      ? (() => { const s = el("select", { style: `background:rgba(30,41,59,0.6);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:7px;` }); (fld.options||[]).forEach((o) => s.append(el("option", { value: o }, o))); if (fld.default) s.value = fld.default; return s; })()
      : el("input", { type: "text", value: fld.default || "", placeholder: fld.placeholder || "", style: `background:rgba(30,41,59,0.4);color:${TXT};border:1px solid ${BORDER};border-radius:8px;padding:8px;font:13px 'JetBrains Mono';` });
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
    if (res.summary) { const t = el("div", { style: "display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font:12px 'JetBrains Mono';margin-top:6px;" }); res.summary.forEach(([k, v]) => { t.append(el("div", { style: `color:${SUB};` }, k), el("div", { style: `color:${TXT};` }, String(v))); }); out.append(t); }
  };
  body.append(go, out);
}
```

- [ ] **Step 2: Build + preview-verify**

```bash
npm run build
```
In the preview, type `1/(s*(s+2.1))`, click the **P for PM** goal, enter target PM `40`, Solve → confirm `K_P = 8.4` (8.18) appears.
Expected: design strip solves reusing the typed G.

- [ ] **Step 3: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Add design strip that reuses the dashboard G via runSolver"
```

---

### Task 7: Symbolic board + answer-equivalence checker (auto-swap)

**Files:**
- Modify: `lcd-solver-ui.js`

- [ ] **Step 1: Implement `renderSymbolicBoard`**

Replace the Task-4 stub. Uses `analyzeSymbolic` and the existing `runSolver("symbolic_equiv", …)` for the option checker.

```js
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

  // answer checker
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
```

- [ ] **Step 2: Build + preview-verify**

```bash
npm run build
```
In the preview, type `K/(s*(s+a))` → confirm the echo flips to "symbolic input", the board shows `closed-loop T = K/(s^2+as+K)`, `type 1`. Paste options `K/(s^2+a*s+K)` and `K/(s^2+a*s)` → click check → first is "✓ equal", second "not equal".
Expected: symbolic board + checker correct.

- [ ] **Step 3: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Auto-swap to symbolic board with answer-equivalence checker"
```

---

### Task 8: Standalone calculators + numeric option matcher; final cleanup

**Files:**
- Modify: `lcd-solver-ui.js`

- [ ] **Step 1: Add a collapsible "Calculators" section**

In `init()`, after the board mount, add a calculators area driven by `formsInGroup("calc")`, reusing `showGoal` (which already renders a form's fields and runs `runSolver`) but without injecting `G`:

```js
  const calcWrap = el("div", { style: "margin-top:14px;" });
  calcWrap.append(el("div", { style: `color:${SUB};font:600 10px 'Outfit';text-transform:uppercase;letter-spacing:.6px;` }, "Calculators (not based on one G)"));
  const calcChips = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;" });
  const calcBody = el("div", {});
  for (const f of formsInGroup("calc")) {
    const chip = el("button", { style: `background:#172033;color:${SUB};border:1px solid ${BORDER};border-radius:8px;padding:6px 10px;font:600 11px 'Outfit';cursor:pointer;` }, f.title.replace(/^P\d+ — |^Analysis — /, ""));
    chip.onclick = () => showGoal(f, calcBody, "");  // no G injection
    calcChips.append(chip);
  }
  calcWrap.append(calcChips, calcBody);
  left.append(calcWrap);
```

Note `showGoal` skips a field named `G`; the calc forms (`solve_2nd_order`, `solve_closed_loop_2nd_order`, `solve_KP_from_ess`, `solve_nested_ess`, `solve_symbol`, `linearize_tf`) have no `G` field, so all their fields render.

- [ ] **Step 2: Add a numeric option matcher to the read-out board**

In `analyzeAndRender` (numeric branch), after the grid, append a matcher that reuses `runSolver` paths via `matchOptions`. Simplest: a box + a quantity `<select>` (DC gain dB, PM, GM dB, ωc) that compares pasted options to that read-out:

```js
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
```

Add `import { matchOptions } from "./spike/match.js";` at the top.

- [ ] **Step 3: Build + preview-verify the full exam flow**

```bash
npm run build
```
In the preview verify three flows end-to-end:
1. `12/((s+2)*(s+3))` → board shows DC gain `2 · 6.02 dB`; match "DC gain (dB)" against `6\n3\n0` → 6 is ✓.
2. `1/(s*(s+2.1))` → design strip P-for-PM, PM 40 → `K_P 8.4`.
3. `K/(s*(s+a))` → symbolic board + checker.
Expected: all three pass.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lcd-solver-ui.js
git commit -m "Add standalone calculators and numeric option matcher to the dashboard"
```

---

### Task 9: Final review pass

**Files:**
- Modify: `lcd-solver-ui.js` (only if cleanup needed)

- [ ] **Step 1: Confirm no dead code / dangling imports**

Grep for removed symbols and unused imports:

```bash
grep -nE "buildSolverPicker|renderForm|doPaste|SAMPLE|state.optionsEl|state.picker" lcd-solver-ui.js
```
Expected: no matches (all removed). Remove any leftover unused imports flagged by the bundler.

- [ ] **Step 2: Build clean + full suite green**

```bash
npm run build && npm test
```
Expected: bundle builds; all tests pass.

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A
git commit -m "Remove dead form-picker code from the dashboard rebuild"
```

---

## Self-review notes

- **Spec coverage:** input box + sources (Task 4 + bridge setters + `group:"source"` in Task 3); interpreted-as echo (Tasks 1, 4); numeric board incl. DC-dB and y(0⁺)/y(∞) (Tasks 1, 4); plots+overlay (Task 5, reuses existing `renderPlotPanel`); design strip reusing G (Task 6); symbolic auto-swap + equivalence (Tasks 2, 7); option matcher (Task 8); standalone calculators (Task 8); per-card null-safety (Task 1 `guard`). All §3–§8 covered.
- **Out of scope honored:** no engine/solver/CAS/reducer edits; no NL command bar.
- **Type consistency:** `analyzeNumeric` field names used in Task 4 match Task 1 (`dcGain`, `dcGain_dB`, `margins.PM_deg`, `ess.ess_step`, `initialValue`, `finalValue`, `settling`, `stable`). `analyzeSymbolic` fields (`closedLoop`, `type`, `order`, `K0`, `essStep`, `essRamp`) match Tasks 2 and 7. `showGoal` is defined in Task 6 and reused in Task 8.
- **Note for the implementer:** the TF-source converters (`group:"source"`) are reachable as calculators that drop their result into `state.sysBox`; wiring a "use as G" button on those results is a small nicety the executor may add when building Task 8, but is not required for the core flow.
