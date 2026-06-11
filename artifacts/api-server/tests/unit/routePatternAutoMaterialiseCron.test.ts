import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-02 — daily cron materialises route patterns.
 *
 * Audit finding (TA-CONF-01): transport-route-patterns.ts comment
 * promised "Materialised by the daily cron" but no such job existed
 * in cronScheduler.ts — a dispatcher trusting it would lose tomorrow's
 * draft bookings silently.
 *
 * This PR closes the promise + adds the opt-in gate so existing
 * tenants stay on the manual path until they consciously enable
 * automation.
 *
 * Pins:
 *   • migration 310 adds autoMaterialiseEnabled column (default FALSE)
 *   • handler queries TOMORROW in Riyadh (not today, not UTC)
 *   • DOW mask check matches the SPA convention (bit 0 = Sunday)
 *   • JOIN against planning_settings filters to opted-in companies
 *   • activeFrom/Until window honored
 *   • idempotent INSERT mirrors /materialise + /materialise-range
 *   • canon inheritance (bookingSource, tripFamily, status='draft')
 *   • registered in JOB_DEFINITIONS at 06:30 Riyadh (03:30 UTC)
 *   • route file comment no longer lies about cron coverage
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const MIGRATION = read("migrations/310_transport_planning_auto_materialise.sql");
const CRON = read("lib/cronScheduler.ts");
const ROUTE = read("routes/transport-route-patterns.ts");

describe("#2079 TA-T18-02 — migration 310: opt-in column", () => {
  it("file exists at the canonical migrations path", () => {
    expect(existsSync(join(apiSrc, "migrations/310_transport_planning_auto_materialise.sql"))).toBe(true);
  });
  it("adds autoMaterialiseEnabled BOOLEAN NOT NULL DEFAULT FALSE", () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS "autoMaterialiseEnabled" BOOLEAN NOT NULL DEFAULT FALSE/,
    );
  });
  it("documents the opt-in semantics on the column", () => {
    expect(MIGRATION).toMatch(/COMMENT ON COLUMN transport_planning_settings\."autoMaterialiseEnabled"/);
    expect(MIGRATION).toMatch(/materialise_due_route_patterns/);
    expect(MIGRATION).toMatch(/Idempotent on \(companyId, bookingNumber\)/);
  });
});

describe("#2079 TA-T18-02 — cron handler shape", () => {
  it("declares materialiseDueRoutePatterns as an exported async cron handler", () => {
    expect(CRON).toMatch(/export async function materialiseDueRoutePatterns\(\): Promise<string>/);
  });

  it("targets TOMORROW in Riyadh (not today, not UTC)", () => {
    const block = CRON.slice(CRON.indexOf("export async function materialiseDueRoutePatterns"));
    expect(block).toMatch(/Date\.now\(\) \+ 86400000/);
    expect(block).toMatch(/currentDateInTz\("Asia\/Riyadh", tomorrow\)/);
  });

  it("computes day-of-week in Riyadh — matches the SPA's 7-bit mask convention", () => {
    const block = CRON.slice(CRON.indexOf("materialiseDueRoutePatterns"));
    expect(block).toMatch(/T12:00:00\+03:00/);
    expect(block).toMatch(/getUTCDay\(\)/);
    expect(block).toMatch(/\(rp\."daysOfWeekMask" >> \$1\) & 1\) = 1/);
  });

  it("JOINs planning_settings with autoMaterialiseEnabled = TRUE (opt-in gate)", () => {
    const block = CRON.slice(CRON.indexOf("materialiseDueRoutePatterns"));
    expect(block).toMatch(/JOIN transport_planning_settings tps/);
    expect(block).toMatch(/tps\."autoMaterialiseEnabled" = TRUE/);
  });

  it("respects activeFrom / activeUntil window (NULL means no bound)", () => {
    const block = CRON.slice(CRON.indexOf("materialiseDueRoutePatterns"));
    expect(block).toMatch(/rp\."activeFrom"\s+IS NULL OR rp\."activeFrom"\s+<= \$2::date/);
    expect(block).toMatch(/rp\."activeUntil" IS NULL OR rp\."activeUntil" >= \$2::date/);
  });

  it("only considers patterns with status='active' + not soft-deleted", () => {
    const block = CRON.slice(CRON.indexOf("materialiseDueRoutePatterns"));
    expect(block).toMatch(/rp\."deletedAt" IS NULL/);
    expect(block).toMatch(/rp\.status = 'active'/);
  });
});

describe("#2079 TA-T18-02 — insert idempotency + canon inheritance", () => {
  const block = CRON.slice(CRON.indexOf("materialiseDueRoutePatterns"));

  it("bookingNumber keyed `RP-{patternCode}-{YYYYMMDD}` (same as manual /materialise)", () => {
    expect(block).toMatch(/`RP-\$\{pattern\.patternCode\}-\$\{target\.replace\(\/-\/g, ""\)\}`/);
  });

  it("ON CONFLICT (companyId, bookingNumber) DO NOTHING + UNION-ALL existed-detection", () => {
    expect(block).toMatch(/ON CONFLICT \("companyId", "bookingNumber"\) DO NOTHING/);
    expect(block).toMatch(/SELECT id, TRUE AS existed/);
    expect(block).toMatch(/NOT EXISTS \(SELECT 1 FROM ins\)/);
  });

  it("canon: bookingSource='recurring_schedule', serviceType='cargo_load', tripFamily='cargo', status='draft'", () => {
    expect(block).toMatch(/'recurring_schedule'/);
    expect(block).toMatch(/'cargo_load',\s*\$4, 'cargo'/);
    expect(block).toMatch(/'draft', NULL\)/);
  });

  it("returns a human-readable summary line (scanned/created/existed/errors)", () => {
    expect(block).toMatch(/return `materialise_due_route_patterns: \$\{patterns\.length\} patterns scanned/);
  });

  it("per-row try/catch isolates errors (one bad pattern does not kill the run)", () => {
    expect(block).toMatch(/try \{[\s\S]{0,2000}\} catch \(err\) \{\s*errors\+\+;/);
  });

  it("no JE / GL contact from the cron path (transport rule)", () => {
    expect(block).not.toMatch(/postJournalEntry|journal_entries|writeJournal/);
  });
});

describe("#2079 TA-T18-02 — JOB_DEFINITIONS registration", () => {
  it("registers materialise_due_route_patterns at 06:30 Riyadh (03:30 UTC)", () => {
    expect(CRON).toMatch(
      /name: "materialise_due_route_patterns"[\s\S]{0,400}schedule: "30 3 \* \* \*"[\s\S]{0,200}handler: materialiseDueRoutePatterns/,
    );
  });
  it("schedule comment explains the timezone offset", () => {
    expect(CRON).toMatch(/06:30 Riyadh = 03:30 UTC/);
  });
});

describe("#2079 TA-T18-02 — route file no longer lies about cron coverage", () => {
  it("comment names both the manual + cron paths and the opt-in gate", () => {
    expect(ROUTE).toMatch(/materialise_due_route_patterns/);
    expect(ROUTE).toMatch(/autoMaterialiseEnabled/);
    expect(ROUTE).toMatch(/06:30 Riyadh/);
  });
  it("no longer claims unconditional 'by the daily cron'", () => {
    // Old promise: "by the daily cron" — the fix replaces it with the
    // two-path description above. If someone reverts to the unconditional
    // claim, this assertion fires.
    expect(ROUTE).not.toMatch(/\* recurring schedule\. Materialised into `transport_bookings` rows by\s*\n\s*\* the daily cron/);
  });
});
