/**
 * Saudization (Nitaqat) monthly snapshot cron handler.
 *
 * Runs once a month, walks every active company, counts Saudi vs
 * non-Saudi employees, classifies via lib/saudi-compliance/nitaqat,
 * and writes the result to `saudization_snapshots`. Idempotent on
 * `(companyId, period)` thanks to the unique index from migration
 * 142 — re-running mid-month UPDATEs the existing row.
 *
 * Also returns a structured outcome for the cron-log line + a
 * downstream emailer (week 3 deliverable) to consume.
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import { classifyNitaqat } from "./nitaqat.js";
import type { NitaqatCategory } from "./types.js";
import { todayISO } from "../businessHelpers.js";

export interface SnapshotPerCompany {
  companyId: number;
  period: string; // YYYY-MM
  totalEmployees: number;
  saudiEmployees: number;
  nonSaudiEmployees: number;
  saudizationPercent: number;
  category: NitaqatCategory;
  exempt: boolean;
}

export interface SnapshotRunOutcome {
  scanned: number;
  written: number;
  errors: string[];
  /** Full per-company results — useful for the dashboard, the
   *  email digest, and the unit tests. */
  snapshots: SnapshotPerCompany[];
}

/**
 * Compute the per-company headcount aggregates. Pure helper so the
 * cron driver can be tested without touching the DB.
 *
 * Saudi nationality is determined by the case-insensitive
 * comparison `nationality ILIKE 'sa%' OR nationality = 'سعودي'`.
 * Operators with non-default nationality strings can extend the
 * predicate by adding rows to a per-tenant `saudization_overrides`
 * table — that wiring lands when the analyser starts producing
 * audit-flagged anomalies.
 */
export function computeSnapshot(
  companyId: number,
  period: string,
  rows: Array<{ nationality: string | null }>,
): Omit<SnapshotPerCompany, "companyId" | "period"> {
  let saudi = 0;
  for (const r of rows) {
    if (isSaudiNationality(r.nationality)) saudi += 1;
  }
  const total = rows.length;
  const nonSaudi = total - saudi;
  const result = classifyNitaqat({ saudiEmployees: saudi, totalEmployees: total });
  return {
    totalEmployees: total,
    saudiEmployees: saudi,
    nonSaudiEmployees: nonSaudi,
    saudizationPercent: result.saudizationPercent,
    category: result.category,
    exempt: result.exempt,
  };
}

export function isSaudiNationality(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (v.startsWith("sa")) return true;          // "Saudi", "SA", "saudi arabian"
  if (v === "سعودي" || v === "سعودية") return true;
  return false;
}

/**
 * The cron-driven runner. Picks every active company, reads its
 * employees, computes the snapshot, and upserts. Returns the
 * structured outcome for the cron-log line and downstream
 * consumers.
 */
export async function runSaudizationSnapshot(asOfDate?: string): Promise<SnapshotRunOutcome> {
  const today = asOfDate ?? todayISO();
  const period = today.slice(0, 7); // YYYY-MM

  const out: SnapshotRunOutcome = { scanned: 0, written: 0, errors: [], snapshots: [] };

  const companies = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status = 'active' AND "deletedAt" IS NULL`,
  );
  out.scanned = companies.length;

  for (const company of companies) {
    try {
      const employees = await rawQuery<{ nationality: string | null }>(
        `SELECT nationality
         FROM employees
         WHERE "companyId" = $1
           AND "deletedAt" IS NULL`,
        [company.id],
      );

      const computed = computeSnapshot(company.id, period, employees);

      await rawExecute(
        `INSERT INTO saudization_snapshots (
           "companyId", period, "totalEmployees", "saudiEmployees", "nonSaudiEmployees",
           "saudizationPercent", category, "computedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT ("companyId", period) DO UPDATE
           SET "totalEmployees"     = EXCLUDED."totalEmployees",
               "saudiEmployees"     = EXCLUDED."saudiEmployees",
               "nonSaudiEmployees"  = EXCLUDED."nonSaudiEmployees",
               "saudizationPercent" = EXCLUDED."saudizationPercent",
               category             = EXCLUDED.category,
               "computedAt"         = NOW()`,
        [
          company.id, period,
          computed.totalEmployees, computed.saudiEmployees, computed.nonSaudiEmployees,
          computed.saudizationPercent, computed.category,
        ],
      );

      out.written += 1;
      out.snapshots.push({ companyId: company.id, period, ...computed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`company=${company.id}: ${msg}`);
      logger.error({ companyId: company.id, err: msg }, "[saudization] snapshot failed");
    }
  }

  return out;
}

/** Cron-compatible wrapper: returns one-line summary for cron_logs. */
export async function saudizationMonthlySnapshotCron(): Promise<string> {
  const out = await runSaudizationSnapshot();
  if (out.scanned === 0) return "no active companies";
  const reds = out.snapshots.filter((s) => s.category === "red").length;
  return `scanned=${out.scanned} written=${out.written} errors=${out.errors.length} red=${reds}`;
}
