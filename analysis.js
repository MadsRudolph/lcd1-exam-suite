/**
 * analysis.js
 * System-level analysis for a drawn block diagram: open-loop L(s), closed-loop
 * T(s)=Y/R, disturbance response Y/D, plus characteristic equation, poles,
 * zeros and a stability verdict. Built on top of the existing solver so it
 * reuses the exact-rational reduction and the loop-break machinery.
 */

import { transferFunction, solveBlockDiagram, loopGain } from './solver.js';
import { roots } from './spike/numeric/roots.js';

const SOURCE_TYPES = ['input', 'disturbance'];

// Find the wire to cut so the open-loop transfer function L(s) is the
// conventional return ratio: the OUTER loop broken at the comparator, with any
// inner loops left closed. Returns the connection id to cut, or null when the
// diagram is purely feed-forward.
//
// The naive choice — any feedback wire — is wrong for nested loops: cutting an
// inner loop while the outer stays closed yields a valid characteristic
// equation but not the L(s) exams ask for (e.g. K/(s+1)·2/(s+a)). So we prefer
// the feedback wire entering the comparator that the reference feeds, and fall
// back to a DFS back edge only when there is no clear comparator.
export function findLoopCutEdge(nodes, connections) {
    const adj = new Map();
    for (const c of connections) {
        if (!adj.has(c.fromNode)) adj.set(c.fromNode, []);
        adj.get(c.fromNode).push(c);
    }

    // Nodes reachable forward from `start` (start excluded unless it loops back).
    const forwardReach = (start) => {
        const seen = new Set();
        const stack = [...(adj.get(start) || []).map(c => c.toNode)];
        while (stack.length) {
            const u = stack.pop();
            if (seen.has(u)) continue;
            seen.add(u);
            for (const c of (adj.get(u) || [])) stack.push(c.toNode);
        }
        return seen;
    };

    // Preferred: the outermost feedback wire into the reference comparator.
    // A wire X -> C is feedback if C can reach X (it closes a loop through C).
    const inputs = nodes.filter(n => n.type === 'input');
    for (const inp of inputs) {
        const comparators = (adj.get(inp.id) || [])
            .map(c => nodes.find(n => n.id === c.toNode))
            .filter(n => n && n.type === 'sum');
        for (const C of comparators) {
            const back = forwardReach(C.id);
            const feedbacks = connections.filter(c =>
                c.toNode === C.id && c.fromNode !== inp.id && back.has(c.fromNode));
            if (feedbacks.length) {
                // Negative feedback first; it's the conventional sensor path.
                const neg = feedbacks.find(c => c.sign === '-');
                return (neg || feedbacks[0]).id;
            }
        }
    }

    // Fallback: first DFS back edge, traversing from inputs to follow the flow.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    nodes.forEach(n => color.set(n.id, WHITE));

    let backEdge = null;
    const visit = (u) => {
        color.set(u, GRAY);
        for (const c of (adj.get(u) || [])) {
            const cv = color.get(c.toNode);
            if (cv === GRAY) { backEdge = c; return true; }
            if (cv === WHITE && visit(c.toNode)) return true;
        }
        color.set(u, BLACK);
        return false;
    };

    const order = [
        ...nodes.filter(n => n.type === 'input'),
        ...nodes.filter(n => n.type !== 'input'),
    ];
    for (const n of order) {
        if (color.get(n.id) === WHITE && visit(n.id)) break;
    }
    return backEdge ? backEdge.id : null;
}

// Wrap a solver result into a tidy { ok, katex, formula, tf, symtf } record.
function pack(result, extra = {}) {
    return {
        ok: true,
        katex: result.finalTransferFunction.toKaTeX(),
        formula: result.finalTransferFunction.toFormulaString(),
        tf: result.tf || null,
        symtf: result.symtf || null,
        ...extra,
    };
}

export function fmtNum(x) {
    if (!isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
    const r = Math.round(x * 1e6) / 1e6;
    return parseFloat(r.toFixed(4)).toString();
}

// KaTeX for a single complex root, e.g. -1.5 \pm 2j collapsed per-root.
export function complexKaTeX(c) {
    const re = fmtNum(c.re);
    if (Math.abs(c.im) < 1e-7) return re;
    const sign = c.im >= 0 ? '+' : '-';
    const im = fmtNum(Math.abs(c.im));
    const imPart = im === '1' ? 'j' : `${im}j`;
    return `${re} ${sign} ${imPart}`;
}

// Numeric poles/zeros/stability from a closed-loop rational TF.
function characterise(tf, openTf) {
    if (!tf) return { numeric: false };

    // math-engine stores coeffs low->high; root-finder wants high->low.
    const denHigh = tf.den.coeffs.slice().reverse();
    const numHigh = tf.num.coeffs.slice().reverse();

    const poles = roots(denHigh);
    const zeros = roots(numHigh);

    const stable = poles.length > 0 && poles.every(p => p.re < -1e-7);

    // DC gain T(0) = constant term ratio (infinite if a pure integrator).
    const den0 = tf.den.coeffs[0];
    const num0 = tf.num.coeffs[0];
    const dcGain = Math.abs(den0) < 1e-9 ? Infinity : num0 / den0;

    const order = tf.den.degree;

    // System type = poles of the open loop at s=0 (leading zeros, low-first).
    let type = null;
    if (openTf && openTf.den) {
        const lo = openTf.den.coeffs;
        let k = 0;
        while (k < lo.length && Math.abs(lo[k]) < 1e-9) k++;
        type = k;
    }

    const characteristic = `${tf.den.toKaTeXString()} = 0`;

    return { numeric: true, poles, zeros, stable, dcGain, order, type, characteristic };
}

// Full analysis of the current diagram. Never throws — each section degrades
// to { ok:false, error } so the panel can render whatever is computable.
export function analyzeDiagram(nodes, connections) {
    const out = {
        closedLoop: null,
        openLoop: null,
        disturbances: [],
        char: { numeric: false },
    };

    const inputNode = nodes.find(n => n.type === 'input');
    const outputNode = nodes.find(n => n.type === 'output');

    // Closed loop T(s) = Y/R
    try {
        const r = solveBlockDiagram(nodes, connections);
        out.closedLoop = pack(r, { label: 'Y/R' });
    } catch (e) {
        out.closedLoop = { ok: false, error: e.message, label: 'Y/R' };
    }

    // Open loop L(s) — auto-break a feedback wire.
    try {
        const cutId = findLoopCutEdge(nodes, connections);
        if (cutId) {
            const r = loopGain(nodes, connections, cutId);
            out.openLoop = pack(r, { label: 'L(s)' });
        } else {
            out.openLoop = { ok: false, error: 'No feedback loop detected.', label: 'L(s)' };
        }
    } catch (e) {
        out.openLoop = { ok: false, error: e.message, label: 'L(s)' };
    }

    // Disturbance response Y/D for every wired disturbance block.
    if (outputNode) {
        const wired = new Set(connections.map(c => c.fromNode));
        for (const d of nodes.filter(n => n.type === 'disturbance')) {
            if (!wired.has(d.id)) continue; // ignore dangling disturbance blocks
            const label = `Y/${d.label || 'D'}`;
            try {
                const r = transferFunction(nodes, connections, d.id, outputNode.id);
                out.disturbances.push(pack(r, { label }));
            } catch (e) {
                out.disturbances.push({ ok: false, error: e.message, label });
            }
        }
    }

    // Poles / zeros / stability from the numeric closed-loop TF.
    const clTf = out.closedLoop && out.closedLoop.ok ? out.closedLoop.tf : null;
    const olTf = out.openLoop && out.openLoop.ok ? out.openLoop.tf : null;
    out.char = characterise(clTf, olTf);

    return out;
}
