import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 Layer 8 — per-leg suggest-assignment + UI.
// Closes the gap: itinerary legs carried assignedVehicleId/DriverId
// columns but the editor had no way to set them. Now operators click
// "اقترح" on a leg, the engine ranks candidates, and selection
// PATCHes the leg directly (no dispatch order until later
// materialization).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ENGINE = readApi("lib/fleet/assignmentSuggestionEngine.ts");
const PLANNING = readApi("routes/transport-planning.ts");
const DIALOG = readSpa("components/shared/assignment-suggest-dialog.tsx");
const ITINERARY_DETAIL = readSpa("pages/fleet/transport-itinerary-detail.tsx");

describe("#1812 — engine exposes suggestForLeg + shared scoring", () => {
  it("exports suggestForLeg as a second public entry point", () => {
    expect(ENGINE).toContain("export async function suggestForLeg");
  });

  it("extracts SuggestionCriteria interface for the shared engine core", () => {
    expect(ENGINE).toContain("export interface SuggestionCriteria");
    for (const field of [
      "scheduledStartAt", "scheduledEndAt", "transportServiceType",
      "passengerCount", "cargoWeight", "requestedVehicleClass",
      "vehicleSubstitutionPolicy", "allowUpgrade",
      "requiredExactVehicleId", "requiredExactDriverId",
      "fromLat", "fromLng",
    ]) {
      expect(ENGINE, `criteria field ${field} missing`).toContain(field);
    }
  });

  it("suggestAssignments delegates to suggestForCriteria after loading the booking", () => {
    expect(ENGINE).toMatch(/return suggestForCriteria\(/);
    expect(ENGINE).toMatch(/async function suggestForCriteria/);
  });

  it("suggestForLeg loads from transport_itinerary_legs + transport_itineraries", () => {
    expect(ENGINE).toMatch(/FROM transport_itinerary_legs l[\s\S]{0,200}JOIN transport_itineraries i/);
    // Picks origin lat/lng from the leg's location.
    expect(ENGINE).toMatch(/transport_locations fl ON fl\.id = l\."originLocationId"/);
  });

  it("suggestForLeg defaults vehicleSubstitutionPolicy to equivalent_allowed", () => {
    expect(ENGINE).toMatch(/vehicleSubstitutionPolicy: "equivalent_allowed"/);
  });
});

describe("#1812 — per-leg suggest endpoint", () => {
  it("POST /transport/itineraries/:id/legs/:legId/suggest-assignment exists", () => {
    expect(PLANNING).toMatch(
      /\.post\(\s*"\/transport\/itineraries\/:id\/legs\/:legId\/suggest-assignment"/,
    );
  });

  it("verifies the leg belongs to the named itinerary + scope", () => {
    expect(PLANNING).toMatch(/SELECT id FROM transport_itinerary_legs[\s\S]{0,200}"itineraryId" = \$2/);
  });

  it("delegates to suggestForLeg", () => {
    expect(PLANNING).toContain("suggestForLeg(scope.companyId, legId");
  });
});

describe("#1812 — dialog supports booking + leg sources", () => {
  it("Props discriminates source.kind = 'booking' or 'leg'", () => {
    expect(DIALOG).toContain('kind: "booking"');
    expect(DIALOG).toContain('kind: "leg"');
  });

  it("suggestUrl picks the right endpoint per kind", () => {
    expect(DIALOG).toMatch(/effectiveSource\.kind === "booking"/);
    expect(DIALOG).toMatch(/\/transport\/itineraries\/\$\{effectiveSource\.itineraryId\}\/legs\/\$\{effectiveSource\.legId\}\/suggest-assignment/);
  });

  it("leg path PATCHes assignedVehicleId/DriverId (no dispatch order yet)", () => {
    expect(DIALOG).toMatch(/effectiveSource\.kind === "leg"/);
    expect(DIALOG).toMatch(/assignedVehicleId: c\.vehicleId/);
    expect(DIALOG).toMatch(/assignedDriverId: c\.driverId/);
    expect(DIALOG).toMatch(/status: "assigned"/);
  });

  it("button label adapts to source: leg shows 'اعتمد + إسناد المرحلة'", () => {
    expect(DIALOG).toMatch(/اعتمد \+ إسناد المرحلة/);
    expect(DIALOG).toMatch(/اعتمد \+ أنشئ أمر التوزيع/);
  });

  it("default autoCreate differs: true for booking, false for leg", () => {
    expect(DIALOG).toMatch(/autoCreate \?\? \(effectiveSource\.kind === "booking"\)/);
  });

  it("legacy bookingId prop still works for back-compat", () => {
    expect(DIALOG).toContain("legacyBookingId");
  });
});

describe("#1812 — itinerary detail SPA wiring", () => {
  it("itinerary detail mounts AssignmentSuggestDialog with source.kind=leg", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-itinerary-detail.tsx"))).toBe(true);
    expect(ITINERARY_DETAIL).toContain("AssignmentSuggestDialog");
    expect(ITINERARY_DETAIL).toMatch(/source=\{\{ kind: "leg", itineraryId: it\.id, legId: suggestLegId/);
  });

  it("renders Wand2 button on each leg", () => {
    expect(ITINERARY_DETAIL).toContain("Wand2");
    expect(ITINERARY_DETAIL).toMatch(/اقترح المركبة والسائق/);
  });
});
