#!/usr/bin/env node
// run-all.mjs — Runs the full scan chain.
// Usage:
//   node audit/system-review/tooling/run-all.mjs                  # wave 1 only
//   node audit/system-review/tooling/run-all.mjs --module=hr      # one module
//   node audit/system-review/tooling/run-all.mjs --include-all    # all 379 routes

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const steps = [
  ["page-inventory.mjs", []],
  ["button-handler-scan.mjs", []],
  ["api-to-audit-map.mjs", []],
  ["schema-link.mjs", []],
  ["hardcoded-data-scan.mjs", []],
  ["build-findings.mjs", []],
  ["generate-pages.mjs", args],
  ["merge-runtime-results.mjs", []],
  ["build-module-index.mjs", []],
];

for (const [step, extraArgs] of steps) {
  console.log(`\n=== ${step} ===`);
  const r = spawnSync("node", [join(__dirname, step), ...extraArgs], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✗ ${step} exited ${r.status}`);
    process.exit(r.status || 1);
  }
}
console.log("\n✓ all steps complete");
