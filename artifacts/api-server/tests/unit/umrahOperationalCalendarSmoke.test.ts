import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §4 of #1870 — Operational Umrah Calendar, Phase 1.
 *
 * The Charter calls this "the heart of operations". Phase 1 lands:
 *
 *   1. GET /umrah/calendar/events?from=&to=&seasonId=&layers=
 *      Returns events aggregated per day per layer, with sampleIds
 *      so the day-detail panel drills straight to the records.
 *
 *   2. Six event layers wired (arrival, departure, visa_expiring,
 *      overstay, transport_trip, nusk_expiring) — each from existing
 *      date columns; no schema changes.
 *
 *   3. /umrah/calendar FE page: monthly grid + day-detail side panel
 *      + per-layer toggles + previous/next/today navigation.
 *
 * Phase 2 (deferred to follow-up PRs):
 *   - yearly + seasonal views, calendar-driven actions
 *   - more layers (pricing/commission/group readiness)
 *   - real-time refresh via the §10 event stream
 */
// U-07 Phase 15 — calendar route + CALENDAR_LAYER_META carved into umrah-calendar.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-calendar.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/calendar.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

const REQUIRED_LAYERS = [
  "pilgrim_arrival",
  "pilgrim_departure",
  "visa_expiring",
  "overstay",
  "transport_trip",
  "nusk_expiring",
] as const;

describe("API — calendar layer catalog", () => {
  it("CALENDAR_LAYER_META declares all six Phase-1 layers", () => {
    expect(ROUTE).toMatch(/export const CALENDAR_LAYER_META: Record<CalendarLayer/);
    for (const layer of REQUIRED_LAYERS) {
      expect(ROUTE).toContain(`${layer}:`);
    }
  });

  it("each layer has an Arabic label + a Charter-specified color", () => {
    // §4 says: أخضر/أصفر/أحمر/رمادي/أزرق/بنفسجي — six colors.
    expect(ROUTE).toMatch(/color: "green"/);
    expect(ROUTE).toMatch(/color: "blue"/);
    expect(ROUTE).toMatch(/color: "yellow"/);
    expect(ROUTE).toMatch(/color: "red"/);
    expect(ROUTE).toMatch(/color: "purple"/);
    // Each layer label is non-empty Arabic.
    expect(ROUTE).toMatch(/label: "وصول معتمرين"/);
    expect(ROUTE).toMatch(/label: "مغادرة معتمرين"/);
    expect(ROUTE).toMatch(/label: "تأشيرات تنتهي"/);
    expect(ROUTE).toMatch(/label: "متأخرون عن المغادرة"/);
    expect(ROUTE).toMatch(/label: "رحلات نقل"/);
    expect(ROUTE).toMatch(/label: "فواتير نسك تنتهي"/);
  });

  it("each layer maps to its source entity for drill-down", () => {
    expect(ROUTE).toMatch(/entityType: "umrah_pilgrims"/);
    expect(ROUTE).toMatch(/entityType: "umrah_transport"/);
    expect(ROUTE).toMatch(/entityType: "umrah_nusk_invoices"/);
  });
});

describe("API — GET /umrah/calendar/events", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/calendar\/events"/);
  });

  it("validates YYYY-MM-DD format on from + to", () => {
    expect(ROUTE).toMatch(/!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(fromStr\) \|\| !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(toStr\)/);
  });

  it("caps the window at 366 days (raised from 90 for Phase-2 yearly view)", () => {
    // Phase 1 capped at 90 days for the monthly view. Phase 2's
    // yearly view needs a single round-trip per year, so 366 days.
    // 366 × 8 layers stays in the single-digit second budget on a
    // typical season.
    expect(ROUTE).toMatch(/if \(days > 366\)/);
    expect(ROUTE).toMatch(/نافذة التقويم محدودة بـ 366 يوماً/);
  });

  it("whitelists the layers query param against CalendarLayer", () => {
    expect(ROUTE).toMatch(/\.filter\(\(s\): s is CalendarLayer =>/);
  });

  it("optional seasonId filter scopes the pilgrim + transport queries", () => {
    expect(ROUTE).toMatch(/AND p\."seasonId" = \$\$\{baseParams\.length\}/);
    expect(ROUTE).toMatch(/AND t\."seasonId" = \$\$\{baseParams\.length\}/);
  });

  it("each layer query returns date + count + sampleIds[1:10]", () => {
    // The sampleIds slice keeps the response cheap (10 ids per day
    // max) while letting the day-detail panel skip a second fetch.
    expect(ROUTE).toMatch(/ARRAY_AGG\(p\.id ORDER BY p\.id\)\)\[1:10\] AS "sampleIds"/);
    expect(ROUTE).toMatch(/ARRAY_AGG\(t\.id ORDER BY t\.id\)\)\[1:10\] AS "sampleIds"/);
    expect(ROUTE).toMatch(/ARRAY_AGG\(n\.id ORDER BY n\.id\)\)\[1:10\] AS "sampleIds"/);
  });

  it("nusk_expiring query excludes cancelled + refunded invoices", () => {
    // Otherwise a refunded invoice that's "expired" would clutter
    // the calendar with a date the operator can't act on.
    expect(ROUTE).toMatch(/AND n\."nuskStatus" NOT IN \('cancelled', 'refunded'\)/);
  });

  it("visa_expiring query excludes departed + cancelled pilgrims", () => {
    expect(ROUTE).toMatch(/AND p\.status NOT IN \('departed', 'cancelled'\)/);
  });

  it("runs all layer queries in parallel via Promise.all", () => {
    expect(ROUTE).toMatch(/await Promise\.all\(\s*[\r\n]+\s*ALL_LAYERS\.map/);
  });
});

describe("FE — page registration", () => {
  it("/umrah/calendar is registered in umrahRoutes", () => {
    expect(ROUTES).toMatch(/UmrahCalendar = lazy\(\(\) => import\("@\/pages\/umrah\/calendar"\)\)/);
    expect(ROUTES).toMatch(/path: "\/umrah\/calendar"/);
  });
});

describe("FE — calendar page (monthly grid + day detail)", () => {
  it("fetches /umrah/calendar/events with the visible month window", () => {
    expect(PAGE).toMatch(/`\/umrah\/calendar\/events\?from=\$\{from\}&to=\$\{to\}&layers=\$\{layersQs\}`/);
  });

  it("declares all six layers in the default-enabled set", () => {
    for (const layer of REQUIRED_LAYERS) {
      expect(PAGE).toContain(`"${layer}"`);
    }
  });

  it("renders a layer-toggle row with checkboxes", () => {
    expect(PAGE).toMatch(/data-testid=\{`calendar-layer-\$\{key\}`\}/);
  });

  it("renders the month nav (prev/next/today)", () => {
    expect(PAGE).toMatch(/data-testid="calendar-prev"/);
    expect(PAGE).toMatch(/data-testid="calendar-next"/);
    expect(PAGE).toMatch(/data-testid="calendar-month-label"/);
  });

  it("renders a 7-column grid keyed by date", () => {
    expect(PAGE).toMatch(/data-testid="calendar-grid"/);
    expect(PAGE).toMatch(/data-testid=\{`calendar-day-\$\{cell\.date\}`\}/);
  });

  it("Saturday-first weekdays match the Arabic operator's mental model", () => {
    expect(PAGE).toMatch(/WEEKDAYS_AR = \["السبت", "الأحد"/);
  });

  it("day-detail panel renders one entry per layer with drill-down link", () => {
    expect(PAGE).toMatch(/data-testid="calendar-day-detail-title"/);
    expect(PAGE).toMatch(/data-testid=\{`calendar-day-event-\$\{ev\.layer\}`\}/);
  });

  it("LAYER_HREF maps each layer to a drill-down URL with the date", () => {
    // The destination pages own the row-by-row UI; the calendar
    // just pivots the operator to them with the right filter.
    expect(PAGE).toMatch(/pilgrim_arrival: .* `\/umrah\/pilgrims\?arrivalDate=\$\{date\}`/);
    expect(PAGE).toMatch(/pilgrim_departure: .* `\/umrah\/pilgrims\?departureDate=\$\{date\}`/);
    expect(PAGE).toMatch(/overstay: .* `\/umrah\/pilgrims\?status=overstayed`/);
  });

  it("only fires the API when at least one layer is enabled", () => {
    expect(PAGE).toMatch(/enabledLayers\.size > 0/);
  });
});
