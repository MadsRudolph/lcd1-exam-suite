# LCD1 Solver — JS port spike

A from-scratch JavaScript port of the LCD1 control-systems solvers (P2–P7), validated
against the Python 70-test oracle. Zero dependencies — pure Node, `node --test`.

## Run the solvers (CLI)

```bash
node cli.js help                 # list commands
node cli.js margins   "1/(s+1)**3"
node cli.js stable-k  "25/(s**3+s**2+10*s)"
node cli.js ess       "5*(s+4)/(s**2*(s+1)*(s+20))"
node cli.js tf        "900/((0.25*s+1)*(s**2+50*s+3000))"
node cli.js second-order --zeta 0.707 --wn 10
node cli.js pi-lead   --unknown alpha --gammaM 75 --phiG -112.77 --Ni 5
node cli.js p-for-pm  "1/(s*(s+2.1))" 40
node cli.js bode      --dc 6.02 --corners "1:-20,2:20" --phase "1:-90,2:-90"
node cli.js nested-ess --arch two_KP_same --G0 0.75 --ess 0.25
```

## Smart Paste — paste a whole exam question

Paste the prompt (and options) straight from the PDF; the parser cleans garbled
copy-paste (flattened `s3`, unicode minus, fraction bars split across lines),
routes to the right solver, and solves it:

```bash
node cli.js question "A loop transfer function L(s) = K/(s(s+3)(s+10)). What gain K gives phase margin PM=40 degrees?
1. K = 19.5
2. K = 44
3. K = 88"
# -> Routed to solve_P_for_PM; K_P 87.87 (option 88)

node cli.js question --file question.txt
```

Transfer functions use `s`, `*`, `/`, `+`, `-`, `**` (or `^`).

## Run the parity tests

```bash
npm test           # 41 tests; mirrors the Python oracle's expected values
```

## Layout

```
numeric/   complex.js · poly.js · roots.js · tf.js · margins.js · parse.js
solvers/   p2.js · p3.js · p4.js · p5.js · p6.js · p7.js
cli.js     terminal front-end over the solvers
test/      node:test parity suites (one per problem type) + cli smoke test
```

## Coverage vs the oracle

**77 JS tests green; the Python oracle is 70/70 on the same machine.** Every solver
family is ported and parity-verified. The only intentional gap is the symbolic DSL
block-reducer (`p1_block_reduce.py`) — BDR's graphical reducer replaces it in the merged app.

| Problem | Ported | Notes |
|---|---|---|
| P1 ODE → TF | ✅ | |
| P1 state-space → TF | ✅ | Faddeev–Leverrier C(sI−A)⁻¹B + D |
| P1 block reduction (DSL) | ⛔ by design | superseded by BDR's graphical reducer |
| P2 Bode read-off → G(s) | ✅ | figure output omitted |
| P3 margins + stable-K | ✅ | matches python-control margins |
| P4 2nd-order metrics | ✅ | |
| P4 `solve_K_for_spec` | ✅ | numeric 1-D solve (no CAS) |
| P5 ess (K_P + table) | ✅ | |
| P6 PI-Lead + P-for-PM | ✅ | |
| P6 full design + lag-beta | ✅ | |
| P7 feedforward + nested ess | ✅ | |
| Option matching | ✅ | NUMBER/DICT/TF/PICK + stable-range flagging |
| Smart Paste (route + extract) | ✅ | garbled-PDF TF reconstruction |

See [`../docs/archive/js-port-fidelity-spike.md`](../docs/archive/js-port-fidelity-spike.md) for the fidelity write-up.
