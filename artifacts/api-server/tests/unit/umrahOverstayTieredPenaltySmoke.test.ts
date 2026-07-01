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

describe("umrahDailyOverstayScan — delegates billing to the shared helper", () => {
  it("builds overstayCfg from the three settings keys", () => {
    // The cron still reads the same three keys; it now hands them to the
    // shared math helper instead of inlining the formula.
    expect(CRON).toMatch(/perDay: penaltyByKey\["umrah\.overstay_daily_penalty"\] \?\? 0/);
    expect(CRON).toMatch(/tierDays: penaltyByKey\["umrah\.overstay_tier_days"\] \?\? 0/);
    expect(CRON).toMatch(/tierAmount: penaltyByKey\["umrah\.overstay_tier_amount"\] \?\? 0/);
  });

  it("computes the penalty via the shared overstayPenaltyAmount helper (single source of truth)", () => {
    // The tiered/per-day formula + Math.ceil + non-negative clamp now live in
    // lib/umrahPenaltyMath.ts (pinned by umrahOverstayPenaltyMath.test.ts) and
    // are SHARED with the mutamers import (umrahImportEngine.detectViolation),
    // so an overstay billed by either path produces the IDENTICAL amount.
    // Pre-fix the import hard-coded a divergent flat `days × 200`.
    expect(CRON).toMatch(/import \{ overstayPenaltyAmount \} from "\.\/umrahPenaltyMath\.js"/);
    expect(CRON).toMatch(/const penalty = overstayPenaltyAmount\(o\.overDays, overstayCfg\)/);
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
