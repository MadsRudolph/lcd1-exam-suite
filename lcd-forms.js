// Declarative solver-form registry — JS port of lcd1-solver/lcd_solver/ui/forms.py.
// Every LCD1 solver's visible, editable fields live here. The block-diagram
// reducer form is intentionally omitted (use the Block Diagram mode instead).
//
// field.kind ∈ "str" | "float" | "int" | "tf" | "dropdown".

export const FORMS = [
  // ---- P1 ----
  {
    pattern: "P1", title: "P1 — ODE → TF", variant: "ODE → TF", fn: "solve_ode_to_tf", group: "source",
    resultKind: "TF",
    fields: [
      { name: "y_coeffs", label: "y coeffs (highest-deg first, comma-sep)", kind: "str", placeholder: "5, 1, 0.5", tooltip: "Coefficients of y and its derivatives, e.g. 5,1,0.5 for 5y''+y'+0.5y." },
      { name: "u_coeffs", label: "u coeffs (highest-deg first, comma-sep)", kind: "str", placeholder: "3", tooltip: "Coefficients of u, e.g. 3 for 3u." },
    ],
    explanation: "ODE → transfer function G(s)=U(s)/Y(s). Highest derivative first.",
  },
  {
    pattern: "P1", title: "P1 — State-space → TF", variant: "State-space → TF", fn: "solve_state_space_to_tf", group: "source",
    resultKind: "TF",
    fields: [
      { name: "A", label: "A", kind: "str", placeholder: "[[-1,0],[0,-1]]", tooltip: "State matrix A as nested lists." },
      { name: "B", label: "B", kind: "str", placeholder: "[[1],[9]]", tooltip: "Input column vector B." },
      { name: "C", label: "C", kind: "str", placeholder: "[[1,1]]", tooltip: "Output row vector C." },
      { name: "D", label: "D", kind: "str", placeholder: "[[0]]", default: "[[0]]", tooltip: "Direct term D." },
    ],
    explanation: "G(s) = C(sI−A)⁻¹B + D from state-space matrices.",
  },
  // ---- P2 ----
  {
    pattern: "P2", title: "P2 — Bode read-off", variant: "Compose G(s) from read-off", fn: "compose_tf_from_bode", group: "source",
    resultKind: "TF",
    fields: [
      { name: "dc_gain_dB", label: "DC gain (dB)", kind: "float", default: "0", placeholder: "6.02", tooltip: "DC gain in dB." },
      { name: "corners", label: "Corners: (ω, Δslope dB/dec)", kind: "str", default: "[(1,-20),(10,+20)]", placeholder: "[(1,-20),(10,+20)]", tooltip: "−20 per pole, +20 per zero, at each corner ω." },
      { name: "phase_events", label: "Phase events: (ω, Δφ°)", kind: "str", default: "[(1,-90),(10,+90)]", placeholder: "[(1,-90),(10,+90)]", tooltip: "Sign disambiguates LHP vs RHP." },
    ],
    explanation: "Reconstruct G(s) from Bode magnitude-slope corners and phase events.",
  },
  {
    pattern: "P2", title: "Bode read-off → margins", variant: "corners/phase → type · order · GM · PM · ω_c · ω_π", fn: "bode_readoff", group: "source",
    resultKind: "INFO",
    fields: [
      { name: "dc_gain_dB", label: "DC gain (dB) — low-frequency magnitude", kind: "float", default: "0", placeholder: "6.02", tooltip: "The magnitude of the open-loop Bode plot at low frequency, in dB." },
      { name: "corners", label: "Corners: (ω, Δslope dB/dec)", kind: "str", default: "[(1,-20),(10,-20)]", placeholder: "[(1,-20),(10,-20)]", tooltip: "Each magnitude-asymptote break you read off: −20 per pole, +20 per zero, at corner frequency ω." },
      { name: "phase_events", label: "Phase events: (ω, Δφ°)", kind: "str", default: "[(1,-90),(10,-90)]", placeholder: "[(1,-90),(10,-90)]", tooltip: "Phase contributions you read off; the sign disambiguates LHP vs RHP (NMP) factors." },
    ],
    explanation: "Read the asymptotes off the exam's Bode plot → reconstruct G(s) → get type, order, gain/phase margins and the crossover frequencies at once. The drawn Bode lets you check the reconstruction against the exam figure (and you can overlay the exam plot behind it).",
  },
  // ---- P3 ----
  {
    pattern: "P3", title: "P3 — Stable-K range", variant: "Stable-K range (handles RHP)", fn: "solve_stable_K_range", group: "design",
    resultKind: "RANGE",
    fields: [{ name: "G", label: "G(s)", kind: "tf", placeholder: "1 / (s+1)**3", tooltip: "Open-loop plant G(s)." }],
    explanation: "Range of proportional gain K for closed-loop stability (Routh for RHP plants).",
  },
  {
    pattern: "P3", title: "P3 — Margins", variant: "GM / PM / ω_pc / ω_gc", fn: "solve_margins",
    resultKind: "DICT", dictMatchKeys: ["GM", "GM_dB", "PM_deg", "omega_pc", "omega_gc"],
    fields: [{ name: "G", label: "G(s)", kind: "tf", placeholder: "25 / (s**3 + s**2 + 10*s)", tooltip: "Open-loop loop TF G(s)." }],
    explanation: "Gain/phase margins (linear & dB) and the crossover frequencies.",
  },
  // ---- P4 ----
  {
    pattern: "P4", title: "P4 — 2nd-order specs", variant: "Mp ↔ ζ ↔ ω_n/t_p/t_s", fn: "solve_2nd_order", group: "calc",
    resultKind: "DICT", dictMatchKeys: ["zeta", "Mp", "Mp_pct", "omega_n", "omega_d", "t_p", "t_s_2pct", "t_s_5pct", "t_r", "omega_BW"],
    fields: [
      { name: "Mp", label: "Mp (fraction)", kind: "str", placeholder: "0.17", tooltip: "Overshoot as a fraction (0.17 = 17%). Blank if unknown." },
      { name: "zeta", label: "ζ", kind: "str", placeholder: "0.5", tooltip: "Damping ratio. Blank if unknown." },
      { name: "omega_n", label: "ω_n (rad/s)", kind: "str", placeholder: "2.0", tooltip: "Natural frequency. Blank if unknown." },
      { name: "t_p", label: "t_p (s)", kind: "str", placeholder: "1.77", tooltip: "Peak time. Blank if unknown." },
      { name: "t_s_2pct", label: "t_s 2% (s)", kind: "str", placeholder: "4.0", tooltip: "2% settling time. Blank if unknown." },
    ],
    explanation: "Fill any subset (typically ζ or Mp plus one time/frequency metric); the rest are computed.",
  },
  {
    pattern: "P4", title: "P4 — Closed-loop + 1 spec", variant: "Closed-loop TF + 1 known metric", fn: "solve_closed_loop_2nd_order", group: "calc",
    resultKind: "DICT", dictMatchKeys: ["K", "zeta", "Mp", "Mp_pct", "omega_n", "omega_d", "t_p", "t_s_2pct", "t_s_5pct", "t_r", "omega_BW"],
    fields: [
      { name: "closed_loop_str", label: "Closed-loop TF in s, K", kind: "str", default: "K / (s**2 + 2*s + K)", placeholder: "K / (s**2 + 5*s + K)", tooltip: "The CLOSED-LOOP TF (note the trailing +K from unity feedback), not the forward plant." },
      { name: "given_kind", label: "Known metric", kind: "dropdown", default: "Mp", options: ["Mp", "zeta", "omega_n", "omega_d", "t_p", "t_s_2pct", "K"], tooltip: "Which metric is known." },
      { name: "given_value", label: "Value of that metric", kind: "float", default: "0.17", placeholder: "0.17", tooltip: "Numeric value of the known metric." },
    ],
    explanation: "Solve for K from one known metric and fill the full second-order table.",
  },
  {
    pattern: "P4", title: "P4 — K for transient spec", variant: "K boundary for Mp / ζ spec", fn: "solve_K_for_spec", group: "design",
    resultKind: "NUMBER",
    fields: [
      { name: "G_str", label: "G(s, K)", kind: "str", default: "K/(s*(s+5))", placeholder: "K/(s*(s+5))", tooltip: "Parametric loop-gain TF containing K." },
      { name: "spec", label: "Spec", kind: "str", default: "Mp <= 0.12", placeholder: "Mp <= 0.12  or  zeta >= 0.5", tooltip: "Inequality spec on Mp or zeta." },
    ],
    explanation: "K boundary that meets a transient spec (Mp ≤ … or ζ ≥ …).",
  },
  // ---- P5 ----
  {
    pattern: "P5", title: "P5 — K_P from ess", variant: "K_P from step ess (type-0)", fn: "solve_KP_from_ess", group: "calc",
    resultKind: "NUMBER",
    fields: [
      { name: "G0", label: "G(0)", kind: "float", placeholder: "0.4  (or -7.96 if dB)", tooltip: "Plant DC gain read off the Bode plot." },
      { name: "G0_unit", label: "unit", kind: "dropdown", default: "dB", options: ["dB", "linear"], tooltip: "Whether G(0) is in dB (magnitude Bode plot) or linear. Pick dB if you read it off a |G| in dB axis." },
      { name: "ess_target", label: "target ess", kind: "float", placeholder: "0.555", tooltip: "Target steady-state error under a unit step." },
    ],
    explanation: "K_P for a target steady-state error on a type-0 plant. G(0) may be dB or linear.",
  },
  {
    pattern: "P5", title: "P5 — ess table", variant: "type + Kp/Kv/Ka + ess", fn: "solve_ess_table",
    resultKind: "DICT", dictMatchKeys: ["type", "K_p", "K_v", "K_a", "ess_step", "ess_ramp", "ess_parabola"],
    fields: [{ name: "G", label: "G(s)", kind: "tf", placeholder: "5*(s+4) / (s**2 * (s+1) * (s+20))", tooltip: "Open-loop plant G(s). Fold a P-gain in as K*(...) if stated." }],
    explanation: "System type, error constants Kp/Kv/Ka, and ess for step/ramp/parabola.",
  },
  // ---- P6 ----
  {
    pattern: "P6", title: "P6 — PI-Lead (phase budget)", variant: "α / Ni / KP / β / design", fn: "solve_pi_lead", group: "design",
    resultKind: "DICT", dictMatchKeys: ["alpha", "M_D", "M_D_dB", "N_i", "K_P", "beta"],
    fields: [
      { name: "unknown", label: "solve for", kind: "dropdown", default: "alpha", options: ["alpha", "Ni", "KP", "beta", "design"], tooltip: "α/Ni/KP are PI-Lead modes; β is the Lag part; design = full design (φ_G computed from G(jω_c))." },
      { name: "gamma_M_deg", label: "γ_M (°)", kind: "float", default: "75", placeholder: "75", tooltip: "Target phase margin." },
      { name: "phi_G_deg", label: "φ_G (°) — read off Bode at ω_c", kind: "str", placeholder: "-112.77", tooltip: "Plant phase at the crossover frequency. Read it off the Bode phase plot (not needed in KP/design modes)." },
      { name: "N_i", label: "N_i", kind: "str", default: "5", placeholder: "5", tooltip: "PI frequency ratio N_i." },
      { name: "alpha", label: "α (if not the unknown)", kind: "str", placeholder: "0.0918", tooltip: "Lead attenuation α — an input in Ni/KP/β modes." },
      { name: "omega_c", label: "ω_c (rad/s)", kind: "str", placeholder: "6.4", tooltip: "Design crossover frequency (KP/design modes)." },
      { name: "G", label: "G(s) — KP/design modes", kind: "tf", placeholder: "900 / ((0.25*s+1)*(s**2+50*s+3000))", tooltip: "Plant TF (only KP and design modes)." },
    ],
    explanation: "Phase-budget design: −180 + γ_M = φ_G + φ_Lead + φ_PI. φ_G usually comes off the Bode phase plot.",
  },
  {
    pattern: "P6", title: "P6 — P for PM", variant: "K_P for target PM", fn: "solve_P_for_PM", group: "design",
    resultKind: "DICT", dictMatchKeys: ["K_P", "omega_c"],
    fields: [
      { name: "G", label: "G(s)", kind: "tf", placeholder: "1 / (s*(s+2.1))", tooltip: "Open-loop plant G(s)." },
      { name: "target_PM_deg", label: "target PM (°)", kind: "float", default: "45", placeholder: "45", tooltip: "Target phase margin." },
    ],
    explanation: "Proportional gain K_P for a target phase margin, with the resulting ω_c.",
  },
  // ---- P7 ----
  {
    pattern: "P7", title: "P7 — Feedforward form", variant: "Pick proper-fast F_d", fn: "pick_feedforward_form", group: "calc",
    resultKind: "PICK",
    fields: [
      { name: "n_lags", label: "n (first-order lags)", kind: "int", default: "3", placeholder: "3", tooltip: "Number of plant lags." },
      { name: "D_order", label: "Disturbance dynamics order", kind: "int", default: "2", placeholder: "2", tooltip: "Order of the disturbance dynamics." },
    ],
    explanation: "Structure of a realisable feed-forward controller F_d(s).",
  },
  // ---- Analysis (general-TF tools; also the Block Diagram bridge landing spots) ----
  {
    pattern: "Analysis", title: "Characterize TF", variant: "poles, ζ, ωₙ, step specs", fn: "characterize",
    resultKind: "INFO",
    fields: [{ name: "G", label: "G(s) (closed-loop)", kind: "tf", placeholder: "1/(s**2+2*s+2)", tooltip: "A closed-loop TF to characterize: poles, DC gain, and 2nd-order specs." }],
    explanation: "Poles/zeros, DC gain, and — for a 2nd-order TF — ζ, ωₙ and the full second-order table.",
  },
  {
    pattern: "Analysis", title: "Bandwidth", variant: "−3 dB bandwidth", fn: "bandwidth",
    resultKind: "NUMBER",
    fields: [{ name: "G", label: "G(s) (closed-loop)", kind: "tf", placeholder: "1/(s+2)", tooltip: "Closed-loop TF; bandwidth is the −3 dB point from DC." }],
    explanation: "Closed-loop bandwidth: the frequency where |G| drops 3 dB below its DC value.",
  },
  {
    pattern: "Analysis", title: "Settling time", variant: "dominant-pole t_s", fn: "dominant_settling",
    resultKind: "INFO",
    fields: [{ name: "G", label: "G(s) (closed-loop)", kind: "tf", placeholder: "1/((s+1)*(s+10))", tooltip: "Stable closed-loop TF; settling from the dominant pole." }],
    explanation: "Dominant-pole settling time (2% and 5%) of a stable closed-loop TF.",
  },
  {
    pattern: "Analysis", title: "Closed-loop stability", variant: "Nyquist / RHP-pole count", fn: "analyze_stability",
    resultKind: "INFO",
    fields: [
      { name: "G", label: "G(s) (open-loop)", kind: "tf", placeholder: "(s+10)/((s-1)*(s+5))", tooltip: "Open-loop plant; stability of 1 + K·G is checked by counting closed-loop RHP poles." },
      { name: "K", label: "K", kind: "float", default: "1", placeholder: "1", tooltip: "Loop gain." },
    ],
    explanation: "Closed-loop stability of 1 + K·G: open-loop and closed-loop RHP-pole counts (handles RHP plants).",
  },
  {
    pattern: "Analysis", title: "Symbolic loop analysis", variant: "closed-loop · type · order · K₀ · ess (in symbols)", fn: "symbolic_analysis",
    resultKind: "INFO",
    fields: [
      { name: "L", label: "Loop gain L(s) = C·G·H (parameters kept symbolic)", kind: "str", placeholder: "Kp*b*c/(s*(tau*s+1))", tooltip: "The open-loop / loop-gain transfer function in s with literal parameters (a, b, K, Kp, tau…). Or send it straight from a drawn block diagram. Returns the closed-loop T = L/(1+L), system type, order, static loop gain K₀, and the steady-state error to a step and a ramp — all in symbols." },
    ],
    explanation: "From the loop gain L(s): the closed-loop transfer function T = L/(1+L), system type (poles at the origin), order, static loop gain K₀ = lim s^N·L, and the steady-state error to a unit step (1/(1+K₀) for type 0, 0 for type ≥ 1) and unit ramp (1/Kv) — all computed symbolically. One drawn diagram → every grouped sub-answer.",
  },
  {
    pattern: "Analysis", title: "Disturbance ess", variant: "step at a named node", fn: "symbolic_disturbance_ess",
    resultKind: "INFO",
    fields: [
      { name: "Gd", label: "Gd(s) — injection node → output (loop open)", kind: "str", placeholder: "a", tooltip: "Transfer function from the disturbance injection point to the output, with the loop opened." },
      { name: "L", label: "L(s) — loop gain seen at that node", kind: "str", placeholder: "a*k*(s+b)/(s^2+c*s+1)", tooltip: "The loop gain (return ratio) around the injection node, parameters kept symbolic." },
    ],
    explanation: "Steady-state error from a unit-step disturbance: e_dss = −lim_{s→0} Gd/(1+L). Returns 0 when an integrator in the loop rejects the disturbance.",
  },
  {
    pattern: "Analysis", title: "Solve for a symbol", variant: "a/(1+a)=2/3 → a=2", fn: "solve_symbol", group: "calc",
    resultKind: "INFO",
    fields: [
      { name: "equation", label: "Equation (one '=', unknown anywhere)", kind: "str", placeholder: "1/(1+0.4*K1) = 0.4", tooltip: "A single-unknown static equation in the symbol named below — e.g. a/(1+a)=2/3, or 1/(1+0.4*K1)=0.4. Linear unknowns solve exactly; numeric quadratics return both roots." },
      { name: "symbol", label: "Solve for", kind: "str", placeholder: "K1", tooltip: "The unknown symbol to solve for." },
    ],
    explanation: "Solves a single-unknown equation symbolically (an ess or gain relation read off the loop). Linear unknowns give an exact closed form; numeric quadratics give both roots.",
  },
  {
    pattern: "Analysis", title: "Linearize → TF", variant: "ẋ=f(x,u) at an operating point", fn: "linearize_tf", group: "calc",
    resultKind: "INFO",
    fields: [
      { name: "f", label: "f(x,u) in ẋ = f(x,u)", kind: "str", placeholder: "c*b*u - a*x", tooltip: "Right-hand side of a first-order nonlinear state equation — polynomial/rational in the state and input symbols and any literal parameters." },
      { name: "stateVar", label: "state symbol", kind: "str", default: "x", placeholder: "x", tooltip: "The state variable name." },
      { name: "inputVar", label: "input symbol", kind: "str", default: "u", placeholder: "u", tooltip: "The input variable name." },
      { name: "point", label: "operating point", kind: "str", placeholder: "x=0, u=0", tooltip: "Operating values for the state and input, e.g. x=0, u=2. Every other parameter stays symbolic." },
    ],
    explanation: "Small-signal transfer function G(s)=ΔX/ΔU = (∂f/∂u)/(s − ∂f/∂x) at the operating point. Polynomial/rational nonlinearities only (no sin/exp/√).",
  },
  {
    pattern: "Analysis", title: "Symbolic equivalence", variant: "are these answers algebraically equal?", fn: "symbolic_equiv",
    resultKind: "INFO",
    fields: [
      { name: "ref", label: "Reference TF (in s, parameters like K, a kept symbolic)", kind: "str", placeholder: "K/(s^2 + (a+1)*s + 2*K + a)", tooltip: "The transfer function you computed — or send one straight from the Block Diagram. Parameters (K, a, ω…) stay symbolic. Paste the candidate answers in the options box below; each is tested for exact algebraic equality." },
    ],
    explanation: "Tests whether each multiple-choice answer is algebraically identical to your reference TF — even when written in a different but equal form (expanded, reordered, or scaled by a constant). Put the candidate answers in the options box.",
  },
  {
    pattern: "Analysis", title: "Plot transfer function", variant: "step · Bode · Nyquist · pole-zero", fn: "plot_tf",
    resultKind: "INFO",
    fields: [{ name: "G", label: "G(s)", kind: "tf", placeholder: "25/(s**2+3*s+25)", tooltip: "Any transfer function to plot: step response, Bode, Nyquist and pole-zero map." }],
    explanation: "Draws the unit step response, Bode diagram, Nyquist plot and pole-zero map of the transfer function, annotated with the key values.",
  },
  {
    pattern: "P7", title: "P7 — Nested ess", variant: "K from nested-loop ess", fn: "solve_nested_ess", group: "calc",
    resultKind: "NUMBER",
    fields: [
      { name: "architecture", label: "architecture", kind: "dropdown", default: "two_KP_same", options: ["two_KP_same", "nested_K1_K2"], tooltip: "Nested-loop architecture." },
      { name: "G0", label: "G(0) — two_KP_same", kind: "str", placeholder: "0.75", tooltip: "Inner plant DC gain." },
      { name: "ess_target", label: "ess target — two_KP_same", kind: "str", placeholder: "0.25", tooltip: "Target steady-state error." },
      { name: "eps1", label: "eps1 — nested_K1_K2", kind: "str", placeholder: "0.4", tooltip: "Inner-loop error coefficient." },
      { name: "eps2", label: "eps2 — nested_K1_K2", kind: "str", placeholder: "0.05", tooltip: "Outer-loop error coefficient." },
      { name: "G2_0", label: "G2(0) — nested_K1_K2", kind: "str", placeholder: "0.4", tooltip: "Inner plant DC gain G2(0)." },
    ],
    explanation: "Gains for nested control loops to hit an ess target.",
  },
  // ---- New analysis tools ----
  {
    pattern: "Analysis", title: "Evaluate G(jω)", variant: "|G| & ∠G at a frequency", fn: "evaluate_gjw", group: "design",
    resultKind: "INFO",
    fields: [
      { name: "G", label: "G(s)", kind: "tf", placeholder: "1/(s*(s+2.1))", tooltip: "Open-loop TF — reused from the system box." },
      { name: "omega", label: "ω (rad/s)", kind: "str", placeholder: "6.4", tooltip: "Frequency to evaluate at — e.g. the crossover ω_c when reading φ_G for a controller design." },
      { name: "target_mag_dB", label: "…or find ω where |G| = (dB)", kind: "str", placeholder: "0", tooltip: "Optional: solve for the frequency at this magnitude (0 dB = gain crossover). Leave blank to skip." },
      { name: "target_phase_deg", label: "…or find ω where ∠G = (°)", kind: "str", placeholder: "-180", tooltip: "Optional: solve for the frequency at this phase (-180° = phase crossover). Leave blank to skip." },
    ],
    explanation: "Read |G(jω)| (dB and linear) and ∠G(jω) at any frequency — the hand-calculation behind finding K_P or checking a crossover. Optionally solve for the ω at a target magnitude or phase.",
  },
  {
    pattern: "P4", title: "From a step-response plot", variant: "read-offs → ζ, ω_n, ω_d", fn: "second_order_from_plot", group: "calc",
    resultKind: "INFO",
    fields: [
      { name: "y_steady", label: "steady-state value (off the plot)", kind: "str", placeholder: "2.0", tooltip: "Final settled value of the step response. With the peak it gives the overshoot → ζ." },
      { name: "y_peak", label: "peak value (off the plot)", kind: "str", placeholder: "2.9", tooltip: "Maximum value of the step response." },
      { name: "period", label: "oscillation period T (s)", kind: "str", placeholder: "0.21", tooltip: "Period of the damped oscillation read off the time axis. ω_d = 2π/T." },
      { name: "t_p", label: "peak time t_p (s) — alt. to period", kind: "str", placeholder: "1.77", tooltip: "Time of the first peak. t_p = π/ω_d. Use this OR the period." },
    ],
    explanation: "Turn step-response read-offs into second-order parameters: peak & steady values → overshoot → ζ; period or peak time → ω_d; then ω_n = ω_d/√(1−ζ²).",
  },
  {
    pattern: "Analysis", title: "Initial / final value", variant: "IVT & FVT on F(s)", fn: "value_theorems", group: "calc",
    resultKind: "INFO",
    fields: [
      { name: "F", label: "F(s) — the s-domain signal (E(s), Y(s)…)", kind: "tf", placeholder: "4*(s+50)/(s*(s**2+30*s+200))", tooltip: "The Laplace-domain expression to take limits of. If it is a plant that still needs an input, choose one below." },
      { name: "input", label: "apply input", kind: "dropdown", default: "none", options: ["none", "step", "ramp", "impulse"], tooltip: "Multiply F by the input: step = 1/s, ramp = 1/s², impulse = 1. Use 'none' if F is already the full signal." },
    ],
    explanation: "Initial-value theorem y(0⁺)=lim_{s→∞} sF(s) and final-value theorem y(∞)=lim_{s→0} sF(s). FVT is the quick route to a steady-state value or error (e.g. lim_{s→0} sE(s)).",
  },
];

export const formByFn = (fn) => FORMS.find((f) => f.fn === fn) || null;

export const formsInGroup = (g) => FORMS.filter((f) => f.group === g);
