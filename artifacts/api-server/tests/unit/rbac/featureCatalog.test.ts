import { describe, it, expect } from "vitest";
import {
  FEATURE_CATALOG,
  FEATURE_INDEX,
  SELF_SERVICE_FEATURES,
  getFeature,
  isValidActionFor,
  isValidScopeFor,
} from "../../../src/lib/rbac/featureCatalog.js";

describe("featureCatalog", () => {
  it("has unique feature keys", () => {
    const keys = FEATURE_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every parent_key references a known feature or is undefined", () => {
    const known = new Set(FEATURE_CATALOG.map((f) => f.key));
    for (const f of FEATURE_CATALOG) {
      if (f.parentKey) {
        expect(known.has(f.parentKey)).toBe(true);
      }
    }
  });

  it("FEATURE_INDEX maps every key", () => {
    expect(FEATURE_INDEX.size).toBe(FEATURE_CATALOG.length);
    for (const f of FEATURE_CATALOG) {
      expect(FEATURE_INDEX.get(f.key)).toBe(f);
    }
  });

  it("getFeature returns the feature for a known key", () => {
    expect(getFeature("hr.payroll.runs")?.labelAr).toBeTruthy();
  });

  it("getFeature returns undefined for unknown key", () => {
    expect(getFeature("nonsense.key")).toBeUndefined();
  });

  it("SELF_SERVICE_FEATURES contains all selfService:true", () => {
    const selfServiceFromCatalog = FEATURE_CATALOG.filter((f) => f.selfService).map((f) => f.key);
    expect([...SELF_SERVICE_FEATURES].sort()).toEqual(selfServiceFromCatalog.sort());
  });

  it("self-service features cover the employee floor", () => {
    // The employee-first guarantee means these must be selfService.
    const must = [
      "hr.attendance.checkin",
      "hr.leaves.my",
      "hr.payroll.my_payslip",
      "tasks.my",
      "requests.my",
      "documents.my",
      "calendar.my",
      "notifications",
    ];
    for (const k of must) {
      const f = FEATURE_INDEX.get(k);
      expect(f?.selfService, `${k} should be selfService`).toBe(true);
    }
  });

  it("isValidActionFor validates against the catalog", () => {
    expect(isValidActionFor("hr.employees", "view")).toBe(true);
    expect(isValidActionFor("hr.employees", "list")).toBe(true);
    expect(isValidActionFor("hr.attendance.checkin", "delete")).toBe(false);
    expect(isValidActionFor("nonsense", "view")).toBe(false);
  });

  it("isValidScopeFor validates against the catalog", () => {
    expect(isValidScopeFor("hr.attendance.checkin", "self")).toBe(true);
    expect(isValidScopeFor("hr.attendance.checkin", "all")).toBe(false);
    expect(isValidScopeFor("admin", "company")).toBe(true);
    expect(isValidScopeFor("admin", "all")).toBe(true);
  });

  it("approvable features carry approvableActions", () => {
    const finance = FEATURE_INDEX.get("finance.invoices");
    expect(finance?.approvableActions).toContain("approve");
  });

  it("sensitive feature declarations exist for known PII fields", () => {
    const employees = FEATURE_INDEX.get("hr.employees");
    expect(employees?.sensitiveFields).toContain("salary");
    expect(employees?.sensitiveFields).toContain("nationalId");
    expect(employees?.sensitiveFields).toContain("iban");
  });
});
