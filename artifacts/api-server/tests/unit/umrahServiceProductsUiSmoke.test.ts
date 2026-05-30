import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the Phase 3a UI surface — the operator-facing settings page
 * gains the 3 product-mapping dropdowns + an incomplete-config
 * warning banner. Phase 3b will activate the actual GL split.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

describe("settings page — Phase 3a state additions", () => {
  it("UmrahSettings interface declares the 3 new product fields + names", () => {
    expect(PAGE).toMatch(/umrahVisaProductId: number \| null/);
    expect(PAGE).toMatch(/umrahVisaProductName: string \| null/);
    expect(PAGE).toMatch(/umrahServicesProductId: number \| null/);
    expect(PAGE).toMatch(/umrahServicesProductName: string \| null/);
    expect(PAGE).toMatch(/umrahTransportProductId: number \| null/);
    expect(PAGE).toMatch(/umrahTransportProductName: string \| null/);
  });

  it("fetches the products list from /finance/products", () => {
    expect(PAGE).toContain('"/finance/products"');
    expect(PAGE).toContain('["finance-products"]');
  });

  it("each dropdown has its own useState + useEffect that syncs from settings", () => {
    expect(PAGE).toMatch(/setSelectedVisaProductId\(settings\.umrahVisaProductId != null \? String\(settings\.umrahVisaProductId\) : ""\)/);
    expect(PAGE).toMatch(/setSelectedServicesProductId\(settings\.umrahServicesProductId != null \? String\(settings\.umrahServicesProductId\) : ""\)/);
    expect(PAGE).toMatch(/setSelectedTransportProductId\(settings\.umrahTransportProductId != null \? String\(settings\.umrahTransportProductId\) : ""\)/);
  });

  it("toPatchValue helper folds '' → null and value → Number (matches PR #1469 PATCH wire format)", () => {
    expect(PAGE).toMatch(/const toPatchValue = \(v: string\): number \| null => \(v === "" \? null : Number\(v\)\)/);
  });
});

describe("settings page — save handler PATCHes all 4 fields together", () => {
  it("save sends the 3 new product mappings alongside nuskSupplierId", () => {
    expect(PAGE).toMatch(/nuskSupplierId: toPatchValue\(selectedSupplierId\)/);
    expect(PAGE).toMatch(/umrahVisaProductId: toPatchValue\(selectedVisaProductId\)/);
    expect(PAGE).toMatch(/umrahServicesProductId: toPatchValue\(selectedServicesProductId\)/);
    expect(PAGE).toMatch(/umrahTransportProductId: toPatchValue\(selectedTransportProductId\)/);
  });

  it("dirty check covers all 4 fields (save button disabled until SOMETHING changes)", () => {
    // Without all 4 in the dirty calc, the save button could stay
    // disabled even after the operator changed a product dropdown.
    expect(PAGE).toMatch(/dirty =\s*selectedSupplierId !== [\s\S]{1,1000}selectedVisaProductId !== [\s\S]{1,1000}selectedServicesProductId !== [\s\S]{1,1000}selectedTransportProductId !==/);
  });
});

describe("settings page — service-products card UI", () => {
  it("renders a dedicated card with stable testid for the 3 dropdowns", () => {
    expect(PAGE).toContain('data-testid="umrah-service-products-card"');
    expect(PAGE).toContain('data-testid="umrah-visa-product-select"');
    expect(PAGE).toContain('data-testid="umrah-services-product-select"');
    expect(PAGE).toContain('data-testid="umrah-transport-product-select"');
  });

  it("incomplete-config banner renders when any of the 3 mappings is unset", () => {
    // Surface the gap — without the banner, the operator who picks
    // 2 of 3 won't realize the split won't activate. Better to nag
    // than to silently fall back to bundled lines.
    expect(PAGE).toMatch(/settings\?\.umrahVisaProductId == null[\s\S]{0,400}settings\?\.umrahServicesProductId == null[\s\S]{0,400}settings\?\.umrahTransportProductId == null/);
    expect(PAGE).toContain('data-testid="service-products-incomplete-banner"');
    expect(PAGE).toContain("لم تُكتمل خريطة المنتجات");
  });

  it("each dropdown surfaces the product's defaultTaxCode in the option label", () => {
    // Critical signal — operators can see at a glance whether the
    // visa product they picked is actually configured as zero-rated.
    // Without the [tax] suffix they'd have to flip to /finance/products
    // to double-check.
    expect(PAGE).toMatch(/p\.defaultTaxCode \? `\$\{p\.name\} \[\$\{p\.defaultTaxCode\}\]` : p\.name/);
  });

  it("link to /finance/products lets the operator create missing products inline", () => {
    expect(PAGE).toContain('href="/finance/products"');
  });
});
