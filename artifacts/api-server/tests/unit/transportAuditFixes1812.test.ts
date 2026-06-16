import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 — audit fixes:
//   1. materialise endpoint is idempotent on (companyId, routePatternId,
//      requestedPickupDate) → operator double-click does not duplicate.
//   2. PATCH /transport/bookings/:id whitelists columns — operator can
//      NOT mutate tripFamily / routePatternId / bookingSource etc.
//   3. AssignmentSuggestionEngine applies a tripFamily SQL filter so
//      cargo vehicles aren't suggested for passenger bookings.

const apiSrc = join(import.meta.dirname!, "../../src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const PATTERNS = readApi("routes/transport-route-patterns.ts");
const BOOKINGS = readApi("routes/transport-bookings.ts");
const ENGINE   = readApi("lib/fleet/assignmentSuggestionEngine.ts");

describe("#1812 — materialise is idempotent (no duplicate bookings)", () => {
  it("validates targetDate format as YYYY-MM-DD", () => {
    expect(PATTERNS).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(PATTERNS).toMatch(/targetDate يجب أن يكون بصيغة YYYY-MM-DD/);
  });

  it("checks for an existing booking before INSERT", () => {
    expect(PATTERNS).toMatch(/SELECT id FROM transport_bookings[\s\S]{0,200}"routePatternId" = \$2/);
    expect(PATTERNS).toMatch(/"requestedPickupDate" = \$3/);
  });

  it("returns the existing booking with alreadyExisted: true on duplicate fire", () => {
    expect(PATTERNS).toMatch(/data: \{ bookingId: existing\.id, bookingNumber, alreadyExisted: true \}/);
  });
});

describe("#1812 — PATCH /transport/bookings whitelists columns", () => {
  it("declares PATCH_BANNED set", () => {
    expect(BOOKINGS).toContain("PATCH_BANNED");
    for (const banned of [
      '"tripFamily"', '"routePatternId"', '"bookingSource"',
      '"bookingNumber"', '"companyId"', '"branchId"',
      '"createdBy"', '"createdAt"', '"deletedAt"',
    ]) {
      expect(BOOKINGS, `PATCH_BANNED missing ${banned}`).toContain(banned);
    }
  });

  it("PATCH loop drops banned columns silently", () => {
    expect(BOOKINGS).toMatch(/if \(val !== undefined && !PATCH_BANNED\.has\(col\)\)/);
  });
});

describe("#1812 — AssignmentSuggestionEngine applies tripFamily filter", () => {
  it("derives isPassengerBooking from serviceType + passengerCount", () => {
    expect(ENGINE).toMatch(/isPassengerBooking[\s\S]{0,200}startsWith\("passenger_"\)/);
    expect(ENGINE).toMatch(/booking\.passengerCount \?\? 0\) > 0/);
  });

  it("derives isCargoBooking from serviceType + cargoWeight", () => {
    expect(ENGINE).toMatch(/isCargoBooking[\s\S]{0,200}"cargo_load"/);
    expect(ENGINE).toMatch(/Number\(booking\.cargoWeight\) \?\? 0\) > 0/);
  });

  it("excludes !validForPassengers vehicles from passenger pool (NULL is allowed)", () => {
    expect(ENGINE).toMatch(/v\."validForPassengers" IS NULL OR v\."validForPassengers" = TRUE/);
  });

  it("excludes !validForCargo vehicles from cargo pool (NULL is allowed)", () => {
    expect(ENGINE).toMatch(/v\."validForCargo" IS NULL OR v\."validForCargo" = TRUE/);
  });

  it("no filter applied when booking is mixed/unknown (legacy safety)", () => {
    expect(ENGINE).toMatch(/familyFilterSql = isPassengerBooking && !isCargoBooking[\s\S]{0,300}: ""/);
  });

  it("filter is injected into the vehicles SELECT WHERE clause", () => {
    expect(ENGINE).toMatch(/\$\{familyFilterSql\}/);
  });
});
