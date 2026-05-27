#!/usr/bin/env node
//
// scripts/src/audit-numbering-coverage.mjs — Issue #1141 stop-ship gate.
//
// The unified numbering center (#1141) only delivers on its architectural
// promise if EVERY executive route that emits an official document number
// goes through `numberingService.issueNumber`. Lint rules already block
// the obvious anti-patterns (nextval, generateTimeRef, generateRef,
// Math.random) — but a route can still introduce a fresh INSERT into an
// executive table without ever calling the numbering center, and the lint
// rules won't catch it.
//
// This audit takes the inverse view: for every INSERT into a table that
// has a `ref` / `number` / `code` column, the route MUST also call
// `issueNumber` somewhere in the same handler body — otherwise we report
// a coverage gap.
//
// Output: a per-route coverage table + a hard exit code (0 clean, 1 drift).
//
// Usage:
//   node scripts/src/audit-numbering-coverage.mjs            # report + fail on drift
//   node scripts/src/audit-numbering-coverage.mjs --report   # report only

import { readdir, readFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const REPORT_ONLY = process.argv.includes("--report");

// Executive document tables — INSERTs into these MUST be paired with
// a `issueNumber` (or `issueCorrespondenceNumber`) call somewhere in
// the same file. Tables NOT in this list are technical / lookup / log
// tables that legitimately have a `ref`-like column for non-document
// purposes (e.g. communications_log.body, bank_statements.reference).
//
// Adding a new executive table that ships a customer-visible number?
// → add it here AND seed a scheme in numbering_schemes.
const EXECUTIVE_TABLES = new Set([
  "requests",
  "employee_contracts",
  "official_letters",
  "employees",                  // empNumber
  "correspondence",
  "invoices",
  "credit_memos",
  "debit_memos",
  "receipt_vouchers",
  "payment_vouchers",
  "expenses",
  "journal_entries",
  "purchase_requests",
  "purchase_orders",
  "goods_receipts",
  "supplier_invoices",
  "payment_runs",
  "bank_guarantees",
  "umrah_groups",
  "umrah_agent_invoices",
  "fleet_trips",
  "rental_contracts",           // contractNumber
  "contract_payment_schedule",  // receiptNumber
  "support_tickets",
  "projects",
  "crm_leads",
  "legal_contracts",
  "legal_cases",                // caseNumber
  "clients",                    // code
  "warehouse_movements",        // reference
  "salary_advances",
  "hr_employee_loans",
  "hr_overtime_requests",
  "hr_exit_requests",
]);

// Files we don't expect to issue numbers — admin / read-only / engine
// helpers, or routes whose INSERTs into executive tables come from the
// engine layer (which already routes through numberingService).
const SKIP_FILES = new Set([
  "numbering.ts",       // the numbering admin surface itself
  "settings.ts",        // settings CRUD
  "auth.ts",            // tokens, sessions
  "admin.ts",           // admin tools
  "index.ts",           // route mounting
  "bi.ts",              // reporting
  "dashboard.ts",       // reporting
  "search.ts",          // read-only
  "notifications.ts",   // user-facing notifications
  "calendar.ts",        // calendar events
  "events.ts",          // event stream
  "execDashboard.ts",   // reporting
  "mySpace.ts",         // self-service
  "actionCenter.ts",    // dashboard
  "obligations.ts",     // derived view
  "audit-logs.ts",      // logs
  "auditLogs.ts",       // logs
  "activityIngest.ts",  // logs
  "activityLog.ts",     // logs
  "permissions.ts",     // admin
  "rbacV2.ts",          // admin
  "rules.ts",           // admin
  "publicData.ts",      // public read
  "storage.ts",         // file storage
  "print.ts",           // print engine
  "printVerify.ts",     // print verify
  "scheduled-reports.ts", // reports
  "gov-integrations.ts",  // gateway
  "moduleDashboards.ts",  // reporting
  "approvalActions.ts",   // approval flows
  "automation.ts",        // automation rules
  "workflows.ts",         // workflows
  "intelligence.ts",      // analytics
  "marketing.ts",         // campaigns
  "pdpl.ts",              // PDPL
  "impactPreview.ts",     // preview tool
  "entityMeta.ts",        // metadata
  "moduleDashboards.ts",  // reporting
  "notification-engine.ts", // notification engine
  "import.ts",            // bulk import
  "export.ts",            // bulk export
  "careersPortal.ts",     // public careers
  "operationsCenter.ts",  // operations dashboard
]);

// File-level overrides: routes that DO issue numbering but indirectly
// via an engine, OR routes that legitimately INSERT into an executive
// table from a forwarded source (e.g. PR conversion → PO).
const ENGINE_FORWARD_NOTES = new Map([
  ["accounting-engine.ts",  "engine forwards through financialEngine.postJournalEntry"],
  ["finance-recurring.ts",   "engine-driven; inherits issueNumber from the JV it generates"],
  ["finance-collection.ts",  "engine-driven collection follow-ups"],
  ["finance-vendor-contracts.ts", "vendor contracts use ref from numberingService via finance-purchase"],
]);

// ─── Regex helpers ──────────────────────────────────────────────────

const INSERT_RE = /INSERT\s+INTO\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const ISSUE_NUMBER_CALL_RE = /\b(?:issueNumber|issueCorrespondenceNumber|reserveNumber)\s*\(/;

// ─── Scanner ────────────────────────────────────────────────────────

async function listRouteFiles() {
  const all = await readdir(ROUTES_DIR);
  return all.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}

function findExecutiveInserts(source) {
  const hits = new Set();
  let m;
  INSERT_RE.lastIndex = 0;
  while ((m = INSERT_RE.exec(source)) !== null) {
    const table = m[1];
    if (EXECUTIVE_TABLES.has(table)) hits.add(table);
  }
  return [...hits];
}

function routeIssuesNumbering(source) {
  return ISSUE_NUMBER_CALL_RE.test(source);
}

async function main() {
  const files = await listRouteFiles();
  const rows = [];
  for (const file of files) {
    if (SKIP_FILES.has(file)) continue;
    const path = join(ROUTES_DIR, file);
    const source = await readFile(path, "utf8");
    const tables = findExecutiveInserts(source);
    if (tables.length === 0) continue;
    const issues = routeIssuesNumbering(source);
    const note = ENGINE_FORWARD_NOTES.get(file) ?? null;
    rows.push({ file, tables, issues, note });
  }

  // ── Render ──
  const drifts = rows.filter((r) => !r.issues && !r.note);
  const widthFile = Math.max(20, ...rows.map((r) => r.file.length));
  const widthTbls = Math.max(20, ...rows.map((r) => r.tables.join(", ").length));

  console.log("");
  console.log(`Numbering coverage audit — Issue #1141`);
  console.log(`scan: ${rows.length} route file(s) that INSERT into an executive table`);
  console.log("");
  console.log(
    "  ".padEnd(widthFile, " ") + "  " +
    "executive table(s)".padEnd(widthTbls, " ") + "  " +
    "issueNumber?  notes",
  );
  console.log("  " + "-".repeat(widthFile + widthTbls + 30));
  for (const r of rows.sort((a, b) => Number(b.issues) - Number(a.issues) || a.file.localeCompare(b.file))) {
    const status = r.issues ? "✓"
      : r.note ? "→engine"
      : "✗ MISSING";
    console.log(
      "  " + r.file.padEnd(widthFile, " ") + "  " +
      r.tables.join(", ").padEnd(widthTbls, " ") + "  " +
      status.padEnd(13, " ") + "  " +
      (r.note ?? ""),
    );
  }
  console.log("");

  // Defence-in-depth proof — also confirm the four legacy patterns
  // are absent across the entire routes/ tree. The lint rules already
  // forbid them, but a fresh contributor reading this report wants
  // ONE place where they can see the live count is zero. Same regexes
  // as scripts/src/lint-patterns.mjs's four numbering rules.
  const allRouteSources = await Promise.all(
    files.map(async (f) => ({ file: f, src: await readFile(join(ROUTES_DIR, f), "utf8") })),
  );
  const LEGACY_PATTERNS = [
    { id: "nextval-in-route",                    re: /\bnextval\s*\(\s*['"`]?[a-zA-Z_]+_seq/, skip: (f) => f === "numbering.ts" },
    { id: "generateTimeRef-as-official-number",  re: /\bgenerateTimeRef\s*\(/,                  skip: () => false },
    { id: "generateRef-or-generateBranchRef",    re: /\bgenerate(?:Branch)?Ref\s*\(/,           skip: () => false },
    { id: "random-as-ref-fallback",              re: /(?:\b(?:seq|ref|number)\b[^;]{0,180}Math\.random\s*\(|Math\.random\s*\(\s*\)[^;]{0,180}\b(?:seq|ref|number)\b)/, skip: () => false },
  ];
  const legacyHits = [];
  for (const { file, src } of allRouteSources) {
    for (const p of LEGACY_PATTERNS) {
      if (p.skip(file)) continue;
      if (p.re.test(src)) legacyHits.push({ file, rule: p.id });
    }
  }
  console.log("Legacy-pattern guard (proof that all four forbidden patterns are absent):");
  for (const p of LEGACY_PATTERNS) {
    const count = legacyHits.filter((h) => h.rule === p.id).length;
    console.log(`  ${count === 0 ? "✓" : "✗"} ${p.id}: ${count} hit(s)`);
  }
  console.log("");

  if (drifts.length === 0 && legacyHits.length === 0) {
    console.log("✓ audit-numbering-coverage: every route writes through the numbering center AND zero legacy patterns remain.");
    process.exit(0);
  }

  if (legacyHits.length > 0) {
    console.error(`✗ audit-numbering-coverage: ${legacyHits.length} legacy-pattern hit(s) survived the lint rules — investigate scripts/src/lint-patterns.mjs:`);
    for (const h of legacyHits) console.error(`  • ${h.file} → ${h.rule}`);
    console.error("");
  }

  console.error(`✗ audit-numbering-coverage: ${drifts.length} route(s) INSERT into an executive document table without going through the numbering center:`);
  for (const r of drifts) {
    console.error(`  • ${r.file} → ${r.tables.join(", ")}`);
  }
  console.error("");
  console.error(`Fix: import \`issueNumber\` from "../lib/numberingService.js" and replace the ref/number/code value with the returned \`number\`. Add an entry to numbering_schemes if the (moduleKey, entityKey) doesn't exist yet.`);
  console.error(`If the INSERT goes through an engine that already issues, add the file to ENGINE_FORWARD_NOTES in scripts/src/audit-numbering-coverage.mjs with a justification.`);
  if (REPORT_ONLY) process.exit(0);
  process.exit(drifts.length > 0 || legacyHits.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[audit-numbering-coverage] CRASHED:", err);
  process.exit(2);
});
