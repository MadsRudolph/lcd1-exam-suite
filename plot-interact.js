// plot-interact.js
// Hover read-off for the transfer-function plots. The pure helpers map between
// pixel and data coordinates; attachHover() (added later) wires the crosshair +
// tooltip onto an injected SVG using the data the UI already has.

export function parsePlotbox(s) {
  const [x, y, w, h] = String(s).split(",").map(Number);
  return { x, y, w, h };
}

/** Pixel x -> data x (un-logs when isLog). */
export function invertX(px, box, xDomain, isLog) {
  const t = (px - box.x) / box.w;
  const v = xDomain[0] + t * (xDomain[1] - xDomain[0]);
  return isLog ? 10 ** v : v;
}

/** Data x -> pixel x. */
export function projectX(dataX, box, xDomain, isLog) {
  const v = isLog ? Math.log10(dataX) : dataX;
  return box.x + (v - xDomain[0]) / (xDomain[1] - xDomain[0]) * box.w;
}

/** Data y -> pixel y (axis inverted: yDomain[0] at the bottom, [1] at the top). */
export function projectY(dataY, box, yDomain) {
  const t = (dataY - yDomain[0]) / (yDomain[1] - yDomain[0]);
  return box.y + box.h - t * box.h;
}

/** Index of the sample in xs closest to target. */
export function nearestByX(xs, target) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Index of the point closest to (tx, ty). */
export function nearest2D(xs, ys, tx, ty) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = (xs[i] - tx) ** 2 + (ys[i] - ty) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
