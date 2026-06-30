// check-nav-label-hygiene.mjs
//
// Permanent protection against the two classes of navigation defect this repo
// has repeatedly had to clean up by hand:
//
//   1. DUPLICATION — the same Arabic label pointing at two different pages, so
//      the menu LOOKS like it has duplicate features («المخاطر» ×2, «الامتثال» ×2,
//      «السياسات والحوكمة» vs «الحوكمة والامتثال» …). Each must be disambiguated,
//      OR explicitly allow-listed as a legitimate per-module context label.
//
//   2. LATIN LEAKAGE — an English/acronym label creeping back into the sidebar
//      after the full Arabisation pass (GL Health / Cockpit / CMSV6 …).
//
//   3. CANONICAL DRIFT — a registry label that is neither the canonical label
//      nor a registered search alias in navigation.canonical-map.ts (the single
//      source of truth, rule #5/#6). Adding a label means updating the map.
//
// Robust by construction: reads only the two static TS files (registry +
// canonical-map), never resolves routes or page files, so it cannot flake in CI.
//
//   node scripts/src/check-nav-label-hygiene.mjs            # report
//   node scripts/src/check-nav-label-hygiene.mjs --strict   # exit 1 on any HARD violation

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const REGISTRY = path.join(ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts");
const CANONICAL = path.join(ROOT, "artifacts/ghayth-erp/src/components/layout/navigation.canonical-map.ts");

const strict = process.argv.includes("--strict");

// ── Allowlists ────────────────────────────────────────────────────────────

// Labels that are INTENTIONALLY shared across several paths because the sidebar
// section (the module) is the disambiguator — e.g. each module has its own
// «التقارير». Adding to this list is a deliberate, reviewed decision.
const CONTEXT_SCOPED_DUP_LABELS = new Set([
  "لوحة التحكم",   // per-module dashboards (/dashboard + /module-dashboards?tab=…)
  "نظرة عامة",     // group-landing overview per module (legal / governance / properties)
  "التقارير",      // each module's reports landing (hr / fleet / warehouse / umrah)
  "الفواتير",      // finance vs umrah invoices — section-scoped
  "المدفوعات",     // finance / properties / umrah payments — section-scoped
  "الطلبات",       // hr services vs store orders — section-scoped
  "الموردون",      // owner decision: finance vs warehouse, section disambiguates (canonical-map)
  "لوحة التشغيل",  // fleet telematics ops vs umrah ops — section-scoped
  "الإعدادات",     // global settings vs umrah settings — section-scoped
  "الباقات",       // umrah packages vs website CMS packages — section-scoped
]);

// Established Latin acronyms permitted ONLY inside parentheses next to an Arabic
// term (e.g. «أجهزة التسجيل (MDVR)»). A bare Latin label is never allowed.
const LATIN_PAREN_OK = /\([A-Za-z0-9/ .-]+\)/g;

// ── Parse helpers ─────────────────────────────────────────────────────────

/** Every { label, path } in the registry (children included). */
function registryEntries() {
  const src = fs.readFileSync(REGISTRY, "utf-8");
  const re = /label:\s*"([^"]+)"\s*,\s*path:\s*"([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ label: m[1], path: m[2].replace(/[?#].*$/, "") });
  return out;
}

/** canonical-map: path -> { canon, aliases:Set }. */
function canonicalMap() {
  const src = fs.readFileSync(CANONICAL, "utf-8");
  const re = /\{\s*path:\s*"([^"]+)",\s*canonicalLabel:\s*"([^"]+)",(?:\s*aliases:\s*\[([^\]]*)\],)?/g;
  const map = new Map();
  let m;
  while ((m = re.exec(src))) {
    const aliases = new Set((m[3] || "").split(",").map((s) => s.replace(/^\s*"|"\s*$/g, "").trim()).filter(Boolean));
    map.set(m[1], { canon: m[2], aliases });
  }
  return map;
}

// ── Checks ────────────────────────────────────────────────────────────────

const entries = registryEntries();
const canon = canonicalMap();
const hard = [];

// 1. Duplicate labels (same label, ≥2 distinct paths).
const byLabel = new Map();
for (const e of entries) {
  if (!byLabel.has(e.label)) byLabel.set(e.label, new Set());
  byLabel.get(e.label).add(e.path);
}
const dupViolations = [];
for (const [label, paths] of byLabel) {
  if (paths.size > 1 && !CONTEXT_SCOPED_DUP_LABELS.has(label)) {
    dupViolations.push({ label, paths: [...paths] });
  }
}

// 2. Latin leakage (Latin letters outside an allowed parenthetical).
const latinViolations = [];
for (const label of new Set(entries.map((e) => e.label))) {
  const stripped = label.replace(LATIN_PAREN_OK, "");
  if (/[A-Za-z]/.test(stripped)) latinViolations.push(label);
}

// 3. Canonical drift (governed path whose registry label ∉ canon ∪ aliases).
const driftViolations = [];
for (const e of entries) {
  const c = canon.get(e.path);
  if (c && e.label !== c.canon && !c.aliases.has(e.label)) {
    driftViolations.push({ path: e.path, label: e.label, canon: c.canon });
  }
}

// ── Report ────────────────────────────────────────────────────────────────

console.log(`nav labels scanned:                 ${entries.length}`);
console.log(`[HARD] duplicate labels:            ${dupViolations.length}`);
console.log(`[HARD] Latin labels:                ${latinViolations.length}`);
console.log(`[HARD] canonical-map drift:         ${driftViolations.length}`);

if (dupViolations.length) {
  console.log("\n## [HARD] duplicate labels (same label → different pages)");
  console.log("   Disambiguate the label, or add it to CONTEXT_SCOPED_DUP_LABELS with a reason.");
  for (const v of dupViolations) console.log(`  «${v.label}»  →  ${v.paths.join("  ,  ")}`);
}
if (latinViolations.length) {
  console.log("\n## [HARD] Latin labels (Arabise; keep acronyms only inside parentheses)");
  for (const l of latinViolations) console.log(`  «${l}»`);
}
if (driftViolations.length) {
  console.log("\n## [HARD] canonical-map drift (label not the canonical nor a registered alias)");
  console.log("   Update navigation.canonical-map.ts (canonicalLabel or aliases) for the path.");
  for (const v of driftViolations) console.log(`  ${v.path}: «${v.label}» (canonical «${v.canon}»)`);
}

const totalHard = dupViolations.length + latinViolations.length + driftViolations.length;
if (totalHard === 0) console.log("\n✓ nav label hygiene clean");

if (strict && totalHard > 0) process.exit(1);
