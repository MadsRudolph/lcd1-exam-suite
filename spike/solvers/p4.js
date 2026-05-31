// P4 — 2nd-order specs. JS port of lcd1-solver/lcd_solver/solvers/p4_secondorder.py:
// the closed-form solve_2nd_order plus a numeric solve_K_for_spec.
import { parseTf } from "../numeric/parse.js";

function MpFromZeta(zeta) {
  if (zeta <= 0 || zeta >= 1) return 0.0;
  return Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta ** 2));
}

function zetaFromMp(Mp) {
  if (Mp <= 0) return 1.0;
  const L = Math.log(1 / Mp);
  return L / Math.sqrt(Math.PI ** 2 + L ** 2);
}

/**
 * Fill in whichever 2nd-order quantities are derivable.
 * Accept any subset of {Mp, zeta} and any subset of {omega_n, t_p, t_s_2pct}.
 * Inconsistent inputs throw.
 */
export function solve2ndOrder({
  Mp = null,
  zeta = null,
  omega_n = null,
  t_p = null,
  t_s_2pct = null,
} = {}) {
  // ---- damping ----
  if (Mp !== null && zeta !== null) {
    if (Math.abs(zetaFromMp(Mp) - zeta) > 1e-2) {
      throw new Error(`Mp=${Mp} and zeta=${zeta} are inconsistent`);
    }
  }
  if (zeta === null && Mp !== null) {
    zeta = zetaFromMp(Mp);
  } else if (zeta !== null && Mp === null) {
    Mp = MpFromZeta(zeta);
  } else if (zeta === null && Mp === null) {
    throw new Error("Provide at least one of {Mp, zeta}");
  }

  // ---- omega_n ----
  if (omega_n === null) {
    if (t_p !== null && zeta < 1) {
      omega_n = Math.PI / (t_p * Math.sqrt(1 - zeta ** 2));
    } else if (t_s_2pct !== null) {
      omega_n = 4.0 / (zeta * t_s_2pct);
    }
  }

  const out = { zeta, Mp, Mp_pct: 100 * Mp };
  if (omega_n === null) return out;

  out.omega_n = omega_n;
  out.omega_d = omega_n * Math.sqrt(Math.max(0.0, 1 - zeta ** 2));
  out.t_p = out.omega_d > 0 ? Math.PI / out.omega_d : Infinity;
  out.t_s_2pct = zeta > 0 ? 4.0 / (zeta * omega_n) : Infinity;
  out.t_s_5pct = zeta > 0 ? 3.0 / (zeta * omega_n) : Infinity;
  out.t_r = 1.8 / omega_n;
  out.omega_BW =
    omega_n *
    Math.sqrt(1 - 2 * zeta ** 2 + Math.sqrt(4 * zeta ** 4 - 4 * zeta ** 2 + 2));
  if (zeta < Math.SQRT2 / 2) {
    out.omega_r = omega_n * Math.sqrt(1 - 2 * zeta ** 2);
    out.M_r = 1 / (2 * zeta * Math.sqrt(1 - zeta ** 2));
  }
  return out;
}

/**
 * Closed-loop K boundary for a 2nd-order-reducible unity-feedback loop with a
 * proportional loop gain K, e.g. G = "K/(s*(s+5))". JS replacement for the
 * sympy-based solve_K_for_spec: substitute K=1 to recover the base plant P(s),
 * form the closed-loop char poly den_P + K*num_P numerically, and 1-D solve
 * zeta(K) = zeta_required (zeta decreases monotonically with K).
 *
 * spec ∈ {"Mp <= X", "zeta >= X"}. Returns the K boundary.
 */
export function solveKForSpec(G_str, spec) {
  const m = /^\s*(Mp|zeta)\s*(<=|>=)\s*([\d.eE+-]+)\s*$/.exec(spec);
  if (!m) throw new Error(`Unrecognised spec: ${spec}`);
  const [, varName, , valStr] = m;
  const val = parseFloat(valStr);
  const zetaReq = varName === "Mp" ? zetaFromMp(val) : val;

  // Base plant P(s): substitute the loop gain symbol K -> 1.
  const P = parseTf(G_str.replace(/\bK_?[Pp]?\b/g, "1"));
  const numP = P.num.slice();
  const denP = P.den.slice();
  if (denP.length !== 3) {
    throw new Error("solve_K_for_spec only handles 2nd-order-reducible closed loops");
  }
  // closed-loop denominator = den_P + K*num_P (num_P left-padded to den_P length)
  const padNum = new Array(denP.length).fill(0);
  for (let i = 0; i < numP.length; i++) padNum[denP.length - numP.length + i] = numP[i];

  const zetaOfK = (K) => {
    const a2 = denP[0] + K * padNum[0];
    const a1 = denP[1] + K * padNum[1];
    const a0 = denP[2] + K * padNum[2];
    return a1 / a2 / (2 * Math.sqrt(a0 / a2));
  };

  // zeta(K) is decreasing; bisect f(K)=zeta(K)-zetaReq on (lo, hi).
  let lo = 1e-9;
  let hi = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (zetaOfK(mid) > zetaReq) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Given a parametric closed-loop TF in (s, K) and one known 2nd-order metric,
 * return K plus the full metric table. Numeric replacement for the sympy version:
 * the closed-loop denominator is affine in K, so den(K) = den0 + K*(den1 - den0)
 * is recovered by parsing with K=0 and K=1; then a 1-D solve finds K.
 *
 * given_kind ∈ {Mp, zeta, omega_n, omega_d, t_p, t_s_2pct, K}.
 */
export function solveClosedLoop2ndOrder(closed_loop_str, given_kind, given_value) {
  const den0 = parseTf(closed_loop_str.replace(/\bK_?[Pp]?\b/g, "0")).den;
  const den1 = parseTf(closed_loop_str.replace(/\bK_?[Pp]?\b/g, "1")).den;
  if (den0.length !== 3 || den1.length !== 3) {
    throw new Error("solve_closed_loop_2nd_order requires a 2nd-order denominator");
  }
  const denOfK = (K) => den0.map((c, i) => c + K * (den1[i] - c));
  const wnZeta = (K) => {
    const [a2, a1, a0] = denOfK(K);
    const wn = Math.sqrt(a0 / a2);
    const zeta = a1 / a2 / (2 * wn);
    return { wn, zeta };
  };
  const metric = (K) => {
    const { wn, zeta } = wnZeta(K);
    const wd = wn * Math.sqrt(Math.max(0, 1 - zeta ** 2));
    switch (given_kind) {
      case "Mp": return MpFromZeta(zeta);
      case "zeta": return zeta;
      case "omega_n": return wn;
      case "omega_d": return wd;
      case "t_p": return Math.PI / wd;
      case "t_s_2pct": return 4 / (wn * zeta);
      default: throw new Error(`unknown given_kind ${given_kind}`);
    }
  };

  let K_val;
  if (given_kind === "K") {
    K_val = Number(given_value);
  } else {
    // Scan ascending K for a sign change in metric(K) - target, then bisect.
    const target = given_kind === "Mp" ? Number(given_value) : Number(given_value);
    const f = (K) => metric(K) - target;
    const grid = [];
    for (let e = -6; e <= 6; e += 0.02) grid.push(10 ** e);
    let lo = null, hi = null, flo = f(grid[0]);
    for (let i = 1; i < grid.length; i++) {
      const fi = f(grid[i]);
      if (Number.isFinite(flo) && Number.isFinite(fi) && flo * fi <= 0) { lo = grid[i - 1]; hi = grid[i]; break; }
      flo = fi;
    }
    if (lo === null) throw new Error(`No positive K satisfies ${given_kind}=${given_value}`);
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    K_val = 0.5 * (lo + hi);
  }

  const { wn, zeta } = wnZeta(K_val);
  const out = solve2ndOrder({ zeta, omega_n: wn });
  out.K = K_val;
  return out;
}

export { MpFromZeta, zetaFromMp };
