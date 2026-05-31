# Mock Exam 1 — LCD1 solver stress test

A realistic, deliberately hard mock LCD1 (34722) exam used to stress-test the
Exam Suite. It mirrors a real paper's topic spread and intentionally includes
the categories the solver is known to struggle with (pick-a-plot, conceptual,
linearization) plus planted traps.

## Artifacts (PDFs are gitignored — regenerate them)

- `Mock-Exam-1-Questions.pdf` — what you solve, using the app, as in a real exam.
- `Mock-Exam-1-Solutions.pdf` — worked answer key with the app/CLI route per question.

## Regenerate

```bash
# 1. figures (needs python + control + matplotlib + numpy)
python build_figures.py            # writes figures/*.png, prints the reference answers

# 2. PDFs (needs a LaTeX install with pdflatex + tikz)
pdflatex Mock-Exam-1-Questions.tex
pdflatex Mock-Exam-1-Solutions.tex
```

`build_figures.py` also prints a REFERENCE block: every computational answer as
computed by python-control, which agrees with the app's JS engine (cross-checked
via `node spike/cli.js …`).

## Source layout

- `exam-content.tex` — the single source of truth for all 16 questions. A
  `\ifsolutions` flag toggles the worked-answer blocks.
- `Mock-Exam-1-Questions.tex` / `Mock-Exam-1-Solutions.tex` — thin drivers that
  set the flag and `\input` the content.
- `build_figures.py` — generates every figure (step responses, Bode, Nyquist)
  with python-control, so the visual questions are real, not faked.

## Coverage map (16 questions)

| # | Topic | Class | App route |
|---|---|---|---|
| 1 | Block reduction (nested loops) | compute | Block Diagram mode |
| 2 | ODE → TF poles | compute | `ode` |
| 3 | State-space → TF | compute | `ss` |
| 4 | Second-order: pick the step plot | pick-a-plot (gap) | reason + `characterize` |
| 5 | DC gain **in dB** (unit trap) | compute + trap | `tf` |
| 6 | Bode read-off → compose G(s) | read-off → form | `bode` |
| 7 | Pick the Bode plot | pick-a-plot (gap) | reason |
| 8 | Gain & phase margins | compute | `margins` |
| 9 | Stable-K range (Routh) | compute | `stable-k` |
| 10 | Pick the Nyquist plot | pick-a-plot (gap) | reason + `stability` |
| 11 | Steady-state error (ramp) | compute | `ess` |
| 12 | Closed-loop K for Mp (form-semantics trap) | compute | `closed-loop` |
| 13 | PI-Lead design (find K_P) | compute | `pi-lead` |
| 14 | P-for-PM with **planted `s+21`/`s+2.1` typo** | compute + trap | Smart Paste guard |
| 15 | Linearize nonlinear ODE → TF | compute (un-built gap) | by hand + `tf` |
| 16 | Conceptual true/false | conceptual (gap) | reason |

See `../docs/stress-test-1-findings.md` for the per-question stress-test results.
