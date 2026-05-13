import { describe, it, expect } from "vitest";
import { assertInsert } from "../../src/lib/rawdb.js";

describe("assertInsert", () => {
  it("returns the id for a positive insert", () => {
    expect(assertInsert(42, "clients")).toBe(42);
  });

  it("returns the id for id=1 (smallest valid)", () => {
    expect(assertInsert(1, "clients")).toBe(1);
  });

  it("throws on insertId=0 (ON CONFLICT DO NOTHING with no row)", () => {
    expect(() => assertInsert(0, "clients")).toThrow(/clients INSERT returned no id/);
  });

  it("throws on negative insertId", () => {
    expect(() => assertInsert(-1, "client_portal_accounts")).toThrow(/client_portal_accounts/);
  });

  it("throws on NaN insertId (defensive)", () => {
    expect(() => assertInsert(Number.NaN, "suppliers")).toThrow(/suppliers/);
  });

  it("throws on Infinity (defensive)", () => {
    expect(() => assertInsert(Number.POSITIVE_INFINITY, "x")).toThrow();
  });

  it("error message includes the entity name for diagnosability", () => {
    try {
      assertInsert(0, "vendor_contracts");
    } catch (err) {
      expect(String(err)).toContain("vendor_contracts");
      return;
    }
    throw new Error("assertInsert(0) did not throw");
  });
});
