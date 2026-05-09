import { describe, it, expect } from "vitest";
import { evaluateConditions } from "../../../src/lib/rbac/abacConditions.js";

const baseCtx = {
  scope: { userId: 1, companyId: 100, branchId: 10, employeeId: 5 },
  record: null,
  userDepartmentId: 7,
  ipAddress: null,
  emergency: false,
};

describe("evaluateConditions", () => {
  describe("no conditions", () => {
    it("passes when conditions is null", () => {
      expect(evaluateConditions(null, baseCtx).passed).toBe(true);
    });
    it("passes when conditions is empty object", () => {
      expect(evaluateConditions({}, baseCtx).passed).toBe(true);
    });
    it("passes when conditions is undefined", () => {
      expect(evaluateConditions(undefined, baseCtx).passed).toBe(true);
    });
  });

  describe("statusIn / statusNotIn", () => {
    it("passes when record.status matches statusIn", () => {
      const ctx = { ...baseCtx, record: { status: "draft" } };
      expect(evaluateConditions({ statusIn: ["draft", "pending"] }, ctx).passed).toBe(true);
    });
    it("blocks when record.status not in statusIn", () => {
      const ctx = { ...baseCtx, record: { status: "approved" } };
      const r = evaluateConditions({ statusIn: ["draft"] }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("STATUS_NOT_ALLOWED");
    });
    it("blocks when status is null/missing and statusIn is set", () => {
      const ctx = { ...baseCtx, record: { status: null } };
      expect(evaluateConditions({ statusIn: ["draft"] }, ctx).passed).toBe(false);
    });
    it("blocks when status is in statusNotIn", () => {
      const ctx = { ...baseCtx, record: { status: "closed" } };
      const r = evaluateConditions({ statusNotIn: ["closed", "cancelled"] }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("STATUS_BLOCKED");
    });
  });

  describe("amountMax / amountMin", () => {
    it("passes when amount is within bounds", () => {
      const ctx = { ...baseCtx, record: { amount: 5000 } };
      expect(evaluateConditions({ amountMax: 10000, amountMin: 100 }, ctx).passed).toBe(true);
    });
    it("blocks when amount exceeds amountMax", () => {
      const ctx = { ...baseCtx, record: { amount: 15000 } };
      const r = evaluateConditions({ amountMax: 10000 }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("AMOUNT_EXCEEDS_CONDITION");
    });
    it("blocks when amount below amountMin", () => {
      const ctx = { ...baseCtx, record: { amount: 50 } };
      const r = evaluateConditions({ amountMin: 100 }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("AMOUNT_BELOW_CONDITION");
    });
    it("coerces string amounts", () => {
      const ctx = { ...baseCtx, record: { amount: "5000" as any } };
      expect(evaluateConditions({ amountMax: 10000 }, ctx).passed).toBe(true);
    });
  });

  describe("ownership conditions", () => {
    it("passes ownRecord when createdBy matches userId", () => {
      const ctx = { ...baseCtx, record: { createdBy: 1 } };
      expect(evaluateConditions({ ownRecord: true }, ctx).passed).toBe(true);
    });
    it("blocks ownRecord when createdBy differs", () => {
      const ctx = { ...baseCtx, record: { createdBy: 999 } };
      const r = evaluateConditions({ ownRecord: true }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("NOT_OWN_RECORD");
    });
    it("ownDepartment matches user's department", () => {
      const ctx = { ...baseCtx, record: { departmentId: 7 } };
      expect(evaluateConditions({ ownDepartment: true }, ctx).passed).toBe(true);
    });
    it("ownDepartment blocks for different department", () => {
      const ctx = { ...baseCtx, record: { departmentId: 99 } };
      expect(evaluateConditions({ ownDepartment: true }, ctx).passed).toBe(false);
    });
    it("ownBranch matches user's branch", () => {
      const ctx = { ...baseCtx, record: { branchId: 10 } };
      expect(evaluateConditions({ ownBranch: true }, ctx).passed).toBe(true);
    });
  });

  describe("businessHours", () => {
    it("passes inside the window", () => {
      const ctx = { ...baseCtx, now: new Date(2026, 4, 9, 10, 0, 0) };
      expect(evaluateConditions({ businessHours: { from: 8, to: 18 } }, ctx).passed).toBe(true);
    });
    it("blocks before the window", () => {
      const ctx = { ...baseCtx, now: new Date(2026, 4, 9, 7, 0, 0) };
      const r = evaluateConditions({ businessHours: { from: 8, to: 18 } }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("OUTSIDE_BUSINESS_HOURS");
    });
    it("blocks at exactly the upper bound (exclusive)", () => {
      const ctx = { ...baseCtx, now: new Date(2026, 4, 9, 18, 0, 0) };
      expect(evaluateConditions({ businessHours: { from: 8, to: 18 } }, ctx).passed).toBe(false);
    });
  });

  describe("daysOfWeek", () => {
    it("passes on allowed Saudi work day", () => {
      // 2026-05-10 is a Sunday (day 0)
      const ctx = { ...baseCtx, now: new Date(2026, 4, 10) };
      expect(evaluateConditions({ daysOfWeek: [0, 1, 2, 3, 4] }, ctx).passed).toBe(true);
    });
    it("blocks on Friday when restricted to Sun-Thu", () => {
      // 2026-05-08 is a Friday (day 5)
      const ctx = { ...baseCtx, now: new Date(2026, 4, 8) };
      const r = evaluateConditions({ daysOfWeek: [0, 1, 2, 3, 4] }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("WRONG_DAY_OF_WEEK");
    });
  });

  describe("ipPrefixIn", () => {
    it("passes when ip starts with an allowed prefix", () => {
      const ctx = { ...baseCtx, ipAddress: "192.168.5.123" };
      expect(evaluateConditions({ ipPrefixIn: ["10.0.0.", "192.168."] }, ctx).passed).toBe(true);
    });
    it("blocks when ip is outside all prefixes", () => {
      const ctx = { ...baseCtx, ipAddress: "203.0.113.1" };
      const r = evaluateConditions({ ipPrefixIn: ["10.0.0.", "192.168."] }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("IP_NOT_ALLOWED");
    });
  });

  describe("emergencyDisabled", () => {
    it("blocks during emergency when flag set", () => {
      const ctx = { ...baseCtx, emergency: true };
      const r = evaluateConditions({ emergencyDisabled: true }, ctx);
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("EMERGENCY_LOCK");
    });
    it("passes when no emergency", () => {
      const ctx = { ...baseCtx, emergency: false };
      expect(evaluateConditions({ emergencyDisabled: true }, ctx).passed).toBe(true);
    });
  });

  describe("AND-combination", () => {
    it("requires every condition to pass", () => {
      const ctx = { ...baseCtx, record: { amount: 5000, status: "draft", createdBy: 1 } };
      const r = evaluateConditions(
        { amountMax: 10000, statusIn: ["draft"], ownRecord: true },
        ctx
      );
      expect(r.passed).toBe(true);
    });
    it("fails when any condition fails", () => {
      const ctx = { ...baseCtx, record: { amount: 5000, status: "approved", createdBy: 1 } };
      const r = evaluateConditions(
        { amountMax: 10000, statusIn: ["draft"], ownRecord: true },
        ctx
      );
      expect(r.passed).toBe(false);
      expect(r.failedReason).toBe("STATUS_NOT_ALLOWED");
    });
  });
});
