import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 final follow-up — admin CRUD surface for the two rules engines
// created in migration 269 (PR #1796):
//
//   • fleet_expense_rules       → /fleet/expense-rules
//   • transport_intake_rules    → /transport/intake-rules
//
// The migration was merged in #1796 but the tables had no admin route.
// This PR closes that gap with backend CRUD + a 2-tab admin SPA.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const BACKEND = readApi("routes/fleet-rules-admin.ts");
const ROUTES_INDEX = readApi("routes/index.ts");
const ADMIN_PAGE = readSpa("pages/fleet/transport-rules-admin.tsx");
const FLEET_ROUTES = readSpa("routes/fleetRoutes.tsx");
const BOOKINGS_LIST = readSpa("pages/fleet/transport-bookings.tsx");

describe("#1733 follow-up — fleet_expense_rules backend CRUD", () => {
  it("file exists + mounts under requireModule(fleet) + requireGuards(financial)", () => {
    expect(existsSync(join(apiSrc, "routes/fleet-rules-admin.ts"))).toBe(true);
    expect(ROUTES_INDEX).toContain("fleetRulesAdminRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate.
    expect(ROUTES_INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(ROUTES_INDEX).toContain('const transportFinancialGate = requireGuards("financial")');
    expect(ROUTES_INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });

  it("exposes the 4 CRUD endpoints + soft-delete", () => {
    expect(BACKEND).toMatch(/\.get\(\s*"\/fleet\/expense-rules"/);
    expect(BACKEND).toMatch(/\.post\(\s*"\/fleet\/expense-rules"/);
    expect(BACKEND).toMatch(/\.patch\(\s*"\/fleet\/expense-rules\/:id"/);
    expect(BACKEND).toMatch(/\.delete\(\s*"\/fleet\/expense-rules\/:id"/);
    // Delete is SOFT — sets deletedAt + isActive=FALSE, doesn't DROP.
    expect(BACKEND).toMatch(/UPDATE fleet_expense_rules[\s\S]{0,200}"deletedAt" = NOW\(\)/);
  });

  it("enforces the 3 source values + 3 accounting buckets + 6 liability parties", () => {
    for (const s of ["fuel_log", "maintenance", "traffic_violation"]) {
      expect(BACKEND).toContain(`"${s}"`);
    }
    for (const t of [
      "direct_expense", "capitalized_asset_improvement", "deferred_expense",
    ]) {
      expect(BACKEND).toContain(`"${t}"`);
    }
    for (const l of [
      "company", "driver", "customer", "third_party", "insurance", "unknown",
    ]) {
      expect(BACKEND).toContain(`"${l}"`);
    }
  });

  it("audits every mutation (create / update / delete)", () => {
    // Three createAuditLog calls — one per mutation endpoint.
    const auditCalls = BACKEND.match(/createAuditLog\(\{/g) || [];
    expect(auditCalls.length).toBeGreaterThanOrEqual(6); // 3 for expense + 3 for intake
  });

  it("gates expense-rules on fleet.expenses feature", () => {
    expect(BACKEND).toMatch(/feature: "fleet\.expenses", action: "list"/);
    expect(BACKEND).toMatch(/feature: "fleet\.expenses", action: "create"/);
    expect(BACKEND).toMatch(/feature: "fleet\.expenses", action: "update"/);
    expect(BACKEND).toMatch(/feature: "fleet\.expenses", action: "delete"/);
  });
});

describe("#1733 follow-up — transport_intake_rules backend CRUD", () => {
  it("exposes the 4 CRUD endpoints + soft-delete", () => {
    expect(BACKEND).toMatch(/\.get\(\s*"\/transport\/intake-rules"/);
    expect(BACKEND).toMatch(/\.post\(\s*"\/transport\/intake-rules"/);
    expect(BACKEND).toMatch(/\.patch\(\s*"\/transport\/intake-rules\/:id"/);
    expect(BACKEND).toMatch(/\.delete\(\s*"\/transport\/intake-rules\/:id"/);
    expect(BACKEND).toMatch(/UPDATE transport_intake_rules[\s\S]{0,200}"deletedAt" = NOW\(\)/);
  });

  it("enforces the 3 operation types + 6 transport service types", () => {
    for (const op of ["booking", "dispatch", "service_line"]) {
      expect(BACKEND).toContain(`"${op}"`);
    }
    // #TA-T18-UX-AUDIT — the 6 service types are now sourced from the shared
    // lib/transportEnums (dedup of 5 byte-identical copies); the route imports
    // the enum instead of re-declaring the list inline.
    expect(BACKEND).toMatch(
      /import \{ TRANSPORT_SERVICE_TYPES \} from "\.\.\/lib\/transportEnums\.js"/,
    );
    const ENUMS = readApi("lib/transportEnums.ts");
    for (const s of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(ENUMS).toContain(`"${s}"`);
    }
  });

  it("supports the 4 boolean flag columns (Comment 5/6 intake semantics)", () => {
    for (const f of [
      "requiresAttachment", "requiresApproval",
      "createsBookingDraft", "createsBillingCandidate",
    ]) {
      expect(BACKEND).toContain(f);
    }
  });

  it("gates intake-rules on fleet.bookings feature", () => {
    expect(BACKEND).toMatch(/"\/transport\/intake-rules"[\s\S]{0,200}feature: "fleet\.bookings", action: "list"/);
  });
});

describe("#1733 follow-up — admin SPA tabs", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav + Tabs", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-rules-admin.tsx"))).toBe(true);
    expect(ADMIN_PAGE).toContain("PageShell");
    expect(ADMIN_PAGE).toContain("FleetTabsNav");
    expect(ADMIN_PAGE).toContain("TabsTrigger");
  });

  it("renders both panels + their CRUD endpoints", () => {
    expect(ADMIN_PAGE).toContain("ExpenseRulesPanel");
    expect(ADMIN_PAGE).toContain("IntakeRulesPanel");
    expect(ADMIN_PAGE).toMatch(/\/fleet\/expense-rules/);
    expect(ADMIN_PAGE).toMatch(/\/transport\/intake-rules/);
  });

  it("offers the 3 expense sources + 3 accounting treatments + 6 liability parties", () => {
    for (const s of ["fuel_log", "maintenance", "traffic_violation"]) {
      expect(ADMIN_PAGE, `expense source ${s} missing`).toContain(`value: "${s}"`);
    }
    for (const t of [
      "direct_expense", "capitalized_asset_improvement", "deferred_expense",
    ]) {
      expect(ADMIN_PAGE, `treatment ${t} missing`).toContain(`value: "${t}"`);
    }
    for (const l of [
      "company", "driver", "customer", "third_party", "insurance", "unknown",
    ]) {
      expect(ADMIN_PAGE, `liability ${l} missing`).toContain(`value: "${l}"`);
    }
  });

  it("offers the 3 operation types + 6 service types in the intake panel", () => {
    for (const op of ["booking", "dispatch", "service_line"]) {
      expect(ADMIN_PAGE, `op ${op} missing`).toContain(`value: "${op}"`);
    }
    for (const s of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(ADMIN_PAGE, `service ${s} missing`).toContain(`value: "${s}"`);
    }
  });

  it("Arabic-first UI for both tabs", () => {
    expect(ADMIN_PAGE).toMatch(/قواعد العمليات والنفقات/);
    expect(ADMIN_PAGE).toMatch(/تصنيف النفقات/);
    expect(ADMIN_PAGE).toMatch(/استقبال العمليات/);
    expect(ADMIN_PAGE).toMatch(/قاعدة جديدة/);
  });

  it("dynamic field visibility — fuel shows stationName, maintenance shows maintenanceType, violation shows violationType", () => {
    expect(ADMIN_PAGE).toMatch(/expenseSource === "fuel_log"[\s\S]{0,300}stationName/);
    expect(ADMIN_PAGE).toMatch(/expenseSource === "maintenance"[\s\S]{0,300}maintenanceType/);
    expect(ADMIN_PAGE).toMatch(/expenseSource === "traffic_violation"[\s\S]{0,300}violationType/);
  });
});

describe("#1733 follow-up — route + nav integration", () => {
  it("fleetRoutes registers /fleet/transport/rules", () => {
    expect(FLEET_ROUTES).toContain("TransportRulesAdmin");
    expect(FLEET_ROUTES).toContain("/fleet/transport/rules");
  });

  it("bookings list cross-links to /fleet/transport/rules", () => {
    expect(BOOKINGS_LIST).toMatch(/\/fleet\/transport\/rules/);
    expect(BOOKINGS_LIST).toMatch(/قواعد العمليات/);
  });
});
