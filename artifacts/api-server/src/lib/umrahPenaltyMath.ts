// ─── Umrah overstay-penalty math — SINGLE source of truth ────────────────────
// The operator's stated billing rule for an in-Kingdom program overstay:
//
//   "نبيع يا اجل 20 يوم او 15 حسب مدة البرنامج ولكن بغض النظر حنا لنا تسعير
//    الأصل 20 يوم بسعر وبعد كذا كل 10 يوم بـ 50 ريال زيادة"
//
// i.e. once a pilgrim overstays, every started block of `tierDays` days costs
// `tierAmount` — ceil(overDays / tierDays) × tierAmount. When the tiered keys
// aren't configured, fall back to a flat per-day rate (overDays × perDay).
//
// This module is PURE (no DB, no imports) so BOTH writers of the invoiced
// `umrah_violations.penaltyAmount` compute the IDENTICAL amount:
//   • the daily cron `umrahDailyOverstayScan` (auto-detection), and
//   • the mutamers import `detectViolation` (file upload).
// Previously the import hard-coded a flat `days × 200`, so the same overstay
// was billed differently depending on which path detected it first. (#3003-follow)

export interface OverstayPenaltyConfig {
  /** Flat per-day rate (umrah.overstay_daily_penalty). Used when not tiered. */
  perDay: number;
  /** Block size in days (umrah.overstay_tier_days). Tiered only when > 0. */
  tierDays: number;
  /** Charge per started block (umrah.overstay_tier_amount). Tiered only when > 0. */
  tierAmount: number;
}

/**
 * Overstay penalty for `overDays` days, per the company's configured model.
 * Tiered when BOTH tierDays and tierAmount are > 0 (a partially-set config
 * intentionally falls back to per-day, never silently zeroes the penalty via
 * one missing key). overDays is clamped to ≥ 0 against bad pilgrim data.
 */
export function overstayPenaltyAmount(overDaysRaw: unknown, cfg: OverstayPenaltyConfig): number {
  const overDays = Math.max(0, Number(overDaysRaw) || 0);
  const useTiered = cfg.tierDays > 0 && cfg.tierAmount > 0;
  return useTiered
    ? Math.ceil(overDays / cfg.tierDays) * cfg.tierAmount
    : overDays * cfg.perDay;
}
