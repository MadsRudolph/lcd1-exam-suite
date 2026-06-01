// Headless harness that exercises the EXACT code path the GUI solver runs:
// smartPaste() (the "paste an exam question" box) and runSolver() (the forms),
// plus the live dashboard read-outs (analyzeNumeric / analyzeSymbolic).
//
// Build:  npx esbuild exam-harness.src.js --bundle --format=esm --platform=node --outfile=exam-harness.mjs
// Run:    node exam-harness.mjs cases.json   (array of cases; prints JSON results)
//         node exam-harness.mjs              (built-in smoke test)
//
// Case shape:
//   { id, kind: "paste",     text, options? }            -> smartPaste + dashboard read-outs on the extracted TF
//   { id, kind: "solve",     fn, inputs, options?, matchKey? }  -> runSolver (a form)
//   { id, kind: "dashboard", tf }                        -> analyzeNumeric / analyzeSymbolic only
import { readFileSync } from "node:fs";
import { runSolver, smartPaste, analyzeNumeric, analyzeSymbolic, isSymbolicTf } from "./lcd-engine.js";

function dashboard(tf) {
  if (tf == null) return null;
  return isSymbolicTf(tf) ? { mode: "symbolic", ...analyzeSymbolic(tf) } : { mode: "numeric", ...analyzeNumeric(tf) };
}

function runCase(c) {
  try {
    if (c.kind === "paste") {
      const sp = smartPaste(c.text);
      const board = dashboard(sp.tf);
      // If options were extracted (or supplied) we can't auto-match in paste mode (by design);
      // record what the student would see.
      return { id: c.id, kind: c.kind, smartPaste: sp, dashboard: board };
    }
    if (c.kind === "solve") {
      const res = runSolver(c.fn, c.inputs || {}, c.options || "", c.matchKey || null);
      return { id: c.id, kind: c.kind, fn: c.fn, result: res };
    }
    if (c.kind === "dashboard") {
      return { id: c.id, kind: c.kind, dashboard: dashboard(c.tf) };
    }
    return { id: c.id, error: `unknown kind ${c.kind}` };
  } catch (e) {
    return { id: c.id, error: String(e && e.stack || e) };
  }
}

const arg = process.argv[2];
let cases;
if (arg) {
  cases = JSON.parse(readFileSync(arg, "utf8"));
} else {
  cases = [
    { id: "smoke-margins", kind: "solve", fn: "solve_margins", inputs: { G: "1/(s+1)**3" }, options: "1. GM=8\n2. GM=4\n3. GM=2", matchKey: "GM" },
    { id: "smoke-paste", kind: "paste", text: "A loop transfer function L(s) = K/(s(s+3)(s+10)). What gain K gives phase margin PM=40 degrees?\n1. K = 19.5\n2. K = 44\n3. K = 88" },
    { id: "smoke-dash", kind: "dashboard", tf: "12/((s+2)*(s+3))" },
  ];
}

const out = cases.map(runCase);
console.log(JSON.stringify(out, null, 2));
