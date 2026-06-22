#!/usr/bin/env node
// Static UX gate for Ghayth.
// Dependency-free so it can run directly with Node in GitHub Actions.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "docs/ux/UX_ACCEPTANCE_GATE.md",
  "docs/ux/UX_SCORECARD.md",
  "docs/ux/UX_TEST_MATRIX.md",
  "docs/ux/FINAL_UX_REPORT_TEMPLATE.md",
  "e2e/tests/ux-acceptance-gate.spec.ts",
  ".github/workflows/ux-gate.yml",
  ".github/workflows/arabic-rtl-guard.yml",
  ".github/workflows/accessibility.yml",
  ".github/workflows/lighthouse.yml",
];

const failures = [];

function read(relPath) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file: ${relPath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

for (const relPath of requiredFiles) read(relPath);

const matrix = read("docs/ux/UX_TEST_MATRIX.md");
for (const term of ["P0", "Create employee", "Create invoice", "Close trip", "Audit/Event"]) {
  if (!matrix.includes(term)) failures.push(`UX_TEST_MATRIX.md missing term: ${term}`);
}

const scorecard = read("docs/ux/UX_SCORECARD.md");
for (const term of ["LCP", "INP", "CLS", "Accessibility", "Audit/Event/Report"]) {
  if (!scorecard.includes(term)) failures.push(`UX_SCORECARD.md missing term: ${term}`);
}

const spec = read("e2e/tests/ux-acceptance-gate.spec.ts");
for (const term of ["@ux-gate", "UX_GATE_ROUTES", "RTL", "consoleErrors", "pageErrors", "undefined", "/employees/create"]) {
  if (!spec.includes(term)) failures.push(`ux-acceptance-gate.spec.ts missing term: ${term}`);
}

const uxGate = read(".github/workflows/ux-gate.yml");
if (!uxGate.includes("node scripts/src/ux-scorecard.mjs")) failures.push("ux-gate.yml does not run ux-scorecard.mjs");

const arabicGate = read(".github/workflows/arabic-rtl-guard.yml");
if (!arabicGate.includes("@ux-gate") || !arabicGate.includes("UX_GATE_ROUTES")) {
  failures.push("arabic-rtl-guard.yml must reference the Playwright UX gate contract");
}

const accessibility = read(".github/workflows/accessibility.yml");
if (!accessibility.includes("@axe-core/cli") || !accessibility.includes("UX_BASE_URL")) {
  failures.push("accessibility.yml must support optional axe scan through UX_BASE_URL");
}

const lighthouse = read(".github/workflows/lighthouse.yml");
if (!lighthouse.includes("@lhci/cli") || !lighthouse.includes("UX_BASE_URL")) {
  failures.push("lighthouse.yml must support optional LHCI scan through UX_BASE_URL");
}

if (failures.length) {
  console.error("UX gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UX gate static checks passed.");
