// Initial- and final-value theorems on an s-domain signal F(s) = num/den.
//   y(0⁺) = lim_{s→∞} s·F(s)      (initial-value theorem)
//   y(∞)  = lim_{s→0}  s·F(s)      (final-value theorem; valid when s·F has no
//                                   poles in the closed RHP)
// num/den are highest-degree-first coefficient arrays (as parseTf returns).
//   ReExam F21 Q8:  F = 4(s+50)/(s(s²+30s+200))  →  y(∞) = 1
const trailingZeros = (a) => {
  let k = 0;
  while (k < a.length && Math.abs(a[a.length - 1 - k]) < 1e-12) k++;
  return k;
};
const trimLead = (a) => {
  let i = 0;
  while (i < a.length - 1 && Math.abs(a[i]) < 1e-12) i++;
  return a.slice(i);
};

// lim_{s→∞} s·(num/den): compare degrees of s·num and den.
function initialValue(num, den) {
  const dn = num.length - 1 + 1; // degree of s·num
  const dd = den.length - 1;
  if (dn < dd) return 0;
  if (dn > dd) return Infinity;
  return num[0] / den[0];
}

// lim_{s→0} s·(num/den). p = poles at the origin (trailing zeros of den).
function finalValue(num, den) {
  const p = trailingZeros(den);
  if (p === 0) return 0; // no integrator → the signal decays to 0
  if (p >= 2) return Infinity; // double integrator → unbounded
  // p === 1: s·F = num / (den/s); evaluate at s=0 = const(num) / coeff_of_s(den).
  return num[num.length - 1] / den[den.length - 2];
}

// Multiply F(s) by a standard input: step 1/s, ramp 1/s², impulse 1.
function applyInput(num, den, input) {
  if (input === "step") return { num, den: [...den, 0] };
  if (input === "ramp") return { num, den: [...den, 0, 0] };
  return { num, den }; // "impulse" or "none": F is already the signal
}

export function valueTheorems(numIn, denIn, input = "none") {
  const { num, den } = applyInput(trimLead(numIn), trimLead(denIn), input);
  return {
    initial_value: initialValue(num, den),
    final_value: finalValue(num, den),
  };
}
