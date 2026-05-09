/**
 * Iqama renewal alerter.
 *
 * The standard alert thresholds are 90 / 60 / 30 / 14 / 7 / 1 days
 * before expiry — emit one notification at each crossing so HR has
 * enough lead time to start renewal paperwork.
 *
 * Pure helper today; the cron-side wiring + notification dispatch
 * land in week 2 alongside the Saudization snapshot job.
 */
import type { IqamaExpiryWatch } from "./types.js";

export const IQAMA_ALERT_THRESHOLDS_DAYS: readonly number[] = [90, 60, 30, 14, 7, 1];

/**
 * Given a list of (employeeId, iqamaExpiry, asOfDate), return the
 * subset that crosses one of the alert thresholds today.
 *
 * Pure: no DB, no time. The caller passes `asOfDate` so unit tests
 * can pin the day.
 */
export function selectExpiringIqamas(opts: {
  asOfDate: string; // YYYY-MM-DD
  employees: Array<{ employeeId: number; iqamaExpiry: string | null | undefined }>;
}): IqamaExpiryWatch[] {
  const asOf = new Date(opts.asOfDate + "T00:00:00Z");
  if (Number.isNaN(asOf.getTime())) {
    throw new Error(`Iqama alerts: invalid asOfDate "${opts.asOfDate}"`);
  }

  const out: IqamaExpiryWatch[] = [];
  const thresholds = new Set(IQAMA_ALERT_THRESHOLDS_DAYS);

  for (const emp of opts.employees) {
    if (!emp.iqamaExpiry) continue;
    const expiry = new Date(emp.iqamaExpiry + "T00:00:00Z");
    if (Number.isNaN(expiry.getTime())) continue;

    const daysLeft = Math.round(
      (expiry.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (daysLeft < 0) continue;

    out.push({
      employeeId: emp.employeeId,
      iqamaExpiry: emp.iqamaExpiry,
      daysLeft,
      isThreshold: thresholds.has(daysLeft),
    });
  }

  return out.filter((w) => w.isThreshold);
}
