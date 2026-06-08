import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 follow-up — the two highest-value gaps after the 10 PRs landed:
//   1. Drag-and-drop reschedule on the dispatch board (HTML5 native — no
//      @dnd-kit dependency added). The backend reschedule endpoint
//      already re-runs eligibility + tstzrange conflict detection.
//   2. Price-rules admin SPA. The accountant-side auto-price relies on
//      transport_price_rules being populated; previously rules could
//      only be inserted via SQL.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const DISPATCH = readSpa("pages/fleet/transport-dispatch.tsx");
const PRICE_RULES = readSpa("pages/fleet/transport-price-rules.tsx");
const FLEET_ROUTES = readSpa("routes/fleetRoutes.tsx");
const BOOKINGS_LIST = readSpa("pages/fleet/transport-bookings.tsx");
const BACKEND = readApi("routes/transport-bookings.ts");

describe("#1733 follow-up — dispatch drag-and-drop reschedule", () => {
  it("backend exposes POST /transport/dispatch-orders/:id/reschedule", () => {
    expect(BACKEND).toMatch(/\/transport\/dispatch-orders\/:id\/reschedule/);
    // Reschedule must lock the row + re-check eligibility + conflict on
    // the NEW combination, excluding self via id <> $N.
    expect(BACKEND).toMatch(/FOR UPDATE/);
    expect(BACKEND).toMatch(/assertDriverEligibility/);
    expect(BACKEND).toMatch(/id <> \$\d/);
    // Only pre-execution states (pending / notified) are reschedulable.
    expect(BACKEND).toMatch(/\["pending", "notified"\]/);
    // Emits a dedicated event so the dispatch board can refresh + audit.
    expect(BACKEND).toMatch(/fleet\.dispatch\.rescheduled/);
  });

  it("SPA wires native HTML5 DnD (no @dnd-kit dependency)", () => {
    // Drag state + reschedule helper.
    expect(DISPATCH).toMatch(/draggingOrderId/);
    expect(DISPATCH).toMatch(/dropTargetDriverId/);
    expect(DISPATCH).toMatch(/setRescheduling/);
    expect(DISPATCH).toMatch(/\/transport\/dispatch-orders\/\$\{orderId\}\/reschedule/);
    expect(DISPATCH).toMatch(/driverId: newDriverId/);
    // Native browser drag events on order cards + driver columns.
    expect(DISPATCH).toMatch(/draggable=\{isDraggable\}/);
    expect(DISPATCH).toMatch(/onDragStart=/);
    expect(DISPATCH).toMatch(/onDragEnd=/);
    expect(DISPATCH).toMatch(/onDragOver=/);
    expect(DISPATCH).toMatch(/onDrop=/);
    // GripVertical icon hints draggability.
    expect(DISPATCH).toMatch(/GripVertical/);
    // Defensive: no @dnd-kit dependency leaked in.
    expect(DISPATCH).not.toMatch(/@dnd-kit/);
  });

  it("SPA only allows reschedule on pre-execution states", () => {
    // The draggable flag is gated on pending|notified to mirror the
    // backend guard (server still validates — UI is just a UX hint).
    expect(DISPATCH).toMatch(
      /o\.status === "pending"[\s\S]{0,80}o\.status === "notified"/,
    );
  });

  it("SPA invalidates the query + shows toast on success", () => {
    expect(DISPATCH).toMatch(/invalidateQueries/);
    expect(DISPATCH).toMatch(/تم تغيير السائق/);
    // Failure path surfaces the backend message.
    expect(DISPATCH).toMatch(/تعذّر إعادة الجدولة/);
  });
});

describe("#1733 follow-up — price-rules admin SPA", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-price-rules.tsx"))).toBe(true);
    expect(PRICE_RULES).toContain("PageShell");
    expect(PRICE_RULES).toContain("FleetTabsNav");
  });

  it("registered route /fleet/transport/price-rules", () => {
    expect(FLEET_ROUTES).toContain("TransportPriceRules");
    expect(FLEET_ROUTES).toContain("/fleet/transport/price-rules");
  });

  it("CRUDs against the backend price-rules endpoints", () => {
    expect(PRICE_RULES).toMatch(/\/transport\/price-rules"/);
    // PATCH for edit + isActive toggle.
    expect(PRICE_RULES).toMatch(/\/transport\/price-rules\/\$\{form\.id\}/);
    expect(PRICE_RULES).toMatch(/\/transport\/price-rules\/\$\{r\.id\}/);
    // Preview button calls the live engine.
    expect(PRICE_RULES).toMatch(/\/transport\/price-rules\/preview/);
  });

  it("offers all 6 transport service types + all 9 units of measure", () => {
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(PRICE_RULES, `service type ${v} missing`).toContain(`value: "${v}"`);
    }
    for (const v of [
      "kg", "tonne", "pax", "trip", "km", "hour", "day", "pallet", "carton",
    ]) {
      expect(PRICE_RULES, `unit ${v} missing`).toContain(`value: "${v}"`);
    }
  });

  it("matching criteria + price fields are all wired in the form", () => {
    for (const k of [
      "customerId", "transportServiceType", "vehicleType",
      "routeFrom", "routeTo", "cargoType", "unitOfMeasure",
      "unitPrice", "minimumCharge", "currency", "vatRate",
      "validFrom", "validTo", "priority", "isActive",
    ]) {
      expect(PRICE_RULES, `field ${k} missing`).toContain(k);
    }
  });

  it("Arabic-first UI", () => {
    expect(PRICE_RULES).toMatch(/قواعد التسعير/);
    expect(PRICE_RULES).toMatch(/قاعدة جديدة/);
    expect(PRICE_RULES).toMatch(/جرّب المحرّك/);
    expect(PRICE_RULES).toMatch(/سعر الوحدة/);
  });

  it("preview result shows the chosen rule id + price + uom", () => {
    expect(PRICE_RULES).toMatch(/previewResult/);
    expect(PRICE_RULES).toMatch(/ruleId/);
    expect(PRICE_RULES).toMatch(/unitPrice/);
    expect(PRICE_RULES).toMatch(/unitOfMeasure/);
  });

  it("bookings list links out to the price-rules admin", () => {
    expect(BOOKINGS_LIST).toMatch(/\/fleet\/transport\/price-rules/);
    expect(BOOKINGS_LIST).toMatch(/قواعد التسعير/);
  });
});
