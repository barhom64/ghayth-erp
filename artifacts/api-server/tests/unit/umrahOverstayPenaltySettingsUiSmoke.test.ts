import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the operator-facing UI + backend wiring for the tiered penalty
 * model PR #1477 shipped. Before this PR the cron consulted three
 * `system_settings` keys but the operator could only set them via SQL
 * — making the just-shipped feature unusable in production.
 *
 * This PR surfaces them on /umrah/settings with proper PATCH semantics
 * (omit=preserve, null=revert-to-global-default, value=override).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

describe("GET /umrah/settings — penalty knobs in the response", () => {
  it("batch-reads the 3 system_settings keys with NULLS FIRST precedence", () => {
    // Same query shape the cron (PR #1477) uses, so the UI shows
    // EXACTLY what the cron will compute against — no drift.
    // §8 of #1870 expanded the IN-list to include `umrah_vat_rate`,
    // `umrah_vat_mode`, and `commission_via_hr` so the same single
    // round-trip serves the finance-hygiene knobs too — pin the 3
    // penalty keys are STILL present even though the list now has 6.
    expect(ROUTE).toMatch(/SELECT key, value FROM system_settings[\s\S]{1,800}'umrah\.overstay_daily_penalty'/);
    expect(ROUTE).toMatch(/'umrah\.overstay_tier_days'/);
    expect(ROUTE).toMatch(/'umrah\.overstay_tier_amount'/);
    expect(ROUTE).toMatch(/ORDER BY "companyId" NULLS FIRST/);
  });

  it("returns null when a setting is unset (operator UI shows '— افتراضي —')", () => {
    expect(ROUTE).toMatch(/"umrah\.overstay_daily_penalty":\s*null/);
    expect(ROUTE).toMatch(/"umrah\.overstay_tier_days":\s*null/);
    expect(ROUTE).toMatch(/"umrah\.overstay_tier_amount":\s*null/);
  });

  it("response shape adds the 3 fields alongside the existing settings", () => {
    expect(ROUTE).toMatch(/umrahOverstayDailyPenalty: penaltyByKey\["umrah\.overstay_daily_penalty"\]/);
    expect(ROUTE).toMatch(/umrahOverstayTierDays: penaltyByKey\["umrah\.overstay_tier_days"\]/);
    expect(ROUTE).toMatch(/umrahOverstayTierAmount: penaltyByKey\["umrah\.overstay_tier_amount"\]/);
  });
});

describe("PATCH /umrah/settings — penalty knobs in the schema + handler", () => {
  it("nullableNumberPreproc folds '' to null + enforces non-negative", () => {
    // Same omit/clear semantics as nullableFkPreproc but value type
    // is number, not FK. Non-negative because a negative penalty
    // would generate refund violations on overstay (logical bug).
    expect(ROUTE).toMatch(/const nullableNumberPreproc = z\.preprocess\([\s\S]{1,400}z\.coerce\.number\(\)\.nonnegative/);
  });

  it("schema adds the 3 penalty knobs alongside the existing FKs", () => {
    expect(ROUTE).toMatch(/umrahOverstayDailyPenalty: nullableNumberPreproc/);
    expect(ROUTE).toMatch(/umrahOverstayTierDays: nullableNumberPreproc/);
    expect(ROUTE).toMatch(/umrahOverstayTierAmount: nullableNumberPreproc/);
  });

  it("explicit null DELETEs the company-scoped row (reverts to global default)", () => {
    // Without the DELETE branch, the operator couldn't roll back to
    // the global default after overriding once — they'd be stuck with
    // their company-scoped value forever. The cron's NULLS FIRST
    // ordering then surfaces the global default.
    expect(ROUTE).toMatch(/if \(value === null\) \{\s*await rawExecute\(\s*`DELETE FROM system_settings WHERE key = \$1 AND "companyId" = \$2 AND "branchId" IS NULL`/);
  });

  it("explicit number does UPDATE-then-INSERT UPSERT (matches existing settings.ts pattern)", () => {
    expect(ROUTE).toMatch(/UPDATE system_settings SET value=\$1, "updatedAt"=NOW\(\)/);
    expect(ROUTE).toMatch(/if \(!result\.affectedRows\) \{\s*await rawExecute\(\s*`INSERT INTO system_settings/);
  });

  it("undefined fields are skipped (omit-preserve semantics)", () => {
    // The `continue` on undefined preserves PATCH semantics — saving
    // only nuskSupplierId shouldn't touch the penalty knobs.
    // §8 of #1870 renamed the loop variable from `penaltyFields` to
    // `settingsFields` because the same loop now also covers VAT +
    // commission knobs — the omit/null/value contract is identical.
    expect(ROUTE).toMatch(/for \(const \[key, value\] of settingsFields\) \{\s*if \(value === undefined\) continue/);
  });

  it("audit log captures the new keys when they changed", () => {
    expect(ROUTE).toMatch(/auditAfter\[keyToAuditField\[key\]!\] = value/);
  });
});

describe("settings page — overstay-penalty card", () => {
  it("UmrahSettings interface declares the 3 penalty fields as number|null", () => {
    expect(PAGE).toMatch(/umrahOverstayDailyPenalty: number \| null/);
    expect(PAGE).toMatch(/umrahOverstayTierDays: number \| null/);
    expect(PAGE).toMatch(/umrahOverstayTierAmount: number \| null/);
  });

  it("3 useState slots + 3 sync effects (same pattern as the FK fields)", () => {
    expect(PAGE).toMatch(/const \[penaltyDailyAmount, setPenaltyDailyAmount\] = useState<string>\(""\)/);
    expect(PAGE).toMatch(/const \[penaltyTierDays, setPenaltyTierDays\] = useState<string>\(""\)/);
    expect(PAGE).toMatch(/const \[penaltyTierAmount, setPenaltyTierAmount\] = useState<string>\(""\)/);
  });

  it("save handler routes all 3 through toPatchValue (matches PR #1469 wire format)", () => {
    expect(PAGE).toMatch(/umrahOverstayDailyPenalty: toPatchValue\(penaltyDailyAmount\)/);
    expect(PAGE).toMatch(/umrahOverstayTierDays: toPatchValue\(penaltyTierDays\)/);
    expect(PAGE).toMatch(/umrahOverstayTierAmount: toPatchValue\(penaltyTierAmount\)/);
  });

  it("card renders with stable testids on each input field", () => {
    expect(PAGE).toContain('data-testid="umrah-overstay-penalty-card"');
    expect(PAGE).toContain('data-testid="penalty-tier-days-field"');
    expect(PAGE).toContain('data-testid="penalty-tier-amount-field"');
    expect(PAGE).toContain('data-testid="penalty-daily-amount-field"');
  });

  it("'active model' banner — tiered takes precedence when BOTH tier knobs > 0", () => {
    // The cron's selection logic mirrored in the UI so the operator
    // sees the SAME model the cron will use. AND match — NOT OR —
    // because partial config falls back to per-day.
    expect(PAGE).toMatch(/Number\(penaltyTierDays\) > 0 && Number\(penaltyTierAmount\) > 0/);
    expect(PAGE).toContain('data-testid="penalty-tiered-active-banner"');
  });

  it("'active model' banner shows per-day when only daily > 0 (no tier banner)", () => {
    expect(PAGE).toMatch(/Number\(penaltyDailyAmount\) > 0/);
    expect(PAGE).toContain('data-testid="penalty-per-day-active-banner"');
  });

  it("dirty check extended to cover the 3 new fields", () => {
    expect(PAGE).toMatch(/penaltyDailyAmount !== \(settings\?\.umrahOverstayDailyPenalty/);
    expect(PAGE).toMatch(/penaltyTierDays !== \(settings\?\.umrahOverstayTierDays/);
    expect(PAGE).toMatch(/penaltyTierAmount !== \(settings\?\.umrahOverstayTierAmount/);
  });
});
