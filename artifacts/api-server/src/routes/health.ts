import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { rawQuery } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Critical tables that every running instance must have, no matter which
 * company or module is enabled. If any of these is missing the server cannot
 * serve basic auth / scope / audit — so `/health/schema` fails them hard.
 *
 * Module-scoped tables (hr_*, finance_*, fleet_*, …) are checked via the
 * broader coverage list but are not in the "critical" set — their absence
 * degrades a specific module rather than bringing the whole server down.
 */
const CRITICAL_TABLES = [
  "companies",
  "branches",
  "users",
  "employees",
  "employee_assignments",
  "role_permissions",
  "audit_logs",
  "event_logs",
  "schema_migrations",
  "approval_requests",
  "notifications",
  "system_settings",
] as const;

/**
 * Per-module expected tables. A module is healthy when every table in its
 * list exists in public schema. Missing tables land in the `missing` array
 * for that module so the operator sees exactly which area is broken.
 *
 * This list is deliberately the highest-signal subset — not every table in
 * the code. It matches the seven domain hubs used by the UNIFICATION_PLAN.md
 * domain sweep (P4.x).
 */
const MODULE_TABLES: Record<string, readonly string[]> = {
  hr: [
    "employees",
    "employee_assignments",
    "hr_leave_requests",
    "hr_leave_types",
    "hr_leave_balances",
    "attendance",
    "hr_inquiry_memos",
    "hr_inquiry_memo_events",
    "hr_discipline_regulation",
    "leave_approval_stages",
  ],
  finance: [
    "invoices",
    "journal_entries",
    "journal_lines",
    "chart_of_accounts",
    "vouchers",
    "expenses",
    "budgets",
    "financial_periods",
    "recurring_journals",
  ],
  fleet: [
    "fleet_vehicles",
    "fleet_drivers",
    "fleet_trips",
    "fleet_maintenance",
    "fleet_traffic_violations",
    "fleet_fuel_logs",
  ],
  warehouse: [
    "warehouse_products",
    "warehouse_movements",
    "warehouse_stock_batches",
    "inventory_counts",
  ],
  property: [
    "rental_contracts",
    "property_units",
    "property_buildings",
    "rent_payments",
    "contract_payment_schedule",
    "property_owners",
    "tenants",
  ],
  projects: [
    "projects",
    "project_phases",
    "project_tasks",
    "project_milestones",
    "project_costs",
  ],
  legal: [
    "legal_cases",
    "legal_contracts",
    "legal_sessions",
    "legal_judgments",
  ],
  crm: [
    "clients",
    "crm_opportunities",
    "crm_activities",
  ],
  support: [
    "support_tickets",
  ],
  operations: [
    "tasks",
    "obligations",
    "obligation_escalations",
  ],
};

/**
 * Runtime schema audit — P0.4 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * Queries `information_schema.tables` once and cross-references against:
 *   1. `CRITICAL_TABLES`  — infra the server absolutely needs
 *   2. `MODULE_TABLES`    — per-domain expectations from the plan
 *   3. `schema_migrations` state — which incremental migrations have run
 *
 * Returns a `/health/schema` response the operator can hit to see *exactly*
 * which module is broken and which migrations haven't landed. This is how we
 * find the 263 vs 57 gap the plan's baseline called out — without having to
 * parse source code.
 *
 * Response shape:
 *   {
 *     status: "ok" | "degraded" | "critical",
 *     tables: {
 *       total: number,            // tables present in DB
 *       critical: { ok: n, missing: [...] },
 *       modules: { hr: { ok: n, expected: n, missing: [...] }, ... }
 *     },
 *     migrations: {
 *       applied: n,
 *       lastFilename: string | null
 *     },
 *     checkedAt: string
 *   }
 *
 * The endpoint intentionally does NOT require auth — the Replit
 * autoscale health check needs to reach it, and it reveals only table
 * names that are already implicit in the public API surface.
 */
router.get("/health/schema", async (_req, res) => {
  try {
    const publicTables = await rawQuery<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    const present = new Set(publicTables.map((r) => r.table_name));

    const criticalMissing = CRITICAL_TABLES.filter((t) => !present.has(t));
    const criticalOk = CRITICAL_TABLES.length - criticalMissing.length;

    const modules: Record<string, { ok: number; expected: number; missing: string[] }> = {};
    for (const [module, expected] of Object.entries(MODULE_TABLES)) {
      const missing = expected.filter((t) => !present.has(t));
      modules[module] = {
        ok: expected.length - missing.length,
        expected: expected.length,
        missing,
      };
    }

    // Migration state — informational, not a failure signal on its own.
    let migrationsApplied = 0;
    let lastMigration: string | null = null;
    try {
      const migs = await rawQuery<{ filename: string }>(
        `SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1`
      );
      if (migs.length > 0) {
        lastMigration = migs[0]!.filename;
      }
      const countRows = await rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM schema_migrations`
      );
      migrationsApplied = Number(countRows[0]?.count ?? 0);
    } catch {
      // schema_migrations itself doesn't exist — that's a critical miss and
      // is already reflected in `criticalMissing`.
    }

    const anyModuleBroken = Object.values(modules).some((m) => m.missing.length > 0);
    const status =
      criticalMissing.length > 0 ? "critical" : anyModuleBroken ? "degraded" : "ok";

    const httpStatus = status === "critical" ? 503 : 200;

    res.status(httpStatus).json({
      status,
      tables: {
        total: publicTables.length,
        critical: {
          ok: criticalOk,
          expected: CRITICAL_TABLES.length,
          missing: criticalMissing,
        },
        modules,
      },
      migrations: {
        applied: migrationsApplied,
        lastFilename: lastMigration,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: "critical",
      error: "failed to query information_schema",
      message: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
