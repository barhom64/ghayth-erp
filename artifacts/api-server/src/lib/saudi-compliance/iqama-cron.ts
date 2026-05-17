/**
 * Iqama renewal alert cron driver.
 *
 * Runs once a day, walks every active employee with an iqamaExpiry
 * set, picks the rows crossing one of the spec'd thresholds today
 * (90/60/30/14/7/1 days), and emits one log entry per affected
 * employee. Notification dispatch (email + push) hooks into the
 * existing notificationService in a follow-up — for now the
 * structured warn-level log is enough for the daily ops sweep and
 * gives the data team a concrete query to build the digest from.
 *
 * Idempotency: the cron itself runs daily and the threshold matcher
 * only fires on EXACT day matches (90, 60, 30, 14, 7, 1) — running
 * twice in the same day produces the same alert set, but the
 * notification engine de-duplicates by `dedupKey`.
 */
import { rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";
import { selectExpiringIqamas } from "./iqama-alerts.js";
import type { IqamaExpiryWatch } from "./types.js";
import { todayISO } from "../businessHelpers.js";

export interface IqamaCronOutcome {
  scanned: number;
  alertsEmitted: number;
  perCompany: Record<number, number>;
}

/**
 * Pure shaping of the structured log payload — keeps the cron
 * driver short and lets the unit test assert on the message
 * format without touching the logger.
 */
export function formatAlertMessage(watch: IqamaExpiryWatch): string {
  return `iqama=${watch.employeeId} expires=${watch.iqamaExpiry} (${watch.daysLeft} days)`;
}

export async function runIqamaDailyAlerts(asOfDate?: string): Promise<IqamaCronOutcome> {
  const today = asOfDate ?? todayISO();
  const out: IqamaCronOutcome = { scanned: 0, alertsEmitted: 0, perCompany: {} };

  const employees = await rawQuery<{
    employeeId: number;
    companyId: number;
    iqamaExpiry: string;
  }>(
    `SELECT id AS "employeeId",
            "companyId",
            "iqamaExpiry"::text AS "iqamaExpiry"
     FROM employees
     WHERE "iqamaExpiry" IS NOT NULL
       AND "deletedAt" IS NULL`,
  );
  out.scanned = employees.length;

  const watches = selectExpiringIqamas({
    asOfDate: today,
    employees: employees.map((e) => ({
      employeeId: e.employeeId,
      iqamaExpiry: e.iqamaExpiry,
    })),
  });

  // Lookup map: employeeId → companyId for the per-company tally.
  const empToCompany = new Map<number, number>();
  for (const e of employees) empToCompany.set(e.employeeId, e.companyId);

  for (const watch of watches) {
    const companyId = empToCompany.get(watch.employeeId) ?? 0;
    out.alertsEmitted += 1;
    out.perCompany[companyId] = (out.perCompany[companyId] ?? 0) + 1;

    logger.warn(
      { companyId, ...watch },
      `[iqama-alerts] ${formatAlertMessage(watch)}`,
    );
  }

  return out;
}

/** Cron-compatible wrapper: returns one-line summary for cron_logs. */
export async function iqamaDailyAlertCron(): Promise<string> {
  const out = await runIqamaDailyAlerts();
  if (out.scanned === 0) return "no employees with iqama tracking";
  if (out.alertsEmitted === 0) return `scanned=${out.scanned} no thresholds crossed today`;
  return `scanned=${out.scanned} alerts=${out.alertsEmitted} companies=${Object.keys(out.perCompany).length}`;
}
