// One-click Exam UI.
//
// Flips the whole app between the normal (flashy) theme and a sober, light
// "engineering tool" skin by toggling html[data-theme="exam"]. Every colour in
// the app routes through CSS variables, so flipping that one attribute reskins
// both the Block Diagram and LCD1 Solver modes at once. The choice is persisted
// and re-applied on launch (a tiny inline script in index.html sets it before
// first paint so there's no flash of the dark theme).

const KEY = "lcd-theme";

function isExam() {
  return document.documentElement.getAttribute("data-theme") === "exam";
}

function apply(exam) {
  if (exam) document.documentElement.setAttribute("data-theme", "exam");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(KEY, exam ? "exam" : "normal"); } catch (e) { /* private mode */ }
  // Plots are baked SVG strings; the solver listens for this to rebuild them.
  window.dispatchEvent(new CustomEvent("lcd-theme-change", { detail: { exam } }));
}

function build() {
  if (document.getElementById("exam-toggle-btn")) return;
  const btn = document.createElement("button");
  btn.id = "exam-toggle-btn";
  btn.className = "exam-toggle";
  btn.title = "Toggle the exam-friendly UI theme";

  // The label shows what the button switches TO.
  const sync = () => { btn.textContent = isExam() ? "Normal UI" : "Exam UI"; };

  btn.addEventListener("click", () => { apply(!isExam()); sync(); });
  sync();
  document.body.appendChild(btn);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", build);
} else {
  build();
}
