// P4 — 2nd-order specs. JS port of lcd1-solver/lcd_solver/solvers/p4_secondorder.py
// (the pure closed-form part: solve_2nd_order). Symbolic K-extraction is ported
// separately once the numeric core lands.

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

export { MpFromZeta, zetaFromMp };
