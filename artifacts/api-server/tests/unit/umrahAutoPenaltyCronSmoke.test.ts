import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the automated overstay-penalty pipeline:
 *
 *   1. Engine extraction — the penalty creation logic now lives in
 *      `lib/umrahPenaltyEngine.ts` so the manual route + the new auto-
 *      generation cron run the SAME code path. No drift possible.
 *
 *   2. overstayExempt bug fix — the inlined route used to fire a
 *      penalty on exempt pilgrims. The extracted engine query honours
 *      `umrah_pilgrims.overstayExempt` (migration 242).
 *
 *   3. Opt-in cron — `umrah_daily_auto_penalty_generation` runs at 7 AM
 *      and only acts on companies that flipped the setting
 *      `umrah.auto_penalty.enabled = true`. Default false preserves
 *      backward-compat manual supervision.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahPenaltyEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const CRON = readFileSync(
  join(import.meta.dirname!, "../../src/lib/cronScheduler.ts"),
  "utf8",
);

describe("umrahPenaltyEngine — extracted from the manual route", () => {
  it("exports generateOverstayPenalties with the documented shape", () => {
    expect(ENGINE).toMatch(/export async function generateOverstayPenalties\(/);
    expect(ENGINE).toMatch(/scope: PenaltyEngineScope,\s*opts: PenaltyEngineOpts,?\s*\): Promise<PenaltyEngineResult>/);
  });

  it("result type carries the audit signal for the cron / route", () => {
    expect(ENGINE).toMatch(/checked: number/);
    expect(ENGINE).toMatch(/penaltiesCreated: number/);
    expect(ENGINE).toMatch(/violationsLinked: number/);
    expect(ENGINE).toMatch(/skippedExempt: number/);
  });

  it("query honours overstayExempt (bug fix vs the legacy inlined route)", () => {
    // The on-row exclusion uses COALESCE so pre-migration rows (NULL
    // exempt flag) are treated as non-exempt — same defensive pattern
    // the violation-detection cron already uses.
    expect(ENGINE).toMatch(/AND NOT COALESCE\(p\."overstayExempt", false\)/);
  });

  it("emits a separate count for the exempt rows so the audit log shows them", () => {
    // The cron's audit signal needs to show "we considered N exempt
    // pilgrims and skipped them" — otherwise operators can't tell
    // whether 0 penalties means "nothing happened" or "everything
    // exempt".
    expect(ENGINE).toMatch(/COALESCE\(p\."overstayExempt", false\) = true/);
    expect(ENGINE).toMatch(/skippedExempt = Number\(exemptCount\[0\]\?\.c \?\? 0\)/);
  });

  it("posts the penalty GL via umrahEngine — financial impact unchanged", () => {
    expect(ENGINE).toMatch(/umrahEngine\.postPenaltyGL\(/);
  });

  it("transitions pilgrim status overstayed → violated (idempotent skip on miss)", () => {
    expect(ENGINE).toMatch(/applyTransition\(\{[\s\S]{0,400}fromStates:\s*\["overstayed"\],\s*toState:\s*"violated"/);
  });
});

describe("POST /umrah/run-penalty-engine — delegates to the engine", () => {
  it("the route no longer carries the inlined SELECT + INSERT logic", () => {
    // After extraction, the route should be a thin wrapper.
    expect(ROUTE).toMatch(/generateOverstayPenalties\(\s*\{ companyId: scope\.companyId/);
    // The /run-penalty-engine route block specifically no longer
    // INSERTs into umrah_penalties (that lives in the engine now).
    // Take everything between the route declaration and the next
    // router.* (next handler) and assert no INSERT survives in it.
    const m = ROUTE.match(/router\.post\("\/run-penalty-engine"[\s\S]*?(?=router\.(get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    expect(m![0]).not.toContain("INSERT INTO umrah_penalties");
  });

  it("audit log still captures the result with the new skippedExempt count", () => {
    expect(ROUTE).toMatch(/checked: result\.checked,\s*penaltiesCreated: result\.penaltiesCreated,\s*violationsLinked: result\.violationsLinked,\s*skippedExempt: result\.skippedExempt,/);
  });
});

describe("umrah_daily_auto_penalty_generation — opt-in cron", () => {
  it("cron handler exists in cronScheduler with the documented schedule", () => {
    expect(CRON).toMatch(/async function umrahDailyAutoPenaltyGeneration\(\): Promise<string>/);
    expect(CRON).toMatch(/name: "umrah_daily_auto_penalty_generation"[\s\S]{0,200}schedule: "0 7 \* \* \*"/);
  });

  it("opt-in semantics — reads umrah.auto_penalty.enabled per company", () => {
    // Default false: companies not in the table get an undefined flag,
    // which the truthy check rejects. Manual supervision stays intact
    // for everyone who didn't explicitly opt in.
    expect(CRON).toMatch(/resolveSettings\("umrah\.auto_penalty\.enabled", c\.id\)/);
    expect(CRON).toMatch(/const flag = flagRaw === true \|\| flagRaw === "true" \|\| flagRaw === 1/);
    expect(CRON).toMatch(/if \(!flag\) continue/);
  });

  it("per-company override of overstayDays + dailyRate via settings", () => {
    // Falls back to the same defaults the manual route uses (3 days
    // threshold, 500 SAR/day) so a company that only flips the
    // enabled flag still gets sensible behavior.
    expect(CRON).toMatch(/resolveSettings\("umrah\.auto_penalty\.overstay_days", c\.id\)/);
    expect(CRON).toMatch(/resolveSettings\("umrah\.auto_penalty\.daily_rate", c\.id\)/);
    expect(CRON).toMatch(/const overstayDays = Number\(overstayDaysRaw \?\? 3\)/);
    expect(CRON).toMatch(/const dailyRate = Number\(dailyRateRaw \?\? 500\)/);
  });

  it("emits umrah.auto_penalty.cron_run event per company so the audit trail surfaces it", () => {
    expect(CRON).toMatch(/action: "umrah\.auto_penalty\.cron_run"/);
    expect(CRON).toMatch(/source: "cron"/);
  });

  it("uses the SAME engine the manual route uses (no drift)", () => {
    expect(CRON).toMatch(/await import\("\.\/umrahPenaltyEngine\.js"\)/);
    expect(CRON).toMatch(/generateOverstayPenalties\(/);
  });
});
