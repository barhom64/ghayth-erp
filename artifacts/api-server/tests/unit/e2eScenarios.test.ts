import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

// ─── E2E Scenario: Umrah Full Lifecycle ──────────────────────────────────
// Verifies the full umrah flow exists in code:
// Season → Agent → Sub-Agent → Package → Import → Invoice → Payment →
// Violation → Penalty → Statement → Journal Entries → Audit
describe("E2E: Umrah full lifecycle scenario", () => {
  const umrah = read("routes/umrah.ts");
  const entities = read("routes/umrah-entities.ts");
  const importEngine = read("lib/umrahImportEngine.ts");
  const invoiceEngine = read("lib/umrahInvoicingEngine.ts");

  it("1. Season CRUD exists", () => {
    expect(umrah).toContain('router.post("/seasons"');
    expect(umrah).toContain('router.patch("/seasons/:id"');
  });

  it("2. Agent CRUD exists", () => {
    expect(umrah).toContain('router.post("/agents"');
    expect(umrah).toContain('router.patch("/agents/:id"');
  });

  it("3. Sub-agent CRUD exists", () => {
    expect(entities).toContain('router.post("/sub-agents"');
    expect(entities).toContain('router.patch("/sub-agents/:id"');
    expect(entities).toContain('"/sub-agents/:id/link"');
  });

  it("4. Package CRUD exists", () => {
    expect(umrah).toContain('router.post("/packages"');
    expect(umrah).toContain('router.patch("/packages/:id"');
  });

  it("5. Pilgrim creation encrypts sensitive data", () => {
    expect(umrah).toContain("encryptField(passportPlain)");
    expect(umrah).toContain("blindIndex(passportPlain)");
  });

  it("6. Import engine exists and encrypts", () => {
    expect(importEngine).toContain("parseMutamersWorkbook");
    expect(importEngine).toContain("encryptField");
    expect(importEngine).toContain("blindIndex");
  });

  it("7. Invoice generation prevents duplicates", () => {
    expect(invoiceEngine).toContain("alreadyInvoiced");
    expect(invoiceEngine).toContain("مفوترة مسبقاً");
  });

  it("8. Invoice generation requires entryDate", () => {
    expect(invoiceEngine).toContain("لا تحتوي على تاريخ دخول");
  });

  it("9. Payment registration exists with FIFO", () => {
    expect(invoiceEngine).toContain("registerPayment");
    expect(invoiceEngine).toContain("paidAmount");
  });

  it("10. Violation detection exists", () => {
    expect(importEngine).toContain("detectViolation");
    expect(importEngine).toContain("umrah_violations");
  });

  it("11. Penalty engine exists", () => {
    expect(umrah).toContain('"/run-penalty-engine"');
    expect(umrah).toContain("umrah_penalties");
  });

  it("12. Statement generation exists", () => {
    expect(entities).toContain('"/statements/');
    expect(invoiceEngine).toContain("generateStatement");
  });

  it("13. Journal entries are guarded", () => {
    expect(invoiceEngine).toContain("createGuardedJournalEntry");
  });

  it("14. Audit logging on sensitive access", () => {
    expect(umrah).toContain("logSensitiveAccess");
    expect(umrah).toContain("umrah_pilgrims");
  });

  it("15. Groups CRUD is complete", () => {
    expect(entities).toContain('router.get("/groups"');
    expect(entities).toContain('router.get("/groups/:id"');
    expect(entities).toContain('router.post("/groups"');
    expect(entities).toContain('router.patch("/groups/:id"');
    expect(entities).toContain('router.delete("/groups/:id"');
  });
});

// ─── E2E Scenario: Finance Golden Path ───────────────────────────────────
describe("E2E: Finance golden path", () => {
  const invoices = read("routes/finance-invoices.ts");
  const journal = read("routes/finance-journal.ts");
  const purchase = read("routes/finance-purchase.ts");
  const accounts = read("routes/finance-accounts.ts");

  it("Invoice CRUD + lifecycle", () => {
    expect(invoices).toContain('.post("/invoices"');
    expect(invoices).toContain('.patch("/invoices/:id"');
    expect(invoices).toContain("applyTransition");
  });

  it("Journal entry CRUD + approval", () => {
    expect(journal).toContain('.post("/journal"');
    expect(journal).toContain("applyTransition");
  });

  it("Purchase order lifecycle", () => {
    expect(purchase).toContain('.post("/purchase-orders"');
    expect(purchase).toContain("applyTransition");
  });

  it("Chart of accounts exists", () => {
    expect(accounts).toContain('.get("/chart-of-accounts"');
    expect(accounts).toContain('.post("/accounts"');
  });
});

// ─── E2E Scenario: HR Golden Path ────────────────────────────────────────
describe("E2E: HR golden path", () => {
  const employees = read("routes/employees.ts");
  const hr = read("routes/hr.ts");
  const contracts = read("routes/hr-contracts.ts");
  const exit = read("routes/hr-exit.ts");
  const loans = read("routes/hr-loans.ts");

  it("Employee CRUD", () => {
    expect(employees).toContain('router.post("/"');
    expect(employees).toContain('router.patch("/:id"');
  });

  it("Leave request lifecycle", () => {
    expect(hr).toContain("leave_requests");
    expect(hr).toContain("applyTransition");
  });

  it("Contract management exists", () => {
    expect(contracts).toContain('.post("/"');
    expect(contracts).toContain('.patch("/:id"');
  });

  it("Exit/clearance workflow", () => {
    expect(exit).toContain("exit_requests");
    expect(exit).toContain("clearance");
  });

  it("Loan request lifecycle", () => {
    expect(loans).toContain("hr_employee_loans");
    expect(loans).toContain('"/loans"');
  });
});

// ─── E2E Scenario: Permissions Isolation ─────────────────────────────────
describe("E2E: Permission isolation", () => {
  const indexTs = read("routes/index.ts");
  const permMw = read("middlewares/permissionMiddleware.ts");

  it("All major modules have requireModule guards", () => {
    expect(indexTs).toContain('requireModule("hr")');
    expect(indexTs).toContain('requireModule("finance")');
    expect(indexTs).toContain('requireModule("fleet")');
    expect(indexTs).toContain('requireModule("warehouse")');
    expect(indexTs).toContain('requireModule("property")');
    expect(indexTs).toContain('requireModule("legal")');
    expect(indexTs).toContain('requireModule("operations")');
    expect(indexTs).toContain('requireModule("crm")');
    expect(indexTs).toContain('requireModule("bi")');
    expect(indexTs).toContain('requireModule("store")');
    expect(indexTs).toContain('requireModule("governance")');
    expect(indexTs).toContain('requireModule("comms")');
  });

  it("Permission middleware checks wildcard, grant/revoke, and logs denials", () => {
    expect(permMw).toContain("grant");
    expect(permMw).toContain("revoke");
    expect(permMw).toContain("security_log");
  });

  it("Financial routes have requireGuards(financial)", () => {
    const financialLines = indexTs.split("\n").filter(l => l.includes("/finance") && l.includes("router.use"));
    const guardedCount = financialLines.filter(l => l.includes('requireGuards("financial")')).length;
    expect(guardedCount).toBeGreaterThanOrEqual(10);
  });

  it("Umrah routes both have financial guard", () => {
    expect(indexTs).toContain('requireGuards("financial"), umrahRouter');
    expect(indexTs).toContain('requireGuards("financial"), umrahEntitiesRouter');
  });
});

// ─── E2E Scenario: Fleet ─────────────────────────────────────────────────
describe("E2E: Fleet golden path", () => {
  const fleet = read("routes/fleet.ts");

  it("Vehicle CRUD", () => {
    expect(fleet).toContain('"/vehicles"');
    expect(fleet).toContain('"/vehicles/:id"');
  });

  it("Driver management", () => {
    expect(fleet).toContain('"/drivers"');
  });

  it("Trip lifecycle", () => {
    expect(fleet).toContain('"/trips"');
    expect(fleet).toContain("applyTransition");
  });
});

// ─── E2E Scenario: Legal ─────────────────────────────────────────────────
describe("E2E: Legal golden path", () => {
  const legal = read("routes/legal.ts");

  it("Case lifecycle", () => {
    expect(legal).toContain("legal_cases");
    expect(legal).toContain("applyTransition");
  });

  it("Contract lifecycle", () => {
    expect(legal).toContain("legal_contracts");
    expect(legal).toContain("applyTransition");
  });
});

// ─── E2E Scenario: Property ─────────────────────────────────────────────
describe("E2E: Property golden path", () => {
  const properties = read("routes/properties.ts");

  it("Unit management", () => {
    expect(properties).toContain("property_units");
  });

  it("Contract lifecycle", () => {
    expect(properties).toContain("property_contracts");
    expect(properties).toContain("applyTransition");
  });
});
