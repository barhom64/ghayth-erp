// check-nav-title-consistency.mjs
//
// Page-side companion to gate:labels. After the sidebar was fully Arabised, page
// <PageShell title="…"> strings still carried English glosses («(CFO Cockpit)»,
// «(Approvals Inbox)» …). This gate keeps PAGE TITLES Arabic too: it resolves
// every sidebar entry to its page component, reads the PageShell title, and FAILS
// --strict if a title contains Latin that is not one of a small allow-list of
// established acronyms (WPS / ZATCA / WHT / PDPL …).
//
// `--full` additionally prints the (advisory, non-blocking) list of sidebar-label
// vs page-title differences for on-demand review — most are the intentional
// "short nav label + descriptive page title" convention, so they are NOT gated.
//
// Best-effort resolution: redirect routes, dynamic titles (title={…}), pages with
// no PageShell, and :id/create routes are skipped.
//
//   node scripts/src/check-nav-title-consistency.mjs            # report Latin-in-title
//   node scripts/src/check-nav-title-consistency.mjs --strict   # exit 1 on Latin-in-title
//   node scripts/src/check-nav-title-consistency.mjs --full     # + advisory label≠title list

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "artifacts/ghayth-erp/src");
const ROUTES_DIR = path.join(SRC, "routes");
const REGISTRY = path.join(SRC, "components/layout/navigation.registry.ts");

const strict = process.argv.includes("--strict");
const full = process.argv.includes("--full");

// Established acronyms allowed to remain in an Arabic page title.
const ACRONYM = /\b(WPS|ZATCA|WHT|PDPL|CAPA|B2C|YTD|MDVR|CMSV6|GL|PBX|VAT|SARIE|OCR)\b/g;

function norm(s) {
  return s.replace(/[ً-ْـ]/g, "").replace(/\s+/g, " ").replace(/^ال/, "").trim();
}

// route resolution: nav path -> page file
function pageFileForPaths() {
  const lazyImport = new Map();
  const redirectConsts = new Set();
  const routePaths = [];
  for (const f of fs.readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, f), "utf-8");
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("([^"]+)"\)\)/g)) lazyImport.set(m[1], m[2]);
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*redirectTo\(/g)) redirectConsts.add(m[1]);
    for (const m of src.matchAll(/\{\s*path:\s*"([^"]+)",\s*component:\s*([A-Za-z0-9_]+|redirectTo\([^)]*\))/g)) routePaths.push({ path: m[1], component: m[2] });
  }
  const out = new Map();
  for (const { path: p, component } of routePaths) {
    if (component.startsWith("redirectTo(") || redirectConsts.has(component)) continue;
    const imp = lazyImport.get(component);
    if (!imp) continue;
    const rel = imp.replace(/^@\//, "");
    for (const ext of [".tsx", ".ts"]) {
      const file = path.join(SRC, rel + ext);
      if (fs.existsSync(file)) { out.set(p, file); break; }
    }
  }
  return out;
}

function pageShellTitle(file) {
  const src = fs.readFileSync(file, "utf-8");
  const i = src.indexOf("<PageShell");
  if (i === -1) return null;
  const m = src.slice(i, i + 600).match(/title=\{?"([^"]+)"/);
  return m ? m[1] : null;
}

function navLabelsByPath() {
  const src = fs.readFileSync(REGISTRY, "utf-8");
  const map = new Map();
  for (const m of src.matchAll(/label:\s*"([^"]+)"\s*,\s*path:\s*"([^"]+)"/g)) {
    const p = m[2].replace(/[?#].*$/, "");
    if (!map.has(p)) map.set(p, new Set());
    map.get(p).add(m[1]);
  }
  return map;
}

const pageFiles = pageFileForPaths();
const navLabels = navLabelsByPath();
const latin = [];
const labelDiffs = [];
let compared = 0;

for (const [p, labels] of navLabels) {
  if (p.includes(":")) continue;
  const file = pageFiles.get(p);
  if (!file) continue;
  const title = pageShellTitle(file);
  if (!title) continue;
  compared++;
  // Latin-in-title (HARD): strip acronyms + punctuation/digits, any Latin left = English leak.
  const residue = title.replace(ACRONYM, "").replace(/[()/—.,0-9°٪%&+:|\s-]/g, "");
  if (/[A-Za-z]/.test(residue)) latin.push({ path: p, title });
  // label≠title (advisory)
  const nt = norm(title);
  if (![...labels].some((l) => norm(l) === nt)) labelDiffs.push({ path: p, labels: [...labels], title });
}

console.log(`page titles checked:        ${compared}`);
console.log(`[HARD] Latin in page title: ${latin.length}`);
if (latin.length) {
  console.log("\n## [HARD] English leaking into a page title (Arabise; keep only the allow-listed acronyms)");
  for (const m of latin.sort((a, b) => a.path.localeCompare(b.path))) console.log(`  ${m.path}  →  «${m.title}»`);
}
if (!latin.length) console.log("\n✓ page titles Arabic-clean");

if (full) {
  console.log(`\n[ADVISORY] sidebar label ≠ page title: ${labelDiffs.length} (mostly the intentional short-label / descriptive-title convention)`);
  for (const m of labelDiffs.sort((a, b) => a.path.localeCompare(b.path))) console.log(`  ${m.path}: nav «${m.labels.join("/")}» ≠ «${m.title}»`);
}

if (strict && latin.length > 0) process.exit(1);
