import { SymTF } from "./symtf.js";
import { parseExprToTF } from "./parse-expr.js";

const SOURCE_TYPES = ["input", "disturbance"];

export function solveExact(nodes, connections, sourceId, sinkId) {
    const sinkNode = nodes.find(n => n.id === sinkId);
    if (!nodes.find(n => n.id === sourceId)) throw new Error("Missing source node");
    if (!sinkNode) throw new Error("Missing sink node");

    const base = [
        ...nodes.filter(n => n.type === "block"),
        ...nodes.filter(n => n.type === "sum"),
        ...nodes.filter(n => n.type === "output"),
    ];
    // sink last
    const active = base.filter(n => n.id !== sinkId).concat(base.filter(n => n.id === sinkId));
    const K = active.length;
    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");
    const idx = {};
    active.forEach((n, i) => (idx[n.id] = i));

    // M X = V ;  M = I - A
    const M = Array.from({ length: K }, (_, i) =>
        Array.from({ length: K }, (_, j) => (i === j ? SymTF.one() : SymTF.zero())));
    const V = Array.from({ length: K }, () => SymTF.zero());

    for (let i = 0; i < K; i++) {
        const target = active[i];
        for (const conn of connections.filter(c => c.toNode === target.id)) {
            let w = SymTF.one();
            if (target.type === "block") w = parseExprToTF(target.value);
            if (target.type === "sum" && conn.sign === "-") w = w.neg();
            if (conn.fromNode === sourceId) V[i] = V[i].add(w);
            else {
                const j = idx[conn.fromNode];
                if (j !== undefined) M[i][j] = M[i][j].sub(w);
            }
        }
    }

    // Gaussian elimination over SymTF
    for (let k = 0; k < K; k++) {
        let pivot = -1;
        for (let r = k; r < K; r++) if (!M[r][k].isZero()) { pivot = r; break; }
        if (pivot === -1) continue;
        if (pivot !== k) { [M[k], M[pivot]] = [M[pivot], M[k]]; [V[k], V[pivot]] = [V[pivot], V[k]]; }
        const pv = M[k][k];
        for (let j = 0; j < K; j++) M[k][j] = M[k][j].div(pv);
        V[k] = V[k].div(pv);
        for (let i = 0; i < K; i++) {
            if (i === k) continue;
            const f = M[i][k];
            if (f.isZero()) continue;
            for (let j = 0; j < K; j++) M[i][j] = M[i][j].sub(f.mul(M[k][j]));
            V[i] = V[i].sub(f.mul(V[k]));
        }
    }

    return V[idx[sinkId]].simplify();
}
