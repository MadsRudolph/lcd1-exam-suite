# Disturbances & Arbitrary Transfer Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Block Diagram mode, let the user add disturbance nodes, compute the closed-loop transfer function between any chosen Source and Sink, and compute the open-loop loop gain L(s) by breaking a wire.

**Architecture:** Generalize the block-diagram solver into one pure `transferFunction(nodes, connections, sourceId, sinkId)` that drives both the numeric (exact-rational) and symbolic (KaTeX-steps) paths; `solveBlockDiagram` becomes a thin R→Y wrapper so existing behaviour is unchanged. Disturbance nodes are a new source type the solver zeroes via superposition. Break-a-wire L(s) reuses the same solver on a temporary connection set (virtual source feeds the cut's destination, virtual sink reads its source), negated to the `1 + L = 0` convention. The solver stays pure and unit-tested; the canvas/HTML/app glue is verified in the running app.

**Tech Stack:** Vanilla ES modules (`solver.js`, `math-engine.js`, `canvas.js`, `app.js`, `index.html`), `node:test` runner under `spike/`, esbuild bundle (`npm run build`), Electron shell.

**Spec:** [`docs/superpowers/specs/2026-05-31-disturbances-and-arbitrary-tf-design.md`](../specs/2026-05-31-disturbances-and-arbitrary-tf-design.md)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `solver.js` | Pure parameterised solve (`transferFunction`), back-compat wrapper (`solveBlockDiagram`), endpoint listing (`collectEndpoints`), open-loop L(s) (`loopGain`). Treats `input` + `disturbance` as sources. | Modify (Tasks 1, 2) |
| `spike/test/solver-tf.test.js` | Unit tests: R→Y regression, D→Y disturbance, no-path = 0, `solveBlockDiagram` parity. | Create (Task 1) |
| `spike/test/loopgain.test.js` | Unit tests: `collectEndpoints`, `loopGain` = GH on a cut feedback wire (sign pinned), forward-wire cut = 0. | Create (Task 2) |
| `canvas.js` | Draw the `disturbance` node; one-shot break-mode that emits the clicked wire id. | Modify (Tasks 3, 5) |
| `index.html` | "Disturbance (D)" sidebar button; Source/Sink dropdowns; "Break Loop" button; shortcuts entry. | Modify (Tasks 3, 4, 5) |
| `app.js` | Wire the disturbance button; populate/refresh dropdowns; route Solve + Break Loop through the new solver functions; label the result. | Modify (Tasks 3, 4, 5) |

**Conventions (do not break):** commits read like a human wrote them — NO AI attribution / Co-Authored-By, no mention of AI in messages or comments. 100% offline, zero new runtime deps. `bundle.js` is gitignored — rebuild with `npm run build`; never commit it. Run tests with `npm test` from the repo root (it runs `node --test` under `spike/`). On Windows use `PAGER=cat` so git never hangs.

---

### Task 1: Generalize the solver core to `transferFunction(nodes, connections, sourceId, sinkId)`

**Files:**
- Modify: `solver.js` (functions `solveBlockDiagram` 11-69, `solveNumerically` 74-230, `getEquationForNode` 762-810, `solveSymbolically` 812-987)
- Test: `spike/test/solver-tf.test.js` (create)

**Context:** Today `solveNumerically` and `solveSymbolically` each call `nodes.find(n => n.type==='input')` / `'output'` and hardcode R→Y. We parameterise both by `(sourceId, sinkId)`. A "source" is any node of type `input` **or** `disturbance`; in the linear system the chosen source is injected = 1 and every other source = 0 (superposition — which falls out for free, because non-chosen sources are neither the RHS source nor "active" nodes, so their connections contribute to nothing). The sink must be the **last** active node for the symbolic forward-substitution to land on it, so we reorder `activeNodes` to put the sink last (harmless for the numeric Gaussian path, which reads the sink's row by index). We also expose the raw numeric `TransferFunction` as `result.tf` so later tasks (and tests) can read `num`/`den` coefficient arrays.

- [ ] **Step 1: Write the failing tests**

Create `spike/test/solver-tf.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { transferFunction, solveBlockDiagram } from "../../solver.js";

// Coefficient arrays are ascending power: [c0, c1, c2] == c0 + c1*s + c2*s^2.
function approxCoeffs(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg}: length ${actual} vs ${expected}`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9, `${msg}: coeff[${i}] ${actual[i]} vs ${expected[i]}`);
  }
}

// Standard single loop: R -> S1(+) -> G -> S2(+) -> Y, feedback H from S2 back to S1(-),
// disturbance D injected at S2(+). G = 10/(s^2+2s), H = 2.
function standardLoopWithDisturbance() {
  const nodes = [
    { id: "R",  type: "input",       value: "1",            label: "R", x: 0, y: 0 },
    { id: "D",  type: "disturbance", value: "1",            label: "D", x: 0, y: 0 },
    { id: "S1", type: "sum",         value: "",             label: "S1", x: 0, y: 0 },
    { id: "G",  type: "block",       value: "10/(s^2+2s)",  label: "G", x: 0, y: 0 },
    { id: "S2", type: "sum",         value: "",             label: "S2", x: 0, y: 0 },
    { id: "H",  type: "block",       value: "2",            label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y",  type: "output",      value: "1",            label: "Y", x: 0, y: 0 },
  ];
  const connections = [
    { id: "c1", fromNode: "R",  toNode: "S1", sign: "+" },
    { id: "c2", fromNode: "S1", toNode: "G",  sign: "" },
    { id: "c3", fromNode: "G",  toNode: "S2", sign: "+" },
    { id: "c4", fromNode: "S2", toNode: "Y",  sign: "" },
    { id: "c5", fromNode: "D",  toNode: "S2", sign: "+" },
    { id: "c6", fromNode: "S2", toNode: "H",  sign: "" },
    { id: "c7", fromNode: "H",  toNode: "S1", sign: "-" },
  ];
  return { nodes, connections };
}

test("R -> Y is the closed loop G/(1+GH) = 10/(s^2+2s+20)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = transferFunction(nodes, connections, "R", "Y");
  approxCoeffs(r.tf.num.coeffs, [10], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});

test("D -> Y is 1/(1+GH) scaled = (s^2+2s)/(s^2+2s+20)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = transferFunction(nodes, connections, "D", "Y");
  approxCoeffs(r.tf.num.coeffs, [0, 2, 1], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});

test("a disturbance with no path to the sink gives TF = 0", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  nodes.push({ id: "D2", type: "disturbance", value: "1", label: "D2", x: 0, y: 0 });
  const r = transferFunction(nodes, connections, "D2", "Y");
  approxCoeffs(r.tf.num.coeffs, [0], "num");
});

test("solveBlockDiagram defaults to first input -> first output (regression)", () => {
  const { nodes, connections } = standardLoopWithDisturbance();
  const r = solveBlockDiagram(nodes, connections);
  approxCoeffs(r.tf.num.coeffs, [10], "num");
  approxCoeffs(r.tf.den.coeffs, [20, 2, 1], "den");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from repo root)
Expected: FAIL — `transferFunction` is not exported / `r.tf` is undefined.

- [ ] **Step 3: Add the `SOURCE_TYPES` constant and refactor `solveNumerically`'s signature + lookups**

In `solver.js`, near the top (after the `import` on line 9) add:

```javascript
const SOURCE_TYPES = ['input', 'disturbance'];
```

Change `solveNumerically(nodes, connections)` (line 74) to `solveNumerically(nodes, connections, sourceId, sinkId)` and replace its head (lines 75-93) with:

```javascript
function solveNumerically(nodes, connections, sourceId, sinkId) {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const sinkNode = nodes.find(n => n.id === sinkId);

    if (!sourceNode) throw new Error("Missing source node");
    if (!sinkNode) throw new Error("Missing sink node");

    const base = [
        ...nodes.filter(n => n.type === 'block'),
        ...nodes.filter(n => n.type === 'sum'),
        ...nodes.filter(n => n.type === 'output')
    ];
    // Put the sink last so the symbolic forward-substitution lands on it; harmless here.
    const activeNodes = base.filter(n => n.id !== sinkId).concat(base.filter(n => n.id === sinkId));
    const K = activeNodes.length;

    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");

    const indexMap = {};
    activeNodes.forEach((n, idx) => {
        indexMap[n.id] = idx;
    });
```

- [ ] **Step 4: Route the chosen source onto the RHS in `solveNumerically`**

In the incoming-connection loop, replace the branch (lines 126-134) with:

```javascript
            if (fromNodeId === sourceId) {
                V[i] = V[i].add(weight);
            } else {
                const j = indexMap[fromNodeId];
                if (j !== undefined) {
                    M[i][j] = M[i][j].subtract(weight);
                }
            }
```

In the `initialEquations` block, replace `inputNode.label` (line 164) with `sourceNode.label`.

- [ ] **Step 5: Read the sink row and expose the raw TF in `solveNumerically`**

Replace lines 218-229 with:

```javascript
    const outIdx = indexMap[sinkId];
    const finalTF = V[outIdx].clone().simplify();

    return {
        initialEquations,
        steps,
        tf: finalTF,
        finalTransferFunction: {
            toKaTeX: () => finalTF.toKaTeX(),
            toFormulaString: () => finalTF.toFormulaString()
        }
    };
```

- [ ] **Step 6: Parameterise `getEquationForNode` and `solveSymbolically`**

Change `getEquationForNode(k, activeNodes, C, V, inputNode)` (line 762) to `getEquationForNode(k, activeNodes, C, V, sourceNode)` and inside it replace the two `inputNode` references (lines 781-782) with `sourceNode`:

```javascript
    let rhs = "";
    if (!V[k].isZero()) {
        const vStr = V[k].toKaTeX();
        const inputLabel = formatLabelForKaTeX(sourceNode.label);
```

Change `solveSymbolically(nodes, connections)` (line 812) to `solveSymbolically(nodes, connections, sourceId, sinkId)` and replace its head (lines 813-832) with:

```javascript
export function solveSymbolically(nodes, connections, sourceId, sinkId) {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const sinkNode = nodes.find(n => n.id === sinkId);

    if (!sourceNode) throw new Error("Missing source node");
    if (!sinkNode) throw new Error("Missing sink node");

    // Sort active nodes: blocks, sums, outputs — then force the sink to be last.
    const base = [
        ...nodes.filter(n => n.type === 'block'),
        ...nodes.filter(n => n.type === 'sum'),
        ...nodes.filter(n => n.type === 'output')
    ];
    const activeNodes = base.filter(n => n.id !== sinkId).concat(base.filter(n => n.id === sinkId));
    const K = activeNodes.length;

    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");

    const indexMap = {};
    activeNodes.forEach((n, idx) => {
        indexMap[n.id] = idx;
    });
```

- [ ] **Step 7: Route the source and sink through `solveSymbolically`'s body**

In the coefficient-fill loop, replace the branch (lines 860-868) with:

```javascript
            if (fromNodeId === sourceId) {
                V[i] = V[i].add(symbol);
            } else {
                const j = indexMap[fromNodeId];
                if (j !== undefined) {
                    C[i][j] = C[i][j].add(symbol);
                }
            }
```

In the `initialEquations` block replace `inputNode.label` (line 891) with `sourceNode.label`. Replace the five `getEquationForNode(..., inputNode)` calls (lines 918, 927, 941, 951, 964) with `getEquationForNode(..., sourceNode)`. Replace `const outIdx = indexMap[outputNode.id];` (line 912) with `const outIdx = indexMap[sinkId];` and the `outputNode.label` reference in the final step title (line 970 — "Resolve Final Self-Loop on ...") with `sinkNode.label`. After these edits, no `inputNode`/`outputNode` identifiers remain anywhere in `solver.js` — grep to confirm: `PAGER=cat git grep -n "inputNode\|outputNode" solver.js` should return nothing.

- [ ] **Step 8: Replace `solveBlockDiagram` with `transferFunction` + a thin wrapper**

Replace the whole `solveBlockDiagram` function (lines 11-69) with:

```javascript
export function transferFunction(nodes, connections, sourceId, sinkId) {
    const sourceNode = nodes.find(n => n.id === sourceId);
    const sinkNode = nodes.find(n => n.id === sinkId);
    if (!sourceNode) throw new Error("No source selected");
    if (!sinkNode) throw new Error("No sink selected");

    // Symbolic if any block has letters other than 's'.
    const hasSymbolic = nodes.some(n => {
        if (n.type !== 'block') return false;
        const val = n.value.toLowerCase().replace(/\s+/g, '');
        const cleaned = val.replace(/[0-9s\+\-\*\/\(\)\.]/g, '');
        return cleaned.length > 0;
    });

    if (hasSymbolic) {
        const r = solveSymbolically(nodes, connections, sourceId, sinkId);
        return { ...r, tf: null };
    }

    // Exact numeric final TF.
    const numResult = solveNumerically(nodes, connections, sourceId, sinkId);

    // Clean G/H labels for the educational symbolic steps.
    let gCount = 1, hCount = 1;
    const blockLabels = new Map();
    nodes.forEach(n => {
        if (n.type === 'block') {
            const label = n.label ? n.label.trim() : "";
            if (label && /^[a-zA-Z]+\d*$/.test(label) && label.length <= 4) {
                blockLabels.set(n.id, label);
            } else {
                const isFeedback = n.direction === 'left';
                blockLabels.set(n.id, isFeedback ? `H${hCount++}` : `G${gCount++}`);
            }
        }
    });
    const symbolicNodes = nodes.map(n => n.type === 'block'
        ? { ...n, label: blockLabels.get(n.id), value: blockLabels.get(n.id) }
        : { ...n });
    const symResult = solveSymbolically(symbolicNodes, connections, sourceId, sinkId);

    return {
        initialEquations: symResult.initialEquations,
        steps: symResult.steps,
        finalTransferFunction: numResult.finalTransferFunction,
        tf: numResult.tf
    };
}

export function solveBlockDiagram(nodes, connections) {
    const inputNode = nodes.find(n => n.type === 'input');
    const outputNode = nodes.find(n => n.type === 'output');
    if (!inputNode) throw new Error("Missing Input node (R)");
    if (!outputNode) throw new Error("Missing Output node (Y)");
    return transferFunction(nodes, connections, inputNode.id, outputNode.id);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 4 new tests green, and the existing suite (144 tests) still green.

- [ ] **Step 10: Commit**

```bash
PAGER=cat git add solver.js spike/test/solver-tf.test.js
PAGER=cat git commit -m "Generalize block-diagram solver to arbitrary source/sink transfer functions"
```

---

### Task 2: Endpoint listing + break-a-wire open-loop L(s)

**Files:**
- Modify: `solver.js` (add `collectEndpoints`, `loopGain`, `negateResult`)
- Test: `spike/test/loopgain.test.js` (create)

**Context:** `collectEndpoints(nodes)` lists selectable Source ids/labels (input + disturbance) and Sink ids/labels (output) for the dropdowns. `loopGain(nodes, connections, cutConnId)` computes the open-loop loop gain at a cut wire `X→Y`: build a temporary diagram with the cut removed, a virtual source feeding the cut's **destination** (preserving the cut wire's sign), and a virtual sink reading the cut's **source**, then run `transferFunction(virtualSource → virtualSink)`. The raw measurement is the negative of the loop gain for standard negative feedback (it measures `−GH`), so we **negate** it to return `L(s)` in the `1 + L = 0` convention (so `L = GH`). `Polynomial.multiplyScalar` already exists (used in `TransferFunction.normalize`).

- [ ] **Step 1: Write the failing tests**

Create `spike/test/loopgain.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEndpoints, loopGain } from "../../solver.js";

function approxCoeffs(actual, expected, msg) {
  assert.equal(actual.length, expected.length, `${msg}: length ${actual} vs ${expected}`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9, `${msg}: coeff[${i}] ${actual[i]} vs ${expected[i]}`);
  }
}

// Simple negative-feedback loop: R -> S(+) -> G -> Y, feedback H from G back to S(-).
// G = 10/(s^2+2s), H = 2.  Feedback wire (H -> S) has id "fb".
function simpleLoop() {
  const nodes = [
    { id: "R", type: "input",  value: "1",           label: "R", x: 0, y: 0 },
    { id: "S", type: "sum",    value: "",            label: "S", x: 0, y: 0 },
    { id: "G", type: "block",  value: "10/(s^2+2s)", label: "G", x: 0, y: 0 },
    { id: "H", type: "block",  value: "2",           label: "H", direction: "left", x: 0, y: 0 },
    { id: "Y", type: "output", value: "1",           label: "Y", x: 0, y: 0 },
  ];
  const connections = [
    { id: "c1", fromNode: "R", toNode: "S", sign: "+" },
    { id: "c2", fromNode: "S", toNode: "G", sign: "" },
    { id: "c3", fromNode: "G", toNode: "Y", sign: "" },
    { id: "c4", fromNode: "G", toNode: "H", sign: "" },
    { id: "fb", fromNode: "H", toNode: "S", sign: "-" },
  ];
  return { nodes, connections };
}

test("collectEndpoints lists input+disturbance as sources, output as sinks", () => {
  const nodes = [
    { id: "R",  type: "input",       label: "R" },
    { id: "D",  type: "disturbance", label: "D" },
    { id: "G",  type: "block",       label: "G" },
    { id: "Y1", type: "output",      label: "Y1" },
    { id: "Y2", type: "output",      label: "Y2" },
  ];
  const { sources, sinks } = collectEndpoints(nodes);
  assert.deepEqual(sources.map(s => s.id), ["R", "D"]);
  assert.deepEqual(sinks.map(s => s.id), ["Y1", "Y2"]);
});

test("breaking the feedback wire gives the loop gain L = GH = 20/(s^2+2s)", () => {
  const { nodes, connections } = simpleLoop();
  const r = loopGain(nodes, connections, "fb");
  approxCoeffs(r.tf.num.coeffs, [20], "num");
  approxCoeffs(r.tf.den.coeffs, [0, 2, 1], "den");
});

test("breaking a non-loop forward wire gives L = 0", () => {
  const { nodes, connections } = simpleLoop();
  const r = loopGain(nodes, connections, "c3"); // G -> Y is not part of a loop
  approxCoeffs(r.tf.num.coeffs, [0], "num");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `collectEndpoints` / `loopGain` are not exported.

- [ ] **Step 3: Implement `collectEndpoints`, `loopGain`, and `negateResult`**

Append to `solver.js` (after `solveBlockDiagram`):

```javascript
export function collectEndpoints(nodes) {
    const sources = nodes
        .filter(n => SOURCE_TYPES.includes(n.type))
        .map(n => ({ id: n.id, label: n.label }));
    const sinks = nodes
        .filter(n => n.type === 'output')
        .map(n => ({ id: n.id, label: n.label }));
    return { sources, sinks };
}

// Open-loop loop gain at a cut wire X -> Y. Returns L(s) in the 1 + L = 0 convention.
export function loopGain(nodes, connections, cutConnId) {
    const cut = connections.find(c => c.id === cutConnId);
    if (!cut) throw new Error("Wire not found");

    const VSRC = '__vsrc__';
    const VSINK = '__vsink__';

    const tempNodes = [
        ...nodes,
        { id: VSRC,  type: 'input',  value: '1', label: 'L_{in}',  x: 0, y: 0 },
        { id: VSINK, type: 'output', value: '1', label: 'L_{out}', x: 0, y: 0 }
    ];
    const tempConns = connections
        .filter(c => c.id !== cutConnId)
        .concat([
            // Inject the test signal where the cut wire fed (preserve its sign).
            { id: '__vsrc_wire__',  fromNode: VSRC, toNode: cut.toNode,   sign: cut.sign },
            // Read the signal that comes back around to the cut wire's source.
            { id: '__vsink_wire__', fromNode: cut.fromNode, toNode: VSINK, sign: '' }
        ]);

    const measured = transferFunction(tempNodes, tempConns, VSRC, VSINK);
    return negateResult(measured);
}

// L(s) = -(measured): the raw break measures -GH for negative feedback; negate to GH.
function negateResult(result) {
    if (result.tf) {
        const negTf = result.tf.clone();
        negTf.num = negTf.num.multiplyScalar(-1);
        return {
            initialEquations: [],
            steps: [],
            tf: negTf,
            finalTransferFunction: {
                toKaTeX: () => negTf.toKaTeX(),
                toFormulaString: () => negTf.toFormulaString()
            }
        };
    }
    const k = result.finalTransferFunction.toKaTeX();
    const f = result.finalTransferFunction.toFormulaString();
    return {
        initialEquations: [],
        steps: [],
        tf: null,
        finalTransferFunction: {
            toKaTeX: () => `-\\left(${k}\\right)`,
            toFormulaString: () => `-(${f})`
        }
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — the 3 new tests green; full suite still green.

- [ ] **Step 5: Commit**

```bash
PAGER=cat git add solver.js spike/test/loopgain.test.js
PAGER=cat git commit -m "Add endpoint listing and break-a-wire open-loop loop gain"
```

---

### Task 3: Disturbance node — canvas drawing, sidebar button, app wiring

**Files:**
- Modify: `canvas.js` (`addNode` 94-120, `drawNode` 953-1131)
- Modify: `index.html` (tool-grid 25-42)
- Modify: `app.js` (button refs 17-21, add-node handlers 45-56)

**Context:** A disturbance is a source drawn like an Input circle but visually distinct (amber, with a downward inject arrow) and carrying a single output port to wire into a summing junction. The solver already treats `disturbance` as a source (Task 1), so this task is pure UI glue. Canvas drawing is DOM-bound (`createElementNS`) and — consistent with the existing codebase, where `drawNode`/`addNode` have no unit tests — is verified in the running app rather than with `node:test`.

- [ ] **Step 1: Give `addNode` a disturbance default**

In `canvas.js` `addNode` (after the `sum` branch, line 114), add:

```javascript
        } else if (type === 'disturbance') {
            node.label = label || "D";
            node.value = "1";
        }
```

- [ ] **Step 2: Draw the disturbance node**

In `canvas.js` `drawNode`, change the first node-type guard (line 961) so disturbances reuse the circle path but render distinctly. Replace lines 961-997 (`if (node.type === 'input' || node.type === 'output') { ... }`) with the same block guarded by `input || output || disturbance`, an amber stroke for disturbances, an inject arrow, and an output port:

```javascript
        if (node.type === 'input' || node.type === 'output' || node.type === 'disturbance') {
            const isDisturbance = node.type === 'disturbance';
            // Circle node
            const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circ.setAttribute('cx', node.x);
            circ.setAttribute('cy', node.y);
            circ.setAttribute('r', '25');
            circ.setAttribute('fill', '#1e293b');
            circ.setAttribute('stroke', isSelected ? '#3b82f6' : (isDisturbance ? '#f59e0b' : '#64748b'));
            circ.setAttribute('stroke-width', isSelected ? '3' : '2');
            circ.setAttribute('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))');
            g.appendChild(circ);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', node.x);
            text.setAttribute('y', node.y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', isDisturbance ? '#fbbf24' : '#f8fafc');
            text.setAttribute('font-family', 'sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('font-size', '14');
            text.textContent = node.label;
            g.appendChild(text);

            if (isDisturbance) {
                // Downward inject arrow above the circle, signalling an external input.
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                arrow.setAttribute('d', `M ${node.x} ${node.y - 48} L ${node.x} ${node.y - 28} M ${node.x - 5} ${node.y - 34} L ${node.x} ${node.y - 28} L ${node.x + 5} ${node.y - 34}`);
                arrow.setAttribute('stroke', '#f59e0b');
                arrow.setAttribute('stroke-width', '2');
                arrow.setAttribute('fill', 'none');
                g.appendChild(arrow);
            }

            // Add Ports based on direction.
            if (node.type === 'output') {
                let inX = node.x - 25, inY = node.y;
                if (dir === 'left') { inX = node.x + 25; }
                else if (dir === 'up') { inX = node.x; inY = node.y + 25; }
                else if (dir === 'down') { inX = node.x; inY = node.y - 25; }
                this.addPort(g, node.id, inX, inY, 'in');
            } else {
                // input and disturbance both expose a single output port.
                let outX = node.x + 25, outY = node.y;
                if (dir === 'left') { outX = node.x - 25; }
                else if (dir === 'up') { outX = node.x; outY = node.y - 25; }
                else if (dir === 'down') { outX = node.x; outY = node.y + 25; }
                this.addPort(g, node.id, outX, outY, 'out');
            }
        } else if (node.type === 'sum') {
```

- [ ] **Step 3: Add the sidebar button**

In `index.html`, inside `.tool-grid` after the Sum Junction button (line 41), add:

```html
                <button class="btn-tool" id="add-disturbance-btn" style="color:#f59e0b;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2"/></svg>
                    Disturbance (D)
                </button>
```

- [ ] **Step 4: Wire the button in `app.js`**

In `app.js`, after `const addSumBtn = ...` (line 20) add:

```javascript
    const addDisturbanceBtn = document.getElementById('add-disturbance-btn');
```

After the `addSumBtn` click handler (line 56) add:

```javascript
    if (addDisturbanceBtn) {
        addDisturbanceBtn.addEventListener('click', () => {
            canvas.addNode('disturbance', 180, 360, '1', 'D');
        });
    }
```

- [ ] **Step 5: Build and verify in the app**

Run: `npm run build`
Then launch (`npm start`, or load `index.html` in the preview harness) and verify:
1. The sidebar shows a "Disturbance (D)" button.
2. Clicking it drops an amber circle labelled **D** with a downward inject arrow and a single output port.
3. You can drag a wire from D's output port into a summing junction's input port (the strict output↔input rule still applies).
4. The existing Input/Output/Block/Sum nodes are unchanged.

Expected: all four hold.

- [ ] **Step 6: Commit**

```bash
PAGER=cat git add canvas.js index.html app.js
PAGER=cat git commit -m "Add disturbance node type with sidebar button and inject-arrow rendering"
```

---

### Task 4: Source/Sink dropdowns + labelled solve

**Files:**
- Modify: `index.html` (canvas-actions 166-169; right-panel copy header optional)
- Modify: `app.js` (imports 7-9, solve/render 112-273, state-change 70-95)

**Context:** Two dropdowns let the user pick which Source and Sink to compute. They are populated from `collectEndpoints(canvas.nodes)` and refresh whenever the diagram changes (the canvas already calls `handleStateChange` + `updateDiagramStats` via its `onStateChange` callback — we hook there). On Solve, if both a source and sink are chosen we call `transferFunction(nodes, conns, sourceId, sinkId)` and label the output `<sink>/<source>`; otherwise we fall back to `solveBlockDiagram`. The result label (and copy buttons) become dynamic instead of the hardcoded `Y(s)/R(s)`.

- [ ] **Step 1: Add the dropdown markup**

In `index.html`, replace the `.canvas-actions` block (lines 166-169) with:

```html
                <div class="canvas-actions" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <label style="font-size:11px; color:var(--text-secondary);">Source</label>
                    <select id="source-select" style="background:#0f172a; color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:5px 8px; font-size:12px;"></select>
                    <label style="font-size:11px; color:var(--text-secondary);">Sink</label>
                    <select id="sink-select" style="background:#0f172a; color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; padding:5px 8px; font-size:12px;"></select>
                    <button class="btn-action" id="solve-btn">Solve Loop</button>
                    <button class="btn-action" id="break-loop-btn">Break Loop</button>
                    <button class="btn-action red" id="clear-btn">Clear Canvas</button>
                </div>
```

(`break-loop-btn` is wired in Task 5; it is harmless until then.)

- [ ] **Step 2: Import the new solver functions**

In `app.js`, change the solver import (line 8) to:

```javascript
import { solveBlockDiagram, transferFunction, collectEndpoints, loopGain } from './solver.js';
```

- [ ] **Step 3: Grab the dropdown elements and a populate helper**

In `app.js`, after `const stepsOutput = ...` (line 31) add:

```javascript
    const sourceSelect = document.getElementById('source-select');
    const sinkSelect = document.getElementById('sink-select');

    // Label shown for the current result, e.g. "Y/R", "Y/D", or "L(s)".
    let currentTfLabel = 'Y/R';

    // Build the KaTeX left-hand side for a label like "Y/R" or "L(s)".
    function lhsLatex(label) {
        if (label === 'L(s)') return 'L(s)';
        const [num, den] = label.split('/');
        return `\\frac{${num}(s)}{${den || ''}(s)}`;
    }

    function fillSelect(select, items) {
        const prev = select.value;
        select.innerHTML = '';
        items.forEach(it => {
            const opt = document.createElement('option');
            opt.value = it.id;
            opt.textContent = it.label;
            select.appendChild(opt);
        });
        if (items.some(it => it.id === prev)) {
            select.value = prev; // preserve the user's choice across refreshes
        }
    }

    function refreshEndpointDropdowns() {
        const { sources, sinks } = collectEndpoints(canvas.nodes);
        fillSelect(sourceSelect, sources);
        fillSelect(sinkSelect, sinks);
    }
```

- [ ] **Step 4: Refresh the dropdowns on every state change**

In `app.js`, change the canvas construction callback (lines 34-37) to also refresh the dropdowns:

```javascript
    const canvas = new BlockDiagramCanvas(svgEl, () => {
        handleStateChange();
        updateDiagramStats();
        refreshEndpointDropdowns();
    });
```

- [ ] **Step 5: Make `triggerSolve` use the chosen endpoints and a dynamic label**

In `app.js`, replace `triggerSolve` (lines 148-163) with (`currentTfLabel` is already declared in Step 3):

```javascript
    function triggerSolve() {
        try {
            const sourceId = sourceSelect.value;
            const sinkId = sinkSelect.value;
            let result;
            if (sourceId && sinkId) {
                result = transferFunction(canvas.nodes, canvas.connections, sourceId, sinkId);
                const srcLabel = sourceSelect.selectedOptions[0]?.textContent || 'R';
                const sinkLabel = sinkSelect.selectedOptions[0]?.textContent || 'Y';
                currentTfLabel = `${sinkLabel}/${srcLabel}`;
            } else {
                result = solveBlockDiagram(canvas.nodes, canvas.connections);
                currentTfLabel = 'Y/R';
            }
            lastSolutionResult = result;
            renderMathSolution(result, currentTfLabel);
            if (copyActionsContainer) copyActionsContainer.style.display = 'flex';
            if (window.LCDBridge) window.LCDBridge.onSolved(result, canvas);
        } catch (e) {
            console.error(e);
            lastSolutionResult = null;
            if (window.LCDBridge) window.LCDBridge.onSolveFailed();
            if (copyActionsContainer) copyActionsContainer.style.display = 'none';
            tfOutput.innerHTML = `<span style="color: var(--accent-red); font-size: 13px;">Error: ${e.message}</span>`;
            stepsOutput.innerHTML = `<div style="color: var(--text-secondary); font-size: 12px; font-style: italic;">Could not solve the system of equations. Make sure your nodes are fully connected from the source to the sink.</div>`;
        }
    }
```

- [ ] **Step 6: Make `renderMathSolution` and the copy buttons use the label**

In `app.js`, change the signature `function renderMathSolution(result) {` (line 198) to:

```javascript
    function renderMathSolution(result, label = 'Y/R') {
```

In the no-KaTeX fallback, replace line 201:

```javascript
            tfOutput.textContent = `Y(s)/R(s) = ${result.finalTransferFunction.toFormulaString()}`;
```

with:

```javascript
            tfOutput.textContent = `${label} = ${result.finalTransferFunction.toFormulaString()}`;
```

In the KaTeX path, replace the final-TF render block (lines 216-221):

```javascript
        // Render Final Transfer Function
        const latexStr = `\\frac{Y(s)}{R(s)} = ${result.finalTransferFunction.toKaTeX()}`;
        tfOutput.innerHTML = '';
        const tfContainer = document.createElement('div');
        katex.render(latexStr, tfContainer, { displayMode: true, throwOnError: false });
        tfOutput.appendChild(tfContainer);
```

with:

```javascript
        // Render Final Transfer Function
        const latexStr = `${lhsLatex(label)} = ${result.finalTransferFunction.toKaTeX()}`;
        tfOutput.innerHTML = '';
        const tfContainer = document.createElement('div');
        katex.render(latexStr, tfContainer, { displayMode: true, throwOnError: false });
        tfOutput.appendChild(tfContainer);
```

For the copy buttons, replace the Copy Text formula builder (line 120):

```javascript
            const formulaStr = `Y(s)/R(s) = ${lastSolutionResult.finalTransferFunction.toFormulaString()}`;
```

with:

```javascript
            const formulaStr = `${currentTfLabel} = ${lastSolutionResult.finalTransferFunction.toFormulaString()}`;
```

and the Copy LaTeX builder (line 130):

```javascript
            const latexStr = `\\frac{Y(s)}{R(s)} = ${lastSolutionResult.finalTransferFunction.toKaTeX()}`;
```

with:

```javascript
            const latexStr = `${lhsLatex(currentTfLabel)} = ${lastSolutionResult.finalTransferFunction.toKaTeX()}`;
```

(`currentTfLabel` and `lhsLatex` are declared in Step 3, which runs during setup before any copy click fires, so they are in scope inside the handlers.)

- [ ] **Step 7: Populate the dropdowns once on startup**

In `app.js`, at the end of the `DOMContentLoaded` handler, the last line is `loadTemplate('feedback');` (line 783). `loadTemplate` calls `canvas.render()` → `onStateChange` → `refreshEndpointDropdowns`, so the dropdowns populate automatically. No extra call needed. (If `loadTemplate` is ever removed, add `refreshEndpointDropdowns();` before it.)

- [ ] **Step 8: Build and verify in the app**

Run: `npm run build`
Then launch and verify on the default feedback template:
1. Source dropdown shows **R**; Sink dropdown shows **Y**.
2. Solve shows `\frac{Y(s)}{R(s)} = ...` with the same TF as before (regression).
3. Add a Disturbance D, wire it into the summing junction, click Solve — Source dropdown now also lists **D**.
4. Pick Source = D, Solve — the label reads `Y/D` and the TF differs from `Y/R`.
5. Copy Text / Copy LaTeX produce the label that is currently shown.

Expected: all five hold.

- [ ] **Step 9: Commit**

```bash
PAGER=cat git add index.html app.js
PAGER=cat git commit -m "Add Source/Sink dropdowns and labelled arbitrary transfer-function solve"
```

---

### Task 5: Break-loop mode — click a wire to get open-loop L(s)

**Files:**
- Modify: `canvas.js` (`onMouseDown` 291-345, key handler 159-176)
- Modify: `app.js` (break-loop button wiring)
- Modify: `index.html` (Keyboard Shortcuts list ~108-123)

**Context:** The "Break Loop" button (added in Task 4's markup) puts the canvas into a one-shot break mode: the next wire click is the cut. The canvas exposes `enterBreakMode(callback)`; in `onMouseDown` we intercept a wire click while in break mode, call `callback(connId)`, and exit. `app.js` runs `loopGain(...)` on the chosen wire and renders the result labelled `L(s)`. Esc cancels break mode.

- [ ] **Step 1: Add break-mode state + entry on the canvas**

In `canvas.js`, inside `onMouseDown` (line 291) add this as the very first block, before the port check:

```javascript
    onMouseDown(e) {
        const coords = this.getMouseCoords(e);
        const target = e.target;

        // One-shot "break a wire" mode: the next wire click is the cut.
        if (this.breakMode) {
            const wirePath = target.closest('.connection-line');
            if (wirePath) {
                e.preventDefault();
                const connId = wirePath.getAttribute('data-id');
                const cb = this.breakMode;
                this.breakMode = null;
                this.svg.style.cursor = '';
                cb(connId);
            }
            return;
        }
```

(Keep the rest of `onMouseDown` unchanged.)

Add a method on the `BlockDiagramCanvas` class (next to `clear`, around line 92):

```javascript
    enterBreakMode(callback) {
        this.breakMode = callback;
        this.svg.style.cursor = 'crosshair';
    }
```

- [ ] **Step 2: Let Esc cancel break mode**

In `canvas.js`, in the keydown handler's Escape branch (line 165), add a break-mode cancel before the `activeWire` check:

```javascript
                } else if (e.key === 'Escape') {
                    if (this.breakMode) {
                        this.breakMode = null;
                        this.svg.style.cursor = '';
                    } else if (this.activeWire) {
                        this.activeWire = null;
                        this.render();
                    } else if (this.selectedElement) {
                        this.selectedElement = null;
                        this.render();
                        this.onStateChange();
                    }
                }
```

- [ ] **Step 3: Wire the Break Loop button in `app.js`**

In `app.js`, after the disturbance button handler (Task 3, Step 4), add:

```javascript
    const breakLoopBtn = document.getElementById('break-loop-btn');
    if (breakLoopBtn) {
        breakLoopBtn.addEventListener('click', () => {
            tfOutput.innerHTML = `<span style="color: var(--accent-blue); font-size: 13px;">Click a wire to break the loop there…</span>`;
            canvas.enterBreakMode((connId) => {
                try {
                    const result = loopGain(canvas.nodes, canvas.connections, connId);
                    lastSolutionResult = result;
                    currentTfLabel = 'L(s)';
                    renderMathSolution(result, 'L(s)');
                    if (copyActionsContainer) copyActionsContainer.style.display = 'flex';
                    if (window.LCDBridge) window.LCDBridge.onSolved(result, canvas);
                } catch (e) {
                    console.error(e);
                    tfOutput.innerHTML = `<span style="color: var(--accent-red); font-size: 13px;">Error: ${e.message}</span>`;
                }
            });
        });
    }
```

(`currentTfLabel`, `renderMathSolution`, `lastSolutionResult`, `copyActionsContainer` are all declared earlier in the same `DOMContentLoaded` scope.)

- [ ] **Step 4: Document the shortcut**

In `index.html`, inside the Keyboard Shortcuts `<ul>` (after the "Branch Take-off" item, ~line 115), add:

```html
                    <li style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Break Loop (open-loop L(s))</span>
                        <kbd style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 6px; font-family: monospace; color: var(--text-primary); font-weight: bold; font-size: 10px; box-shadow: 0 1px 1px rgba(0,0,0,0.5);">Break Loop + click wire</kbd>
                    </li>
```

- [ ] **Step 5: Build and verify in the app**

Run: `npm run build`
Then launch and verify on the default feedback template (G = 10/(s²+2s), H = 2):
1. Click "Break Loop" — the TF panel prompts "Click a wire to break the loop there…" and the cursor becomes a crosshair.
2. Click the feedback wire (H → Σ). The panel shows `L(s) = ...` equal to `20/(s² + 2s)` (i.e. GH).
3. Press "Break Loop" then Esc — break mode cancels (cursor returns to normal), nothing is computed.
4. Break a non-loop forward wire (e.g. G → Y) — `L(s) = 0`.
5. The diagram/connections are unchanged after any break (no wire is actually deleted).

Expected: all five hold.

- [ ] **Step 6: Commit**

```bash
PAGER=cat git add canvas.js app.js index.html
PAGER=cat git commit -m "Add break-a-wire mode that computes the open-loop loop gain"
```

---

## Final verification

- [ ] Run the full suite: `npm test` → all green (144 existing + 7 new = 151).
- [ ] `npm run build` succeeds with no errors.
- [ ] In-app smoke test end to end: default template solves Y/R unchanged; add D and wire it in → Y/D differs; Break Loop on the feedback wire → L(s) = GH; bridge "Use in LCD1 Solver" still appears and accepts the shown TF.
- [ ] Confirm `bundle.js` is NOT staged in any commit (it is gitignored).

## Notes for the implementer

- **Coefficient order:** `Polynomial.coeffs` is ascending power — `[c0, c1, c2]` means `c0 + c1·s + c2·s²`. The test helper `approxCoeffs` compares with a 1e-9 tolerance because `TransferFunction.normalize` divides through by the leading denominator coefficient (floats).
- **Superposition is automatic:** a non-chosen source is neither the RHS source nor an "active" node, so its incoming connections map to nothing — it is effectively zeroed. You do not need explicit code to zero other sources.
- **Sink must be last (symbolic):** the symbolic solver does forward substitution ending on the last active node. Both solvers reorder `activeNodes` to put the sink last; do not skip that reorder or D→Y / multi-output sinks will read the wrong row.
- **Loop-gain sign is pinned by test:** `loopGain` negates the raw break measurement so that for standard negative feedback `L = GH` (characteristic equation `1 + L = 0`). The `breaking the feedback wire ... = GH` test locks this; if you change the virtual-wire wiring, that test must still pass.
- **Why the UI tasks have no `node:test`:** `canvas.js` drawing and `app.js` DOM glue need a browser DOM. The existing codebase does not unit-test `drawNode`/`addNode`; following that pattern, Tasks 3–5 are verified through the running app. All load-bearing math is in `solver.js` and is unit-tested in Tasks 1–2.
