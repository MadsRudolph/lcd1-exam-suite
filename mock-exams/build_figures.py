"""
Generate all figures for Mock Exam 1 and print the reference computations used
to fix the answer key. Uses python-control / matplotlib / numpy (same stack the
real LCD1 solution plots were made with).

Run:  python build_figures.py
Outputs PNGs into ./figures/ and prints a REFERENCE block for cross-checking.
"""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import control as ct

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, "figures")
os.makedirs(FIG, exist_ok=True)

plt.rcParams.update({
    "figure.dpi": 130,
    "savefig.dpi": 130,
    "font.size": 10,
    "axes.grid": True,
    "grid.alpha": 0.35,
    "lines.linewidth": 1.6,
})

def save(fig, name):
    p = os.path.join(FIG, name)
    fig.tight_layout()
    fig.savefig(p, bbox_inches="tight")
    plt.close(fig)
    print("  wrote", name)


# ---------------------------------------------------------------------------
# Q4 - pick the step response of G = 25/(s^2 + 3s + 25)  (zeta=0.3, wn=5)
# ---------------------------------------------------------------------------
def q4_step_options():
    print("\n[Q4] step-response pick-a-plot  G = 25/(s^2+3s+25)")
    wn = 5.0
    cases = {
        "a": (0.30, "zeta=0.30 (CORRECT)"),   # ~37% overshoot
        "b": (0.70, "zeta=0.70"),             # ~4.6% overshoot (near distractor)
        "c": (0.00, "zeta=0.00"),             # undamped
        "d": (1.50, "zeta=1.50"),             # overdamped
    }
    t = np.linspace(0, 4, 800)
    for key, (z, label) in cases.items():
        G = ct.tf([wn*wn], [1, 2*z*wn, wn*wn])
        tt, yy = ct.step_response(G, T=t)
        fig, ax = plt.subplots(figsize=(3.2, 2.4))
        ax.plot(tt, yy, color="#c0392b")
        ax.set_xlabel("Time (s)"); ax.set_ylabel("Amplitude")
        ax.set_title("Step Response", fontsize=9)
        ax.set_ylim(-0.05, 2.05 if z == 0 else max(1.6, yy.max()*1.1))
        save(fig, f"q4_step_{key}.png")
        if z > 0:
            Mp = np.exp(-np.pi*z/np.sqrt(1-z*z))
            print(f"    {key}: {label}  Mp={Mp*100:.1f}%")
        else:
            print(f"    {key}: {label}  sustained oscillation")


# ---------------------------------------------------------------------------
# Q6 - Bode read-off -> compose G.  G = 200/((s+2)(s+10))  (DC=20dB=10)
# ---------------------------------------------------------------------------
def q6_bode_readoff():
    print("\n[Q6] Bode read-off  G = 200/((s+2)(s+10))  DC=10 (20 dB)")
    G = ct.tf([200], np.polymul([1, 2], [1, 10]))
    w = np.logspace(-1, 3, 700)
    mag, phase, omega = ct.frequency_response(G, w)
    magdb = 20*np.log10(mag)
    phdeg = np.degrees(np.unwrap(phase))
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(4.6, 3.6), sharex=True)
    a1.semilogx(omega, magdb, color="#1f4e79"); a1.set_ylabel("Magnitude (dB)")
    a1.set_title("Bode Diagram", fontsize=9)
    a2.semilogx(omega, phdeg, color="#1f4e79"); a2.set_ylabel("Phase (deg)")
    a2.set_xlabel("Frequency (rad/s)")
    save(fig, "q6_bode.png")
    print(f"    DC magnitude = {magdb[0]:.2f} dB  (linear {mag[0]:.2f})")


# ---------------------------------------------------------------------------
# Q7 - pick the Bode plot.  correct: 500(s+10)/(s(s^2+6s+900))
#   integrator + real zero -10 + lightly damped poles wn=30 zeta=0.1
# ---------------------------------------------------------------------------
def q7_bode_options():
    print("\n[Q7] Bode pick-a-plot")
    opts = {
        "a": (ct.tf([500, 5000], np.polymul([1, 0], [1, 6, 900])),
              "CORRECT: integrator, zero -10, complex poles wn=30 z=0.1"),
        "b": (ct.tf([500, 5000], [1, 6, 900]),
              "no integrator"),
        "c": (ct.tf([500, -5000], np.polymul([1, 0], [1, 6, 900])),
              "RHP zero +10"),
        "d": (ct.tf([500, 5000], np.polymul([1, 0], [1, 60, 900])),
              "heavily damped poles z=1.0 (no peak)"),
    }
    w = np.logspace(-1, 3, 800)
    for key, (G, label) in opts.items():
        mag, phase, omega = ct.frequency_response(G, w)
        fig, (a1, a2) = plt.subplots(2, 1, figsize=(3.3, 2.9), sharex=True)
        a1.semilogx(omega, 20*np.log10(mag), color="#1f4e79")
        a1.set_ylabel("Mag (dB)"); a1.set_title("Bode Diagram", fontsize=8)
        a2.semilogx(omega, np.degrees(np.unwrap(phase)), color="#1f4e79")
        a2.set_ylabel("Phase (deg)"); a2.set_xlabel("Frequency (rad/s)")
        save(fig, f"q7_bode_{key}.png")
        print(f"    {key}: {label}")


# ---------------------------------------------------------------------------
# Q10 - pick the Nyquist plot. correct: L = 10/(s(s+1)(s+2))
# ---------------------------------------------------------------------------
def q10_nyquist_options():
    print("\n[Q10] Nyquist pick-a-plot")
    # Four distinct "entry signatures":
    #   a  type-1 3-pole : enters from BOTTOM (-90 asymptote), crosses neg-real axis
    #   b  type-0 3-pole : starts at FINITE +real point, loops, crosses neg-real near 0
    #   c  type-2 3-pole : enters from the LEFT (-180 asymptote along neg-real axis)
    #   d  type-0 2-pole : starts at FINITE +real point, simple arc, no neg-real crossing
    opts = {
        "a": (ct.tf([10], np.polymul([1, 0], np.polymul([1, 1], [1, 2]))),
              "CORRECT: type-1 3-pole 10/(s(s+1)(s+2)) - bottom asymptote"),
        "b": (ct.tf([6], np.polymul([1, 1], np.polymul([1, 2], [1, 3]))),
              "type-0 3-pole 6/((s+1)(s+2)(s+3)) - finite start, loops"),
        "c": (ct.tf([4], np.polymul([1, 0, 0], [1, 1])),
              "type-2 3-pole 4/(s^2(s+1)) - left asymptote"),
        "d": (ct.tf([4], np.polymul([1, 1], [1, 2])),
              "type-0 2-pole 4/((s+1)(s+2)) - finite start, simple arc"),
    }
    for key, (L, label) in opts.items():
        fig, ax = plt.subplots(figsize=(3.0, 3.0))
        resp = ct.nyquist_response(L)
        ct.nyquist_plot(resp, ax=ax, unit_circle=False, mirror_style=False,
                        max_curve_magnitude=7, max_curve_offset=0.0,
                        primary_style=['-', '-'], color="#1f4e79")
        ax.plot(-1, 0, "rx", markersize=7)
        ax.set_xlabel("Re"); ax.set_ylabel("Im")
        ax.set_title("Nyquist", fontsize=9)
        if ax.get_legend():
            ax.get_legend().set_visible(False)
        save(fig, f"q10_nyquist_{key}.png")
        gm, pm, wpc, wgc = ct.margin(L)
        print(f"    {key}: {label}  GM={gm:.3g} PM={pm:.3g}")


def reference_numbers():
    print("\n========== REFERENCE ANSWER KEY (python-control) ==========")
    print("Q1 block reduce  : 10/(s^2+15s+24)")
    print("Q2 ODE poles     :", np.roots([1, 4, 13]))
    A = np.array([[-2, 1], [0, -3]]); B = np.array([[0], [1]]); C = np.array([[1, 0]])
    sys = ct.ss(A, B, C, [[0]]); G3 = ct.ss2tf(sys)
    print("Q3 SS->TF        :", G3, " DC=", ct.dcgain(G3))
    G5 = ct.tf([20], np.polymul([1, 2], [1, 5]))
    print("Q5 DC gain       :", ct.dcgain(G5), "=", 20*np.log10(ct.dcgain(G5)), "dB")
    L8 = ct.tf([5], np.polymul([1, 0], np.polymul([1, 1], [1, 3])))
    gm, pm, wpc, wgc = ct.margin(L8)
    print(f"Q8 margins       : GM={gm:.4g} ({20*np.log10(gm):.3g} dB) PM={pm:.4g} deg")
    print("Q12 closed-loop  : K=11.45, zeta=0.591, wn=3.38 (Mp=0.1)")
    print("Q14 typo s+21    : Kp=623.7 ;  intended s+2.1 : Kp=6.24")
    z0 = np.pi/3
    print(f"Q15 linearize    : 4cos(pi/3)={4*np.cos(z0):.3f} -> 1/(s^2+s+2), poles {np.roots([1,1,2])}")


if __name__ == "__main__":
    print("Generating Mock Exam 1 figures ...")
    q4_step_options()
    q6_bode_readoff()
    q7_bode_options()
    q10_nyquist_options()
    reference_numbers()
    print("\nAll figures written to", FIG)
