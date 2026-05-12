#!/usr/bin/env node
// button-handler-scan.mjs — Read-only.
// For each page file referenced in _page-inventory.json, scans the source
// and emits per-page lists of:
//   - api calls (useApiQuery / useApiMutation / fetch / apiPost / api.<verb>)
//   - buttons (<Button>...</Button> with surrounding handler hints)
//   - imports of other modules' helpers (cross-domain calls)
//
// Output: tooling/_buttons-by-page.json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const INVENTORY = join(__dirname, "_page-inventory.json");
const OUT = join(__dirname, "_buttons-by-page.json");

const inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));

function safeRead(rel) {
  if (!rel) return null;
  const full = join(REPO, rel);
  if (!existsSync(full)) {
    const idx = full.replace(/\.tsx$/, "/index.tsx");
    if (existsSync(idx)) return readFileSync(idx, "utf8");
    return null;
  }
  return readFileSync(full, "utf8");
}

const API_PATTERNS = [
  // useApiMutation("/path", "POST", ...)
  /useApiMutation\(\s*[`"']([^`"']+)[`"']\s*,\s*[`"']([A-Z]+)[`"']/g,
  // useApiQuery([...], "/path")
  /useApiQuery[\w<>]*\([^,]+,\s*[`"']([^`"']+)[`"']/g,
];

function extractApiCalls(src) {
  const calls = [];
  // mutations
  for (const m of src.matchAll(/useApiMutation\(\s*[`"']([^`"']+)[`"']\s*,\s*[`"']([A-Z]+)[`"']/g)) {
    calls.push({ kind: "mutation", method: m[2], path: m[1] });
  }
  // queries
  for (const m of src.matchAll(/useApiQuery[\w<>]*\(\s*[^,]+,\s*[`"']([^`"']+)[`"']/g)) {
    calls.push({ kind: "query", method: "GET", path: m[1] });
  }
  // raw fetch("/api/...") or fetch(`/api/...`)
  for (const m of src.matchAll(/fetch\(\s*[`"'](\/api\/[^`"']+)[`"']/g)) {
    calls.push({ kind: "fetch", method: "?", path: m[1] });
  }
  return calls;
}

function extractButtons(src) {
  const lines = src.split(/\r?\n/);
  const buttons = [];
  // Walk lines; for each line containing <Button, capture the next 60 chars
  // and look for a text label in the following 3 lines.
  for (let i = 0; i < lines.length; i++) {
    if (!/<Button\b/.test(lines[i])) continue;
    const blob = lines.slice(i, i + 4).join(" ");
    // text between > and < (label) — naive
    const txtMatch = blob.match(/<Button[^>]*>\s*(?:<[^>]+>\s*)?([^<>{}\n]{2,40}?)\s*</);
    const onClick = blob.match(/onClick=\{([^}]+)\}/);
    const titleAttr = blob.match(/title=["']([^"']+)["']/);
    const ariaLabel = blob.match(/aria-label=["']([^"']+)["']/);
    const disabled = /disabled=\{?true|disabled\s*=\s*\{[^}]+\}/.test(blob);
    buttons.push({
      line: i + 1,
      label: (txtMatch && txtMatch[1].trim()) || titleAttr?.[1] || ariaLabel?.[1] || null,
      onClick: onClick ? onClick[1].trim().slice(0, 80) : null,
      disabledHinted: disabled,
    });
  }
  return buttons;
}

function extractCrossDomainImports(src) {
  const out = [];
  for (const m of src.matchAll(/from\s+["']@\/(pages|modules|lib)\/([^"']+)["']/g)) {
    out.push(`${m[1]}/${m[2]}`);
  }
  return out;
}

const result = {};
let withApi = 0,
  withButtons = 0,
  missing = 0;

for (const row of inventory) {
  if (!row.sourceFile) continue;
  const src = safeRead(row.sourceFile);
  if (!src) {
    missing++;
    result[row.path] = { sourceFile: row.sourceFile, missing: true };
    continue;
  }
  const apiCalls = extractApiCalls(src);
  const buttons = extractButtons(src);
  const imports = extractCrossDomainImports(src);
  if (apiCalls.length) withApi++;
  if (buttons.length) withButtons++;
  result[row.path] = {
    sourceFile: row.sourceFile,
    module: row.module,
    apiCalls,
    buttonCount: buttons.length,
    buttons: buttons.slice(0, 200), // safety cap
    lineCount: src.split(/\r?\n/).length,
    crossDomainImports: imports,
  };
}

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`button-handler-scan: ${Object.keys(result).length} pages scanned`);
console.log(`  with API calls : ${withApi}`);
console.log(`  with buttons   : ${withButtons}`);
console.log(`  missing source : ${missing}`);
