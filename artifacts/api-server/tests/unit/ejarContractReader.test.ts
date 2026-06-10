/**
 * EjarContractReader — Mock-First unit tests.
 *
 * The mock reader's job is twofold: validate the ejarNumber surface
 * (so a typo on the form returns a clean 400 from the route, not a
 * 500 from the real adapter someday), and return a deterministic
 * fixture per branch so the form's pre-fill behaviour can be tested
 * end-to-end without a network call. These tests lock both contracts
 * down — the route on top is a thin pass-through.
 */
import { describe, it, expect } from "vitest";
import {
  mockEjarReader,
  isValidEjarFormat,
  type EjarContractData,
} from "../../src/lib/ejarContractReader.js";

describe("isValidEjarFormat", () => {
  it.each([
    ["EJ-1000", true],
    ["EJ-12345", true],
    ["EJ-9999999", true],
    ["ej-1000", false],
    ["EJ1000", false],
    ["EJ-", false],
    ["EJ-12", false],
    ["EJ-12A", false],
    ["", false],
    [null, false],
    [undefined, false],
    [12345, false],
  ])("returns %s for %p", (input, expected) => {
    expect(isValidEjarFormat(input as unknown)).toBe(expected);
  });
});

describe("mockEjarReader", () => {
  const reader = mockEjarReader();

  it("returns null for malformed numbers", async () => {
    expect(await reader.read("not-a-number")).toBeNull();
    expect(await reader.read("EJ-")).toBeNull();
    expect(await reader.read("")).toBeNull();
  });

  it("returns null for the explicit not-found fixture (EJ-9xxx)", async () => {
    expect(await reader.read("EJ-9000")).toBeNull();
    expect(await reader.read("EJ-9999")).toBeNull();
  });

  it("is deterministic: the same ejarNumber always yields the same data", async () => {
    const first = await reader.read("EJ-1234");
    const second = await reader.read("EJ-1234");
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  describe("residential branch (EJ-1xxx)", () => {
    let data: EjarContractData;

    it("populates", async () => {
      const result = await reader.read("EJ-1234");
      expect(result).not.toBeNull();
      data = result!;
    });

    it("maps to residential_rent", () => {
      expect(data.contractType).toBe("residential_rent");
    });

    it("computes yearlyRent + totalContractValue from monthlyRent", () => {
      expect(data.yearlyRent).toBe(data.monthlyRent * 12);
      expect(data.totalContractValue).toBe(data.monthlyRent * 12);
    });

    it("auto-renewal defaults to true for residential", () => {
      expect(data.autoRenewal).toBe(true);
    });

    it("maintenance is shared for residential", () => {
      expect(data.maintenanceResponsibility).toBe("shared");
    });

    it("ejarStatus is active", () => {
      expect(data.ejarStatus).toBe("active");
    });

    it("carries the originating ejarNumber back in the response", () => {
      expect(data.ejarNumber).toBe("EJ-1234");
    });
  });

  describe("commercial branch (EJ-2xxx)", () => {
    let data: EjarContractData;

    it("populates", async () => {
      const result = await reader.read("EJ-2500");
      expect(result).not.toBeNull();
      data = result!;
    });

    it("maps to commercial_rent", () => {
      expect(data.contractType).toBe("commercial_rent");
    });

    it("auto-renewal defaults to false for commercial", () => {
      expect(data.autoRenewal).toBe(false);
    });

    it("maintenance is tenant-borne for commercial", () => {
      expect(data.maintenanceResponsibility).toBe("tenant");
    });

    it("terminationNoticeDays is the commercial-standard 90", () => {
      expect(data.terminationNoticeDays).toBe(90);
    });
  });

  it("never leaks contractType values that are not in the four-branch enum", async () => {
    // The reader represents Ejar contracts, which by Ejar's own rules
    // are either residential or commercial. Sale and management are
    // never returned even if a future digit prefix were added.
    for (const num of ["EJ-1000", "EJ-1999", "EJ-2000", "EJ-2999"]) {
      const d = await reader.read(num);
      expect(d).not.toBeNull();
      expect(["residential_rent", "commercial_rent"]).toContain(d!.contractType);
    }
  });
});

// The mode switch (mock ↔ real) lives on the typed `config.ejar.readerMode`
// in lib/config.ts and is read once at boot, so a runtime env mutation
// inside a test would not propagate. The mock adapter is exercised
// directly above via `mockEjarReader()`; the real adapter's contract
// (throw with a clear EJAR_READER_MODE message) is enforced by the
// implementation itself — re-asserting it would just shadow the source.
