import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1812 TR-017 / A-03 — cargo recurring trips: bulk materialise.
 *
 * Acceptance criterion (user's mandate): «قالب أسبوعي + عدد ردود
 * ينشئ instances مستقلة». A single API call must walk the date
 * window once and produce N independent `transport_bookings` rows —
 * one per matching weekday — keyed uniquely so re-firing the same
 * window does NOT create duplicates.
 *
 * This test pins the surface (route, schema shape, idempotency, day
 * cap, day-of-week mask convention) and the iterator semantics. The
 * live-DB proof (A-03 E2E) is intentionally separate and runs under
 * `db:provision-agent` per the user's «لا ترحيل بـtypecheck فقط» rule.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const SRC = readFileSync(join(apiSrc, "routes/transport-route-patterns.ts"), "utf8");

describe("#1812 TR-017 — schema accepts (fromDate, toDate|count) with required-one refinement", () => {
  it("declares materialiseRangeSchema with ISO_DATE-validated fromDate", () => {
    expect(SRC).toMatch(/const materialiseRangeSchema = z\.object\(/);
    expect(SRC).toMatch(/fromDate: z\.string\(\)\.regex\(ISO_DATE/);
    expect(SRC).toMatch(/const ISO_DATE = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  });

  it("refuses to fire without either toDate or count", () => {
    expect(SRC).toMatch(/b\.toDate != null \|\| b\.count != null/);
    expect(SRC).toMatch(/Either toDate or count is required/);
  });

  it("caps count at MATERIALISE_RANGE_DAY_CAP (= 90) to block runaway fires", () => {
    expect(SRC).toMatch(/const MATERIALISE_RANGE_DAY_CAP = 90;/);
    expect(SRC).toMatch(/count: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(MATERIALISE_RANGE_DAY_CAP\)/);
  });
});

describe("#1812 TR-017 — endpoint surface", () => {
  it("POST /transport/route-patterns/:id/materialise-range exists + RBAC gated", () => {
    expect(SRC).toMatch(
      /transportRoutePatternsRouter\.post\(\s*"\/transport\/route-patterns\/:id\/materialise-range"/,
    );
    // Anchor on the actual endpoint registration (not the first
    // string occurrence — the route file's header comment now also
    // mentions /materialise-range when explaining the cron in
    // #2079 TA-T18-02).
    const block = SRC.slice(SRC.indexOf('transportRoutePatternsRouter.post(\n  "/transport/route-patterns/:id/materialise-range"'));
    expect(block.slice(0, 400)).toMatch(/feature: "fleet\.bookings", action: "create"/);
  });

  it("rejects patterns that are not active OR not in this tenant", () => {
    const block = SRC.slice(SRC.indexOf("/materialise-range"));
    expect(block).toMatch(/status = 'active'/);
    expect(block).toMatch(/القالب غير موجود أو غير نشط/);
  });
});

describe("#1812 TR-017 — idempotent against re-fire", () => {
  it("uses ON CONFLICT (companyId, bookingNumber) DO NOTHING + UNION-ALL to detect existed rows", () => {
    const block = SRC.slice(SRC.indexOf("/materialise-range"));
    expect(block).toMatch(/ON CONFLICT \("companyId", "bookingNumber"\) DO NOTHING/);
    expect(block).toMatch(/SELECT id, TRUE AS existed/);
  });

  it("bookingNumber key is deterministic per (patternCode, date)", () => {
    const block = SRC.slice(SRC.indexOf("/materialise-range"));
    expect(block).toMatch(/`RP-\$\{pattern\.patternCode\}-\$\{date\.replace\(\/-\/g, ""\)\}`/);
  });

  it("response separates created from skipped (exists) so callers can show \"already there\"", () => {
    const block = SRC.slice(SRC.indexOf("/materialise-range"));
    expect(block).toMatch(/created: Array<\{ date: string; bookingId: number; bookingNumber: string \}>/);
    expect(block).toMatch(/skipped: Array<\{ date: string; reason: "exists" \}>/);
    expect(block).toMatch(/totalCreated: created\.length/);
    expect(block).toMatch(/totalSkipped: skipped\.length/);
  });

  it("logs ONE bulk audit row per fire (createdCount + skippedCount), not N events", () => {
    const block = SRC.slice(SRC.indexOf("/materialise-range"));
    expect(block).toMatch(/action: "materialise_range"/);
    expect(block).toMatch(/createdCount: created\.length/);
    expect(block).toMatch(/skippedCount: skipped\.length/);
  });
});

describe("#1812 TR-017 — every created booking inherits the canon (tripFamily=cargo, source=recurring)", () => {
  const block = SRC.slice(SRC.indexOf("/materialise-range"));
  it("bookingSource = 'recurring_schedule'", () => {
    expect(block).toMatch(/'recurring_schedule'/);
  });
  it("transportServiceType = 'cargo_load' AND tripFamily = 'cargo'", () => {
    expect(block).toMatch(/'cargo_load',\s*\$4, 'cargo'/);
  });
  it("routePatternId is the FK back to the parent template", () => {
    expect(block).toMatch(/"routePatternId"/);
  });
  it("status = 'draft' so the dispatcher reviews + assigns each instance individually", () => {
    expect(block).toMatch(/'draft',/);
  });
});

describe("#1812 TR-017 — date iterator semantics (the heart of A-03)", () => {
  const iter = SRC.slice(SRC.indexOf("function* matchingDatesInRange"));

  it("walks forward in 1-day steps + clamps to MATERIALISE_RANGE_DAY_CAP", () => {
    expect(iter).toMatch(/for \(let i = 0; i < MATERIALISE_RANGE_DAY_CAP; i\+\+\)/);
    expect(iter).toMatch(/start\.getTime\(\) \+ i \* 86400000/);
  });

  it("respects activeFrom + activeUntil bounds on the pattern", () => {
    expect(iter).toMatch(/if \(t < activeFromMs \|\| t > activeUntilMs\) continue/);
  });

  it("day-of-week computed in Asia/Riyadh (bit 0 = Sunday)", () => {
    expect(iter).toMatch(/currentDateInTz\("Asia\/Riyadh", new Date\(t\)\)/);
    expect(iter).toMatch(/T12:00:00\+03:00/);
    expect(iter).toMatch(/\(\(daysOfWeekMask >> dayOfWeek\) & 1\)/);
  });

  it("stops at toDate OR after `count` matches — whichever comes first", () => {
    expect(iter).toMatch(/if \(t > endLimit\) return;/);
    expect(iter).toMatch(/if \(count != null && emitted >= count\) return;/);
  });
});

describe("#1812 TR-017 — A-03 acceptance simulation (in-memory)", () => {
  // Inline-replicate the iterator's contract so we can prove its
  // truth table without booting express. If the route file's
  // iterator stops matching this, the regex tests above will fail
  // first — this section is a behavioural double-check.

  const MASK_SUNDAY    = 1 << 0;
  const MASK_MONDAY    = 1 << 1;
  const MASK_WEDNESDAY = 1 << 3;

  function dayOfWeekRiyadh(iso: string): number {
    return new Date(`${iso}T12:00:00+03:00`).getUTCDay();
  }

  function* walk(
    fromDate: string,
    toDate: string | undefined,
    count: number | undefined,
    mask: number,
    activeFrom?: string,
    activeUntil?: string,
  ): Generator<string> {
    const startMs = new Date(`${fromDate}T00:00:00Z`).getTime();
    const endMs = toDate ? new Date(`${toDate}T00:00:00Z`).getTime() : Infinity;
    const fromMs = activeFrom ? new Date(`${activeFrom}T00:00:00Z`).getTime() : -Infinity;
    const untilMs = activeUntil ? new Date(`${activeUntil}T00:00:00Z`).getTime() : Infinity;
    let emitted = 0;
    for (let i = 0; i < 90; i++) {
      const t = startMs + i * 86400000;
      if (t > endMs) return;
      if (t < fromMs || t > untilMs) continue;
      const iso = new Date(t).toISOString().slice(0, 10);
      if (((mask >> dayOfWeekRiyadh(iso)) & 1) === 0) continue;
      yield iso;
      emitted++;
      if (count != null && emitted >= count) return;
    }
  }

  it("weekly Monday-only template + 4-week window → exactly 5 Mondays (inclusive endpoints)", () => {
    // 2026-06-08 is a Monday (Riyadh). Window through 2026-07-06 hits five Mondays.
    const dates = [...walk("2026-06-08", "2026-07-06", undefined, MASK_MONDAY)];
    expect(dates).toEqual(["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06"]);
  });

  it("count-based: weekly Wednesday + count=3 stops after exactly 3 emissions", () => {
    const dates = [...walk("2026-06-08", undefined, 3, MASK_WEDNESDAY)];
    expect(dates).toHaveLength(3);
    expect(dates[0]).toBe("2026-06-10");
  });

  it("multi-day mask (Sun + Wed) emits both each week", () => {
    const dates = [...walk("2026-06-07", undefined, 4, MASK_SUNDAY | MASK_WEDNESDAY)];
    expect(dates).toEqual(["2026-06-07", "2026-06-10", "2026-06-14", "2026-06-17"]);
  });

  it("activeUntil clamps the iterator even when count is larger", () => {
    const dates = [...walk("2026-06-08", undefined, 10, MASK_MONDAY, undefined, "2026-06-22")];
    expect(dates).toEqual(["2026-06-08", "2026-06-15", "2026-06-22"]);
  });

  it("never emits more than 90 calendar days even with an absurd toDate", () => {
    // Mask=0x7F (every day) over a 73-year window must still cap.
    const dates = [...walk("2026-01-01", "2099-12-31", undefined, 0x7F)];
    expect(dates.length).toBeLessThanOrEqual(90);
  });
});
