import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the flight-number visibility + filter:
 *
 *   - GET /umrah/pilgrims accepts `?flight=` and matches it against
 *     BOTH entryFlight and exitFlight via ILIKE so a single search
 *     hits arrival + departure manifests.
 *
 *   - The detail page Trip-Data card shows entryFlight + exitFlight
 *     (columns exist on umrah_pilgrims but were previously invisible
 *     to the operator).
 *
 *   - The pilgrim list page has a free-text flight input alongside
 *     AdvancedFilters and ships it on every request.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const LIST = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);
const DETAIL = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("GET /umrah/pilgrims — flight filter", () => {
  it("destructures `flight` from req.query alongside the existing filters", () => {
    expect(ROUTE).toMatch(/\{\s*seasonId,\s*status,\s*agentId,\s*groupId,\s*nationality,\s*flight,\s*search/);
  });

  it("matches entryFlight OR exitFlight via ILIKE on the same param", () => {
    // Same $param used for both columns so the SQL stays parameter-
    // count-stable; ILIKE so partial matches like "PIA" or "SV-" work.
    expect(ROUTE).toMatch(/if \(flight\) \{[\s\S]{1,400}p\."entryFlight" ILIKE \$\$\{params\.length\} OR p\."exitFlight" ILIKE \$\$\{params\.length\}/);
  });
});

describe("pilgrim list page — flight free-text input", () => {
  it("reads flight from the filters dict (same dynamic-keys pattern as season/group)", () => {
    expect(LIST).toMatch(/const flight = \(filters as Record<string, string>\)\.flight \|\| ""/);
  });

  it("ships flight on the query URL so the backend filter actually runs", () => {
    expect(LIST).toMatch(/flight=\$\{encodeURIComponent\(flight\)\}/);
  });

  it("react-query key includes flight so a change triggers a refetch", () => {
    expect(LIST).toMatch(/\["umrah-pilgrims",[\s\S]{0,300}flight,/);
  });

  it("renders a free-text input (not a dropdown — flight values are unbounded)", () => {
    expect(LIST).toContain('data-testid="pilgrims-flight-filter"');
    expect(LIST).toContain("رقم الرحلة:");
    expect(LIST).toContain("PIA-310");
  });

  it("typing in the input resets pagination to page 1 (consistent with status/season behavior)", () => {
    // Without the page-reset, switching flight on page 7 would silently
    // show "no results" if the new filter has fewer pages.
    expect(LIST).toMatch(/onChange=\{\(e\) => \{ setFilters\(\{ \.\.\.filters, flight: e\.target\.value \} as any\); setPage\(1\); \}\}/);
  });
});

describe("pilgrim detail page — Trip-Data card surfaces flight numbers", () => {
  it("entryFlight + exitFlight rendered as labelled rows", () => {
    expect(DETAIL).toContain("رحلة الوصول");
    expect(DETAIL).toContain("data?.entryFlight");
    expect(DETAIL).toContain("رحلة المغادرة");
    expect(DETAIL).toContain("data?.exitFlight");
  });
});
