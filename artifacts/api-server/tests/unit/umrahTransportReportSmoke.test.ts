import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 stub conversion — umrah_transport report.
 *
 * Pins:
 *   1. /umrah/reports/umrah-transport endpoint joins transport_bookings
 *      to umrah_groups + umrah_agents (the §7 Service Contract chain).
 *   2. INNER JOIN on umrah_groups — bookings not tied to an umrah
 *      group MUST NOT surface (this is the umrah-specific report).
 *   3. bookingSource='umrah_group' guard — defence against the same
 *      table being used by cargo/contracts.
 *   4. Status histogram in the response (FE renders chips per state).
 *   5. FE page + route registration + status filter + per-row link
 *      to /umrah/groups/:id and /umrah/agents/:id.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/transport-requests.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("API — /umrah/reports/umrah-transport", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/umrah-transport"/);
  });

  it("INNER JOINs umrah_groups via transport_bookings.umrahGroupId", () => {
    expect(ROUTE).toMatch(/INNER JOIN umrah_groups g\s+ON g\.id = b\."umrahGroupId"/);
  });

  it("LEFT JOIN to umrah_agents is tenant-safe (companyId + deletedAt)", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_agents a\s+ON a\.id = g\."agentId"\s+AND a\."companyId" = g\."companyId"\s+AND a\."deletedAt" IS NULL/);
  });

  it("filters bookingSource='umrah_group' so cargo/contract rows don't leak", () => {
    expect(ROUTE).toMatch(/AND b\."bookingSource" = 'umrah_group'/);
  });

  it("ORDER BY requestedPickupDate NULLS LAST — earliest pickups first", () => {
    expect(ROUTE).toMatch(/ORDER BY b\."requestedPickupDate" NULLS LAST/);
  });

  it("response carries a per-status histogram + total", () => {
    expect(ROUTE).toMatch(/counts\[r\.status\] = \(counts\[r\.status\] \?\? 0\) \+ 1/);
    expect(ROUTE).toMatch(/data: rows, counts, total: rows\.length/);
  });

  it("optional seasonId + status filters whitelisted via parameter binding", () => {
    expect(ROUTE).toMatch(/seasonClause = ` AND g\."seasonId" = \$/);
    expect(ROUTE).toMatch(/statusClause = ` AND b\.status = \$/);
  });
});

describe("FE — transport report page", () => {
  it("calls the endpoint with both filters", () => {
    expect(PAGE).toMatch(/`\/umrah\/reports\/umrah-transport\$\{qs\}`/);
  });

  it("renders a status filter with the booking-status enum", () => {
    expect(PAGE).toMatch(/data-testid="transport-filter-status"/);
    // Pin a few key status labels Arabic so a translation drift
    // is caught.
    expect(PAGE).toContain("مُقدَّم");
    expect(PAGE).toContain("مُكلَّف");
    expect(PAGE).toContain("مكتمل");
    expect(PAGE).toContain("ملغي");
  });

  it("renders the status histogram chips", () => {
    expect(PAGE).toMatch(/data-testid="transport-status-counts"/);
    expect(PAGE).toMatch(/data-testid=\{`transport-count-\$\{status\}`\}/);
  });

  it("each row drills to /umrah/groups/:id + /umrah/agents/:id", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/groups\/\$\{r\.groupId\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/agents\/\$\{r\.agentId\}`\}/);
  });

  it("empty-state renders when zero rows (no broken table)", () => {
    expect(PAGE).toMatch(/data-testid="transport-empty"/);
    expect(PAGE).toMatch(/لا طلبات نقل تطابق الفلاتر/);
  });
});

describe("FE — route registration", () => {
  it("/umrah/reports/transport-requests is registered", () => {
    expect(ROUTES).toMatch(/UmrahTransportReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/transport-requests"/);
  });
});