#!/usr/bin/env node
// Static UX gate for Ghayth.
//
// This script is dependency-free by design so it can run under the repository's
// frozen pnpm install. It verifies that the final UX gate has the required
// documentation, an executable Playwright smoke suite, and workflow wiring.

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

const requiredMatrixTerms = [
  "P0",
  "إنشاء موظف",
  "إنشاء فاتورة",
  "إغلاق رحلة",
  "رفع وثيقة",
  "Audit/Event/Report",
];

const requiredSpecTerms = [
  "@ux-gate",
  "UX_GATE_ROUTES",
  "RTL",
  "consoleErrors",
  "pageErrors",
  "undefined",
  "/employees/create",
];

const requiredGateTerms = ["gate:ux:static", "pnpm run gate:ux:static"];

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
for (const term of requiredMatrixTerms) {
  if (!matrix.includes(term)) failures.push(`UX_TEST_MATRIX.md missing term: ${term}`);
}

const spec = read("e2e/tests/ux-acceptance-gate.spec.ts");
for (const term of requiredSpecTerms) {
  if (!spec.includes(term)) failures.push(`ux-acceptance-gate.spec.ts missing term: ${term}`);
}

const packageJson = read("package.json");
for (const term of requiredGateTerms) {
  if (!packageJson.includes(term)) failures.push(`package.json missing UX script wiring: ${term}`);
}

const uxGate = read(".github/workflows/ux-gate.yml");
if (!uxGate.includes("gate:ux:static")) failures.push("ux-gate.yml does not run gate:ux:static");

const arabicGate = read(".github/workflows/arabic-rtl-guard.yml");
if (!arabicGate.includes("--grep") || !arabicGate.includes("@ux-gate")) {
  failures.push("arabic-rtl-guard.yml must execute Playwright @ux-gate tests");
}

if (failures.length) {
  console.error("UX gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UX gate static checks passed.");
