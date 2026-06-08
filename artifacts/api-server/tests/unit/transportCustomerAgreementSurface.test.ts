import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 Comment 3 — customer-agreement + time-window fields surfaced
// on the booking create form. Migration 271 added the schema columns;
// this PR makes them actually usable from the SPA.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const BOOKINGS = readApi("routes/transport-bookings.ts");
const CREATE_PAGE = readSpa("pages/fleet/transport-booking-create.tsx");

describe("#1812 — backend accepts customer-agreement + time-window fields", () => {
  it("create schema enumerates the 6 vehicleSubstitutionPolicy values", () => {
    for (const p of [
      "exact_only", "same_class_only", "equivalent_allowed",
      "upgrade_allowed", "operator_approval", "customer_approval",
    ]) {
      expect(BOOKINGS, `policy ${p} missing`).toContain(`"${p}"`);
    }
  });

  it("create schema declares all 5 customer-agreement fields", () => {
    for (const f of [
      "requestedVehicleClass",
      "vehicleSubstitutionPolicy",
      "allowUpgrade",
      "requiredExactVehicleId",
      "requiredExactDriverId",
    ]) {
      expect(BOOKINGS, `field ${f} missing`).toContain(f);
    }
  });

  it("create schema declares all 7 time-window fields", () => {
    for (const f of [
      "pickupWindowStart", "pickupWindowEnd",
      "dropoffWindowStart", "dropoffWindowEnd",
      "fixedAppointmentTime", "isFlexibleTime", "priority",
    ]) {
      expect(BOOKINGS, `field ${f} missing`).toContain(f);
    }
  });

  it("INSERT persists the new fields (parameter positions referenced)", () => {
    expect(BOOKINGS).toMatch(/"requestedVehicleClass", "vehicleSubstitutionPolicy", "allowUpgrade"/);
    expect(BOOKINGS).toMatch(/"requiredExactVehicleId", "requiredExactDriverId"/);
    expect(BOOKINGS).toMatch(/"pickupWindowStart", "pickupWindowEnd"/);
    expect(BOOKINGS).toMatch(/"fixedAppointmentTime", "isFlexibleTime", priority/);
  });

  it("default substitution policy is equivalent_allowed (back-compat)", () => {
    expect(BOOKINGS).toMatch(/b\.vehicleSubstitutionPolicy \?\? "equivalent_allowed"/);
  });
});

describe("#1812 — booking-create form surfaces the new fields", () => {
  it("includes a customer-agreement card with Arabic title", () => {
    expect(CREATE_PAGE).toMatch(/اتفاق العميل \+ النوافذ الزمنية/);
  });

  it("renders requestedVehicleClass input + 6 substitution policies", () => {
    expect(CREATE_PAGE).toContain("requestedVehicleClass");
    for (const p of [
      "exact_only", "same_class_only", "equivalent_allowed",
      "upgrade_allowed", "operator_approval", "customer_approval",
    ]) {
      expect(CREATE_PAGE, `policy ${p} missing`).toContain(`value="${p}"`);
    }
  });

  it("renders allowUpgrade + isFlexibleTime checkboxes", () => {
    expect(CREATE_PAGE).toContain("allowUpgrade");
    expect(CREATE_PAGE).toContain("isFlexibleTime");
    expect(CREATE_PAGE).toMatch(/يسمح العميل بترقية المركبة/);
    expect(CREATE_PAGE).toMatch(/الوقت مرن/);
  });

  it("renders the 4 datetime window inputs + fixed appointment + priority", () => {
    expect(CREATE_PAGE).toContain("pickupWindowStart");
    expect(CREATE_PAGE).toContain("pickupWindowEnd");
    expect(CREATE_PAGE).toContain("dropoffWindowStart");
    expect(CREATE_PAGE).toContain("dropoffWindowEnd");
    expect(CREATE_PAGE).toContain("fixedAppointmentTime");
    expect(CREATE_PAGE).toContain("priority");
  });

  it("submit body wires all the new fields", () => {
    expect(CREATE_PAGE).toMatch(/vehicleSubstitutionPolicy,/);
    expect(CREATE_PAGE).toMatch(/allowUpgrade,/);
    expect(CREATE_PAGE).toMatch(/isFlexibleTime,/);
    expect(CREATE_PAGE).toMatch(/pickupWindowStart: pickupWindowStart \|\| undefined/);
  });

  it("offers a 'required exact vehicle/driver' override pair (Comment 3 sample)", () => {
    expect(CREATE_PAGE).toMatch(/requiredExactVehicleId/);
    expect(CREATE_PAGE).toMatch(/requiredExactDriverId/);
    expect(CREATE_PAGE).toMatch(/إذا اشترط العميل مركبة بعينها/);
  });
});
