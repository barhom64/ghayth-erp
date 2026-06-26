/**
 * list-query — withListFilters tests. Batch 12 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * The shared list-endpoint URL composer behind the warehouse/fleet/CRM list
 * tabs. Pure string work, but with three easy-to-break rules: empty values are
 * omitted, the separator is `?` for a clean base and `&` when the base already
 * has a query string, and every value is URL-encoded.
 */
import { describe, it, expect } from "vitest";
import { withListFilters } from "./list-query";

describe("withListFilters", () => {
  it("returns the base untouched when no filters are set", () => {
    expect(withListFilters("/crm/opportunities", {})).toBe("/crm/opportunities");
    expect(withListFilters("/x", { search: "", status: "" })).toBe("/x"); // empty values omitted
  });

  it("uses `?` for a clean base and `&` when the base already has a query", () => {
    expect(withListFilters("/warehouse/products", { search: "abc" })).toBe("/warehouse/products?search=abc");
    expect(withListFilters("/fleet/vehicles?page=1&limit=20", { dateFrom: "2026-05-01" })).toBe(
      "/fleet/vehicles?page=1&limit=20&dateFrom=2026-05-01",
    );
  });

  it("appends every set filter in a stable order joined by `&`", () => {
    expect(
      withListFilters("/x", { search: "a", status: "active", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
    ).toBe("/x?search=a&status=active&dateFrom=2026-01-01&dateTo=2026-12-31");
  });

  it("omits empty filter values while keeping the set ones", () => {
    expect(withListFilters("/x", { search: "", status: "active", dateFrom: "", dateTo: "2026-12-31" })).toBe(
      "/x?status=active&dateTo=2026-12-31",
    );
  });

  it("URL-encodes filter values (spaces, &, =, Arabic)", () => {
    const val = "a b&c=د";
    expect(withListFilters("/x", { search: val })).toBe(`/x?search=${encodeURIComponent(val)}`);
    expect(withListFilters("/x", { search: val })).toContain("%20"); // space encoded, not raw
  });
});
