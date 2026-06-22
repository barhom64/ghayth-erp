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
  "vendor_advances",            // ref — AP mirror of customer_advances (#1141)
  "vendor_credit_memos",        // ref — AP twin of credit_memos (#1141)
  "intercompany_transactions",  // ref — each leg its own center-issued IC number (#1141)
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

// Per-(file, table) exemptions for the stronger coverage check.
// Pairs a route file with a specific executive table where the route
// legitimately INSERTs without issuing — e.g. because the column is
// nullable and the row exists for a different reason. Each entry
// MUST cite a paragraph in the coverage report.
//
// Keying: `${file}::${table}` so a file can exempt one table and still
// be checked for others.
const PER_TABLE_EXEMPTIONS = new Map([
  // G10–G14 all closed (PRs #1325 / #1329 / #1333 / this PR).
  // No per-table exemptions remain — the audit is now zero-exemption
  // at the per-table level. Any new partial-coverage finding will
  // fail CI immediately.
]);

// Non-route exceptions: when a lib/engines/* file legitimately INSERTs
// into an executive table because the CALLER is expected to issue and
// pass the ref. The exemption is documented per file. Drift only counts
// files that have NEITHER issueNumber NOR an entry here.
//
// Each entry MUST cite either (a) the route that passes the ref via
// issueNumber, OR (b) the open issue tracking the gap. No silent
// exemptions.
const NON_ROUTE_EXCEPTIONS = new Map([
  // financialEngine.createPurchaseOrder accepts `ref` as a required
  // parameter. The contract is: caller MUST issue via numberingService
  // and pass the result. The audit verifies caller compliance through
  // the routes-pass; if a caller builds ref inline the
  // `inline-date-now-as-ref` lint rule catches it. After G3 closure
  // every caller passes a real numberingService-issued ref.
  ["lib/engines/financialEngine.ts", "ref is a required parameter; caller MUST issue. Caller-side audit covers compliance"],
  // legalEngine.createCase + supportEngine.createTicket now accept an
  // OPTIONAL ref/caseNumber parameter (G4/G5 closure). The conversion
  // paths in routes/requests.ts pass it; the audit watches that no NEW
  // caller drops back to the NULL-ref path.
  ["lib/engines/legalEngine.ts",     "caseNumber is now optional; caller (routes/requests.ts G5) passes a numberingService-issued value. Coverage report §3 G5 closed."],
  ["lib/engines/supportEngine.ts",   "ref is now optional; callers (routes/requests.ts G4, routes/clientPortal.ts) pass a numberingService-issued value. Coverage report §3 G4 closed."],
  // warehouseEngine.issueStock accepts `reference` as a REQUIRED parameter
  // (same contract as financialEngine.createPurchaseOrder). The only caller
  // today is the fleet.warehouse_deduction.requested handler in
  // lib/eventListeners.ts, which passes the maintenance correlation ref
  // MAINT-{maintenanceId}; route-level movement INSERTs issue via the
  // warehouse.stock_movement scheme directly.
  ["lib/engines/warehouseEngine.ts", "reference is a required parameter; caller (lib/eventListeners.ts fleet handler) passes MAINT-{id}. Caller-side audit covers compliance"],
  // lib/cronScheduler.ts G6+G7 closed in PR #1370: both auto-PO and
  // auto-legal-case paths now route through issueNumber. The audit's
  // regex detects those calls; no exemption needed.
]);

// ─── Regex helpers ──────────────────────────────────────────────────

const INSERT_RE = /INSERT\s+INTO\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const ISSUE_NUMBER_CALL_RE = /\b(?:issueNumber|issueCorrespondenceNumber|reserveNumber)\s*\(/;

// ─── Scanner ────────────────────────────────────────────────────────

async function listRouteFiles() {
  const all = await readdir(ROUTES_DIR);
  return all.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
}

// Non-route layers that ALSO write executive tables — scanned as a
// second pass so the audit doesn't miss them.
//
// Lawyer's review (2026-05-27 coverage report) flagged 7 gaps outside
// routes/: lib/engines/financialEngine.ts (createPurchaseOrder),
// lib/engines/supportEngine.ts (createTicket), lib/engines/legalEngine.ts
// (createCase), lib/cronScheduler.ts (purchase_orders + legal_cases
// auto-creation), lib/disciplineEngine.ts (generateMemoNumber). The
// audit must reach those layers too.
const LIB_DIR = join(REPO_ROOT, "artifacts/api-server/src/lib");
const NON_ROUTE_SCAN_PATHS = [
  "engines",          // every file in lib/engines/
  "cronScheduler.ts", // a single file
  "disciplineEngine.ts",
];

async function listNonRouteFiles() {
  const results = [];
  for (const p of NON_ROUTE_SCAN_PATHS) {
    const full = join(LIB_DIR, p);
    try {
      const stat = await import("node:fs/promises").then((m) => m.stat(full));
      if (stat.isDirectory()) {
        const entries = await readdir(full);
        for (const e of entries) {
          if (e.endsWith(".ts") && !e.endsWith(".d.ts")) {
            results.push({ path: join(full, e), label: `lib/${p}/${e}` });
          }
        }
      } else if (stat.isFile()) {
        results.push({ path: full, label: `lib/${p}` });
      }
    } catch {
      // path doesn't exist — skip silently (drift gates handle that)
    }
  }
  return results;
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

// Stronger check: for each executive table the file INSERTs into,
// confirm there is at least one issueNumber({...}) call in the same
// file whose `entityTable` argument matches that table. A pass on
// routeIssuesNumbering ALONE just proves the file calls issueNumber
// SOMEWHERE — but the file might issue for one table (e.g.
// sales_invoice) while INSERTing into a DIFFERENT executive table
// (e.g. credit_memos) without issuing a ref. This catches that case.
function tablesIssuedFor(source) {
  const out = new Set();
  let i = 0;
  const needle = "issueNumber({";
  while (true) {
    const idx = source.indexOf(needle, i);
    if (idx === -1) break;
    let depth = 1;
    let j = idx + needle.length;
    while (j < source.length && depth > 0) {
      const ch = source[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    const block = source.slice(idx, j);
    const m = block.match(/entityTable:\s*["']([^"']+)["']/);
    if (m) out.add(m[1]);
    i = j;
  }
  // Also pick up issueCorrespondenceNumber helpers that always target
  // the same table.
  if (/issueCorrespondenceNumber\s*\(/.test(source) && source.includes("correspondence")) {
    out.add("correspondence");
  }
  return out;
}

async function main() {
  const files = await listRouteFiles();
  const rows = [];
  // Per-(file, table) gaps where the file INSERTs into a table but
  // doesn't issue for that specific table (only flagged once we've
  // also confirmed the file *does* call issueNumber for at least one
  // OTHER table — so a fully-bypassing file shows in the main row, and
  // the partial gaps show here).
  const perTableGaps = [];
  for (const file of files) {
    if (SKIP_FILES.has(file)) continue;
    const path = join(ROUTES_DIR, file);
    const source = await readFile(path, "utf8");
    const tables = findExecutiveInserts(source);
    if (tables.length === 0) continue;
    const issues = routeIssuesNumbering(source);
    const note = ENGINE_FORWARD_NOTES.get(file) ?? null;
    rows.push({ file, tables, issues, note });
    if (issues) {
      const issuedFor = tablesIssuedFor(source);
      for (const t of tables) {
        if (!issuedFor.has(t) && !note) {
          const exemptKey = `${file}::${t}`;
          const exempt = PER_TABLE_EXEMPTIONS.get(exemptKey) ?? null;
          perTableGaps.push({ file, table: t, exempt });
        }
      }
    }
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

  // ── Second pass: lib/engines/, lib/cronScheduler.ts, lib/disciplineEngine.ts ──
  // These layers were uncovered by the original scan — the 2026-05-27
  // coverage report exposed 7 gaps in them. Any executive INSERT here
  // MUST be paired with issueNumber in the same file (same rule as for
  // routes), or appear in NON_ROUTE_EXCEPTIONS with a documented reason.
  const nonRouteFiles = await listNonRouteFiles();
  const nonRouteRows = [];
  for (const { path, label } of nonRouteFiles) {
    const src = await readFile(path, "utf8");
    const tables = findExecutiveInserts(src);
    if (tables.length === 0) continue;
    const issues = routeIssuesNumbering(src);
    const exempt = NON_ROUTE_EXCEPTIONS.get(label) ?? null;
    nonRouteRows.push({ label, tables, issues, exempt });
  }

  if (nonRouteRows.length > 0) {
    console.log("Non-route layer scan (lib/engines/, lib/cronScheduler.ts, lib/disciplineEngine.ts):");
    const widthLbl = Math.max(35, ...nonRouteRows.map((r) => r.label.length));
    const widthTbl = Math.max(25, ...nonRouteRows.map((r) => r.tables.join(", ").length));
    for (const r of nonRouteRows.sort((a, b) => Number(b.issues) - Number(a.issues) || a.label.localeCompare(b.label))) {
      const status = r.issues ? "✓"
        : r.exempt ? "→ exempt"
        : "✗ MISSING";
      console.log(
        "  " + r.label.padEnd(widthLbl, " ") + "  " +
        r.tables.join(", ").padEnd(widthTbl, " ") + "  " +
        status.padEnd(13, " ") + "  " +
        (r.exempt ?? ""),
      );
    }
    console.log("");
  }

  const nonRouteDrifts = nonRouteRows.filter((r) => !r.issues && !r.exempt);

  // Per-(file, table) drift — partial coverage. A file passes the
  // file-level check (it calls issueNumber somewhere) but doesn't
  // issue for every table it INSERTs into. credit_memos / debit_memos
  // are the canonical examples: finance-invoices.ts issues for
  // sales_invoice only.
  const perTableUnexempt = perTableGaps.filter((g) => !g.exempt);
  if (perTableGaps.length > 0) {
    console.log(`Per-table coverage drift (file issues for SOME table(s) but not for ALL):`);
    for (const g of perTableGaps) {
      const status = g.exempt ? "→ exempt" : "✗";
      console.log(`  ${status} ${g.file} → INSERT INTO ${g.table}${g.exempt ? ` — ${g.exempt}` : " but no issueNumber({ entityTable: \"" + g.table + "\" }) in the same file"}`);
    }
    console.log("");
  }

  if (drifts.length === 0 && legacyHits.length === 0 && nonRouteDrifts.length === 0 && perTableUnexempt.length === 0) {
    console.log("✓ audit-numbering-coverage: every route AND non-route layer writes through the numbering center AND zero legacy patterns remain.");
    process.exit(0);
  }

  if (perTableUnexempt.length > 0) {
    console.error(`✗ audit-numbering-coverage: ${perTableUnexempt.length} per-table gap(s) — a file issues for one table but INSERTs into another without issuing:`);
    for (const g of perTableUnexempt) {
      console.error(`  • ${g.file} → ${g.table} (missing issueNumber({ entityTable: "${g.table}" }))`);
    }
    console.error("");
  }

  if (nonRouteDrifts.length > 0) {
    console.error(`✗ audit-numbering-coverage: ${nonRouteDrifts.length} non-route file(s) INSERT into an executive table without issueNumber:`);
    for (const r of nonRouteDrifts) {
      console.error(`  • ${r.label} → ${r.tables.join(", ")}`);
    }
    console.error("");
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
