# Unified Solver Dashboard — design

**Date:** 2026-05-31
**Status:** approved direction (brainstorm), pending spec review → plan

## Problem

The LCD1 Solver mode is a dropdown of **24 single-purpose forms**. To answer one
exam question a student must: know which form, select it, retype the transfer
function, dodge input traps (`1/s*(s+21)` parses as `(s+21)/s`, not `1/(s(s+21))`),
avoid stale state carried from the previous question, and convert units by hand
(DC gain shown linearly when the question asks for dB). It is the opposite of
"easier." Real exams also **group several questions around one system/figure**, so
re-entering the system per form is pure friction.

## Goal

Replace the form-picker with **one system-centric dashboard**: the student enters a
system **once**, and the app auto-computes and lays out every read-out it can,
hosts the design tools that reuse that same system, and adapts its board to
numeric-vs-symbolic input automatically. The student stops choosing a solver and
just reads the board.

## Decisions (from brainstorm)

1. **Auto-dashboard** (direction A): the *system* is the unit of interaction, not the
   task. No solver dropdown for analysis.
2. **Design tools on the same screen, reusing the G(s)**: pick a goal, type only the
   one extra number, answer appears — never retype the system.
3. **One box auto-adapts** numeric ↔ symbolic: a TF with literal letters (`K`, `a`,
   …) flips the board to the symbolic read-outs + answer-equivalence checker.

## Key principle: this is a re-surfacing layer, not a new engine

Every computation already exists and is parity-verified:
- Numeric solvers (`spike/solvers/*`, surfaced via `lcd-engine.js`): `characterizeTf`
  (poles, DC gain, ζ/ωₙ, initial/final value), `bandwidth`, `dominantSettling`,
  `analyzeStability`, `solveMargins`, `solveEssTable`, `solveStableKRange`,
  `solveP_for_PM`, `solvePiLead*`, `solve2ndOrder`, `solveKForSpec`, etc.
- Symbolic CAS (`symbolic/*`): `parseExprToTF`, `simplify`, `analysis` (type/order/
  staticGain), `ess` (step/ramp/disturbance), `combinators.feedback`,
  `symbolicEquivTest`, `renderSymTF`.
- Numeric TF parser `spike/numeric/parse.js`, plot data `plotdata.js`, plots
  `plot-svg.js`, option matching `spike/match.js`.

**The numeric engine and all solver modules stay byte-for-byte untouched.** This work
is a new presentation/orchestration layer in `lcd-engine.js` + `lcd-solver-ui.js`.
The existing `runSolver(fn, …)` is reused under the hood for design goals and
calculators.

## Architecture

### 1. Input sources → one G(s)

A single input box holds the active system `G(s)`. It can be populated by:
- **typing** a TF (`12/((s+2)*(s+3))`, `^` or `**` powers, implicit multiplication);
- **← block diagram** (existing bridge handoff, numeric or symbolic);
- **← Bode read-off** (the existing `compose_tf_from_bode` / `bode_readoff` converter
  produces a G that lands in the box);
- **← ODE / state-space** (existing `solve_ode_to_tf` / `solve_state_space_to_tf`
  produce a G that lands in the box).

So the former P1/P2 "TF producer" forms become **input sources** feeding the one box,
not separate destinations.

### 2. Interpreted-as echo (the input-trap fix)

Directly under the box, the app echoes **what it parsed**, in expanded
polynomial-ratio form: `interpreted as G(s) = 12 / (s² + 5s + 6)`. This makes the
`1/s*(s+21) → (s+21)/s` precedence mistake visible immediately, and surfaces typos.
If parsing fails, the echo shows the error inline (no result wiped).

### 3. Numeric read-out board (when G is numeric)

Auto-computed cards, each independent — a card that can't be computed shows `—` with
a one-line reason and never breaks the rest of the board:
- **DC gain** — linear **and** dB side by side (`2  ·  6.02 dB`).
- **type / order**; **poles**; **zeros**.
- **GM** (linear + dB), **PM**, **ω_c (ω_gc)**, **ω_π (ω_pc)**.
- **ess**: step / ramp / parabola, plus error constants K_p / K_v / K_a.
- **y(0⁺) / y(∞)** (initial/final value of the step response).
- **bandwidth**; **settling t_s (2%)**; **stable?**.

### 4. Plots

The existing tabbed **Step · Bode · Nyquist · Pole-Zero** panel (with hover read-off
and the exam-image **overlay**), drawn from `buildPlotData(G)`.

### 5. Design strip (reuses the G above)

A row of goals; selecting one reveals only the extra field(s) it needs and answers
using the current G, via the existing solvers:
- **P for PM** → target PM → `K_P`, `ω_c`.
- **PI-Lead design** → γ_M, N_i, ω_c → α, K_P.
- **Stable-K range** → (none) → `K ∈ (low, high)`.
- **K for Mp/ζ spec** → spec string → `K`.

Each answer runs through the existing **no-confident-match guard** / option matcher
when options are pasted (see §7).

### 6. Symbolic board (when G has literal letters)

Detected by the existing "any symbol other than s" test (already in `solver.js`).
The board swaps to the CAS read-outs via `symbolic/*`:
- **closed-loop** `T = L/(1+L)` (simplified), **type / order**, **K₀**,
  **ess** step / ramp (symbolic), **disturbance ess** (when a `Gd` is given).
- **Answer-equivalence checker**: paste the exam's options → ✓ which one is
  algebraically equal (`symbolicEquivTest`, the termination-safe zero-polynomial test).

### 7. Option matching (multiple-choice helper)

A shared "paste the options" affordance. In numeric mode the student picks which
read-out to match against (DC gain, PM, K, …) and the existing `match.js`
NUMBER/DICT matcher flags the closest option, keeping the no-confident-match guard.
In symbolic mode it routes to `symbolicEquivTest`.

### 8. Standalone calculators (not G-centric)

A small minority of the old forms are **not** functions of a single G(s) and stay as
compact standalone calculators in a "Calculators" section:
- **2nd-order spec table** (`solve_2nd_order`: Mp ↔ ζ ↔ ωₙ/t_p/t_s).
- **K_P from ess** (`solve_KP_from_ess`: from a scalar G(0)).
- **Nested-loop ess** (`solve_nested_ess`).

## Data flow

```
input box ── parse ──▶ interpreted-as echo
     │                         │
     ▼                         ▼
 numeric?  ──yes──▶ analyzeNumeric(G) ─▶ read-out cards + plots + design strip
     │                                   (each card = existing solver call, guarded)
     └──no(has letters)──▶ analyzeSymbolic(G) ─▶ symbolic cards + equivalence checker
```

Two new orchestration functions in `lcd-engine.js`:
- `analyzeNumeric(G)` → `{ dcGain, dcGain_dB, type, order, poles, zeros, margins,
  ess, initialValue, finalValue, bandwidth, settling, stable, plotData }`, each field
  computed in its own try/catch so one failure degrades to `—`.
- `analyzeSymbolic(Gstr)` → `{ closedLoop, type, order, K0, essStep, essRamp }` + the
  equivalence entry point.

`lcd-solver-ui.js` renders the dashboard from these objects and wires the design
strip / calculators to the existing `runSolver`.

## Error handling

- **Parse failure** → inline echo error, board cleared to a prompt, no crash.
- **Per-card failure** (no gain crossover → GM ∞; unstable → no settling; integrator
  → DC gain ∞/—) → that card shows `—` + reason; siblings unaffected.
- **Suspicious result** → the interpreted-as echo is the primary safeguard; the design
  strip keeps the no-confident-match guard for pasted options.

## What is removed / changed

- The **24-entry form dropdown** is removed as the primary surface. Its functions are
  re-homed: analysis → auto board; G-centric design → design strip; TF producers →
  input sources; the three non-G calculators → Calculators section; symbolic →
  symbolic board.
- **Block Diagram mode** is unchanged; it feeds the dashboard via the existing bridge.
- The mode switcher (Block Diagram ⇄ LCD1 Solver) is unchanged.

## Testing

- **No engine regressions**: `npm test` stays green (the solver modules are untouched).
- **New orchestration**: unit-test `analyzeNumeric`/`analyzeSymbolic` against known
  systems (e.g. `12/((s+2)(s+3))` → DC 2 / 6.02 dB, type 0, order 2; `K/(s(s+a))` →
  closed-loop `K/(s²+as+K)`, type 1, ess_ramp `a/K`), and that each field is
  independently null-safe.
- **In-app verification** of the real exam flow (E25 Q7 DC-gain-in-dB; the
  `1/s*(s+21)` echo; P-for-PM design strip → 8.4).

## Out of scope (YAGNI)

- No natural-language command bar (rejected direction B).
- No change to the numeric/symbolic engines or the block-diagram reducer.
- No new control-theory capability — purely a re-surfacing of what exists.
