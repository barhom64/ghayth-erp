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

/**
 * Pure classifier (exported for the sibling .test.mjs): decide whether
 * the Button at the current source line is wrapped by a Link, and if
 * so whether the wrap is the safe slot form or the risky nested form.
 *
 *   before — the 3 lines that PRECEDE the Button line, joined.
 *   blob   — the Button line + 3 following lines, joined.
 *
 * Returns { wrappedByLink, linkButtonNestingRisk, buttonIsAsChild }.
 */
export function classifyLinkButton(before, blob) {
  const linkOpensBeforeButton = /<Link\b[^>]*href=/.test(before);
  const linkOpensInline = /<Link\b[^>]*href=/.test(blob);
  const buttonIsAsChild = /\basChild\b/.test(blob);
  const wrappedByLink = linkOpensBeforeButton || linkOpensInline || buttonIsAsChild;
  const linkButtonNestingRisk = linkOpensBeforeButton && !buttonIsAsChild;
  return { wrappedByLink, linkButtonNestingRisk, buttonIsAsChild };
}

function extractButtons(src) {
  const lines = src.split(/\r?\n/);
  const buttons = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/<Button\b/.test(lines[i])) continue;
    const blob = lines.slice(i, i + 4).join(" ");
    // Detect `<Link href="...">...<Button>...</Button>...</Link>` so the
    // button isn't flagged as orphan. Two distinct shapes share this
    // signature and they have OPPOSITE hydration-safety properties:
    //
    //   safe   — `<Button asChild><Link href=…>…</Link></Button>`
    //             Button passes its props to the <a> Link emits, so the
    //             rendered HTML is a single <a> with no nested <button>.
    //   risky  — `<Link href=…><Button>…</Button></Link>`
    //             Renders as <a><button/></a>, which is invalid
    //             interactive nesting and contributes to React hydration
    //             warnings. Issue #640 asks the scanner to surface this
    //             distinction instead of silently normalising both as
    //             "wrappedByLink: true".
    const before = lines.slice(Math.max(0, i - 3), i).join(" ");
    // The "Link opens BEFORE Button without asChild" shape is the
    // unambiguous risky form. Inline-blob Links are too ambiguous to
    // flag from a regex (could be a sibling, not a wrapper) so the
    // predicate only raises the risk for the "Link opens earlier" case.
    const { wrappedByLink, linkButtonNestingRisk } = classifyLinkButton(before, blob);
    const txtMatch = blob.match(/<Button[^>]*>\s*(?:<[^>]+>\s*)?([^<>{}\n]{2,40}?)\s*</);
    const onClick = blob.match(/onClick=\{([^}]+)\}/);
    const titleAttr = blob.match(/title=["']([^"']+)["']/);
    const ariaLabel = blob.match(/aria-label=["']([^"']+)["']/);
    const disabled = /disabled=\{?true|disabled\s*=\s*\{[^}]+\}/.test(blob);
    const isSubmit = /type=["']submit["']/.test(blob);
    buttons.push({
      line: i + 1,
      label: (txtMatch && txtMatch[1].trim()) || titleAttr?.[1] || ariaLabel?.[1] || null,
      onClick: onClick ? onClick[1].trim().slice(0, 80) : null,
      disabledHinted: disabled,
      wrappedByLink,
      linkButtonNestingRisk,
      recommendedPattern: linkButtonNestingRisk ? "Button asChild > Link" : null,
      isSubmit,
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

// Entry-point guard: only run the scanner when this module is invoked
// directly (e.g. `node button-handler-scan.mjs`). Importing it from the
// sibling .test.mjs must NOT trigger a full-disk scan + write.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (!isMain) {
  // Importer wants the exported predicates only.
} else runMain();

function runMain() {
const result = {};
let withApi = 0,
  withButtons = 0,
  missing = 0,
  nestingRiskPages = 0,
  nestingRiskTotal = 0;

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
  const nestingRiskCount = buttons.filter((b) => b.linkButtonNestingRisk).length;
  if (nestingRiskCount > 0) {
    nestingRiskPages++;
    nestingRiskTotal += nestingRiskCount;
  }
  result[row.path] = {
    sourceFile: row.sourceFile,
    module: row.module,
    apiCalls,
    buttonCount: buttons.length,
    linkButtonNestingRiskCount: nestingRiskCount,
    buttons: buttons.slice(0, 200), // safety cap
    lineCount: src.split(/\r?\n/).length,
    crossDomainImports: imports,
  };
}

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`button-handler-scan: ${Object.keys(result).length} pages scanned`);
console.log(`  with API calls : ${withApi}`);
console.log(`  with buttons   : ${withButtons}`);
console.log(`  Link>Button nesting risk : ${nestingRiskTotal} hits across ${nestingRiskPages} pages`);
console.log(`  missing source : ${missing}`);
} // end runMain()
