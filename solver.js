/**
 * solver.js
 * Unified algebraic solver for block diagrams.
 * Automatically chooses between Exact Rational Numeric Solver and Symbolic String Solver.
 * Formulates the diagram as a linear matrix equation (I - A) X = B R
 * and solves it symbolically using either rational transfer functions or symbolic expressions.
 */

import { TransferFunction, Polynomial } from './math-engine.js';

export function solveBlockDiagram(nodes, connections) {
    // Check if any block has symbolic letters (excluding 's' and operators)
    const hasSymbolic = nodes.some(n => {
        if (n.type !== 'block') return false;
        // Check if value contains letters other than 's'
        const val = n.value.toLowerCase().replace(/\s+/g, '');
        // Remove 's', numbers, operators, decimal points, parentheses
        const cleaned = val.replace(/[0-9s\+\-\*\/\(\)\.]/g, '');
        return cleaned.length > 0;
    });

    if (hasSymbolic) {
        return solveSymbolically(nodes, connections);
    } else {
        // Run numeric solver to get the exact numerical final transfer function
        const numResult = solveNumerically(nodes, connections);
        
        // Generate symbolic labels for a clean step-by-step reduction
        let gCount = 1;
        let hCount = 1;
        const blockLabels = new Map();
        nodes.forEach(n => {
            if (n.type === 'block') {
                const label = n.label ? n.label.trim() : "";
                if (label && /^[a-zA-Z]+\d*$/.test(label) && label.length <= 4) {
                    blockLabels.set(n.id, label);
                } else {
                    const isFeedback = n.direction === 'left';
                    if (isFeedback) {
                        blockLabels.set(n.id, `H${hCount++}`);
                    } else {
                        blockLabels.set(n.id, `G${gCount++}`);
                    }
                }
            }
        });

        const symbolicNodes = nodes.map(n => {
            if (n.type === 'block') {
                const symLabel = blockLabels.get(n.id);
                return {
                    ...n,
                    label: symLabel,
                    value: symLabel
                };
            }
            return { ...n };
        });

        // Run symbolic solver to get the beautiful educational steps
        const symResult = solveSymbolically(symbolicNodes, connections);

        return {
            initialEquations: symResult.initialEquations,
            steps: symResult.steps,
            finalTransferFunction: numResult.finalTransferFunction
        };
    }
}

// -------------------------------------------------------------------------
// 1. EXACT RATIONAL NUMERIC SOLVER
// -------------------------------------------------------------------------
function solveNumerically(nodes, connections) {
    const inputNode = nodes.find(n => n.type === 'input');
    const outputNode = nodes.find(n => n.type === 'output');

    if (!inputNode) throw new Error("Missing Input node (R)");
    if (!outputNode) throw new Error("Missing Output node (Y)");

    const activeNodes = [
        ...nodes.filter(n => n.type === 'block'),
        ...nodes.filter(n => n.type === 'sum'),
        ...nodes.filter(n => n.type === 'output')
    ];
    const K = activeNodes.length;

    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");

    const indexMap = {};
    activeNodes.forEach((n, idx) => {
        indexMap[n.id] = idx;
    });

    const M = [];
    const V = [];

    const zeroTF = () => new TransferFunction([0], [1]);
    const oneTF = () => new TransferFunction([1], [1]);

    for (let i = 0; i < K; i++) {
        M[i] = [];
        for (let j = 0; j < K; j++) {
            M[i][j] = i === j ? oneTF() : zeroTF();
        }
        V[i] = zeroTF();
    }

    // Fill coefficients based on incoming connections
    for (let i = 0; i < K; i++) {
        const targetNode = activeNodes[i];
        const incoming = connections.filter(c => c.toNode === targetNode.id);

        incoming.forEach(conn => {
            const fromNodeId = conn.fromNode;
            let weight = oneTF();
            
            if (targetNode.type === 'block') {
                weight = TransferFunction.parse(targetNode.value);
            }
            
            if (targetNode.type === 'sum' && conn.sign === '-') {
                weight = weight.multiply(new TransferFunction([-1], [1]));
            }

            if (fromNodeId === inputNode.id) {
                V[i] = V[i].add(weight);
            } else {
                const j = indexMap[fromNodeId];
                if (j !== undefined) {
                    M[i][j] = M[i][j].subtract(weight);
                }
            }
        });
    }

    // Create a copy of initial equations for documentation steps
    const initialEquations = activeNodes.map((node, i) => {
        const terms = [];
        activeNodes.forEach((otherNode, j) => {
            let coeff = M[i][j].clone();
            if (i === j) {
                coeff = oneTF();
            } else {
                coeff = coeff.multiply(new TransferFunction([-1], [1]));
            }

            if (!coeff.num.isZero()) {
                const cStr = coeff.toFormulaString();
                if (cStr === "1") {
                    terms.push(`${otherNode.label}`);
                } else if (cStr === "-1") {
                    terms.push(`-${otherNode.label}`);
                } else {
                    terms.push(`(${cStr}) \\cdot ${otherNode.label}`);
                }
            }
        });
        
        let rhs = "";
        if (!V[i].num.isZero()) {
            const vStr = V[i].toFormulaString();
            if (vStr === "1") {
                rhs = `+ ${inputNode.label}`;
            } else if (vStr === "-1") {
                rhs = `- ${inputNode.label}`;
            } else {
                rhs = `+ (${vStr}) \\cdot ${inputNode.label}`;
            }
        }
        
        let eq = `${node.label} = ${terms.join(" + ")} ${rhs}`.trim();
        eq = eq.replace(/\+ \-/g, '- ');
        return eq;
    });

    const steps = ["Identified pure numeric/rational diagram.", "Formulating node equations..."];
    
    // Gaussian Elimination
    for (let k = 0; k < K; k++) {
        let pivotRow = -1;
        for (let r = k; r < K; r++) {
            if (!M[r][k].num.isZero()) {
                pivotRow = r;
                break;
            }
        }

        if (pivotRow === -1) continue;

        if (pivotRow !== k) {
            const tempM = M[k]; M[k] = M[pivotRow]; M[pivotRow] = tempM;
            const tempV = V[k]; V[k] = V[pivotRow]; V[pivotRow] = tempV;
        }

        const pivotVal = M[k][k].clone();
        
        for (let j = 0; j < K; j++) {
            M[k][j] = M[k][j].divide(pivotVal);
        }
        V[k] = V[k].divide(pivotVal);

        for (let i = 0; i < K; i++) {
            if (i === k) continue;
            
            const factor = M[i][k].clone();
            if (factor.num.isZero()) continue;

            for (let j = 0; j < K; j++) {
                M[i][j] = M[i][j].subtract(factor.multiply(M[k][j]));
            }
            V[i] = V[i].subtract(factor.multiply(V[k]));
        }

        steps.push(`Eliminated column variable ${activeNodes[k].label}.`);
    }

    const outIdx = indexMap[outputNode.id];
    const finalTF = V[outIdx].clone().simplify();

    // Create a mock TransferFunction wrapper that allows LaTeX rendering
    return {
        initialEquations,
        steps,
        finalTransferFunction: {
            toKaTeX: () => finalTF.toKaTeX(),
            toFormulaString: () => finalTF.toFormulaString()
        }
    };
}

// -------------------------------------------------------------------------
// 2. GENERAL SYMBOLIC AST SOLVER
// -------------------------------------------------------------------------
class SymExpr {
    constructor(type, children = [], value = "") {
        this.type = type; // 'const', 'var', 'add', 'sub', 'mul', 'div', 'neg'
        this.children = children;
        this.value = value;
    }

    static const(val) {
        return new SymExpr('const', [], String(val));
    }

    static var(name) {
        return new SymExpr('var', [], name);
    }

    static neg(expr) {
        return expr.negate();
    }

    isZero() { return this.type === 'const' && this.value === '0'; }
    isOne() { return this.type === 'const' && this.value === '1'; }
    isMinusOne() { return this.type === 'const' && this.value === '-1'; }

    add(other) {
        if (this.isZero()) return other;
        if (other.isZero()) return this;
        
        let children = [];
        if (this.type === 'add') children.push(...this.children);
        else children.push(this);
        
        if (other.type === 'add') children.push(...other.children);
        else children.push(other);
        
        return new SymExpr('add', children).simplifyBasic();
    }

    subtract(other) {
        if (other.isZero()) return this;
        return this.add(SymExpr.neg(other));
    }

    multiply(other) {
        if (this.isZero() || other.isZero()) return SymExpr.const('0');
        if (this.isOne()) return other;
        if (other.isOne()) return this;
        if (this.isMinusOne()) return SymExpr.neg(other);
        if (other.isMinusOne()) return SymExpr.neg(this);
        
        let children = [];
        if (this.type === 'mul') children.push(...this.children);
        else children.push(this);
        
        if (other.type === 'mul') children.push(...other.children);
        else children.push(other);
        
        return new SymExpr('mul', children).simplifyBasic();
    }

    divide(other) {
        if (other.isOne()) return this;
        if (this.isZero()) return SymExpr.const('0');
        return new SymExpr('div', [this, other]).simplifyBasic();
    }

    negate() {
        if (this.type === 'const') {
            if (this.value.startsWith('-')) return SymExpr.const(this.value.substring(1));
            if (this.value === '0') return this;
            return SymExpr.const('-' + this.value);
        }
        if (this.type === 'neg') {
            return this.children[0];
        }
        if (this.type === 'add') {
            return new SymExpr('add', this.children.map(c => c.negate())).simplifyBasic();
        }
        if (this.type === 'mul') {
            let children = [...this.children];
            children[0] = children[0].negate();
            return new SymExpr('mul', children).simplifyBasic();
        }
        if (this.type === 'div') {
            return new SymExpr('div', [this.children[0].negate(), this.children[1]]).simplifyBasic();
        }
        
        return new SymExpr('neg', [this]);
    }

    simplifyBasic() {
        let simplifiedChildren = this.children.map(c => c.simplifyBasic());

        if (this.type === 'add') {
            let flat = [];
            for (let c of simplifiedChildren) {
                if (c.type === 'add') flat.push(...c.children);
                else if (!c.isZero()) flat.push(c);
            }
            if (flat.length === 0) return SymExpr.const('0');
            if (flat.length === 1) return flat[0];
            
            flat.sort((a, b) => a.toString().localeCompare(b.toString()));
            return new SymExpr('add', flat);
        }

        if (this.type === 'mul') {
            let flat = [];
            let sign = 1;
            for (let c of simplifiedChildren) {
                if (c.type === 'mul') flat.push(...c.children);
                else if (c.type === 'neg') {
                    sign *= -1;
                    flat.push(c.children[0]);
                } else if (c.isZero()) {
                    return SymExpr.const('0');
                } else if (!c.isOne()) {
                    flat.push(c);
                }
            }
            if (flat.length === 0) return sign === 1 ? SymExpr.const('1') : SymExpr.const('-1');

            // Merge any nested fractions inside multiplication!
            // E.g. A * (B/C) -> (A*B)/C
            let divChildren = flat.filter(c => c.type === 'div');
            let nonDivChildren = flat.filter(c => c.type !== 'div');
            if (divChildren.length > 0) {
                let numChildren = [...nonDivChildren];
                let denChildren = [];
                for (let div of divChildren) {
                    numChildren.push(div.children[0]);
                    denChildren.push(div.children[1]);
                }
                
                let finalNum = numChildren.length === 1 ? numChildren[0] : new SymExpr('mul', numChildren);
                let finalDen = denChildren.length === 1 ? denChildren[0] : new SymExpr('mul', denChildren);
                
                let res = finalNum.divide(finalDen);
                return sign === 1 ? res : new SymExpr('neg', [res]).simplifyBasic();
            }
            
            flat.sort((a, b) => {
                const typeOrder = { 'const': 1, 'var': 2, 'neg': 3, 'mul': 4, 'add': 5, 'div': 6 };
                const ta = typeOrder[a.type] || 99;
                const tb = typeOrder[b.type] || 99;
                if (ta !== tb) return ta - tb;
                return a.toString().localeCompare(b.toString());
            });

            let res = flat.length === 1 ? flat[0] : new SymExpr('mul', flat);
            return sign === 1 ? res : new SymExpr('neg', [res]);
        }

        if (this.type === 'neg') {
            let child = simplifiedChildren[0];
            if (child.type === 'neg') return child.children[0];
            if (child.isZero()) return child;
            return new SymExpr('neg', [child]);
        }

        if (this.type === 'div') {
            let num = simplifiedChildren[0];
            let den = simplifiedChildren[1];
            if (num.isZero()) return SymExpr.const('0');
            if (den.isOne()) return num;
            
            if (num.type === 'div') {
                return new SymExpr('div', [num.children[0], num.children[1].multiply(den)]).simplifyBasic();
            }
            if (den.type === 'div') {
                return new SymExpr('div', [num.multiply(den.children[1]), den.children[0]]).simplifyBasic();
            }
            
            return new SymExpr('div', [num, den]);
        }

        return new SymExpr(this.type, simplifiedChildren, this.value);
    }

    toString() {
        if (this.type === 'const') return this.value;
        if (this.type === 'var') return this.value;
        if (this.type === 'neg') return `(-${this.children[0].toString()})`;
        if (this.type === 'div') return `(${this.children[0].toString()})/(${this.children[1].toString()})`;
        if (this.type === 'add') return `(${this.children.map(c => c.toString()).join(' + ')})`;
        if (this.type === 'mul') return `(${this.children.map(c => c.toString()).join(' * ')})`;
        return "";
    }

    toKaTeX() {
        if (this.type === 'const') return this.value;
        if (this.type === 'var') {
            return this.value.replace(/([a-zA-Z]+)(\d+)/g, '$1_$2');
        }
        if (this.type === 'neg') {
            return `-${this.children[0].toKaTeX()}`;
        }
        if (this.type === 'div') {
            return `\\frac{${this.children[0].toKaTeX()}}{${this.children[1].toKaTeX()}}`;
        }
        if (this.type === 'add') {
            return this.children.map((c, idx) => {
                let s = c.toKaTeX();
                if (idx > 0 && s.startsWith('-')) {
                    return ` - ${s.substring(1)}`;
                }
                return idx === 0 ? s : ` + ${s}`;
            }).join('');
        }
        if (this.type === 'mul') {
            return this.children.map(c => {
                let s = c.toKaTeX();
                if (c.type === 'add' || c.type === 'sub') {
                    return `(${s})`;
                }
                return s;
            }).join(' \\cdot ');
        }
        return "";
    }

    toFormulaString() {
        if (this.type === 'const') return this.value;
        if (this.type === 'var') return this.value;
        if (this.type === 'neg') {
            return `-${this.children[0].toFormulaString()}`;
        }
        if (this.type === 'div') {
            let num = this.children[0].toFormulaString();
            let den = this.children[1].toFormulaString();
            if (this.children[0].type === 'add' || this.children[0].type === 'sub') {
                num = `(${num})`;
            }
            if (this.children[1].type === 'add' || this.children[1].type === 'sub' || this.children[1].type === 'mul') {
                den = `(${den})`;
            }
            return `${num} / ${den}`;
        }
        if (this.type === 'add') {
            return this.children.map((c, idx) => {
                let s = c.toFormulaString();
                if (idx > 0 && s.startsWith('-')) {
                    return ` - ${s.substring(1)}`;
                }
                return idx === 0 ? s : ` + ${s}`;
            }).join('');
        }
        if (this.type === 'mul') {
            return this.children.map(c => {
                let s = c.toFormulaString();
                if (c.type === 'add' || c.type === 'sub' || c.type === 'div') {
                    return `(${s})`;
                }
                return s;
            }).join(' * ');
        }
        return "";
    }

    getDenominators() {
        let denoms = new Map();
        const traverse = (node) => {
            if (node.type === 'div') {
                let den = node.children[1];
                if (!den.isOne()) {
                    denoms.set(den.toString(), den);
                }
            }
            node.children.forEach(traverse);
        };
        traverse(this);
        return Array.from(denoms.values());
    }

    multiplyByDenom(d) {
        const dStr = d.toString();
        
        if (this.toString() === dStr) {
            return SymExpr.const('1');
        }
        
        if (this.type === 'div') {
            let num = this.children[0];
            let den = this.children[1];
            if (den.toString() === dStr) {
                return num;
            }
            return new SymExpr('div', [num.multiplyByDenom(d), den]).simplifyBasic();
        }
        
        if (this.type === 'mul') {
            let children = [...this.children];
            for (let i = 0; i < children.length; i++) {
                let c = children[i];
                if (c.type === 'div' && c.children[1].toString() === dStr) {
                    children[i] = c.children[0];
                    return new SymExpr('mul', children).simplifyBasic();
                }
            }
            for (let i = 0; i < children.length; i++) {
                let c = children[i];
                if ((c.type === 'add' || c.type === 'sub' || c.type === 'neg') && c.getDenominators().some(x => x.toString() === dStr)) {
                    children[i] = c.multiplyByDenom(d);
                    return new SymExpr('mul', children).simplifyBasic();
                }
            }
            return new SymExpr('mul', [...children, d]).simplifyBasic();
        }
        
        if (this.type === 'add') {
            return new SymExpr('add', this.children.map(c => c.multiplyByDenom(d))).simplifyBasic();
        }
        
        if (this.type === 'neg') {
            return SymExpr.neg(this.children[0].multiplyByDenom(d));
        }
        
        return this.multiply(d);
    }

    resolveFractions() {
        let current = this.simplifyBasic();
        
        if (current.type === 'div') {
            let num = current.children[0].resolveFractions();
            let den = current.children[1].resolveFractions();
            
            let denomsNum = num.getDenominators();
            let denomsDen = den.getDenominators();
            
            let allDenoms = new Map();
            denomsNum.forEach(d => allDenoms.set(d.toString(), d));
            denomsDen.forEach(d => allDenoms.set(d.toString(), d));
            
            for (let d of allDenoms.values()) {
                num = num.multiplyByDenom(d).resolveFractions();
                den = den.multiplyByDenom(d).resolveFractions();
            }
            
            return new SymExpr('div', [num, den]).simplifyBasic();
        }
        
        let resolvedChildren = current.children.map(c => c.resolveFractions());
        return new SymExpr(current.type, resolvedChildren, current.value).simplifyBasic();
    }

    cancelCommonFactors() {
        if (this.type !== 'div') {
            return new SymExpr(this.type, this.children.map(c => c.cancelCommonFactors()), this.value).simplifyBasic();
        }

        let num = this.children[0].cancelCommonFactors();
        let den = this.children[1].cancelCommonFactors();

        let numFactors = num.type === 'mul' ? [...num.children] : [num];
        let denFactors = den.type === 'mul' ? [...den.children] : [den];

        let numClean = [];
        let denClean = [...denFactors];

        for (let nf of numFactors) {
            let nfStr = nf.toString();
            let idx = denClean.findIndex(df => df.toString() === nfStr);
            if (idx !== -1) {
                denClean.splice(idx, 1);
            } else {
                numClean.push(nf);
            }
        }

        let finalNum = numClean.length === 0 ? SymExpr.const('1') : (numClean.length === 1 ? numClean[0] : new SymExpr('mul', numClean));
        let finalDen = denClean.length === 0 ? SymExpr.const('1') : (denClean.length === 1 ? denClean[0] : new SymExpr('mul', denClean));

        return new SymExpr('div', [finalNum, finalDen]).simplifyBasic();
    }

    isSimpleSum() {
        if (this.type !== 'add') return false;
        return this.children.every(c => c.type === 'var' || c.type === 'const');
    }

    distribute() {
        let distChildren = this.children.map(c => c.distribute());
        
        if (this.type === 'mul') {
            let addIdx = distChildren.findIndex(c => c.type === 'add' && !c.isSimpleSum() && !c.children.some(x => x.type === 'const' && x.value === '1'));
            if (addIdx !== -1) {
                let addNode = distChildren[addIdx];
                let otherChildren = [...distChildren];
                otherChildren.splice(addIdx, 1);
                
                let otherProduct = otherChildren.length === 1 ? otherChildren[0] : new SymExpr('mul', otherChildren).simplifyBasic();
                
                let distributedTerms = addNode.children.map(term => {
                    return otherProduct.multiply(term).simplifyBasic();
                });
                
                return new SymExpr('add', distributedTerms).simplifyBasic().distribute();
            }
        }
        
        if (this.type === 'add') {
            let flat = [];
            for (let c of distChildren) {
                if (c.type === 'add') flat.push(...c.children);
                else if (!c.isZero()) flat.push(c);
            }
            return new SymExpr('add', flat).simplifyBasic();
        }
        
        return new SymExpr(this.type, distChildren, this.value).simplifyBasic();
    }

    regroup() {
        if (this.type !== 'add') {
            let resolvedChildren = this.children.map(c => c.regroup());
            return new SymExpr(this.type, resolvedChildren, this.value).simplifyBasic();
        }

        let terms = this.children.map(c => c.regroup());

        let candidates = new Map();
        for (let term of terms) {
            candidates.set(term.toString(), term);
            if (term.type === 'mul') {
                term.children.forEach(c => candidates.set(c.toString(), c));
            }
        }

        // Merge separate terms in the list that constitute all children of any compound candidates
        for (let candidate of candidates.values()) {
            if (candidate.type === 'add' || candidate.type === 'sub') {
                let fChildren = candidate.children;
                let allPresent = fChildren.every(fc => {
                    return terms.some(t => t.toString() === fc.toString());
                });
                
                if (allPresent) {
                    let newTerms = [];
                    let removed = new Set();
                    for (let term of terms) {
                        let isChild = fChildren.some(fc => fc.toString() === term.toString());
                        if (isChild && !removed.has(term.toString())) {
                            removed.add(term.toString());
                        } else {
                            newTerms.push(term);
                        }
                    }
                    newTerms.push(candidate);
                    terms = newTerms;
                }
            }
        }

        let sortedCandidates = Array.from(candidates.values()).sort((a, b) => {
            const score = (node) => {
                if (node.type === 'add' || node.type === 'sub') {
                    const hasOne = node.children.some(c => c.type === 'const' && c.value === '1');
                    return hasOne ? 20 : 10;
                }
                if (node.type === 'var') return 5;
                return 1;
            };
            return score(b) - score(a);
        });

        for (let factor of sortedCandidates) {
            if (factor.isZero() || factor.isOne()) continue;
            let fStr = factor.toString();

            let matchingIndices = [];
            for (let i = 0; i < terms.length; i++) {
                let term = terms[i];
                if (term.toString() === fStr) {
                    matchingIndices.push(i);
                } else if (term.type === 'mul' && term.children.some(c => c.toString() === fStr)) {
                    matchingIndices.push(i);
                }
            }

            if (matchingIndices.length >= 2) {
                let factoredTerms = [];
                let remainingTerms = [];

                for (let i = 0; i < terms.length; i++) {
                    if (matchingIndices.includes(i)) {
                        let term = terms[i];
                        if (term.toString() === fStr) {
                            factoredTerms.push(SymExpr.const('1'));
                        } else {
                            let children = [...term.children];
                            let idx = children.findIndex(c => c.toString() === fStr);
                            children.splice(idx, 1);
                            factoredTerms.push(children.length === 1 ? children[0] : new SymExpr('mul', children));
                        }
                    } else {
                        remainingTerms.push(terms[i]);
                    }
                }

                let newGroup = factor.multiply(new SymExpr('add', factoredTerms).simplifyBasic()).regroup();
                remainingTerms.push(newGroup);
                
                return new SymExpr('add', remainingTerms).simplifyBasic().regroup();
            }
        }

        return new SymExpr('add', terms).simplifyBasic();
    }
}

const parseValToSym = (val) => {
    val = val.trim();
    if (val === "" || val === "1") return SymExpr.const("1");
    if (val === "-1") return SymExpr.const("-1");
    if (!isNaN(val)) return SymExpr.const(val);
    return SymExpr.var(val);
};

export function formatLabelForKaTeX(label) {
    if (!label) return "";
    let fmt = label.trim();
    fmt = fmt.replace(/Σ/g, '\\Sigma');
    fmt = fmt.replace(/_/g, '');
    fmt = fmt.replace(/(\\Sigma|[a-zA-Z]+)(\d+)/g, '$1_$2');
    return fmt;
}

function getEquationForNode(k, activeNodes, C, V, inputNode) {
    const node = activeNodes[k];
    const terms = [];
    activeNodes.forEach((otherNode, j) => {
        if (!C[k][j].isZero()) {
            const coeff = C[k][j];
            const otherLabel = formatLabelForKaTeX(otherNode.label);
            if (coeff.isOne()) {
                terms.push(`${otherLabel}`);
            } else if (coeff.isMinusOne()) {
                terms.push(`-${otherLabel}`);
            } else {
                terms.push(`(${coeff.toKaTeX()}) \\cdot ${otherLabel}`);
            }
        }
    });
    
    let rhs = "";
    if (!V[k].isZero()) {
        const vStr = V[k].toKaTeX();
        const inputLabel = formatLabelForKaTeX(inputNode.label);
        if (vStr === "1") {
            rhs = `+ ${inputLabel}`;
        } else if (vStr === "-1") {
            rhs = `- ${inputLabel}`;
        } else {
            rhs = `+ (${vStr}) \\cdot ${inputLabel}`;
        }
    }
    
    const nodeLabel = formatLabelForKaTeX(node.label);
    if (terms.length === 0 && rhs === "") {
        return `${nodeLabel} = 0`;
    }
    let eq = "";
    if (terms.length === 0) {
        let cleanRhs = rhs.trim();
        if (cleanRhs.startsWith("+")) {
            cleanRhs = cleanRhs.substring(1).trim();
        }
        eq = `${nodeLabel} = ${cleanRhs}`;
    } else {
        eq = `${nodeLabel} = ${terms.join(" + ")} ${rhs}`.trim();
    }
    eq = eq.replace(/\+ \-/g, '- ');
    eq = eq.replace(/\+ \(\-/g, '- (');
    eq = eq.replace(/=\s*\+/g, '= ');
    return eq;
}

export function solveSymbolically(nodes, connections) {
    const inputNode = nodes.find(n => n.type === 'input');
    const outputNode = nodes.find(n => n.type === 'output');

    if (!inputNode) throw new Error("Missing Input node (R)");
    if (!outputNode) throw new Error("Missing Output node (Y)");

    // Sort active nodes: blocks first, then sums, then output
    const activeNodes = [
        ...nodes.filter(n => n.type === 'block'),
        ...nodes.filter(n => n.type === 'sum'),
        ...nodes.filter(n => n.type === 'output')
    ];
    const K = activeNodes.length;

    if (K === 0) throw new Error("No blocks, sums, or outputs to solve");

    const indexMap = {};
    activeNodes.forEach((n, idx) => {
        indexMap[n.id] = idx;
    });

    // Initialize Symbolic Equations matrix and vectors
    const C = [];
    const V = [];

    for (let i = 0; i < K; i++) {
        C[i] = [];
        for (let j = 0; j < K; j++) {
            C[i][j] = SymExpr.const("0");
        }
        V[i] = SymExpr.const("0");
    }

    // Fill Symbolic coefficients based on connections
    for (let i = 0; i < K; i++) {
        const targetNode = activeNodes[i];
        const incoming = connections.filter(c => c.toNode === targetNode.id);

        incoming.forEach(conn => {
            const fromNodeId = conn.fromNode;
            
            let symbol = targetNode.type === 'block' ? parseValToSym(targetNode.value) : SymExpr.const("1");
            
            if (targetNode.type === 'sum' && conn.sign === '-') {
                symbol = SymExpr.neg(symbol);
            }

            if (fromNodeId === inputNode.id) {
                V[i] = V[i].add(symbol);
            } else {
                const j = indexMap[fromNodeId];
                if (j !== undefined) {
                    C[i][j] = C[i][j].add(symbol);
                }
            }
        });
    }

    // Document initial equations
    const initialEquations = activeNodes.map((node, i) => {
        const terms = [];
        activeNodes.forEach((otherNode, j) => {
            if (!C[i][j].isZero()) {
                const coeff = C[i][j];
                const otherLabel = formatLabelForKaTeX(otherNode.label);
                if (coeff.isOne()) {
                    terms.push(`${otherLabel}`);
                } else if (coeff.isMinusOne()) {
                    terms.push(`-${otherLabel}`);
                } else {
                    terms.push(`(${coeff.toKaTeX()}) \\cdot ${otherLabel}`);
                }
            }
        });
        
        let rhs = "";
        if (!V[i].isZero()) {
            const vStr = V[i].toKaTeX();
            const inputLabel = formatLabelForKaTeX(inputNode.label);
            if (vStr === "1") {
                rhs = `+ ${inputLabel}`;
            } else if (vStr === "-1") {
                rhs = `- ${inputLabel}`;
            } else {
                rhs = `+ (${vStr}) \\cdot ${inputLabel}`;
            }
        }
        
        const nodeLabel = formatLabelForKaTeX(node.label);
        let eq = `${nodeLabel} = ${terms.join(" + ")} ${rhs}`.trim();
        eq = eq.replace(/\+ \-/g, '- ');
        eq = eq.replace(/\+ \(\-/g, '- (');
        if (eq.includes("= +")) {
            eq = eq.replace("= +", "=");
        }
        return eq;
    });

    const steps = [];
    const outIdx = indexMap[outputNode.id]; // Should be K - 1

    // Eliminating intermediate nodes step by step using forward substitution
    for (let k = 0; k < K - 1; k++) {
        const selfLoop = C[k][k];
        if (!selfLoop.isZero()) {
            const eqBefore = getEquationForNode(k, activeNodes, C, V, inputNode);
            const denom = SymExpr.const("1").subtract(selfLoop);
            V[k] = V[k].divide(denom);
            for (let j = 0; j < K; j++) {
                if (j !== k) {
                    C[k][j] = C[k][j].divide(denom);
                }
            }
            C[k][k] = SymExpr.const("0");
            const eqAfter = getEquationForNode(k, activeNodes, C, V, inputNode);

            steps.push({
                type: 'self-loop',
                title: `Resolve Self-Loop on ${activeNodes[k].label}`,
                latex: `${eqBefore} \\quad \\implies \\quad ${eqAfter}`
            });
        }

        // Substitute k into all subsequent active nodes
        for (let i = k + 1; i < K; i++) {
            const factor = C[i][k];
            if (factor.isZero()) continue;

            const eqBefore = getEquationForNode(i, activeNodes, C, V, inputNode);

            V[i] = V[i].add(factor.multiply(V[k]));
            for (let j = 0; j < K; j++) {
                if (j !== k) {
                    C[i][j] = C[i][j].add(factor.multiply(C[k][j]));
                }
            }
            C[i][k] = SymExpr.const("0");

            const eqAfter = getEquationForNode(i, activeNodes, C, V, inputNode);

            steps.push({
                type: 'substitution',
                title: `Substitute ${activeNodes[k].label} into ${activeNodes[i].label}`,
                latex: `${eqBefore} \\quad \\implies \\quad ${eqAfter}`
            });
        }
    }

    const finalSelfLoop = C[K - 1][K - 1];
    let rawFinalTF = V[K - 1];
    if (!finalSelfLoop.isZero()) {
        const eqBefore = getEquationForNode(K - 1, activeNodes, C, V, inputNode);
        rawFinalTF = rawFinalTF.divide(SymExpr.const("1").subtract(finalSelfLoop));
        C[K - 1][K - 1] = SymExpr.const("0");
        const eqAfter = getEquationForNode(K - 1, activeNodes, C, V, inputNode);
        steps.push({
            type: 'self-loop',
            title: `Resolve Final Self-Loop on ${outputNode.label}`,
            latex: `${eqBefore} \\quad \\implies \\quad ${eqAfter}`
        });
    }

    const resolved = rawFinalTF.resolveFractions().cancelCommonFactors().distribute().regroup();
    const finalKaTeX = resolved.toKaTeX();
    const finalFormula = resolved.toFormulaString();

    return {
        initialEquations,
        steps,
        finalTransferFunction: {
            toKaTeX: () => finalKaTeX,
            toFormulaString: () => finalFormula
        }
    };
}
