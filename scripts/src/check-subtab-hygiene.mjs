// check-subtab-hygiene.mjs
//
// The system renders TWO horizontal menu layers: the MAIN module tab-bar
// (*-tabs-nav.tsx, guarded by gate:tabs) and the SUB tab-bar inside a page
// (shadcn <Tabs>/<TabsTrigger>). This gate keeps the SUB tabs Arabic: it scans
// every page for static <TabsTrigger>…</TabsTrigger> labels and FAILS --strict if
// one leaks Latin outside the established-acronym allow-list.
//
// Dynamic labels (those containing a {JSX expression}, e.g. «الطلبات ({n})») are
// skipped — only the static text portion can be statically verified.
//
//   node scripts/src/check-subtab-hygiene.mjs            # report
//   node scripts/src/check-subtab-hygiene.mjs --strict   # exit 1 on Latin sub-tab

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.resolve(__dirname, "../../artifacts/ghayth-erp/src/pages");
const strict = process.argv.includes("--strict");

const ACRONYM = /\b(WPS|ZATCA|WHT|PDPL|CAPA|B2C|YTD|MDVR|CMSV6|GL|PBX|VAT|SARIE|SoD|KPI)\b/g;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk(PAGES);
const violations = [];
let scanned = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf-8");
  for (const m of src.matchAll(/<TabsTrigger[^>]*>([^<]*)<\/TabsTrigger>/g)) {
    const label = m[1].trim();
    if (!label || label.includes("{")) continue; // dynamic / empty — skip
    scanned++;
    const residue = label.replace(ACRONYM, "").replace(/[()/…—.,0-9°٪%&+:|\s-]/g, "");
    if (/[A-Za-z]/.test(residue)) {
      violations.push({ file: path.relative(PAGES, file), label });
    }
  }
}

console.log(`static sub-tabs scanned:      ${scanned}`);
console.log(`[HARD] Latin in a sub-tab:    ${violations.length}`);
if (violations.length) {
  console.log("\n## [HARD] English leaking into a page sub-tab (Arabise; acronyms allow-listed)");
  for (const v of violations.sort((a, b) => a.file.localeCompare(b.file))) console.log(`  ${v.file}: «${v.label}»`);
}
if (!violations.length) console.log("\n✓ page sub-tabs Arabic-clean");

if (strict && violations.length > 0) process.exit(1);
