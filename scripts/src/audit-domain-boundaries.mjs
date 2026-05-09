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

// Files that are domain-neutral orchestrators. They may write to multiple
// domains' tables, but they should ideally use engines too. For now we
// only flag the listed cases (hr.ts journal_entries, etc.) — neutral
// orchestrators are checked separately if they appear in this list.
const NEUTRAL_FILES = new Set([
  "requests.ts",       // Generic request → entity converter
  "clientPortal.ts",   // External-facing portal
  "index.ts",          // Router barrel
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

  for await (const filePath of walkFiles(ROUTES_DIR)) {
    fileCount++;
    const basename = filePath.split("/").pop();
    const ownDomain = ROUTE_DOMAIN[basename];
    const isNeutral = NEUTRAL_FILES.has(basename);

    // Skip files we don't classify (finance-*.ts, etc. — they own their writes)
    if (!ownDomain && !isNeutral) continue;

    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");

    for (const pat of PATTERNS) {
      pat.lastIndex = 0;
      let match;
      while ((match = pat.exec(content)) !== null) {
        const table = match[1];
        const owner = TABLE_OWNER[table];
        if (!owner) continue; // unknown table — not our concern
        if (ownDomain && owner === ownDomain) continue; // own-domain write

        // Find approximate line number
        const upToMatch = content.slice(0, match.index);
        const lineNum = upToMatch.split("\n").length;

        violations.push({
          file: basename,
          line: lineNum,
          domain: ownDomain || "neutral",
          table,
          tableOwner: owner,
          op: match[0].split(/\s+/)[0].toUpperCase(),
        });
      }
    }
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
