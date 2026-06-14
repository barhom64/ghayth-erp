import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-12 (RM-04) — family-first booking creation.
 *
 * The audit gap before this PR: the booking-create page opened on
 * a flat dropdown of 6 service types with no upstream cue. The
 * operator often picked the wrong type then had to back out. The
 * audit's RM-04 fix: a two-step flow — first choose the trip
 * FAMILY (ركاب / حمولة), then narrow the service-type dropdown to
 * the matching subset.
 *
 * Server canon is unchanged: `deriveTripFamily()` in
 * transport-bookings.ts still derives tripFamily from the row
 * data (cargo_load → cargo, passenger_* → passenger, equipment_
 * rental tilts passenger, the rest tilt cargo). This PR is a
 * UI-only narrowing — no API change, no schema change.
 *
 * Per the owner's package-locality rule: this test stays in
 * api-server and reads the SPA file as plain text.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-booking-create.tsx"),
  "utf8",
);
const SERVER = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-bookings.ts"),
  "utf8",
);

/* ── Family declaration + per-family subsets ─────────────────── */

describe("#2079 TA-T18-12 — family-first picker", () => {
  it("declares the TripFamily type union (passenger | cargo)", () => {
    expect(PAGE).toMatch(/type\s+TripFamily\s*=\s*"passenger"\s*\|\s*"cargo"/);
  });

  it("declares SERVICE_TYPES_BY_FAMILY with the passenger + cargo subsets", () => {
    const block = PAGE.match(
      /const\s+SERVICE_TYPES_BY_FAMILY[\s\S]+?\}\s*as const;/,
    );
    expect(block, "SERVICE_TYPES_BY_FAMILY not found").toBeTruthy();
    // Passenger subset must include the two canonical passenger
    // service-types.
    expect(block![0]).toMatch(/"passenger_umrah"/);
    expect(block![0]).toMatch(/"passenger_general"/);
    // Cargo subset must include cargo_load.
    expect(block![0]).toMatch(/"cargo_load"/);
  });

  it("the cargo subset does NOT contain passenger_umrah (no cross-family bleed)", () => {
    const block = PAGE.match(
      /cargo:\s*\[[\s\S]+?\][^,]*,?\s*\}\s*as const;/,
    );
    expect(block, "cargo subset not found").toBeTruthy();
    expect(block![0]).not.toMatch(/"passenger_umrah"/);
    expect(block![0]).not.toMatch(/"passenger_general"/);
  });

  it("the passenger subset does NOT contain cargo_load", () => {
    const block = PAGE.match(
      /passenger:\s*\[[\s\S]+?\],/,
    );
    expect(block, "passenger subset not found").toBeTruthy();
    expect(block![0]).not.toMatch(/"cargo_load"/);
  });

  it("declares a tripFamily state initialised to null (operator must pick)", () => {
    expect(PAGE).toMatch(
      /useState<TripFamily\s*\|\s*null>\(null\)/,
    );
  });

  it("flipping the family resets the service-type to the family's canonical default", () => {
    expect(PAGE).toMatch(/const\s+DEFAULT_SERVICE_BY_FAMILY[\s\S]+?passenger:\s*"passenger_umrah"/);
    expect(PAGE).toMatch(/DEFAULT_SERVICE_BY_FAMILY[\s\S]+?cargo:\s*"cargo_load"/);
    expect(PAGE).toMatch(/onTripFamilyChange/);
  });
});

/* ── UI wiring: button + dropdown narrowing ─────────────────── */

describe("#2079 TA-T18-12 — UI narrows the dropdown to the family's subset", () => {
  it("renders ركاب + حمولة buttons that call onTripFamilyChange", () => {
    expect(PAGE).toMatch(
      /onClick=\{\(\)\s*=>\s*onTripFamilyChange\("passenger"\)\}[\s\S]{0,500}?>\s*ركاب\s*</,
    );
    expect(PAGE).toMatch(
      /onClick=\{\(\)\s*=>\s*onTripFamilyChange\("cargo"\)\}[\s\S]{0,500}?>\s*حمولة\s*</,
    );
  });

  it("the service-type Select consumes serviceTypesForFamily(tripFamily) — not the legacy flat array", () => {
    expect(PAGE).toMatch(
      /serviceTypesForFamily\(tripFamily\)\.map\(\(s\)\s*=>/,
    );
  });

  it("the service-type Select is disabled until a family is picked", () => {
    expect(PAGE).toMatch(/disabled=\{tripFamily\s*==\s*null\}/);
  });

  it("the submit button is disabled until a family is picked", () => {
    expect(PAGE).toMatch(
      /type="submit"\s+disabled=\{submitting\s*\|\|\s*!hasLinkedSource\s*\|\|\s*tripFamily\s*==\s*null\}/,
    );
  });

  it("when no family is picked, an Arabic hint guides the operator", () => {
    expect(PAGE).toMatch(/اختر نوع الرحلة لظهور أنواع الخدمة المناسبة/);
  });
});

/* ── Server canon is untouched (regression pin) ─────────────── */

describe("#2079 TA-T18-12 — server deriveTripFamily contract preserved", () => {
  it("server still owns the tripFamily derivation (no API field change)", () => {
    // The deriveTripFamily function MUST remain on the server side
    // — the SPA narrowing is UI-only.
    expect(SERVER).toMatch(/function deriveTripFamily\(/);
  });

  it("deriveTripFamily still maps cargo_load → cargo, passenger_* → passenger", () => {
    expect(SERVER).toMatch(/if \(serviceType === "cargo_load"\) return "cargo"/);
    expect(SERVER).toMatch(/serviceType === "passenger_umrah" \|\| serviceType === "passenger_general"/);
  });
});

/* ── Boundary ────────────────────────────────────────────────── */

describe("#2079 TA-T18-12 — boundary intact", () => {
  it("no new API endpoint or field invented client-side", () => {
    // The page still POSTs the same fields it always did; the
    // tripFamily UI doesn't get its own request body field. Pin
    // by ensuring the request payload reference to
    // transportServiceType stays in the page (unchanged).
    expect(PAGE).toMatch(/transportServiceType,/);
    expect(PAGE).not.toMatch(/body:\s*\{[^}]*tripFamily:/);
  });

  it("no migration / no finance / no engine reference introduced", () => {
    expect(PAGE).not.toMatch(/migrations\//);
    expect(PAGE).not.toMatch(
      /journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|driverReputation|reputationScore|printEngine/,
    );
  });
});
