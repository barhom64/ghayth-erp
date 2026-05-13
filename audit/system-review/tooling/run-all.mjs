#!/usr/bin/env node
// run-all.mjs — Orchestrator for the system-review audit.
//
// Runs the three read-only scanners in the canonical order and prints a
// final summary. Forwards any CLI flags (e.g. --include-all, --module=X)
// to each child so individual scripts can opt-in if they want.
//
// Exit code is non-zero if any child fails. The pre-existing JSON
// artifacts (_page-inventory.json, _buttons-by-page.json,
// _schema-by-entity.json) are reused as-is — generating them is out of
// scope for this entrypoint.

import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FORWARD = process.argv.slice(2);

const STEPS = [
  "api-to-audit-map.mjs",
  "hardcoded-data-scan.mjs",
  "build-findings.mjs",
];

function run(script) {
  return new Promise((res, rej) => {
    const full = join(__dirname, script);
    if (!existsSync(full)) {
      return rej(new Error(`missing script: ${script}`));
    }
    console.log(`\n── ${script} ${FORWARD.join(" ")}`.trim());
    const child = spawn(process.execPath, [full, ...FORWARD], {
      stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`${script} exited with code ${code}`));
    });
    child.on("error", rej);
  });
}

function countPreservedSection3() {
  const modulesDir = join(ROOT, "modules");
  if (!existsSync(modulesDir)) return 0;
  let preserved = 0;
  for (const mod of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!mod.isDirectory()) continue;
    const dir = join(modulesDir, mod.name);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      if (f === "_module.md") continue;
      const src = readFileSync(join(dir, f), "utf8");
      const m = src.match(
        /##\s*3\.[^\n]*\n([\s\S]*?)(?=\n##\s|\n?$)/,
      );
      if (!m) continue;
      const body = m[1].trim();
      if (!body) continue;
      if (/^- \[ \] \*\*TBD\*\*/.test(body)) continue;
      preserved++;
    }
  }
  return preserved;
}

function countFindings() {
  const csv = join(ROOT, "findings", "FINDINGS.csv");
  if (!existsSync(csv)) return null;
  const lines = readFileSync(csv, "utf8").trim().split(/\r?\n/);
  return Math.max(0, lines.length - 1);
}

const t0 = Date.now();
try {
  for (const s of STEPS) await run(s);
} catch (e) {
  console.error(`\n[run-all] ✗ ${e.message}`);
  process.exit(1);
}

const findings = countFindings();
const preserved = countPreservedSection3();
const dt = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n── summary`);
console.log(`  steps run        : ${STEPS.length}`);
console.log(`  findings (CSV)   : ${findings ?? "n/a"}`);
console.log(`  §3 preserved     : ${preserved}`);
console.log(`  elapsed          : ${dt}s`);
