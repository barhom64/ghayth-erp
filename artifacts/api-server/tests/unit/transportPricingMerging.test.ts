import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Pricing + Invoice merging (Issue Comment 3) + driverServiceProfile.
// Locks in:
//   1. Migration 268 + schema dump carry transport_price_rules,
//      transport_invoice_links, and the fleet_drivers.driverServiceProfile
//      extension.
//   2. resolveTransportPrice picks the most-specific matching rule
//      and honours validity windows.
//   3. The route surface includes price-rules CRUD + preview, service-line
//      queue + auto-price, and the invoice-batch merger.
//   4. The invoice-batch endpoint enforces same-customer + already-priced
//      preconditions and emits the finance handoff event.
//   5. fleet.ts driver schemas accept driverServiceProfile.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const PRICING_ROUTE = read("routes/transport-pricing.ts");
const PRICING_LIB = read("lib/fleet/pricingEngine.ts");
const FLEET_ROUTE = read("routes/fleet.ts");
const ROUTES_INDEX = read("routes/index.ts");

describe("#1733 Pricing — migration 268 + schema dump", () => {
  it("migration 268 declares transport_price_rules + transport_invoice_links + driverServiceProfile", () => {
    const migPath = join(apiSrc, "migrations", "268_pricing_and_invoice_merging.sql");
    expect(existsSync(migPath), "migration 268 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toMatch(/ALTER TABLE public\.fleet_drivers\s+ADD COLUMN IF NOT EXISTS "driverServiceProfile"/);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.transport_price_rules");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.transport_invoice_links");
    expect(sql).toContain("uq_transport_invoice_link_service");
    // Service-type enum mirrors the rest of #1733.
    for (const s of ["cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other"]) {
      expect(sql, `service type ${s} missing`).toContain(`'${s}'`);
    }
    // Validity window columns.
    expect(sql).toContain("\"validFrom\"");
    expect(sql).toContain("\"validTo\"");
    expect(sql).toContain("priority");
  });

  it("schema dump carries the tables + PKs + lookup index + driverServiceProfile column", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    expect(pre).toContain("CREATE TABLE public.transport_price_rules");
    expect(pre).toContain("CREATE TABLE public.transport_invoice_links");
    const driversBlock = pre.match(/CREATE TABLE public\.fleet_drivers[\s\S]+?\)\s*;\s*\n/)?.[0]!;
    expect(driversBlock).toContain("driverServiceProfile");
    expect(post).toContain("transport_price_rules_pkey");
    expect(post).toContain("transport_invoice_links_pkey");
    expect(post).toContain("uq_transport_invoice_link_service");
    expect(post).toContain("idx_price_rules_lookup");
    expect(post).toContain("idx_fleet_drivers_service_profile");
  });
});

describe("#1733 Pricing — route surface", () => {
  it("exposes pricing rules CRUD + preview", () => {
    expect(PRICING_ROUTE).toMatch(/\.get\(\s*["']\/transport\/price-rules["']/);
    expect(PRICING_ROUTE).toMatch(/\.post\(\s*["']\/transport\/price-rules["']/);
    expect(PRICING_ROUTE).toMatch(/\.patch\(\s*["']\/transport\/price-rules\/:id["']/);
    expect(PRICING_ROUTE).toMatch(/\.post\(\s*["']\/transport\/price-rules\/preview["']/);
  });

  it("exposes service-line queue + auto-price + invoice-batch merge", () => {
    expect(PRICING_ROUTE).toMatch(/\.get\(\s*["']\/transport\/service-lines["']/);
    expect(PRICING_ROUTE).toMatch(/\.patch\(\s*["']\/transport\/service-lines\/:id["']/);
    expect(PRICING_ROUTE).toMatch(/\.post\(\s*["']\/transport\/service-lines\/:id\/auto-price["']/);
    expect(PRICING_ROUTE).toMatch(/\.post\(\s*["']\/transport\/invoice-batches["']/);
  });

  it("invoice-batch endpoint locks rows FOR UPDATE + validates same-customer + emits event", () => {
    const block = PRICING_ROUTE.match(
      /\/transport\/invoice-batches[\s\S]+?Build invoice batch error:/,
    )?.[0]!;
    expect(block).toContain("FOR UPDATE");
    expect(block).toMatch(/جميع البنود يجب أن تكون لنفس العميل/);
    expect(block).toMatch(/مفوتر مسبقاً|مفوتر مسبقا/);
    expect(block).toMatch(/finance\.transport_billing\.batch\.ready/);
  });

  it("invoice-batch endpoint creates a real draft invoice + lines + links (Step-2)", () => {
    const block = PRICING_ROUTE.match(
      /\/transport\/invoice-batches[\s\S]+?Build invoice batch error:/,
    )?.[0]!;
    // Real invoice document, numbered via the central authority with the same
    // scheme as finance POST /invoices — keeps audit:numbering-coverage in-file.
    expect(block).toContain("INSERT INTO invoices");
    expect(block).toMatch(/issueNumber\(/);
    expect(block).toContain('entityTable: "invoices"');
    expect(block).toContain('expectedTiming: "on_draft"');
    // Revenue routed per line by service type → 4151/4152/4153.
    expect(block).toContain("resolveTransportRevenueAccount");
    expect(block).toContain("INSERT INTO invoice_lines");
    // The deferred B#1 flip now happens with the REAL invoiceId + the junction.
    expect(block).toMatch(/"billingStatus" = 'invoiced'/);
    expect(block).toContain('"invoiceId"');
    expect(block).toContain("INSERT INTO transport_invoice_links");
  });

  it("cargo manifest GL posts freight revenue to the 4153 leaf (Step-2 repoint)", () => {
    const fleetEngine = read("lib/engines/fleetEngine.ts");
    expect(fleetEngine).toMatch(/"cargo_freight_revenue",\s*"credit",\s*"4153"/);
    expect(fleetEngine).not.toMatch(/"cargo_freight_revenue",\s*"credit",\s*"4150"/);
  });

  it("batch handler stamps the trip cost-center (sub-CC under the vehicle) on each line (Step-3)", () => {
    const block = PRICING_ROUTE.match(
      /\/transport\/invoice-batches[\s\S]+?Build invoice batch error:/,
    )?.[0]!;
    // Trip id is lifted from the line, and the trip CC is minted under the vehicle CC.
    expect(block).toContain('"tripId"');
    expect(block).toMatch(/createCostCenterForEntity\([\s\S]{0,60}?"trip"/);
    expect(block).toContain('parentEntityType: "vehicle"');
    // The resolved cost-center is stamped on the invoice line (no longer hard-null).
    expect(block).toContain("p.costCenterId");
  });

  it("cost-center generator supports the trip sub-center type (Step-3)", () => {
    const cc = read("lib/costCenterAutoCreate.ts");
    expect(cc).toMatch(/\|\s*"trip"/);                              // union member
    expect(cc).toMatch(/trip:\s*"TR"/);                            // code prefix
    expect(cc).toMatch(/trip:\s*"auto-created on transport trip/); // audit reason
  });

  it("router is mounted with fleet module + financial guards", () => {
    expect(ROUTES_INDEX).toContain("transportPricingRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate.
    expect(ROUTES_INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(ROUTES_INDEX).toContain('const transportFinancialGate = requireGuards("financial")');
    expect(ROUTES_INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });
});

describe("#1733 Pricing — engine library", () => {
  it("exports resolveTransportPrice with the right input shape", () => {
    expect(PRICING_LIB).toContain("export async function resolveTransportPrice");
    expect(PRICING_LIB).toContain("transportServiceType");
    expect(PRICING_LIB).toContain("serviceDate");
  });

  it("uses validity-window predicate in the SQL", () => {
    expect(PRICING_LIB).toMatch(/\$4::date >= "validFrom"/);
    expect(PRICING_LIB).toMatch(/\$4::date <= "validTo"/);
  });

  it("filters by customerId IS NULL OR matches the input — never leaks across customers", () => {
    expect(PRICING_LIB).toMatch(/"customerId" IS NULL OR "customerId" = \$3/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioural — specificity ranking + validity filter.
// ────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(),
}));

describe("#1733 Pricing — resolveTransportPrice behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when no rule matches", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([]);
    const { resolveTransportPrice } = await import("../../src/lib/fleet/pricingEngine.js");
    const result = await resolveTransportPrice({
      companyId: 1, customerId: 9,
      transportServiceType: "cargo_load",
      serviceDate: "2026-06-07",
    });
    expect(result).toBeNull();
  });

  it("picks the most-specific rule (customer + route beats global)", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([
      // Global default — least specific.
      { id: 1, customerId: null, vehicleType: null,
        routeFrom: null, routeTo: null, cargoType: null,
        unitOfMeasure: "kg", unitPrice: "0.5",
        minimumCharge: null, currency: "SAR", vatRate: null, priority: 0 },
      // Customer-only.
      { id: 2, customerId: 9, vehicleType: null,
        routeFrom: null, routeTo: null, cargoType: null,
        unitOfMeasure: "kg", unitPrice: "0.4",
        minimumCharge: null, currency: "SAR", vatRate: null, priority: 0 },
      // Customer + route — MOST specific.
      { id: 3, customerId: 9, vehicleType: null,
        routeFrom: "Riyadh", routeTo: "Jeddah", cargoType: null,
        unitOfMeasure: "kg", unitPrice: "0.3",
        minimumCharge: null, currency: "SAR", vatRate: null, priority: 0 },
    ]);
    const { resolveTransportPrice } = await import("../../src/lib/fleet/pricingEngine.js");
    const result = await resolveTransportPrice({
      companyId: 1, customerId: 9,
      transportServiceType: "cargo_load",
      vehicleType: null, routeFrom: "Riyadh", routeTo: "Jeddah",
      cargoType: null,
      serviceDate: "2026-06-07",
    });
    expect(result?.ruleId).toBe(3);
    expect(result?.unitPrice).toBe(0.3);
  });

  it("filters out rules whose non-NULL match keys do NOT agree with input", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([
      // Rule pinned to "Riyadh→Jeddah" but the input is "Riyadh→Dammam"
      // → must be discarded even though it appeared in the SQL result.
      { id: 5, customerId: null, vehicleType: null,
        routeFrom: "Riyadh", routeTo: "Jeddah", cargoType: null,
        unitOfMeasure: "kg", unitPrice: "0.6",
        minimumCharge: null, currency: "SAR", vatRate: null, priority: 10 },
    ]);
    const { resolveTransportPrice } = await import("../../src/lib/fleet/pricingEngine.js");
    const result = await resolveTransportPrice({
      companyId: 1, customerId: null,
      transportServiceType: "cargo_load",
      routeFrom: "Riyadh", routeTo: "Dammam",
      serviceDate: "2026-06-07",
    });
    expect(result).toBeNull();
  });
});

describe("#1733 Pricing — fleet.ts driver schemas accept driverServiceProfile", () => {
  it("DRIVER_SERVICE_PROFILES enum + schema fields present", () => {
    expect(FLEET_ROUTE).toContain("DRIVER_SERVICE_PROFILES");
    expect(FLEET_ROUTE).toMatch(
      /createDriverSchema[\s\S]{0,2000}driverServiceProfile:\s*z\.enum\(DRIVER_SERVICE_PROFILES\)/,
    );
    expect(FLEET_ROUTE).toMatch(
      /updateDriverSchema[\s\S]{0,2000}driverServiceProfile:\s*z\.enum\(DRIVER_SERVICE_PROFILES\)/,
    );
    // Five profile values from Comment 3.
    for (const v of ["cargo_driver", "umrah_driver", "passenger_driver", "rental_driver", "mixed"]) {
      expect(FLEET_ROUTE, `profile ${v} missing`).toContain(`"${v}"`);
    }
  });

  it("driver INSERT carries driverServiceProfile", () => {
    expect(FLEET_ROUTE).toMatch(
      /INSERT INTO fleet_drivers[\s\S]{0,400}"driverServiceProfile"/,
    );
  });
});
