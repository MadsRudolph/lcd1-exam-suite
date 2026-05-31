# Security & robustness review

**Date:** 2026-05-31
**Scope:** the merged Electron app — Electron shell (`main.js`, `preload.js`), the LCD1
renderer (`lcd-solver-ui.js`, `lcd-engine.js`), and the solver engine (`spike/`).
**Method:** code audit of the privileged surfaces + adversarial input fuzzing of the parser,
solvers, and Smart Paste regexes (each time-boxed to catch hangs).

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Exponent / degree DoS — `(s+1)**1e8` froze the renderer | High (avail.) | **Fixed** |
| 2 | XSS — pasted option text rendered via `innerHTML` | Medium | **Fixed** |
| 3 | Oversized state-space matrix → n⁴ blowup | Low | **Fixed** |
| 4 | Zero-denominator TF produced silent garbage | Low | **Fixed** |
| 5 | Deep paren nesting → stack overflow | Low | **Fixed** (clean error) |
| 6 | Self-update runs `git pull` + `npm run build` | Medium (by design) | **Documented** |
| — | Electron config (nodeIntegration/contextIsolation) | — | Already correct |

The Electron configuration is sound and is the main reason most renderer issues stay
contained: `nodeIntegration:false`, `contextIsolation:true`, and a preload that exposes only
`checkUpdate()` + a status listener. An XSS therefore could **not** reach Node directly.

## Findings

### 1. Exponent / degree DoS (High → Fixed)
`parseTf("(s+1)**100000000")` expanded a degree-10⁸ polynomial and **hung the single-threaded
renderer indefinitely** (the whole window freezes). Reachable not just from a `G(s)` field but
from **Smart Paste**: a pasted `s99999999` is rewritten to `s**99999999` by the superscript
normaliser, so a shared/typo question could freeze a classmate's app. A constant base
(`5**1e8`) hit the same loop without growing the degree.

**Fix:** a hard `MAX_DEGREE = 1024` cap enforced centrally in `polyMul` (covers `**` and long
implicit products) plus an explicit exponent-magnitude cap in the parser (covers constant
bases). Now throws in <1 ms. Exam transfer functions are degree ≤ ~8, so the cap is invisible
to real use. Guarded by `spike/test/hardening.test.js`.

### 2. Stored/reflected XSS via option text (Medium → Fixed)
`renderResults()` inserted each pasted multiple-choice option into the DOM with `innerHTML`
(`el(span, …, o.raw_text)`). An option line like `<img src=x onerror=…>` would execute in the
renderer. Threat model is real because questions are **shared between classmates** (a poisoned
`.txt`). Contained by `contextIsolation` (no direct Node access), but the script could still
call `electronAPI.checkUpdate()` (→ `git pull` + rebuild + reload) and tamper with the DOM.

**Fix:** user-derived option text is now rendered with `textContent`, never `innerHTML`. The
only `innerHTML` left holds static markup or KaTeX (which renders math, not executable HTML).

### 3. Oversized state-space matrix (Low → Fixed)
A large pasted `A` matrix drove the Faddeev–Leverrier loop into ~n⁴ work (n=400 ≈ 1 s; n≈1000
would effectively hang). **Fix:** `MAX_STATE_DIM = 64` (exam systems are ≤ ~4).

### 4. Zero-denominator TF (Low → Fixed)
`1/(s-s)` parsed to denominator `[0]` and the solvers returned all-`null`/`NaN` silently.
**Fix:** `parseTf` now rejects an all-zero denominator with a clear error.

### 5. Deep paren nesting (Low → Fixed)
`"(".repeat(50000)+"s"+…` overflowed the recursive-descent stack. It was already *caught*
(RangeError is catchable, and every call site wraps `parseTf` in try/catch), so it surfaced as
a graceful error — but now a `MAX_DEPTH = 200` guard throws a readable message first.

### 6. Self-update executes pulled code (Medium — by design, documented)
The `check-update` IPC runs `git pull` then `npm run build` and reloads. The command string is
fixed (no user input is interpolated), so there is **no shell-injection from the renderer**.
However, self-update inherently means **whoever controls the git remote controls code
execution** (a malicious `app.js`/`package.json` would be built and run on the next reload).
This is the deliberate trade-off of the single-bundle self-update model. Recommendations:
- keep the remote on the user's own GitHub over SSH (already the case);
- treat "Check for Updates" as "run upstream code" and only point it at a trusted repo;
- optional future hardening: verify signed commits/tags before building, or gate the rebuild
  behind an explicit confirmation.

## Not vulnerable / checked
- **Shell injection in `check-update`** — fixed command, no interpolation.
- **ReDoS in Smart Paste** — fuzzed with long adversarial strings; scan time is linear-ish
  (~0.8 s on 50 k chars), no catastrophic backtracking.
- **Prototype pollution via matrix `JSON.parse`** — `__proto__` keys become own properties,
  not prototype writes; matrices are coerced to numbers anyway.
- **`eval` / `Function`** — none used anywhere in the engine or UI.
- **Remote content / navigation** — app loads a local file only; no remote URLs.

## How to reproduce
```bash
cd spike && npm test          # includes test/hardening.test.js (DoS/zero-den/matrix guards)
```
