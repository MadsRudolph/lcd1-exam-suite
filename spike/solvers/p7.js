// P7 — Theory: feedforward form picker + nested-loop ess.
// JS port of lcd1-solver/lcd_solver/solvers/p7_theory.py.

/**
 * Theory Q8: for n first-order lags with disturbance dynamics D(s) of order
 * D_order, the realisable feedforward is
 *   F_d(s) = D(s) * prod(tau_k s + 1) / (tau_f s + 1)^(n - D_order),  tau_f <= min(tau_k)/5.
 * Corresponds to option (d).
 */
export function pickFeedforwardForm({ n_lags, D_order = 2 } = {}) {
  const filter_order = Math.max(0, n_lags - D_order);
  return {
    option_label: "d",
    filter_order,
    formula_latex:
      `F_d(s) = \\frac{D(s) \\prod_{k=1}^n (\\tau_k s + 1)}` +
      `{(\\tau_f s + 1)^{${filter_order}}}`,
    tau_f_bound: "tau_f <= min(tau_k)/5",
    explanation:
      "Improper by (n - D_order); appended low-pass filter makes the controller " +
      "realisable. Filter tau_f must be fast (<= min(tau_k)/5) so it does not " +
      "attenuate genuine plant dynamics.",
  };
}

/**
 * 'two_KP_same' (Q9):  e(0) = (1 + K_P G0) / (1 + K_P G0 + K_P^2 G0); solve for K_P.
 * 'nested_K1_K2' (Q6): K_2 = (1 - eps2) / (eps2 * G2_0 * (1 - eps1)).
 */
export function solveNestedEss({ architecture, ...kw } = {}) {
  if (architecture === "two_KP_same") {
    const { G0, ess_target: ess } = kw;
    // ess*G0*K^2 + G0*(ess-1)*K + (ess-1) = 0
    const a = ess * G0;
    const b = G0 * (ess - 1);
    const c = ess - 1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) throw new Error("No real K_P satisfies this nested-loop ess spec");
    const roots = [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)];
    const positives = roots.filter((r) => r > 0);
    if (!positives.length) throw new Error("No positive K_P root");
    return Math.max(...positives);
  }

  if (architecture === "nested_K1_K2") {
    const { eps1, eps2, G2_0 } = kw;
    return (1 - eps2) / (eps2 * G2_0 * (1 - eps1));
  }

  throw new Error(`unknown architecture '${architecture}'`);
}
