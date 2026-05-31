// The three block-diagram combinators over symbolic transfer functions (§2.2).
// Thin, named wrappers on SymTF arithmetic so symbolic reductions read like the
// block algebra they model and stay simplified.
import { SymTF } from "./symtf.js";

// G1 then G2 in cascade.
export function series(g1, g2) {
  return g1.mul(g2).simplify();
}

// G1 and G2 summed on a common path.
export function parallel(g1, g2) {
  return g1.add(g2).simplify();
}

// Closed loop of forward G with feedback H. sign "-" is negative feedback
// (the usual unity/normal case → G/(1+G·H)); "+" is positive feedback
// (→ G/(1−G·H)). H defaults to unity feedback.
export function feedback(g, h = SymTF.one(), sign = "-") {
  const loop = g.mul(h);
  const denom = sign === "-" ? SymTF.one().add(loop) : SymTF.one().sub(loop);
  return g.div(denom).simplify();
}

// Loop gain L = G·H (a.k.a. the open-loop / return-ratio transfer function).
export function loopGain(g, h = SymTF.one()) {
  return g.mul(h).simplify();
}
