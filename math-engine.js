/**
 * math-engine.js
 * A symbolic rational algebra engine designed for control theory.
 * Handles polynomials and transfer functions with exact fraction mathematics.
 */

export class Polynomial {
    /**
     * @param {number[]} coeffs - Coefficients starting from s^0 to s^n. E.g., s^2 + 3s + 2 -> [2, 3, 1]
     */
    constructor(coeffs = [0]) {
        this.coeffs = [...coeffs];
        this.clean();
    }

    clean() {
        // Remove trailing zeros to normalize degree
        while (this.coeffs.length > 1 && Math.abs(this.coeffs[this.coeffs.length - 1]) < 1e-9) {
            this.coeffs.pop();
        }
        // Fix near-zero values
        for (let i = 0; i < this.coeffs.length; i++) {
            if (Math.abs(this.coeffs[i]) < 1e-9) {
                this.coeffs[i] = 0;
            }
        }
    }

    get degree() {
        return this.coeffs.length - 1;
    }

    get leadingCoeff() {
        return this.coeffs[this.coeffs.length - 1];
    }

    add(other) {
        const len = Math.max(this.coeffs.length, other.coeffs.length);
        const result = [];
        for (let i = 0; i < len; i++) {
            const a = this.coeffs[i] || 0;
            const b = other.coeffs[i] || 0;
            result.push(a + b);
        }
        return new Polynomial(result);
    }

    subtract(other) {
        const len = Math.max(this.coeffs.length, other.coeffs.length);
        const result = [];
        for (let i = 0; i < len; i++) {
            const a = this.coeffs[i] || 0;
            const b = other.coeffs[i] || 0;
            result.push(a - b);
        }
        return new Polynomial(result);
    }

    multiply(other) {
        const degSelf = this.degree;
        const degOther = other.degree;
        const result = new Array(degSelf + degOther + 1).fill(0);

        for (let i = 0; i <= degSelf; i++) {
            for (let j = 0; j <= degOther; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        return new Polynomial(result);
    }

    multiplyScalar(k) {
        return new Polynomial(this.coeffs.map(c => c * k));
    }

    divide(other) {
        if (other.isZero()) {
            throw new Error("Division by zero polynomial");
        }

        let num = [...this.coeffs];
        const den = [...other.coeffs];
        const qCoeffs = [];

        const degDen = other.degree;
        const leadDen = other.leadingCoeff;

        while (num.length >= den.length) {
            const degNum = num.length - 1;
            const leadNum = num[num.length - 1];

            const degDiff = degNum - degDen;
            const factor = leadNum / leadDen;

            qCoeffs[degDiff] = factor;

            for (let i = 0; i <= degDen; i++) {
                num[degDiff + i] -= factor * den[i];
            }

            // Remove trailing zero which we just eliminated
            num.pop();
            while (num.length > 0 && Math.abs(num[num.length - 1]) < 1e-9) {
                num.pop();
            }
        }

        // Fill in missing quotient coefficients with 0
        const maxQDeg = this.degree - other.degree;
        for (let i = 0; i <= maxQDeg; i++) {
            if (qCoeffs[i] === undefined) qCoeffs[i] = 0;
        }

        return {
            quotient: new Polynomial(qCoeffs.length > 0 ? qCoeffs : [0]),
            remainder: new Polynomial(num.length > 0 ? num : [0])
        };
    }

    isZero() {
        return this.coeffs.length === 1 && this.coeffs[0] === 0;
    }

    isConstant() {
        return this.coeffs.length === 1;
    }

    clone() {
        return new Polynomial(this.coeffs);
    }

    // Extended Euclidean Algorithm for polynomials
    static gcd(a, b) {
        let x = a.clone();
        let y = b.clone();

        while (!y.isZero()) {
            const { remainder } = x.divide(y);
            x = y;
            y = remainder;
        }

        // Normalize GCD so leading coefficient is 1
        const lead = x.leadingCoeff;
        if (lead !== 0 && Math.abs(lead - 1) > 1e-6) {
            x = x.multiplyScalar(1 / lead);
        }
        return x;
    }

    toFormulaString(varChar = 's') {
        if (this.isZero()) return '0';
        
        let terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (c === 0) continue;

            const sign = c > 0 ? (terms.length > 0 ? ' + ' : '') : (terms.length > 0 ? ' - ' : '-');
            const absC = Math.abs(c);
            
            let coeffStr = '';
            // Display coefficient if it's not 1 or -1, or if it's the constant term
            if (absC !== 1 || i === 0) {
                // Round to 4 decimal places for cleaner rendering
                coeffStr = parseFloat(absC.toFixed(4)).toString();
            }

            let sStr = '';
            if (i > 0) {
                sStr = i === 1 ? varChar : `${varChar}^${i}`;
            }

            terms.push(`${sign}${coeffStr}${sStr}`);
        }
        return terms.join('');
    }

    toKaTeXString(varChar = 's') {
        return this.toFormulaString(varChar);
    }
}

export class TransferFunction {
    /**
     * Represents G(s) = num(s) / den(s)
     * @param {Polynomial|number[]} num
     * @param {Polynomial|number[]} den
     */
    constructor(num = [0], den = [1]) {
        this.num = num instanceof Polynomial ? num : new Polynomial(num);
        this.den = den instanceof Polynomial ? den : new Polynomial(den);
        
        if (this.den.isZero()) {
            throw new Error("Denominator cannot be zero");
        }
        this.normalize();
    }

    normalize() {
        // Ensure denominator leading coefficient is positive/normalized
        const lead = this.den.leadingCoeff;
        if (lead !== 0 && Math.abs(lead - 1) > 1e-6) {
            this.num = this.num.multiplyScalar(1 / lead);
            this.den = this.den.multiplyScalar(1 / lead);
        }
    }

    simplify() {
        if (this.num.isZero()) {
            this.den = new Polynomial([1]);
            return this;
        }

        try {
            const commonGcd = Polynomial.gcd(this.num, this.den);
            if (commonGcd.degree > 0) {
                const { quotient: numQ, remainder: numR } = this.num.divide(commonGcd);
                const { quotient: denQ, remainder: denR } = this.den.divide(commonGcd);

                if (numR.isZero() && denR.isZero()) {
                    this.num = numQ;
                    this.den = denQ;
                }
            }
        } catch (e) {
            console.error("Simplification error", e);
        }
        
        this.normalize();
        return this;
    }

    add(other) {
        // N1/D1 + N2/D2 = (N1*D2 + N2*D1) / (D1*D2)
        const newNum = this.num.multiply(other.den).add(other.num.multiply(this.den));
        const newDen = this.den.multiply(other.den);
        return new TransferFunction(newNum, newDen).simplify();
    }

    subtract(other) {
        // N1/D1 - N2/D2 = (N1*D2 - N2*D1) / (D1*D2)
        const newNum = this.num.multiply(other.den).subtract(other.num.multiply(this.den));
        const newDen = this.den.multiply(other.den);
        return new TransferFunction(newNum, newDen).simplify();
    }

    multiply(other) {
        // (N1*N2) / (D1*D2)
        const newNum = this.num.multiply(other.num);
        const newDen = this.den.multiply(other.den);
        return new TransferFunction(newNum, newDen).simplify();
    }

    divide(other) {
        // (N1*D2) / (D1*N2)
        const newNum = this.num.multiply(other.den);
        const newDen = this.den.multiply(other.num);
        return new TransferFunction(newNum, newDen).simplify();
    }

    feedback(H, sign = 1) {
        // sign = 1 for negative feedback: G/(1 + GH)
        // sign = -1 for positive feedback: G/(1 - GH)
        // G = Ng/Dg, H = Nh/Dh -> (Ng*Dh) / (Dg*Dh + sign*Ng*Nh)
        const newNum = this.num.multiply(H.den);
        const feedbackPart = this.num.multiply(H.num).multiplyScalar(sign);
        const newDen = this.den.multiply(H.den).add(feedbackPart);

        return new TransferFunction(newNum, newDen).simplify();
    }

    isConstant() {
        return this.num.isConstant() && this.den.isConstant();
    }

    getConstantValue() {
        if (this.isConstant()) {
            return this.num.coeffs[0] / this.den.coeffs[0];
        }
        return NaN;
    }

    clone() {
        return new TransferFunction(this.num.clone(), this.den.clone());
    }

    toKaTeX(varChar = 's') {
        if (this.den.isConstant() && this.den.coeffs[0] === 1) {
            return this.num.toKaTeXString(varChar);
        }
        return `\\frac{${this.num.toKaTeXString(varChar)}}{${this.den.toKaTeXString(varChar)}}`;
    }

    toFormulaString(varChar = 's') {
        if (this.den.isConstant() && this.den.coeffs[0] === 1) {
            return this.num.toFormulaString(varChar);
        }
        return `(${this.num.toFormulaString(varChar)}) / (${this.den.toFormulaString(varChar)})`;
    }

    /**
     * Parses a string representation like "10 / (s^2 + 2s + 3)" or "2.5" or "s" into a TransferFunction
     * Supports basic formats
     * @param {string} str
     * @returns {TransferFunction}
     */
    static parse(str) {
        str = str.replace(/\s+/g, '').toLowerCase();
        if (!str) return new TransferFunction([0], [1]);

        // Helper to parse single polynomial string like "s^2+3s+2"
        const parsePoly = (pStr) => {
            if (!pStr) return new Polynomial([0]);
            
            // Split into terms by keeping signs e.g., s^2-3s+2 -> s^2, -3s, +2
            const termMatches = pStr.match(/([+-]?[^+-]+)/g) || [pStr];
            let poly = new Polynomial([0]);

            for (let term of termMatches) {
                let sign = 1;
                if (term.startsWith('-')) {
                    sign = -1;
                    term = term.substring(1);
                } else if (term.startsWith('+')) {
                    term = term.substring(1);
                }

                let coeff = 1;
                let power = 0;

                if (term.includes('s')) {
                    const parts = term.split('s');
                    if (parts[0] !== '') {
                        coeff = parseFloat(parts[0]);
                        if (isNaN(coeff)) coeff = 1;
                    }
                    
                    const powerPart = parts[1];
                    if (powerPart === '') {
                        power = 1;
                    } else if (powerPart.startsWith('^')) {
                        power = parseInt(powerPart.substring(1));
                    }
                } else {
                    coeff = parseFloat(term);
                    power = 0;
                }

                const termCoeffs = new Array(power + 1).fill(0);
                termCoeffs[power] = coeff * sign;
                poly = poly.add(new Polynomial(termCoeffs));
            }
            return poly;
        };

        if (str.includes('/')) {
            const parts = str.split('/');
            // Remove outer parentheses
            let numStr = parts[0].replace(/^\((.*)\)$/, '$1');
            let denStr = parts[1].replace(/^\((.*)\)$/, '$1');
            return new TransferFunction(parsePoly(numStr), parsePoly(denStr));
        } else {
            return new TransferFunction(parsePoly(str), [1]);
        }
    }
}
