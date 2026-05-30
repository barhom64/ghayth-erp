import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the tiered overstay penalty model — the operator's stated
 * billing rule:
 *
 *   "نبيع يا اجل 20 يوم او 15 حسب مدة البرنامج ولكن بغض النظر حنا
 *    لنا تسعير الاصل 20 يوم بسعر وبعد كذا كل 10 يوم ب 50 ريال زيادة"
 *
 * The cron now reads 3 settings keys in one batch and picks the
 * tiered formula when BOTH tier_days + tier_amount are set,
 * otherwise falls back to the existing per-day model (strict
 * regression safety for companies that haven't migrated).
 */
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);

describe("umrahDailyOverstayScan — settings batch read", () => {
  it("reads all 3 keys (daily_penalty + tier_days + tier_amount) in ONE query (no N+1)", () => {
    // Pre-PR the cron fetched per_day per company, then would have
    // fetched tier_days + tier_amount per company too if we'd added
    // them naively — three SELECTs per company. The batch IN-clause
    // collapses to one round-trip per company.
    expect(CRON).toMatch(/SELECT key, value FROM system_settings[\s\S]{1,500}key IN \('umrah\.overstay_daily_penalty',\s*'umrah\.overstay_tier_days',\s*'umrah\.overstay_tier_amount'\)/);
  });

  it("company-scoped value overrides the global default (NULLS FIRST ordering)", () => {
    // The same per-key precedence the existing single-key read used.
    // Global default has companyId=NULL; the company-specific row
    // comes LAST in NULLS FIRST order so the loop's assignment
    // overwrites the default.
    expect(CRON).toMatch(/ORDER BY "companyId" NULLS FIRST/);
    expect(CRON).toMatch(/for \(const row of penaltySettings\) \{\s*penaltyByKey\[row\.key\] = Number\(row\.value \?\? 0\)/);
  });
});

describe("umrahDailyOverstayScan — tiered vs per-day selection", () => {
  it("uses tiered formula when BOTH tier_days > 0 AND tier_amount > 0", () => {
    // useTiered must require BOTH — operators who set only one (e.g.
    // tierDays=10 but forgot tierAmount) would get penalty=0 forever
    // if we used OR; pin the AND so partial config is treated as
    // intentional fallback to per-day.
    expect(CRON).toMatch(/const useTiered = tierDays > 0 && tierAmount > 0/);
  });

  it("tiered penalty = ceil(overDays / tierDays) × tierAmount", () => {
    // The user's example: 25-day stay on 20-day program → overDays=5
    // → ceil(5/10)=1 → 1×50 = 50. 15 over → ceil(15/10)=2 → 100.
    // 20 over → ceil(20/10)=2 → 100 (NOT 3 — matches the "every 10
    // days" rule). Pin Math.ceil so a future "floor" or no-rounding
    // refactor can't silently change billing semantics.
    expect(CRON).toMatch(/useTiered\s*\?\s*Math\.ceil\(overDays \/ tierDays\) \* tierAmount\s*:\s*overDays \* perDay/);
  });

  it("falls back to overDays × perDay when tier config is missing (regression safety)", () => {
    // Companies that haven't set the new keys keep the pre-PR formula
    // verbatim. The per-day path must produce the SAME number it
    // produced before this PR landed.
    expect(CRON).toMatch(/overDays \* perDay/);
  });

  it("overDays is clamped to non-negative (defence against bad pilgrim data)", () => {
    // A negative overDays would yield negative penalty under either
    // model. Pin the clamp so it can't slip back into a future
    // refactor that "simplifies" the arithmetic.
    expect(CRON).toMatch(/const overDays = Math\.max\(0, Number\(o\.overDays\) \|\| 0\)/);
  });
});

describe("umrahDailyOverstayScan — backwards-compat contract", () => {
  it("INSERT into umrah_violations still happens (penalty value just changed)", () => {
    // This PR changes ONLY the penalty amount. Violation row creation,
    // status, type, and de-dup logic are untouched — pre-existing
    // tests for those still pass.
    expect(CRON).toMatch(/INSERT INTO umrah_violations[\s\S]{1,500}'overstay'/);
  });

  it("violation description still uses overDays + 'يوم' text", () => {
    expect(CRON).toMatch(/تجاوز مدة البرنامج بـ \$\{o\.overDays\} يوم/);
  });
});
