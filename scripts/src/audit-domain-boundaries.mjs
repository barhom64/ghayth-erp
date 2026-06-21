#!/usr/bin/env node
//
// scripts/src/audit-domain-boundaries.mjs — Guard #5 (domain boundaries).
//
// Every business domain owns a fixed set of database tables. This script
// scans each route file and refuses any direct INSERT/UPDATE/DELETE SQL
// against tables owned by another domain. Cross-domain writes must go
// through the owning domain's engine API or via events.
//
// This catches violations like:
//   - hr.ts running `UPDATE journal_entries SET status='posted'`
//     (Finance owns journal_entries)
//   - requests.ts running `INSERT INTO support_tickets`
//     (Support owns support_tickets)
//   - clientPortal.ts running `INSERT INTO invoice_payments`
//     (Finance owns invoice_payments)
//
// Usage:
//
//   node scripts/src/audit-domain-boundaries.mjs
//   pnpm audit:domain-boundaries
//

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");

// Each domain owns these tables. Writes to these tables from any other
// domain's route file are forbidden — go through the owning engine or
// emit an event the owning domain handles.
const DOMAIN_TABLES = {
  finance: [
    "journal_entries", "journal_lines", "invoices", "invoice_payments",
    "payments", "account_mappings", "fiscal_periods", "fixed_assets",
    "budgets", "purchase_orders", "chart_of_accounts",
  ],
  hr: [
    "employees", "payroll_runs", "payroll_items", "payroll_deductions",
    "attendance", "leave_requests", "leave_balances", "eos_provisions",
    "employee_assignments",
  ],
  fleet: [
    "fleet_vehicles", "fleet_fuel_logs", "fleet_maintenance",
    "fleet_trips", "fleet_drivers", "fleet_traffic_violations",
    "fleet_insurance",
  ],
  warehouse: ["warehouse_products", "warehouse_movements", "warehouse_categories"],
  legal: ["legal_cases", "legal_sessions", "legal_contracts"],
  crm: ["crm_leads", "crm_opportunities", "crm_activities"],
  properties: [
    "property_buildings", "property_units", "rental_contracts",
    "rent_payments", "property_owners",
  ],
  projects: ["projects", "project_tasks", "project_costs"],
  umrah: [
    "umrah_campaigns", "umrah_pilgrims", "umrah_agents",
    "umrah_agent_invoices", "umrah_transport",
  ],
  support: ["support_tickets"],
  store: ["store_products", "store_orders", "store_categories"],
};

// Map: route file basename → its domain.
const ROUTE_DOMAIN = {
  "hr.ts": "hr",
  "fleet.ts": "fleet",
  "warehouse.ts": "warehouse",
  "legal.ts": "legal",
  "crm.ts": "crm",
  "properties.ts": "properties",
  "projects.ts": "projects",
  "umrah.ts": "umrah",
  "support.ts": "support",
  "store.ts": "store",
};

// Prefix-based owner inference for the ~110 route files NOT in ROUTE_DOMAIN.
// Before #review-2026-06-21 the audit skipped every unmapped file (finance-*,
// hr-*, transport-*, communications, admin, employees…), so real cross-domain
// writes slipped through. We now scan EVERY route file: the owner is resolved
// via ROUTE_DOMAIN → this prefix list (first match wins, order matters) →
// otherwise the file's own stem (an unknown, non-table-owning domain, so any
// write it makes to a DOMAIN_TABLES table is flagged as cross-domain).
// Domains that own no DOMAIN_TABLES (transport/communications/admin/…) are
// intentionally left to resolve to their stem so their cross writes surface.
const DOMAIN_PREFIXES = [
  ["accounting-engine", "finance"],
  ["finance-", "finance"],
  ["hr-", "hr"],
  ["employees", "hr"],
  ["employeeTrackingPolicy", "hr"],
  ["recruitment", "hr"],
  ["training", "hr"],
  ["vehicle-profile", "fleet"],
  ["fleet-", "fleet"],
  ["fleet", "fleet"],
  ["warehouse", "warehouse"],
  ["properties", "properties"],
  ["projects", "projects"],
  ["umrah", "umrah"],
  ["marketing", "crm"],
  ["crm", "crm"],
  ["legal", "legal"],
  ["support", "support"],
  ["store", "store"],
];

function inferDomain(basename) {
  if (ROUTE_DOMAIN[basename]) return ROUTE_DOMAIN[basename];
  for (const [prefix, domain] of DOMAIN_PREFIXES) {
    if (basename.startsWith(prefix)) return domain;
  }
  // Unknown / non-table-owning domain → use the stem so cross writes flag.
  return basename.replace(/\.ts$/, "");
}

// Known pre-existing cross-domain writes (ratchet baseline). Each entry is
// "basename:table" and is documented + tracked for removal. The audit fails
// only on writes NOT in this set — so coverage expands immediately (no new
// violations allowed) while the documented debt is paid down PR-by-PR. Prune
// an entry the moment its write is removed; a stale entry is harmless but
// should not linger. See plans/architecture-boundary-decisions-2026-06-21.md.
const BASELINE = new Set([
  // (الحذف العابر admin→employee_assignments عولِج ودُمج في #2828؛ بقي فقط
  //  INSERT الـbootstrap المعتمد، المُدرج ضمن قسم الـbootstrap أدناه.)
  // communications (خادم) يقرر دعم/CRM ويكتب جداولهما — قرار نطاق مؤجّل.
  "communications.ts:support_tickets",
  "communications.ts:crm_opportunities",
  // transport-pricing (خادم) ينشئ فاتورة ويحسب ضريبة — يحتاج استخراج خدمة مالية
  // مشتركة (refactor واسع، مادة 15) — قرار نطاق مؤجّل.
  "transport-pricing.ts:invoices",
  // transport يعدّل حالة دوام سائق مملوكة للأسطول — متوسط، موثّق.
  "transport-bookings.ts:fleet_drivers",
  "transport-planning.ts:fleet_drivers",
  // employees (HR) ينشئ سطر ربط fleet_drivers (best-effort) — منخفض، موثّق.
  "employees.ts:fleet_drivers",

  // ── تهيئة المنصّة/تسجيل المستأجر (bootstrap ذرّي) — مقبول دستوريًا ──────────
  // إنشاء شركة+فرع+موظف+مستخدم+RBAC في معاملة واحدة عبر خدمة الترقيم. توفير
  // هوية لا سياسة HR. (مصنّف مقبولًا في تقرير المراجعة 2026-06-21.)
  "auth.ts:employees",
  "auth.ts:employee_assignments",
  "admin.ts:employees",
  "admin.ts:employee_assignments", // INSERT bootstrap فقط (الـDELETE العابر عولِج في #2828)

  // ── كتابات عابرة أظهرها توسيع الحارس — تحتاج فرزًا لاحقًا (دَين موثّق) ───────
  // (لم يُدخلها هذا الـPR؛ كانت قائمة على main قبل توسيع التغطية.)
  "finance-hardening.ts:projects",          // finance يكتب projects (أداة hardening/datafix؟)
  "finance-invoices.ts:warehouse_movements",// ربط الفاتورة بحركة مخزون/COGS؟
  "publicData.ts:employees",                // تحديث employees من مسار بيانات عامة (استكمال ذاتي)
  // (settings→employee_assignments/purchase_orders عُولِجا في #2839: نُقلا لعقدَي
  //  HR/المالية القائدين عند تعطيل الفرع — لم تعد الإعدادات تكتبهما مباشرة.)
]);

// Build reverse index: table → owning domain
const TABLE_OWNER = {};
for (const [domain, tables] of Object.entries(DOMAIN_TABLES)) {
  for (const t of tables) TABLE_OWNER[t] = domain;
}

const PATTERNS = [
  /INSERT\s+INTO\s+([a-z_]+)/gi,
  /UPDATE\s+([a-z_]+)\s+SET/gi,
  /DELETE\s+FROM\s+([a-z_]+)/gi,
];

async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (e.isFile() && p.endsWith(".ts")) yield p;
  }
}

async function main() {
  const violations = [];
  let fileCount = 0;

  const baselineHit = new Set();

  for await (const filePath of walkFiles(ROUTES_DIR)) {
    fileCount++;
    const basename = filePath.split("/").pop();
    // Every route file is now scanned; the owner is inferred (no more silent
    // skip of finance-*/transport-*/communications/admin/…).
    const ownDomain = inferDomain(basename);

    const content = await readFile(filePath, "utf8");

    for (const pat of PATTERNS) {
      pat.lastIndex = 0;
      let match;
      while ((match = pat.exec(content)) !== null) {
        const table = match[1];
        const owner = TABLE_OWNER[table];
        if (!owner) continue; // unknown table — not our concern
        if (owner === ownDomain) continue; // own-domain write

        // Known pre-existing cross-domain write → tracked in BASELINE, skip.
        const key = `${basename}:${table}`;
        if (BASELINE.has(key)) { baselineHit.add(key); continue; }

        // Find approximate line number
        const upToMatch = content.slice(0, match.index);
        const lineNum = upToMatch.split("\n").length;

        violations.push({
          file: basename,
          line: lineNum,
          domain: ownDomain,
          table,
          tableOwner: owner,
          op: match[0].split(/\s+/)[0].toUpperCase(),
        });
      }
    }
  }

  // Surface baseline entries that no longer match any write — they were fixed
  // and should be pruned so the audit actively enforces them again.
  const staleBaseline = [...BASELINE].filter((k) => !baselineHit.has(k));
  if (staleBaseline.length > 0) {
    console.log(
      `[audit-domain-boundaries] note — ${staleBaseline.length} baseline entr(y/ies) no longer match (fixed?) — prune from BASELINE:\n  ${staleBaseline.join("\n  ")}`
    );
  }

  if (violations.length === 0) {
    console.log(`[audit-domain-boundaries] OK — scanned ${fileCount} route files · no cross-domain writes detected.`);
    return;
  }

  console.error(`[audit-domain-boundaries] FAIL — ${violations.length} cross-domain write(s) detected:\n`);
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}  ${v.op} ${v.table}  →  ${v.domain} domain writing to ${v.tableOwner}-owned table`
    );
  }
  console.error(`\n  Fix: route the violation through the owning domain's engine`);
  console.error(`        (e.g. financialEngine.updateJournalStatus, supportEngine.createTicket)`);
  console.error(`        or emit an event the owning domain handles.`);
  process.exit(1);
}

main().catch((e) => {
  console.error("[audit-domain-boundaries] crashed:", e);
  process.exit(1);
});
