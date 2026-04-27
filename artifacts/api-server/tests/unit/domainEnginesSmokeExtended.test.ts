import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/engines");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const PROPERTIES = read("propertiesEngine.ts");
const FLEET = read("fleetEngine.ts");
const FINANCIAL = read("financialEngine.ts");
const LEGAL = read("legalEngine.ts");
const UMRAH = read("umrahEngine.ts");

// ══════════════════════════════════════════════════════════════════════════
// PROPERTIES ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("propertiesEngine — class and export", () => {
  it("exports propertiesEngine instance", () => {
    expect(PROPERTIES).toContain("export const propertiesEngine");
  });

  it("implements DomainEngine", () => {
    expect(PROPERTIES).toContain("implements DomainEngine");
  });
});

describe("propertiesEngine — GL posting methods", () => {
  for (const method of [
    "postRentRevenueGL",
    "postMaintenanceExpenseGL",
    "postSecurityDepositGL",
    "postEarlyTerminationGL",
    "postBuildingAssetGL",
    "postInstallmentPaymentGL",
  ]) {
    it(`has ${method}`, () => {
      expect(PROPERTIES).toContain(method);
    });
  }
});

describe("propertiesEngine — cross-domain requests", () => {
  it("requestInvoiceCreation exists", () => {
    expect(PROPERTIES).toContain("requestInvoiceCreation");
  });

  it("requestFixedAssetRegistration exists", () => {
    expect(PROPERTIES).toContain("requestFixedAssetRegistration");
  });

  it("requestLegalCaseCreation exists", () => {
    expect(PROPERTIES).toContain("requestLegalCaseCreation");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FLEET ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("fleetEngine — class and export", () => {
  it("exports fleetEngine instance", () => {
    expect(FLEET).toContain("export const fleetEngine");
  });

  it("implements DomainEngine", () => {
    expect(FLEET).toContain("implements DomainEngine");
  });
});

describe("fleetEngine — GL posting methods", () => {
  for (const method of [
    "postFuelExpenseGL",
    "postMaintenanceGL",
    "postInsuranceGL",
    "postTrafficViolationGL",
    "postViolationPaymentGL",
    "postVehicleAssetGL",
    "postTripCompletionGL",
    "postTripGL",
  ]) {
    it(`has ${method}`, () => {
      expect(FLEET).toContain(method);
    });
  }
});

describe("fleetEngine — cross-domain requests", () => {
  it("requestPayrollDeduction exists", () => {
    expect(FLEET).toContain("requestPayrollDeduction");
  });

  it("requestFixedAssetRegistration exists", () => {
    expect(FLEET).toContain("requestFixedAssetRegistration");
  });

  it("requestWarehouseDeduction exists", () => {
    expect(FLEET).toContain("requestWarehouseDeduction");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// FINANCIAL ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("financialEngine — class and export", () => {
  it("exports financialEngine instance", () => {
    expect(FINANCIAL).toContain("export const financialEngine");
  });

  it("implements DomainEngine", () => {
    expect(FINANCIAL).toContain("implements DomainEngine");
  });
});

describe("financialEngine — exports and interfaces", () => {
  it("exports GLPostingResult interface", () => {
    expect(FINANCIAL).toContain("export interface GLPostingResult");
  });

  it("exports AccountMapping interface", () => {
    expect(FINANCIAL).toContain("export interface AccountMapping");
  });

  it("exports InvoiceCreationRequest interface", () => {
    expect(FINANCIAL).toContain("export interface InvoiceCreationRequest");
  });
});

describe("financialEngine — core methods", () => {
  for (const method of [
    "postJournalEntry",
    "resolveAccountCode",
    "resolveAccountCodes",
    "checkPeriodOpen",
    "checkBudget",
    "recordBudgetUsage",
    "updateJournalStatus",
    "recordInvoicePayment",
    "createPurchaseOrder",
  ]) {
    it(`has ${method}`, () => {
      expect(FINANCIAL).toContain(method);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LEGAL ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("legalEngine — class and export", () => {
  it("exports legalEngine instance", () => {
    expect(LEGAL).toContain("export const legalEngine");
  });

  it("implements DomainEngine", () => {
    expect(LEGAL).toContain("implements DomainEngine");
  });
});

describe("legalEngine — GL posting methods", () => {
  for (const method of [
    "postCaseCostGL",
    "postSettlementGL",
    "postLegalSessionFeeGL",
  ]) {
    it(`has ${method}`, () => {
      expect(LEGAL).toContain(method);
    });
  }
});

describe("legalEngine — cross-domain requests", () => {
  it("requestInvoiceCreation exists", () => {
    expect(LEGAL).toContain("requestInvoiceCreation");
  });

  it("createCase method exists", () => {
    expect(LEGAL).toContain("createCase");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// UMRAH ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("umrahEngine — class and export", () => {
  it("exports umrahEngine instance", () => {
    expect(UMRAH).toContain("export const umrahEngine");
  });
});
