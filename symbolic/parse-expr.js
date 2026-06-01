import { SymTF } from "./symtf.js";
import { MPoly } from "./mpoly.js";
import { Rational } from "./rational.js";

function tokenize(src) {
    const tokens = [];
    let i = 0;
    // Accept the notation people actually type: '**' for powers (the numeric
    // solver's convention) and '·' for multiplication, both normalized to the
    // CAS's own '^'/'*'.
    const s = src.replace(/\s+/g, "").replace(/\*\*/g, "^").replace(/·/g, "*");
    while (i < s.length) {
        const ch = s[i];
        if ("+-*/^()".includes(ch)) { tokens.push({ t: ch }); i++; continue; }
        if (/[0-9.]/.test(ch)) {
            let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
            const raw = s.slice(i, j);
            if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) throw new Error(`Malformed number '${raw}' in '${src}'`);
            tokens.push({ t: "num", v: raw }); i = j; continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
            const run = s.slice(i, j);
            // 's' is the reserved Laplace variable; peel it out of a glued run so
            // 'a2s' tokenizes as a2 * s, while multi-character parameter names
            // (Kp, tau, a2, …) stay intact. Adjacent tokens implicit-multiply.
            let buf = "";
            const flush = () => { if (buf) { tokens.push(/^[0-9]+$/.test(buf) ? { t: "num", v: buf } : { t: "id", v: buf }); buf = ""; } };
            for (const c of run) {
                if (c === "s") { flush(); tokens.push({ t: "id", v: "s" }); }
                else buf += c;
            }
            flush();
            i = j; continue;
        }
        throw new Error(`Unexpected character '${ch}' in '${src}'`);
    }
    return tokens;
}

// Recursive descent with implicit multiplication. Grammar:
//   expr   := term (('+'|'-') term)*
//   term   := factor ( ('*'|'/') factor | factor )*     // juxtaposition = '*'
//   factor := base ('^' integer)?
//   base   := number | id | 's' | '(' expr ')'
export function parseExprToTF(src) {
    const tk = tokenize(src);
    let pos = 0;
    const peek = () => tk[pos];
    const next = () => tk[pos++];

    function base() {
        const t = peek();
        if (!t) throw new Error(`Unexpected end of '${src}'`);
        if (t.t === "(") {
            next();
            const e = expr();
            if (!peek() || peek().t !== ")") throw new Error(`Missing ')' in '${src}'`);
            next();
            return e;
        }
        if (t.t === "num") { next(); return SymTF.constMPoly(MPoly.constant(Rational.parse(t.v))); }
        if (t.t === "id") {
            next();
            if (t.v === "s") return new SymTF([MPoly.ZERO, MPoly.ONE], [MPoly.ONE]);
            return SymTF.constMPoly(MPoly.variable(t.v));
        }
        throw new Error(`Unexpected token '${t.t}' in '${src}'`);
    }
    function factor() {
        let b = base();
        if (peek() && peek().t === "^") {
            next();
            const e = next();
            if (!e || e.t !== "num") throw new Error(`Expected exponent in '${src}'`);
            if (!/^[0-9]+$/.test(e.v)) throw new Error(`Exponent must be a non-negative integer in '${src}'`);
            const n = parseInt(e.v, 10);
            let r = SymTF.one();
            for (let k = 0; k < n; k++) r = r.mul(b);
            b = r;
        }
        return b;
    }
    function unary() {
        const t = peek();
        if (t && (t.t === "-" || t.t === "+")) {
            next();
            const u = unary();
            return t.t === "-" ? u.neg() : u;
        }
        return factor();
    }
    function startsFactor(t) { return t && (t.t === "num" || t.t === "id" || t.t === "("); }
    function term() {
        let r = unary();
        for (;;) {
            const t = peek();
            if (t && (t.t === "*" || t.t === "/")) {
                next();
                const f = unary();
                r = t.t === "*" ? r.mul(f) : r.div(f);
            } else if (startsFactor(t)) {           // implicit multiplication (juxtaposition)
                r = r.mul(unary());
            } else break;
        }
        return r;
    }
    function expr() {
        let r = term();
        for (;;) {
            const t = peek();
            if (t && (t.t === "+" || t.t === "-")) { next(); const u = term(); r = t.t === "+" ? r.add(u) : r.sub(u); }
            else break;
        }
        return r;
    }
    const result = expr();
    if (pos !== tk.length) throw new Error(`Trailing tokens in '${src}'`);
    return result;
}
