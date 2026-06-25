#!/usr/bin/env node
// scripts/src/check-module-strip-coverage.mjs
//
// Module top-strip (tabs-nav) coverage gate. Companion to
// check-tabs-coverage.mjs (which governs that each tab href is real) — this
// one governs the INVERSE: that every routed page which lives INSIDE a module
// actually renders that module's horizontal navigation strip (ModuleTabsNav /
// <XxxTabsNav/>), so the top strip never disappears as the user moves between
// pages of the same module.
//
// Why this exists: the strip is injected PER PAGE (each page renders its
// module's <XxxTabsNav/> just under PageShell). That's the codebase's chosen
// contract (see hrNavStabilitySmoke.test.ts + persona-hr-nav-stability.spec.ts),
// but the contract was only enforced on 5 HR pages. Every other page that
// forgot the strip silently lost its top navigation — the exact "تختفي القائمة
// العلوية" complaint. This generalises the HR contract to every module.
//
// A page "belongs to a module" when its route path falls under one of the
// module's URL prefixes (mirroring the sidebar's grouping). Membership and the
// expected strip are derived from the same navigation the sidebar uses.
//
//   - missing-strip-main   (HARD) : a list / dashboard / report / tool page
//                                    under a module that renders NO *TabsNav.
//                                    These are the pages the user lands on; the
//                                    strip must be there. Fails --strict.
//   - missing-strip-detail (SOFT) : a detail (:id) / create / edit / new page
//                                    with no strip. Report-only — some full-
//                                    screen forms intentionally omit it.
//
// The route → component → page-file resolution reads the routes/*.tsx files
// (`const X = lazy(() => import("@/pages/.."))` + `{ path, component: X }`).
// Pure extractors are exported so the .test.mjs sibling can pin them.
//
// Usage:
//   node scripts/src/check-module-strip-coverage.mjs           # report-only
//   node scripts/src/check-module-strip-coverage.mjs --strict  # exit 1 on HARD

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.join(REPO, "artifacts/ghayth-erp/src");
const ROUTES_DIR = path.join(APP, "routes");

const STRICT = process.argv.includes("--strict");

// ── module map — URL prefixes that each module's top strip covers ───────────
// Derived from the *-tabs-nav.tsx wrappers + navigation.registry.ts module
// roots. A routed path belongs to the module whose LONGEST prefix it matches.
// `label` is the Arabic module name used in the report.
export const MODULES = [
  { key: "finance",   label: "المالية والمحاسبة", prefixes: ["/finance"] },
  { key: "hr",        label: "الموارد البشرية",    prefixes: ["/hr", "/employees"] },
  { key: "fleet",     label: "الأسطول والنقل",     prefixes: ["/fleet", "/me/driver"] },
  { key: "umrah",     label: "العمرة",             prefixes: ["/umrah"] },
  { key: "property",  label: "إدارة الأملاك",      prefixes: ["/properties"] },
  { key: "warehouse", label: "المستودعات",         prefixes: ["/warehouse"] },
  { key: "store",     label: "المتجر",             prefixes: ["/store"] },
  { key: "projects",  label: "المشاريع",           prefixes: ["/projects", "/tasks"] },
  { key: "crm",       label: "العملاء والمبيعات",  prefixes: ["/crm", "/clients"] },
  { key: "support",   label: "الدعم الفني",        prefixes: ["/support"] },
  { key: "legal",     label: "الشؤون القانونية",   prefixes: ["/legal"] },
  { key: "bi",        label: "ذكاء الأعمال",       prefixes: ["/bi"] },
];

// ── pure helpers (exported; exercised by the .test.mjs sibling) ─────────────

/** Strip a trailing query string / hash so a route path compares to a prefix. */
export function basePath(p) {
  return p.replace(/[?#].*$/, "");
}

/** Map `const NAME = lazy(() => import("IMPORT"))` (and plain default imports)
 *  → { NAME: IMPORT }. Quote-agnostic; tolerates webpackChunkName comments. */
export function extractComponentImports(src) {
  const map = {};
  let m;
  const reLazy =
    /\bconst\s+([A-Za-z0-9_]+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g;
  while ((m = reLazy.exec(src)) !== null) map[m[1]] = m[2];
  const rePlain = /\bimport\s+([A-Za-z0-9_]+)\s+from\s+["'`]([^"'`]+)["'`]/g;
  while ((m = rePlain.exec(src)) !== null) if (!map[m[1]]) map[m[1]] = m[2];
  return map;
}

/** Map `{ path: "P", component: NAME }` → [{ path, component }]. Inline
 *  redirect components (`component: redirectTo(...)`) are skipped — they are
 *  not pages. Named RedirectToXxx components are flagged so callers can skip. */
export function extractRouteEntries(src) {
  const out = [];
  // NB: the redirectTo(...) branch must precede the bare-identifier branch, or
  // the latter matches just the word "redirectTo" and the skip below misses it.
  const re =
    /\{\s*path:\s*["'`]([^"'`]+)["'`]\s*,\s*component:\s*(redirectTo\([^)]*\)|[A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const comp = m[2];
    if (comp === "redirectTo" || comp.startsWith("redirectTo(")) continue;
    out.push({ path: m[1], component: comp });
  }
  return out;
}

/** A thin client redirect page (renders nothing, just bounces the route).
 *  These are not real surfaces and must never be asked to render a strip. */
export function isRedirectPage(src) {
  if (!src) return false;
  if (/<\s*Redirect\b/.test(src)) return true; // wouter <Redirect/>
  // useEffect(() => setLocation("/..")) + `return null` — the canonical
  // imperative redirect (e.g. CustomerAdvancesWorkbenchRedirect).
  const bounces = /set(?:Location|location)\s*\(\s*["'`]\//.test(src) || /\bnavigate\s*\(\s*["'`]\//.test(src);
  const rendersNothing = /return\s+null\s*;?\s*\}?\s*$/m.test(src) || /=>\s*null\b/.test(src);
  return bounces && rendersNothing;
}

/** Classify a route so we gate list/dashboard/report/tool pages but only
 *  report detail/create/edit forms (and skip redirects). A page is a
 *  form/detail when its URL says so (`:id`, /create|/new|/edit), its source
 *  lives under pages/create|details/**, OR it uses a FOCUSED layout component
 *  (CreatePageLayout / EntityDetailPage / *DetailPage) or a back-button view —
 *  those are intentionally task-focused surfaces, not module list pages, so
 *  the module strip does not belong on them. `file`/`src` may be "".  */
export function pageKind(routePath, file = "", src = "") {
  const b = basePath(routePath);
  const f = (file || "").replace(/\\/g, "/");
  if (isRedirectPage(src)) return "redirect";
  const usesDetailLayout =
    /\b(EntityDetailPage|DetailPageLayout|RecordDetail)\b/.test(src) || /\bbackHref\s*[=:]/.test(src);
  const usesFormLayout =
    /\b(CreatePageLayout|FormPageLayout|WizardLayout)\b/.test(src) || /\bbackPath\s*[=:]/.test(src);
  if (b.includes(":") || /\/pages\/details\//.test(f) || usesDetailLayout) return "detail";
  if (/\/(create|new|edit)$/.test(b) || /\/pages\/create\//.test(f) || usesFormLayout) return "form";
  return "main";
}

/** Longest-prefix module match for a route path (null = not in any module). */
export function moduleFor(routePath, modules = MODULES) {
  const b = basePath(routePath);
  let best = null;
  let bestLen = 0;
  for (const mod of modules) {
    for (const pre of mod.prefixes) {
      if ((b === pre || b.startsWith(pre + "/")) && pre.length > bestLen) {
        best = mod;
        bestLen = pre.length;
      }
    }
  }
  return best;
}

/** True when a page source renders ANY module strip (<XxxTabsNav/> or
 *  <ModuleTabsNav/>). Any *TabsNav counts — a page may legitimately use a
 *  related sub-strip (AllocationTabsNav, FleetTelematicsTabsNav). */
export function rendersStrip(src) {
  return /<\s*[A-Za-z][A-Za-z0-9]*TabsNav\b/.test(src);
}

/** A thin delegation page whose whole body is `return <Foo .../>` — it re-uses
 *  another component that may itself render the strip (e.g. the umrah
 *  agent/group profitability pages both render <ProfitabilityReport/>). Returns
 *  the delegated component name, or null. */
export function delegatedComponent(src) {
  const m = src.match(/return\s+<([A-Z][A-Za-z0-9]*)\b[^>]*\/>\s*;?\s*\}?/);
  return m ? m[1] : null;
}

/** Map a Capitalized import name → its module specifier, for resolving a
 *  delegated component to its file. */
export function importSpecifier(src, name) {
  const re = new RegExp(
    `import\\s*(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name})\\s*from\\s*["'\\\`]([^"'\\\`]+)["'\\\`]`,
  );
  const m = src.match(re);
  return m ? m[1] : null;
}

// Intentional exceptions — standalone / full-screen surfaces that carry their
// own complete chrome, where a module strip does not belong. Each MUST carry a
// reason (audited like the repo's other allowlists).
export const STRIP_EXEMPT = new Map([
  ["/properties/guide",
    "دليل تفاعلي standalone بـ chrome خاص (هيدر لاصق + قائمة أقسام داخلية)، بلا PageShell — لا موضع نظيف للشريط"],
]);

// ── impure aggregation ──────────────────────────────────────────────────────

/** Resolve a `@/...` import to an on-disk page file (try .tsx then /index.tsx). */
function resolveImport(imp) {
  if (!imp_isLocal(imp)) return null;
  const rel = imp.replace(/^@\//, "");
  const candidates = [
    path.join(APP, rel + ".tsx"),
    path.join(APP, rel + ".ts"),
    path.join(APP, rel, "index.tsx"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
function imp_isLocal(imp) {
  return imp.startsWith("@/") || imp.startsWith("./") || imp.startsWith("../");
}

/** Resolve an import specifier relative to a source file (handles @/ and ./..). */
function resolveFrom(fromFile, imp) {
  if (imp.startsWith("@/")) return resolveImport(imp);
  if (!fromFile) return null;
  const base = path.resolve(path.dirname(fromFile), imp);
  for (const c of [base + ".tsx", base + ".ts", path.join(base, "index.tsx")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** rendersStrip, following ONE level of thin delegation: a page whose body is
 *  `return <Foo/>` counts as having the strip if Foo's file renders it. */
function rendersStripDeep(file, src) {
  if (rendersStrip(src)) return true;
  const dc = delegatedComponent(src);
  if (!dc) return false;
  const spec = importSpecifier(src, dc);
  if (!spec || !imp_isLocal(spec)) return false;
  const f = resolveFrom(file, spec);
  if (!f || !fs.existsSync(f)) return false;
  return rendersStrip(fs.readFileSync(f, "utf-8"));
}

function collectRoutes() {
  const entries = [];
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith("Routes.tsx")) continue;
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf-8");
    const imports = extractComponentImports(src);
    for (const { path: rp, component } of extractRouteEntries(src)) {
      const imp = imports[component];
      if (!imp) continue; // component defined elsewhere / inline — skip
      const f = resolveImport(imp);
      entries.push({ routePath: rp, component, file: f, routesFile: file });
    }
  }
  return entries;
}

function main() {
  const routes = collectRoutes();
  const perModule = new Map(MODULES.map((m) => [m.key, {
    label: m.label, total: 0, withStrip: 0, exempt: 0,
    missingMain: [], missingDetail: [],
  }]));

  const seen = new Set();
  for (const r of routes) {
    const mod = moduleFor(r.routePath);
    if (!mod) continue;
    // de-dup by path (a path can appear once); keep first
    if (seen.has(r.routePath)) continue;
    seen.add(r.routePath);
    const src = r.file && fs.existsSync(r.file) ? fs.readFileSync(r.file, "utf-8") : "";
    const kind = pageKind(r.routePath, r.file || "", src);
    if (kind === "redirect") continue; // thin bounce page — not a real surface
    const bucket = perModule.get(mod.key);
    bucket.total++;
    const has = src && rendersStripDeep(r.file, src);
    if (has) { bucket.withStrip++; continue; }
    if (STRIP_EXEMPT.has(basePath(r.routePath))) { bucket.exempt++; continue; }
    const rec = { path: r.routePath, file: r.file ? path.relative(REPO, r.file) : "(unresolved)" };
    if (kind === "main") bucket.missingMain.push(rec);
    else bucket.missingDetail.push(rec);
  }

  let totalMain = 0;
  let totalDetail = 0;
  console.log(`# module top-strip (tabs-nav) coverage\n`);
  console.log(`mode: ${STRICT ? "STRICT (gate)" : "report-only"}\n`);
  console.log(
    `${"module".padEnd(22)} ${"routed".padStart(6)} ${"strip".padStart(6)} ` +
    `${"miss-main".padStart(10)} ${"miss-detail".padStart(12)}`,
  );
  for (const m of MODULES) {
    const b = perModule.get(m.key);
    totalMain += b.missingMain.length;
    totalDetail += b.missingDetail.length;
    console.log(
      `${b.label.padEnd(22)} ${String(b.total).padStart(6)} ` +
      `${String(b.withStrip).padStart(6)} ${String(b.missingMain.length).padStart(10)} ` +
      `${String(b.missingDetail.length).padStart(12)}`,
    );
  }
  console.log(
    `\n[HARD] main pages missing strip:   ${totalMain}` +
    `\n[soft] detail/form missing strip:  ${totalDetail}\n`,
  );

  for (const m of MODULES) {
    const b = perModule.get(m.key);
    if (b.missingMain.length === 0) continue;
    console.log(`## [HARD] ${b.label} — main pages with no top strip\n`);
    for (const r of b.missingMain) console.log(`  ${r.path}\n      ${r.file}`);
    console.log();
  }

  if (totalMain === 0) console.log(`✓ every module main page renders its top strip.`);

  if (STRICT && totalMain > 0) {
    console.error(
      `\n✗ module-strip gate FAILED: ${totalMain} main page(s) under a module ` +
      `render no top navigation strip.`,
    );
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
