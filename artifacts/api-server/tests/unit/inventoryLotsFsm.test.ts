import { describe, it, expect } from "vitest";
import {
  assertLotTransition,
  nextStatusAfterQc,
  shouldExpire,
  IllegalLotTransitionError,
} from "../../src/lib/inventory/lots-fsm.js";
import type { LotStatus } from "../../src/lib/inventory/types.js";

describe("Lot FSM — allowed transitions", () => {
  it.each([
    ["active", "quarantine"],
    ["active", "recalled"],
    ["active", "expired"],
    ["active", "disposed"],
    ["quarantine", "active"],
    ["quarantine", "recalled"],
    ["quarantine", "disposed"],
    ["recalled", "disposed"],
    ["expired", "disposed"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(() => assertLotTransition(from as LotStatus, to as LotStatus)).not.toThrow();
  });

  it("treats no-op transitions (status === status) as legal", () => {
    expect(() => assertLotTransition("active", "active")).not.toThrow();
    expect(() => assertLotTransition("disposed", "disposed")).not.toThrow();
  });

  it.each([
    ["disposed", "active"],
    ["disposed", "quarantine"],
    ["expired", "active"],
    ["recalled", "active"],
    ["active", "rejected"], // rejected isn't a status value (it's QC outcome)
  ] as const)("rejects %s → %s", (from, to) => {
    expect(() => assertLotTransition(from as LotStatus, to as LotStatus)).toThrow(IllegalLotTransitionError);
  });
});

describe("Lot FSM — QC outcomes", () => {
  it("approve on quarantine → active + qc=approved", () => {
    expect(nextStatusAfterQc("quarantine", "approve")).toEqual({
      status: "active",
      qualityControlStatus: "approved",
    });
  });

  it("approve on already-active is a no-op shape", () => {
    expect(nextStatusAfterQc("active", "approve")).toEqual({
      status: "active",
      qualityControlStatus: "approved",
    });
  });

  it("reject on quarantine → disposed + qc=rejected", () => {
    expect(nextStatusAfterQc("quarantine", "reject")).toEqual({
      status: "disposed",
      qualityControlStatus: "rejected",
    });
  });

  it("rejects QC outcomes on terminal lots (recalled / expired / disposed)", () => {
    expect(() => nextStatusAfterQc("disposed", "approve")).toThrow();
    expect(() => nextStatusAfterQc("recalled", "approve")).toThrow();
    expect(() => nextStatusAfterQc("expired", "reject")).toThrow();
  });
});

describe("Lot FSM — shouldExpire", () => {
  it("flags an active lot whose expiry has passed", () => {
    expect(
      shouldExpire({ status: "active", expiryDate: "2026-04-01", asOfDate: "2026-05-09" }),
    ).toBe(true);
  });

  it("flags a quarantined lot whose expiry has passed (food-safety case)", () => {
    expect(
      shouldExpire({ status: "quarantine", expiryDate: "2026-04-01", asOfDate: "2026-05-09" }),
    ).toBe(true);
  });

  it("does not flag a lot whose expiry is still in the future", () => {
    expect(
      shouldExpire({ status: "active", expiryDate: "2027-01-01", asOfDate: "2026-05-09" }),
    ).toBe(false);
  });

  it("flags exactly on the expiry date (inclusive)", () => {
    expect(
      shouldExpire({ status: "active", expiryDate: "2026-05-09", asOfDate: "2026-05-09" }),
    ).toBe(true);
  });

  it.each([
    ["recalled" as LotStatus],
    ["expired" as LotStatus],
    ["disposed" as LotStatus],
  ])("does not re-expire a %s lot", (status) => {
    expect(
      shouldExpire({ status, expiryDate: "2020-01-01", asOfDate: "2026-05-09" }),
    ).toBe(false);
  });

  it("ignores lots with no expiry date (non-perishable inventory)", () => {
    expect(
      shouldExpire({ status: "active", expiryDate: null, asOfDate: "2026-05-09" }),
    ).toBe(false);
    expect(
      shouldExpire({ status: "active", expiryDate: undefined, asOfDate: "2026-05-09" }),
    ).toBe(false);
  });
});

describe("IllegalLotTransitionError", () => {
  it("carries from and to in the message for the audit log", () => {
    try {
      assertLotTransition("disposed", "active");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalLotTransitionError);
      expect((err as Error).message).toContain("disposed");
      expect((err as Error).message).toContain("active");
      expect((err as Error).name).toBe("IllegalLotTransitionError");
    }
  });
});
