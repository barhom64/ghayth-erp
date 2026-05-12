import { describe, it, expect } from "vitest";
import {
  computeSnapshot,
  isSaudiNationality,
} from "../../src/lib/saudi-compliance/saudization-snapshot.js";
import { formatAlertMessage } from "../../src/lib/saudi-compliance/iqama-cron.js";

describe("isSaudiNationality — case + arabic tolerance", () => {
  it("recognises Latin variants (case-insensitive)", () => {
    expect(isSaudiNationality("Saudi")).toBe(true);
    expect(isSaudiNationality("saudi")).toBe(true);
    expect(isSaudiNationality("SAUDI")).toBe(true);
    expect(isSaudiNationality("SA")).toBe(true);
    expect(isSaudiNationality("saudi arabian")).toBe(true);
  });

  it("recognises Arabic forms", () => {
    expect(isSaudiNationality("سعودي")).toBe(true);
    expect(isSaudiNationality("سعودية")).toBe(true);
  });

  it("rejects other nationalities", () => {
    expect(isSaudiNationality("Egyptian")).toBe(false);
    expect(isSaudiNationality("مصري")).toBe(false);
    expect(isSaudiNationality("Pakistani")).toBe(false);
    expect(isSaudiNationality("Indian")).toBe(false);
  });

  it("trims whitespace before matching", () => {
    expect(isSaudiNationality("  Saudi  ")).toBe(true);
    expect(isSaudiNationality("\tSA\n")).toBe(true);
  });

  it("handles null / undefined / empty", () => {
    expect(isSaudiNationality(null)).toBe(false);
    expect(isSaudiNationality(undefined)).toBe(false);
    expect(isSaudiNationality("")).toBe(false);
    expect(isSaudiNationality("   ")).toBe(false);
  });
});

describe("computeSnapshot — Nitaqat headcount aggregation", () => {
  it("counts Saudis vs non-Saudis correctly across mixed strings", () => {
    const snap = computeSnapshot(1, "2026-05", [
      { nationality: "Saudi" },
      { nationality: "saudi" },
      { nationality: "سعودي" },
      { nationality: "Egyptian" },
      { nationality: "Pakistani" },
      { nationality: null },
    ]);
    expect(snap.totalEmployees).toBe(6);
    expect(snap.saudiEmployees).toBe(3);
    expect(snap.nonSaudiEmployees).toBe(3);
    expect(snap.saudizationPercent).toBe(50);
    expect(snap.category).toBe("platinum");
  });

  it("returns zero-staff snapshot as exempt + 0%", () => {
    const snap = computeSnapshot(1, "2026-05", []);
    expect(snap.totalEmployees).toBe(0);
    expect(snap.saudiEmployees).toBe(0);
    expect(snap.nonSaudiEmployees).toBe(0);
    expect(snap.saudizationPercent).toBe(0);
    expect(snap.exempt).toBe(true);
    expect(snap.category).toBe("green");
  });

  it("flags small-company exempt correctly (under 5 staff)", () => {
    const snap = computeSnapshot(1, "2026-05", [
      { nationality: "Egyptian" },
      { nationality: "Pakistani" },
    ]);
    expect(snap.totalEmployees).toBe(2);
    expect(snap.exempt).toBe(true);
  });

  it("classifies a 100% non-Saudi shop with 10 staff as red", () => {
    const snap = computeSnapshot(1, "2026-05", [
      { nationality: "Egyptian" }, { nationality: "Egyptian" },
      { nationality: "Egyptian" }, { nationality: "Egyptian" },
      { nationality: "Egyptian" }, { nationality: "Pakistani" },
      { nationality: "Pakistani" }, { nationality: "Pakistani" },
      { nationality: "Indian" }, { nationality: "Indian" },
    ]);
    expect(snap.saudizationPercent).toBe(0);
    expect(snap.category).toBe("red");
    expect(snap.exempt).toBe(false);
  });
});

describe("formatAlertMessage — iqama log payload shape", () => {
  it("includes employeeId, expiry, and daysLeft in a stable format", () => {
    const msg = formatAlertMessage({
      employeeId: 42,
      iqamaExpiry: "2026-05-23",
      daysLeft: 14,
      isThreshold: true,
    });
    expect(msg).toContain("iqama=42");
    expect(msg).toContain("expires=2026-05-23");
    expect(msg).toContain("(14 days)");
  });

  it("never throws on edge values (1 day / 90 days)", () => {
    expect(() =>
      formatAlertMessage({ employeeId: 1, iqamaExpiry: "2026-05-10", daysLeft: 1, isThreshold: true }),
    ).not.toThrow();
    expect(() =>
      formatAlertMessage({ employeeId: 2, iqamaExpiry: "2026-08-07", daysLeft: 90, isThreshold: true }),
    ).not.toThrow();
  });
});
