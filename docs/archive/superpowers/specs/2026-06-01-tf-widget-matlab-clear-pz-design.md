# LCD1 Solver — TF widget, MATLAB copy, Clear, PZ stability overlay

**Date:** 2026-06-01

Four additions to the LCD1 Solver dashboard. Zero new dependencies; numeric solver path untouched.

## 1. Smart TF widget (collapsible)

A "✚ Build a transfer function" toggle above `#lcd-sys`. Expands to a visual fraction editor:
- Two stacked inputs: numerator (top) and denominator (bottom), separated by a fraction bar.
- Live KaTeX preview of the fraction (plain-text fallback) + a status line that parses each
  side with `parseExprToTF`: `✓ valid · numeric|symbolic` (via `isSymbolicTf`) or `✗ <error>`.
- **Combine rule** (`combineTf(num, den)`): output `num/(den)`, wrapping a side in parens only
  when it has more than one top-level term. `K` + `s*(s+a)` → `K/(s*(s+a))`; `s+1` + `s+2` →
  `(s+1)/(s+2)`. Identical for symbolic and numeric.
- **Insert into G(s)**: sets `state.sysBox.value`, `growSys()`, `analyzeAndRender()`, collapse.
- **Copy**: `navigator.clipboard.writeText(combined)`.

## 2. Clear button

"✕ Clear" in the header row. `clearAll()`: empties `sysBox`, `board`, `echo`; hides the
from-diagram chooser; `growSys()`.

## 3. Copy-to-MATLAB on graphs

"⧉ Copy MATLAB" button in the plot panel tab row. `renderPlotPanel(pd, defaultTab, src)` gains
`src`; the panel tracks the current tab. On click, copies commented MATLAB via
`matlabForPlot(src, tab)`:
- Header: `% Transfer function G(s)` / `s = tf('s');` / `G = <src with ** → ^>;`
- Symbolic TFs: a commented parameter block (`K = 1; a = 1;  % set your parameter values`)
  before `G`, one assignment per symbol (symbols = identifiers other than `s`).
- Per-tab command + `grid on;`: Step→`step(G)`, Bode→`bode(G)`, Nyquist→`nyquist(G)`,
  Pole-Zero→`pzmap(G)`.

## 4. Pole-zero s-plane stability overlay

`linePlot` gains optional `regions: [{x0,x1,color}]` — translucent rects clipped to the plot box.
`poleZeroPlot`:
- Shades Re<0 (left half-plane) faint green = stable region.
- Emphasizes the jω axis (x=0) with a brighter solid stroke.
- Legend adds "stable region (Re<0)" and "jω axis".

## Testing
- `plot-svg.test.js`: `regions` rect renders; PZ legend mentions stable region / jω axis.
- New `tf-widget.test.js`: `combineTf` (bare vs parens, sym vs num) and `matlabForPlot`
  (per-tab command, `^` conversion, symbolic param block).
- Live verify in Claude_Preview before merge.
