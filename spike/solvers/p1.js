// P1 — Models: ODE -> TF and state-space -> TF.
// JS port of lcd1-solver/lcd_solver/solvers/p1_models.py. The DSL block reducer
// is intentionally dropped: BDR's graphical reducer supersedes it.
import { NumericTF } from "../numeric/tf.js";

/**
 * Build G(s) = u_coeffs(s) / y_coeffs(s) from a differential equation.
 * Coefficients are highest-degree-first. 5y''+y'+0.5y=3u -> y=[5,1,0.5], u=[3].
 */
export function solveOdeToTf(y_coeffs, u_coeffs) {
  return new NumericTF(u_coeffs.slice(), y_coeffs.slice());
}

// ---- small dense-matrix helpers ----
const ident = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
function matMul(A, B) {
  const n = A.length, m = B[0].length, k = B.length;
  const out = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += a * B[p][j];
    }
  return out;
}
const trace = (A) => A.reduce((s, row, i) => s + row[i], 0);
const addScaledIdentity = (A, c) => A.map((row, i) => row.map((v, j) => v + (i === j ? c : 0)));

/**
 * G(s) = C (sI - A)^{-1} B + D for SISO, via the Faddeev–Leverrier algorithm:
 *   adj(sI-A) = Σ M_k s^{n-k},  det(sI-A) = s^n + a_1 s^{n-1} + ... + a_n.
 */
export function solveStateSpaceToTf(A, B, C, D) {
  const n = A.length;
  if (A.some((r) => r.length !== n)) throw new Error("A must be square");
  if (B.length !== n || B[0].length !== 1) throw new Error(`B must be (${n},1)`);
  if (C.length !== 1 || C[0].length !== n) throw new Error(`C must be (1,${n})`);
  const d = D[0][0];

  let M = ident(n);
  const den = [1]; // char poly, highest-degree-first
  const adjNum = []; // C M_k B for k=1..n  -> coeff of s^{n-k}
  for (let k = 1; k <= n; k++) {
    // C M B (scalar)
    const CM = matMul(C, M); // 1 x n
    let cmb = 0;
    for (let i = 0; i < n; i++) cmb += CM[0][i] * B[i][0];
    adjNum.push(cmb);

    const AM = matMul(A, M);
    const a_k = -trace(AM) / k;
    den.push(a_k);
    M = addScaledIdentity(AM, a_k); // M_{k+1}
  }

  // num = adjNum + D*den  (pad adjNum to denominator degree if D != 0)
  let num = adjNum.slice();
  if (d !== 0) {
    const padded = [0, ...adjNum]; // raise to degree n
    num = padded.map((c, i) => c + d * den[i]);
  }
  return new NumericTF(num, den);
}
