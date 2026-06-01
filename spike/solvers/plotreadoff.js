// Convert what you read off a step-response plot into second-order parameters.
// Mirrors the exam workflow: read the steady & peak values (→ overshoot → ζ) and
// the damped oscillation period or peak time (→ ω_d), then back out ω_n.
//   Test Exam Q3: period T≈0.21 s → ω_d=2π/T≈30 rad/s
//   S20 Q5:       y_ss=2.0, y_peak=2.9 → M_p=0.45 → ζ≈0.246
const num = (v) => (v == null || v === "" ? null : Number(v));

export function secondOrderFromReadoff(inp = {}) {
  const out = {};
  const ys = num(inp.y_steady), yp = num(inp.y_peak);
  const period = num(inp.period), tp = num(inp.t_p);
  let zeta = num(inp.zeta);

  // Overshoot → ζ.  M_p = (peak − steady)/steady,  ζ = −ln M_p / √(π² + ln²M_p)
  if (ys != null && yp != null && ys !== 0) {
    const Mp = (yp - ys) / Math.abs(ys);
    out.Mp = Mp;
    out.Mp_pct = Mp * 100;
    if (Mp > 0 && Mp < 1) {
      const lnMp = Math.log(Mp);
      zeta = -lnMp / Math.sqrt(Math.PI ** 2 + lnMp ** 2);
    }
  }
  if (zeta != null) out.zeta = zeta;

  // Damped frequency from the oscillation period (T = 2π/ω_d) or peak time (t_p = π/ω_d).
  let omega_d = null;
  if (period != null && period !== 0) omega_d = (2 * Math.PI) / period;
  else if (tp != null && tp !== 0) omega_d = Math.PI / tp;
  if (omega_d != null) out.omega_d = omega_d;

  // Natural frequency. ω_n = ω_d / √(1 − ζ²); for light damping ω_n ≈ ω_d.
  if (omega_d != null) {
    out.omega_n = zeta != null && zeta < 1 ? omega_d / Math.sqrt(1 - zeta * zeta) : omega_d;
  }
  return out;
}
