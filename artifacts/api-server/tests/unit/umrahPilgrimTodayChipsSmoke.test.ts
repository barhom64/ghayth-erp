import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the "today's arrivals / departures" quick-filter chips:
 *
 *   - GET /umrah/pilgrims accepts ?arrivalDate=YYYY-MM-DD and
 *     ?departureDate=YYYY-MM-DD as exact-match filters on the
 *     respective date columns.
 *
 *   - The two chip buttons on the pilgrims page set the filter to
 *     todayLocal() (Riyadh-local) — clicking the active chip a second
 *     time clears it. The two chips are mutually exclusive: picking
 *     "arrivals today" clears any departure filter, and vice versa,
 *     so the operator can't get a contradictory empty result.
 *
 *   - todayLocal() (NOT new Date().toISOString().slice(0,10)) is the
 *     date source so the chip can't query a stale UTC day at ~21:00
 *     Riyadh on the last day of the month (check:utc-time-drift
 *     enforces this elsewhere).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("GET /umrah/pilgrims — date filters", () => {
  it("destructures arrivalDate + departureDate from req.query", () => {
    expect(ROUTE).toMatch(/\{[^}]*\barrivalDate\b[^}]*\}\s*=\s*req\.query/);
    expect(ROUTE).toMatch(/\{[^}]*\bdepartureDate\b[^}]*\}\s*=\s*req\.query/);
  });

  it("filters by exact match on the date column (no cast needed — column IS date)", () => {
    expect(ROUTE).toMatch(/if \(arrivalDate\)[\s\S]{0,150}p\."arrivalDate" = \$/);
    expect(ROUTE).toMatch(/if \(departureDate\)[\s\S]{0,150}p\."departureDate" = \$/);
  });
});

describe("pilgrims page — today chips", () => {
  it("imports todayLocal so the chip can't drift to UTC", () => {
    // check:utc-time-drift enforces this — the chip MUST use
    // todayLocal() (Riyadh) not new Date().toISOString().slice(0,10)
    // (UTC), which would silently query the wrong day at ~21:00
    // Riyadh on month boundaries.
    expect(PAGE).toMatch(/import \{[^}]*todayLocal[^}]*\} from "@\/lib\/formatters"/);
  });

  it("renders the arrivals + departures chips with stable testids", () => {
    expect(PAGE).toContain('data-testid="pilgrims-today-arrivals"');
    expect(PAGE).toContain('data-testid="pilgrims-today-departures"');
    expect(PAGE).toContain("وصول اليوم");
    expect(PAGE).toContain("مغادرة اليوم");
  });

  it("chips are mutually exclusive — picking one clears the other", () => {
    // Without this, an operator clicking both would end up with an
    // impossible (arrivalDate=today AND departureDate=today) filter
    // and see a confusing empty result.
    expect(PAGE).toMatch(/arrivalDate: next, departureDate: ""/);
    expect(PAGE).toMatch(/departureDate: next, arrivalDate: ""/);
  });

  it("clicking the active chip a second time clears the filter (toggle behavior)", () => {
    expect(PAGE).toMatch(/arrivalDate === t \? "" : t/);
    expect(PAGE).toMatch(/departureDate === t \? "" : t/);
  });

  it("variant flips to 'default' when the chip is the active filter (visual feedback)", () => {
    expect(PAGE).toMatch(/variant=\{arrivalDate === todayLocal\(\) \? "default" : "outline"\}/);
    expect(PAGE).toMatch(/variant=\{departureDate === todayLocal\(\) \? "default" : "outline"\}/);
  });

  it("URL plumbing carries both date filters on every refetch", () => {
    expect(PAGE).toMatch(/arrivalDate=\$\{encodeURIComponent\(arrivalDate\)\}/);
    expect(PAGE).toMatch(/departureDate=\$\{encodeURIComponent\(departureDate\)\}/);
  });

  it("react-query key includes both dates so a change triggers a refetch", () => {
    expect(PAGE).toMatch(/\["umrah-pilgrims",[\s\S]{0,300}arrivalDate,\s*departureDate/);
  });
});
