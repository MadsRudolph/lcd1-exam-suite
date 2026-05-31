// Integration smoke tests for the CLI: spawn it and check key outputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.js");
const run = (args) => execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("margins command reports GM 8", () => {
  assert.match(run(["margins", "1/(s+1)**3"]), /GM\s+8\b/);
});

test("stable-k command reports (0, 0.4)", () => {
  assert.match(run(["stable-k", "25/(s**3+s**2+10*s)"]), /\(0, 0\.4\)/);
});

test("ess command reports system type 2", () => {
  assert.match(run(["ess", "5*(s+4)/(s**2*(s+1)*(s+20))"]), /system type\s+2/);
});

test("pi-lead alpha mode ~0.507", () => {
  assert.match(
    run(["pi-lead", "--unknown", "alpha", "--gammaM", "75", "--phiG", "-112.77", "--Ni", "5"]),
    /alpha\s+0\.507/,
  );
});

test("p-for-pm K_P ~8.18", () => {
  assert.match(run(["p-for-pm", "1/(s*(s+2.1))", "40"]), /K_P\s+8\.1/);
});

test("unknown symbol errors out non-zero", () => {
  assert.throws(() => run(["tf", "K/(s+1)"]));
});
