// One-slot shared channel between the Block Diagram canvas and the LCD1 solver.
// The canvas pushes a reduced G(s) string; the LCD1 panel consumes it.
let pending = null;

export function setHandoff(tfString) {
  pending = tfString;
}
export function peekHandoff() {
  return pending;
}
export function consumeHandoff() {
  const v = pending;
  pending = null;
  return v;
}
