// templates.js
// Data-driven example library for the Block-Diagram board. Each template is a
// portable diagram-state (see diagram-io.js). Adding a template is one entry —
// no imperative wiring code. Grouped for the left panel.
//
// Node tuple:  [type, x, y, value, label, direction?]   (direction only for
//              feedback blocks drawn right-to-left)
// Conn tuple:  [fromIndex, toIndex, sign]                (sign: "+", "-", or "")

const node = (type, x, y, value, label, direction) => {
  const n = { type, x, y, value, label };
  if (direction) n.direction = direction;
  return n;
};
const conn = (from, to, sign = "") => ({ from, to, sign });
const tpl = (id, name, group, description, nodes, connections) => ({
  id,
  name,
  group,
  description,
  state: { version: 1, nodes, connections },
});

export const TEMPLATE_GROUPS = ["Control structures", "Past exams"];

export const TEMPLATES = [
  // ---------------- Control structures ----------------
  tpl("open-loop", "Open loop", "Control structures", "Plant G with no feedback",
    [node("input", 80, 200, "1", "R"), node("block", 330, 200, "5/(s+2)", "G"), node("output", 580, 200, "1", "Y")],
    [conn(0, 1), conn(1, 2)]),

  tpl("unity-fb", "Unity feedback", "Control structures", "G with unity negative feedback",
    [node("input", 80, 200, "1", "R"), node("sum", 200, 200, "", "Σ"),
     node("block", 360, 200, "10/(s^2+2s)", "G"), node("output", 600, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(2, 1, "-")]),

  tpl("sensor-fb", "Feedback with sensor H", "Control structures", "Forward G, feedback path H",
    [node("input", 80, 200, "1", "R"), node("sum", 200, 200, "", "Σ"),
     node("block", 360, 200, "10/(s^2+2s)", "G"), node("block", 360, 330, "2", "H", "left"),
     node("output", 600, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 4), conn(2, 3), conn(3, 1, "-")]),

  tpl("p-control", "P controller + plant", "Control structures", "Proportional control, unity feedback",
    [node("input", 60, 200, "1", "R"), node("sum", 180, 200, "", "Σ"),
     node("block", 320, 200, "Kp", "C"), node("block", 480, 200, "1/(s^2+3s)", "G"),
     node("output", 660, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("pi-control", "PI controller + plant", "Control structures", "Kp(Ti·s+1)/(Ti·s) with plant",
    [node("input", 60, 200, "1", "R"), node("sum", 180, 200, "", "Σ"),
     node("block", 320, 200, "Kp*(Ti*s+1)/(Ti*s)", "C"), node("block", 510, 200, "1/(s+1)", "G"),
     node("output", 680, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("pid-control", "PID controller + plant", "Control structures", "Full PID with plant",
    [node("input", 50, 200, "1", "R"), node("sum", 170, 200, "", "Σ"),
     node("block", 320, 200, "Kp*(Td*Ti*s^2+Ti*s+1)/(Ti*s)", "C"), node("block", 540, 200, "1/(s^2+2s)", "G"),
     node("output", 710, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("lead", "Lead compensator", "Control structures", "Kc(s+z)/(s+p), z<p",
    [node("input", 60, 200, "1", "R"), node("sum", 180, 200, "", "Σ"),
     node("block", 330, 200, "Kc*(s+1)/(s+10)", "C"), node("block", 500, 200, "1/(s^2+4s)", "G"),
     node("output", 680, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("lag", "Lag compensator", "Control structures", "Kc(s+z)/(s+p), z>p",
    [node("input", 60, 200, "1", "R"), node("sum", 180, 200, "", "Σ"),
     node("block", 330, 200, "Kc*(s+10)/(s+1)", "C"), node("block", 500, 200, "1/(s^2+4s)", "G"),
     node("output", 680, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("lead-lag", "Lead-lag compensator", "Control structures", "Cascaded lead and lag",
    [node("input", 50, 200, "1", "R"), node("sum", 170, 200, "", "Σ"),
     node("block", 330, 200, "Kc*(s+1)/(s+10)*(s+8)/(s+0.8)", "C"), node("block", 560, 200, "1/(s^2+2s)", "G"),
     node("output", 730, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3), conn(3, 4), conn(3, 1, "-")]),

  tpl("cascade", "Inner/outer cascade", "Control structures", "Two nested control loops",
    [node("input", 50, 200, "1", "R"), node("sum", 140, 200, "", "Σ1"), node("block", 240, 200, "Kp1", "C1"),
     node("sum", 360, 200, "", "Σ2"), node("block", 450, 200, "Kp2", "C2"),
     node("block", 570, 200, "1/(s+5)", "Gi"), node("block", 690, 200, "1/(s+1)", "Go"),
     node("output", 810, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3, "+"), conn(3, 4), conn(4, 5), conn(5, 6), conn(6, 7),
     conn(5, 3, "-"), conn(6, 1, "-")]),

  tpl("disturbance", "Disturbance on plant", "Control structures", "Step disturbance into the loop",
    [node("input", 50, 200, "1", "R"), node("sum", 160, 200, "", "Σ"), node("block", 280, 200, "Kp", "C"),
     node("sum", 430, 200, "", "Σd"), node("block", 540, 200, "1/(s^2+2s)", "G"),
     node("output", 700, 200, "1", "Y"), node("disturbance", 430, 80, "1", "D")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3, "+"), conn(6, 3, "+"), conn(3, 4), conn(4, 5), conn(4, 1, "-")]),

  tpl("feedforward", "Feedforward + feedback", "Control structures", "Feedforward path Ff plus feedback",
    [node("input", 50, 220, "1", "R"), node("sum", 180, 220, "", "Σ"), node("block", 300, 220, "Kp", "C"),
     node("sum", 450, 220, "", "Σ2"), node("block", 560, 220, "1/(s+1)", "G"),
     node("output", 720, 220, "1", "Y"), node("block", 300, 90, "Kff", "Ff")],
    [conn(0, 1, "+"), conn(1, 2), conn(2, 3, "+"), conn(0, 6), conn(6, 3, "+"), conn(3, 4), conn(4, 5), conn(4, 1, "-")]),

  tpl("parallel", "Parallel paths G1+G2", "Control structures", "Two blocks summed",
    [node("input", 80, 200, "1", "R"), node("block", 290, 130, "1/(s+1)", "G1"),
     node("block", 290, 270, "2/(s+3)", "G2"), node("sum", 480, 200, "", "Σ"),
     node("output", 630, 200, "1", "Y")],
    [conn(0, 1), conn(0, 2), conn(1, 3, "+"), conn(2, 3, "+"), conn(3, 4)]),

  // ---------------- Past exams (verified diagrams) ----------------
  tpl("s20q3", "Exam S20 Q3", "Past exams", "Parallel branch A with loop 1/(s+B)",
    [node("input", 70, 200, "1", "R"), node("sum", 190, 200, "", "Σ1"),
     node("block", 320, 200, "1/(s+B)", "G_ol"), node("block", 320, 90, "A", "A"),
     node("sum", 460, 200, "", "Σ2"), node("output", 570, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(0, 3), conn(1, 2), conn(2, 4, "+"), conn(3, 4, "+"), conn(4, 5), conn(2, 1, "-")]),

  tpl("s21q1", "Exam S21 Q1", "Past exams", "Two forward paths sharing one loop BCF",
    [node("input", 70, 200, "1", "R"), node("sum", 170, 200, "", "Σ1"), node("sum", 270, 200, "", "Σ2"),
     node("block", 380, 200, "B", "B"), node("block", 500, 200, "C", "C"), node("block", 380, 80, "E", "E"),
     node("block", 380, 320, "F", "F", "left"), node("sum", 610, 200, "", "Σ3"), node("output", 690, 200, "1", "Y")],
    [conn(0, 1, "+"), conn(0, 5), conn(1, 2, "+"), conn(2, 3), conn(3, 4), conn(4, 7, "+"),
     conn(5, 7, "+"), conn(7, 8), conn(4, 6), conn(6, 2, "-")]),

  tpl("f22q1", "Exam F22 Q1", "Past exams", "Nested loops H1, H2",
    [node("input", 50, 200, "1", "R"), node("sum", 150, 200, "", "Σ1"), node("sum", 260, 200, "", "Σ2"),
     node("block", 380, 200, "A", "A"), node("block", 500, 200, "B", "B"), node("sum", 610, 200, "", "Σ3"),
     node("block", 730, 120, "D", "D"), node("block", 730, 280, "C", "C"), node("sum", 850, 200, "", "Σ4"),
     node("block", 960, 200, "E", "E"), node("output", 1070, 200, "1", "Y"),
     node("block", 500, 360, "H1", "H1", "left"), node("block", 780, 50, "H2", "H2", "left")],
    [conn(0, 1, "+"), conn(1, 2, "+"), conn(2, 3), conn(3, 4), conn(4, 2, "-"), conn(4, 5, "+"),
     conn(5, 7), conn(5, 6), conn(7, 8, "+"), conn(6, 8, "+"), conn(8, 11), conn(11, 1, "-"),
     conn(8, 9), conn(9, 10), conn(9, 12), conn(12, 5, "-")]),
];
