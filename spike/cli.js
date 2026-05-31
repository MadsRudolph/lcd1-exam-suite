#!/usr/bin/env node
// LCD1 Solver — JS spike CLI. Run a ported solver from the terminal.
//   node cli.js <command> [args]   |   node cli.js help
import { parseTf } from "./numeric/parse.js";
import { Complex } from "./numeric/complex.js";
import { solveMargins, solveStableKRange } from "./solvers/p3.js";
import { solve2ndOrder } from "./solvers/p4.js";
import { solveKPFromEss, solveEssTable } from "./solvers/p5.js";
import { solvePiLead, solvePForPM } from "./solvers/p6.js";
import { composeTfFromBode } from "./solvers/p2.js";
import { solveNestedEss, pickFeedforwardForm } from "./solvers/p7.js";
import { parseQuestion } from "./smart-paste.js";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const cmd = argv[0];

// ---- tiny arg helpers ----
function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}
const num = (v) => (v === undefined ? null : Number(v));
const fmt = (x) => {
  if (x === Infinity) return "∞";
  if (x === -Infinity) return "-∞";
  if (Number.isNaN(x)) return "NaN";
  if (typeof x !== "number") return String(x);
  return Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0)
    ? x.toExponential(4)
    : Number(x.toPrecision(6)).toString();
};
const cplx = (c) =>
  `${fmt(c.re)}${c.im >= 0 ? "+" : "-"}${fmt(Math.abs(c.im))}j`;

function describeTf(G) {
  const poles = G.poles();
  const zeros = G.zeros();
  const integrator = poles.some((p) => p.abs() < 1e-9);
  const dc = integrator ? NaN : G.dcGain();
  return {
    poles,
    zeros,
    dc_gain_linear: dc,
    dc_gain_dB: Number.isNaN(dc) ? NaN : 20 * Math.log10(Math.abs(dc)),
    has_rhp_pole: poles.some((p) => p.re > 1e-9),
  };
}

const line = (k, v) => console.log(`  ${k.padEnd(14)} ${v}`);

function commands() {
  const G = (s) => parseTf(s);
  switch (cmd) {
    case "tf": {
      const d = describeTf(G(argv[1]));
      console.log(`G(s) = ${argv[1]}`);
      line("poles", d.poles.map(cplx).join(", "));
      line("zeros", d.zeros.length ? d.zeros.map(cplx).join(", ") : "(none)");
      line("DC gain", `${fmt(d.dc_gain_linear)}  (${fmt(d.dc_gain_dB)} dB)`);
      line("RHP pole?", d.has_rhp_pole ? "yes (unstable)" : "no");
      break;
    }
    case "margins": {
      const m = solveMargins(G(argv[1]));
      console.log(`Margins of ${argv[1]}`);
      line("GM", `${fmt(m.GM)}  (${fmt(m.GM_dB)} dB)`);
      line("PM", `${fmt(m.PM_deg)}°`);
      line("ω_pc", fmt(m.omega_pc));
      line("ω_gc", fmt(m.omega_gc));
      break;
    }
    case "stable-k": {
      const r = solveStableKRange(G(argv[1]));
      console.log(`Stable-K range of ${argv[1]}`);
      line("K range", `(${fmt(r.low)}, ${fmt(r.high)})`);
      break;
    }
    case "ess": {
      const t = solveEssTable(G(argv[1]));
      console.log(`Steady-state error of ${argv[1]} (unity feedback)`);
      line("system type", t.type);
      line("Kp/Kv/Ka", `${fmt(t.K_p)} / ${fmt(t.K_v)} / ${fmt(t.K_a)}`);
      line("ess step", fmt(t.ess_step));
      line("ess ramp", fmt(t.ess_ramp));
      line("ess parabola", fmt(t.ess_parabola));
      break;
    }
    case "kp-ess": {
      const [G0, unit, ess] = [argv[1], argv[2], argv[3]];
      line("K_P", fmt(solveKPFromEss(Number(G0), unit, Number(ess))));
      break;
    }
    case "second-order": {
      const f = flags(argv.slice(1));
      const out = solve2ndOrder({
        Mp: num(f.Mp),
        zeta: num(f.zeta),
        omega_n: num(f.wn),
        t_p: num(f.tp),
        t_s_2pct: num(f.ts),
      });
      console.log("2nd-order metrics");
      for (const [k, v] of Object.entries(out)) line(k, fmt(v));
      break;
    }
    case "pi-lead": {
      const f = flags(argv.slice(1));
      const res = solvePiLead({
        unknown: f.unknown,
        omega_c: num(f.wc),
        gamma_M_deg: num(f.gammaM),
        phi_G_deg: num(f.phiG),
        N_i: num(f.Ni),
        alpha: num(f.alpha),
        G: f.G ? G(f.G) : null,
      });
      line(f.unknown, fmt(res));
      break;
    }
    case "p-for-pm": {
      const out = solvePForPM(G(argv[1]), Number(argv[2]));
      console.log(`P-controller for PM=${argv[2]}° on ${argv[1]}`);
      line("K_P", fmt(out.K_P));
      line("ω_c", fmt(out.omega_c));
      break;
    }
    case "bode": {
      const f = flags(argv.slice(1));
      const pairs = (s) =>
        (s || "")
          .split(",")
          .filter(Boolean)
          .map((p) => p.split(":").map(Number));
      const out = composeTfFromBode({
        dc_gain_dB: Number(f.dc),
        corners: pairs(f.corners),
        phase_events: pairs(f.phase),
      });
      console.log("Composed G(s) from Bode read-off");
      line("poles", out.poles.map(fmt).join(", ") || "(none)");
      line("zeros", out.zeros.map(fmt).join(", ") || "(none)");
      line("gain", fmt(out.gain));
      line("DC gain", fmt(out.dc_gain_linear));
      break;
    }
    case "nested-ess": {
      const f = flags(argv.slice(1));
      const res = solveNestedEss({
        architecture: f.arch,
        G0: num(f.G0),
        ess_target: num(f.ess),
        eps1: num(f.eps1),
        eps2: num(f.eps2),
        G2_0: num(f.G2),
      });
      line("result", fmt(res));
      break;
    }
    case "question": {
      const f = flags(argv.slice(1));
      const text = f.file ? readFileSync(f.file, "utf8") : f._.join(" ");
      if (!text.trim()) return usage();
      runQuestion(text);
      break;
    }
    default:
      usage();
  }
}

// Route pasted exam text and solve it when the solver is ported in this spike.
function runQuestion(text) {
  const r = parseQuestion(text);
  if (!r) {
    console.log("Could not match this question to a solver pattern.");
    return;
  }
  console.log(`Routed to: ${r.solver_function}`);
  if (Object.keys(r.inputs).length) {
    console.log("Extracted inputs:");
    for (const [k, v] of Object.entries(r.inputs)) line(k, v);
  }
  if (r.options) console.log(`Options:\n  ${r.options.split("\n").join("\n  ")}`);
  console.log("Result:");

  const G = () => parseTf(r.inputs.G);
  try {
    switch (r.solver_function) {
      case "solve_stable_K_range": {
        const x = solveStableKRange(G());
        line("K range", `(${fmt(x.low)}, ${fmt(x.high)})`);
        break;
      }
      case "solve_margins": {
        const m = solveMargins(G());
        line("GM", `${fmt(m.GM)} (${fmt(m.GM_dB)} dB)`);
        line("PM", `${fmt(m.PM_deg)}°`);
        break;
      }
      case "solve_P_for_PM": {
        const out = solvePForPM(G(), Number(r.inputs.target_PM_deg));
        line("K_P", fmt(out.K_P));
        line("ω_c", fmt(out.omega_c));
        break;
      }
      case "solve_ess_table": {
        const t = solveEssTable(G());
        line("system type", t.type);
        line("ess step/ramp/par", `${fmt(t.ess_step)} / ${fmt(t.ess_ramp)} / ${fmt(t.ess_parabola)}`);
        break;
      }
      case "solve_KP_from_ess": {
        const i = r.inputs;
        if (i.G0 !== undefined && i.ess_target !== undefined)
          line("K_P", fmt(solveKPFromEss(Number(i.G0), i.G0_unit, Number(i.ess_target))));
        else line("note", "need G(0) and ess from the text to solve K_P");
        break;
      }
      case "solve_pi_lead": {
        const i = r.inputs;
        if (["alpha", "Ni", "KP"].includes(i.unknown)) {
          const res = solvePiLead({
            unknown: i.unknown,
            omega_c: num(i.omega_c),
            gamma_M_deg: num(i.gamma_M_deg),
            phi_G_deg: num(i.phi_G_deg),
            N_i: num(i.N_i),
            alpha: num(i.alpha),
            G: i.G ? parseTf(i.G) : null,
          });
          line(i.unknown, fmt(res));
        } else {
          line("note", `PI-Lead '${i.unknown}' mode not ported in this spike (phi_G usually read off the Bode plot)`);
        }
        break;
      }
      case "pick_feedforward_form": {
        const out = pickFeedforwardForm({ n_lags: num(r.inputs.n_lags) ?? 3 });
        line("option", out.option_label);
        line("filter order", out.filter_order);
        line("τ_f bound", out.tau_f_bound);
        break;
      }
      default:
        line("note", `'${r.solver_function}' is routed but not ported in this spike (P1/symbolic/figure solver)`);
    }
  } catch (e) {
    line("note", `routed, but missing data to solve: ${e.message}`);
  }
}

function usage() {
  console.log(`LCD1 Solver (JS spike) — usage:

  node cli.js tf            "<G>"                         describe a transfer function
  node cli.js margins       "<G>"                         gain/phase margins
  node cli.js stable-k      "<G>"                         stable-K range
  node cli.js ess           "<G>"                         steady-state error table
  node cli.js kp-ess        <G0> <linear|dB> <ess>        K_P from ess
  node cli.js p-for-pm      "<G>" <PM_deg>                P-controller for a phase margin
  node cli.js second-order  --zeta 0.5 [--wn 10 | --Mp .1 | --tp .3 | --ts 0.8]
  node cli.js pi-lead       --unknown <alpha|Ni|KP> --gammaM 75 --phiG -112.77 --Ni 5 [--alpha .01] [--G "<G>"]
  node cli.js bode          --dc 6.02 --corners "1:-20,2:20" --phase "1:-90,2:-90"
  node cli.js nested-ess    --arch two_KP_same --G0 0.75 --ess 0.25
  node cli.js question      "<paste exam text>"   |   --file question.txt

Transfer functions use s, *, /, +, -, ** (or ^). Example: "900/((0.25*s+1)*(s**2+50*s+3000))"`);
}

try {
  if (!cmd || cmd === "help" || cmd === "--help") usage();
  else commands();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
