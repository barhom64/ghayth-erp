import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transport UX gaps — batch 1 (operational review fixes).
 *
 * Static guard (regex-only, no DB) pinning the batch-1 corrections from
 * the owner's transport review so they don't regress:
 *   A — multi-leg leg times use the unified DateField (not native datetime-local)
 *   B — booking confirmation prefers the LINKED customer name (FK), not free text
 *   C — Saudi driver license number is OPTIONAL (national ID is the identity)
 *   D — dispatch vehicle picker surfaces status + floats available first
 *   E — umrah group picker notes that hotel is entered manually
 *
 * Lives in api-server per the package-locality rule; reads SPA files as text.
 */

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const read = (base: string, rel: string) => readFileSync(join(base, rel), "utf8");

const MULTI_LEG = read(spaSrc, "components/shared/multi-leg-booking-editor.tsx");
const CONFIRM = read(spaSrc, "pages/fleet/transport-booking-confirmation.tsx");
const DRIVERS_CREATE = read(spaSrc, "pages/create/fleet/driver-create-form.tsx");
const DISPATCH = read(spaSrc, "pages/fleet/transport-dispatch.tsx");
const GROUP_PICKER = read(spaSrc, "components/shared/umrah-group-picker.tsx");
const BOOKINGS_ROUTE = read(apiSrc, "routes/transport-bookings.ts");
const FLEET_ROUTE = read(apiSrc, "routes/fleet.ts");

describe("transport UX batch 1 — A: multi-leg uses unified date component", () => {
  it("leg pickup/delivery use DateField mode=datetime, not native datetime-local", () => {
    expect(MULTI_LEG).toMatch(/import \{ DateField \} from "@\/components\/shared\/form-field-wrapper"/);
    expect(MULTI_LEG).toMatch(/<DateField[\s\S]{0,80}mode="datetime"[\s\S]{0,120}scheduledPickupAt/);
    expect(MULTI_LEG).toMatch(/scheduledDeliveryAt/);
    expect(MULTI_LEG).not.toMatch(/type="datetime-local"/);
  });
});

describe("transport UX batch 1 — B: confirmation uses the linked customer", () => {
  it("page prefers linkedCustomerName then falls back to free-text", () => {
    expect(CONFIRM).toMatch(/linkedCustomerName: string \| null/);
    expect(CONFIRM).toMatch(/c\.linkedCustomerName \|\| c\.customerName/);
  });
  it("confirmation route joins clients to expose linkedCustomerName", () => {
    expect(BOOKINGS_ROUTE).toMatch(/\/transport\/bookings\/:id\/confirmation/);
    expect(BOOKINGS_ROUTE).toMatch(/LEFT JOIN clients c ON c\.id = b\."customerId"[\s\S]{0,80}c\.name AS "linkedCustomerName"|c\.name AS "linkedCustomerName"[\s\S]{0,120}LEFT JOIN clients/);
  });
});

describe("transport UX batch 1 — C: Saudi driver license number optional", () => {
  it("SPA requires license number only for non-Saudi", () => {
    expect(DRIVERS_CREATE).toMatch(/needsLicenseNumber = form\.licenseOrigin !== "saudi"/);
    expect(DRIVERS_CREATE).toMatch(/required=\{form\.licenseOrigin !== "saudi"\}/);
  });
  it("backend schema makes licenseNumber optional and requires it for non-Saudi via refine", () => {
    expect(FLEET_ROUTE).toMatch(/licenseNumber: z\.string\(\)\.optional\(\)/);
    expect(FLEET_ROUTE).toMatch(/return !!d\.iqamaNumber && !!d\.licenseNumber/);
  });
});

describe("transport UX batch 1 — D: dispatch vehicle picker status + ordering", () => {
  it("sorts vehicles available-first and labels each option with its status", () => {
    expect(DISPATCH).toMatch(/available" \? 0/);
    expect(DISPATCH).toMatch(/statusLabel\("vehicle", v\.status\)\.label/);
  });
});

describe("transport UX batch 1 — E: umrah picker clarifies hotel is manual", () => {
  it("group picker explains the hotel is entered manually", () => {
    expect(GROUP_PICKER).toMatch(/الفندق يُدخَل يدوياً/);
  });
});
