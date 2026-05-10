import { describe, it, expect } from "vitest";

// ─── Engine Smoke Tests ─────────────────────────────────────────────────────
// Validate that each domain engine exposes the expected public API surface.
// These are contract tests — they verify method existence and shapes,
// not database behaviour (which belongs in integration tests).

describe("FinancialEngine public API", () => {
  it("exposes GL posting + account resolution methods", async () => {
    const { financialEngine } = await import("../../src/lib/engines/financialEngine.js");
    expect(typeof financialEngine.postJournalEntry).toBe("function");
    expect(typeof financialEngine.resolveAccountCode).toBe("function");
    expect(typeof financialEngine.resolveAccountCodes).toBe("function");
    expect(typeof financialEngine.checkPeriodOpen).toBe("function");
    expect(typeof financialEngine.checkBudget).toBe("function");
    expect(typeof financialEngine.recordBudgetUsage).toBe("function");
  });

  it("exposes cross-domain service methods", async () => {
    const { financialEngine } = await import("../../src/lib/engines/financialEngine.js");
    expect(typeof financialEngine.updateJournalStatus).toBe("function");
    expect(typeof financialEngine.recordInvoicePayment).toBe("function");
    expect(typeof financialEngine.createPurchaseOrder).toBe("function");
  });

  it("rejects postJournalEntry without sourceKey", async () => {
    const { financialEngine } = await import("../../src/lib/engines/financialEngine.js");
    await expect(
      financialEngine.postJournalEntry({
        companyId: 1, branchId: 1, createdBy: 1,
        ref: "TEST", description: "no key",
        sourceType: "test", sourceId: 1,
        sourceKey: "",
        lines: [],
      })
    ).rejects.toThrow("sourceKey is required");
  });
});

describe("HREngine public API", () => {
  it("exposes payroll and HR GL methods", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(typeof hrEngine.postPayrollGL).toBe("function");
    expect(typeof hrEngine.postLoanDisbursementGL).toBe("function");
    expect(typeof hrEngine.postExitSettlementGL).toBe("function");
    expect(typeof hrEngine.postLeaveAccrualGL).toBe("function");
    expect(typeof hrEngine.postEOSAccrualGL).toBe("function");
    expect(typeof hrEngine.postPayrollRunGL).toBe("function");
  });

  it("has correct domainId", async () => {
    const { hrEngine } = await import("../../src/lib/engines/hrEngine.js");
    expect(hrEngine.domainId).toBe("hr");
  });
});

describe("FleetEngine public API", () => {
  it("exposes fleet GL methods", async () => {
    const { fleetEngine } = await import("../../src/lib/engines/fleetEngine.js");
    expect(typeof fleetEngine.postFuelExpenseGL).toBe("function");
    expect(typeof fleetEngine.postMaintenanceGL).toBe("function");
    expect(typeof fleetEngine.requestFixedAssetRegistration).toBe("function");
  });

  it("has correct domainId", async () => {
    const { fleetEngine } = await import("../../src/lib/engines/fleetEngine.js");
    expect(fleetEngine.domainId).toBe("fleet");
  });
});

describe("PropertiesEngine public API", () => {
  it("exposes property GL methods", async () => {
    const { propertiesEngine } = await import("../../src/lib/engines/propertiesEngine.js");
    expect(typeof propertiesEngine.postRentRevenueGL).toBe("function");
    expect(typeof propertiesEngine.postMaintenanceExpenseGL).toBe("function");
    expect(typeof propertiesEngine.requestFixedAssetRegistration).toBe("function");
    expect(typeof propertiesEngine.postSecurityDepositGL).toBe("function");
  });

  it("has correct domainId", async () => {
    const { propertiesEngine } = await import("../../src/lib/engines/propertiesEngine.js");
    expect(propertiesEngine.domainId).toBe("property");
  });
});

describe("CRMEngine public API", () => {
  it("exposes CRM GL methods", async () => {
    const { crmEngine } = await import("../../src/lib/engines/crmEngine.js");
    expect(typeof crmEngine.postDealWonGL).toBe("function");
    expect(typeof crmEngine.requestInvoiceCreation).toBe("function");
    expect(typeof crmEngine.requestLegalContractCreation).toBe("function");
  });

  it("has correct domainId", async () => {
    const { crmEngine } = await import("../../src/lib/engines/crmEngine.js");
    expect(crmEngine.domainId).toBe("crm");
  });
});

describe("LegalEngine public API", () => {
  it("exposes legal domain methods", async () => {
    const { legalEngine } = await import("../../src/lib/engines/legalEngine.js");
    expect(typeof legalEngine.postCaseCostGL).toBe("function");
    expect(typeof legalEngine.postSettlementGL).toBe("function");
    expect(typeof legalEngine.postLegalSessionFeeGL).toBe("function");
    expect(typeof legalEngine.createCase).toBe("function");
  });

  it("has correct domainId", async () => {
    const { legalEngine } = await import("../../src/lib/engines/legalEngine.js");
    expect(legalEngine.domainId).toBe("legal");
  });
});

describe("SupportEngine public API", () => {
  it("exposes support domain methods", async () => {
    const { supportEngine } = await import("../../src/lib/engines/supportEngine.js");
    expect(typeof supportEngine.createTicket).toBe("function");
    expect(typeof supportEngine.createPortalTicket).toBe("function");
    expect(typeof supportEngine.markTicketInProgress).toBe("function");
  });

  it("has correct domainId", async () => {
    const { supportEngine } = await import("../../src/lib/engines/supportEngine.js");
    expect(supportEngine.domainId).toBe("support");
  });
});

describe("ProjectsEngine public API", () => {
  it("exposes project domain methods", async () => {
    const { projectsEngine } = await import("../../src/lib/engines/projectsEngine.js");
    expect(typeof projectsEngine.postProjectCostGL).toBe("function");
    expect(typeof projectsEngine.reassignTasks).toBe("function");
  });

  it("has correct domainId", async () => {
    const { projectsEngine } = await import("../../src/lib/engines/projectsEngine.js");
    expect(projectsEngine.domainId).toBe("projects");
  });
});

describe("UmrahEngine public API", () => {
  it("exposes umrah GL methods", async () => {
    const { umrahEngine } = await import("../../src/lib/engines/umrahEngine.js");
    expect(typeof umrahEngine.postAgentInvoiceGL).toBe("function");
    expect(typeof umrahEngine.postTransportExpenseGL).toBe("function");
  });

  it("has correct domainId", async () => {
    const { umrahEngine } = await import("../../src/lib/engines/umrahEngine.js");
    expect(umrahEngine.domainId).toBe("umrah");
  });
});

describe("StoreEngine public API", () => {
  it("exposes store GL methods", async () => {
    const { storeEngine } = await import("../../src/lib/engines/storeEngine.js");
    expect(typeof storeEngine.postOrderGL).toBe("function");
  });

  it("has correct domainId", async () => {
    const { storeEngine } = await import("../../src/lib/engines/storeEngine.js");
    expect(storeEngine.domainId).toBe("store");
  });
});

describe("WarehouseEngine public API", () => {
  it("exposes warehouse GL methods", async () => {
    const { warehouseEngine } = await import("../../src/lib/engines/warehouseEngine.js");
    expect(typeof warehouseEngine.postMovementGL).toBe("function");
  });

  it("has correct domainId", async () => {
    const { warehouseEngine } = await import("../../src/lib/engines/warehouseEngine.js");
    expect(warehouseEngine.domainId).toBe("warehouse");
  });
});
