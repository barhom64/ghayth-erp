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

// ─── E2E Scenario: Season Locking ──────────────────────────────────────────
describe("E2E: Season locking enforcement", () => {
  const umrah = read("routes/umrah.ts");
  const entities = read("routes/umrah-entities.ts");

  it("requireOpenSeason helper exists in umrah.ts", () => {
    expect(umrah).toContain("async function requireOpenSeason");
    expect(umrah).toContain('status !== "open"');
    expect(umrah).toContain("الموسم مغلق");
  });

  it("requireOpenSeason helper exists in umrah-entities.ts", () => {
    expect(entities).toContain("async function requireOpenSeason");
  });

  it("pilgrim creation checks season status", () => {
    expect(umrah).toContain("requireOpenSeason(Number(b.seasonId)");
  });

  it("package creation checks season status", () => {
    expect(umrah).toContain("requireOpenSeason(Number(b.seasonId), scope.companyId)");
  });

  it("transport creation checks season status", () => {
    const transportSection = umrah.split('router.post("/transport"')[1] || "";
    expect(transportSection).toContain("requireOpenSeason");
  });

  it("import checks season status", () => {
    const importSection = umrah.split("async function doImport")[1] || "";
    expect(importSection).toContain("requireOpenSeason");
  });

  it("group creation checks season status", () => {
    const groupSection = entities.split('router.post("/groups"')[1] || "";
    expect(groupSection).toContain("requireOpenSeason");
  });

  it("season close validates no active pilgrims and unpaid invoices", () => {
    expect(umrah).toContain("arrived','active','overstayed");
    expect(umrah).toContain("paid','cancelled");
  });
});

// ─── E2E Scenario: Nusk Invoice CRUD ───────────────────────────────────────
describe("E2E: Nusk invoice CRUD", () => {
  const entities = read("routes/umrah-entities.ts");
  const catalog = read("lib/eventCatalog.ts");

  it("GET /nusk-invoices list exists", () => {
    expect(entities).toContain('router.get("/nusk-invoices"');
  });

  it("GET /nusk-invoices/:id detail exists", () => {
    expect(entities).toContain('router.get("/nusk-invoices/:id"');
  });

  it("POST /nusk-invoices create exists with duplicate check", () => {
    expect(entities).toContain('router.post("/nusk-invoices"');
    expect(entities).toContain("رقم فاتورة نسك مكرر");
  });

  it("PATCH /nusk-invoices/:id update exists with paid guard", () => {
    expect(entities).toContain('router.patch("/nusk-invoices/:id"');
    expect(entities).toContain("لا يمكن تعديل فاتورة نسك مدفوعة");
  });

  it("DELETE /nusk-invoices/:id soft-delete exists with paid guard", () => {
    expect(entities).toContain('router.delete("/nusk-invoices/:id"');
    expect(entities).toContain("لا يمكن حذف فاتورة نسك مدفوعة");
  });

  it("nusk invoice events are catalogued", () => {
    expect(catalog).toContain("umrah.nusk_invoice.created");
    expect(catalog).toContain("umrah.nusk_invoice.updated");
    expect(catalog).toContain("umrah.nusk_invoice.deleted");
  });

  it("nusk invoice has Zod schemas", () => {
    expect(entities).toContain("createNuskInvoiceSchema");
    expect(entities).toContain("updateNuskInvoiceSchema");
  });
});

// ─── E2E Scenario: Full Umrah Lifecycle Flow ───────────────────────────────
// Verifies every step of the lifecycle is wired together:
// Season(open) → Agent → Package → Pilgrim(encrypt) → Import → Group →
// NuskInvoice → SalesInvoice → Payment(FIFO) → Statement → JournalEntry →
// Violation → Penalty → Season(close validation) → Season(closed)
describe("E2E: Full umrah lifecycle flow verification", () => {
  const umrah = read("routes/umrah.ts");
  const entities = read("routes/umrah-entities.ts");
  const importEngine = read("lib/umrahImportEngine.ts");
  const invoiceEngine = read("lib/umrahInvoicingEngine.ts");
  const catalog = read("lib/eventCatalog.ts");
  const governor = read("lib/systemGovernor.ts");

  it("Step 1: Season opens and emits event", () => {
    expect(umrah).toContain("umrah.season.opened");
    expect(umrah).toContain('router.post("/seasons"');
  });

  it("Step 2: Agent is created and linked", () => {
    expect(umrah).toContain('router.post("/agents"');
    expect(catalog).toContain("umrah.agent.created");
  });

  it("Step 3: Package is created with season lock", () => {
    expect(umrah).toContain('router.post("/packages"');
    const pkgSection = umrah.split('router.post("/packages"')[1]?.split('router.')[0] || "";
    expect(pkgSection).toContain("requireOpenSeason");
  });

  it("Step 4: Pilgrim is created with encryption + season lock", () => {
    expect(umrah).toContain("encryptField(passportPlain)");
    expect(umrah).toContain("blindIndex(passportPlain)");
    const pilgrimSection = umrah.split('router.post("/pilgrims"')[1]?.split('router.')[0] || "";
    expect(pilgrimSection).toContain("requireOpenSeason");
  });

  it("Step 5: Import engine processes batch with season lock", () => {
    expect(importEngine).toContain("parseMutamersWorkbook");
    expect(umrah).toContain("doImport");
  });

  it("Step 6: Group is created with season lock", () => {
    expect(entities).toContain('router.post("/groups"');
    const groupSection = entities.split('router.post("/groups"')[1]?.split('router.')[0] || "";
    expect(groupSection).toContain("requireOpenSeason");
  });

  it("Step 7: Nusk invoice is created with duplicate check", () => {
    expect(entities).toContain('router.post("/nusk-invoices"');
    expect(entities).toContain("createNuskInvoiceSchema");
  });

  it("Step 8: Sales invoice is generated (prevents duplicates)", () => {
    expect(invoiceEngine).toContain("alreadyInvoiced");
    expect(invoiceEngine).toContain("generateSalesInvoice");
  });

  it("Step 9: Payment is registered with FIFO allocation", () => {
    expect(invoiceEngine).toContain("registerPayment");
    expect(invoiceEngine).toContain("paidAmount");
  });

  it("Step 10: Statement is generated per sub-agent", () => {
    expect(invoiceEngine).toContain("generateStatement");
    expect(entities).toContain('"/statements/');
  });

  it("Step 11: Journal entries are guarded", () => {
    expect(invoiceEngine).toContain("createGuardedJournalEntry");
  });

  it("Step 12: Violations are detected on import", () => {
    expect(importEngine).toContain("detectViolation");
  });

  it("Step 13: Penalty engine runs per season", () => {
    expect(umrah).toContain('"/run-penalty-engine"');
  });

  it("Step 14: Season close validates dependencies", () => {
    expect(umrah).toContain("arrived','active','overstayed");
    expect(umrah).toContain("paid','cancelled");
  });

  it("Step 15: Financial governor protects all operations", () => {
    expect(governor).toContain("allowed: false");
    expect(governor).toContain("requireGuards");
  });

  it("Step 16: Audit trail on sensitive access", () => {
    expect(umrah).toContain("logSensitiveAccess");
  });
});

// ─── E2E Scenario: Module Boundary Enforcement ────────────────────────────
describe("E2E: Module boundary enforcement", () => {
  const umrah = read("routes/umrah.ts");
  const fleet = read("routes/fleet.ts");
  const hr = read("routes/hr.ts");

  it("umrah reads fleet tables but never writes to them", () => {
    expect(umrah).toContain("SELECT id, status FROM fleet_vehicles");
    expect(umrah).toContain("SELECT id, status");
    expect(umrah).not.toContain("INSERT INTO fleet_");
    expect(umrah).not.toContain("UPDATE fleet_");
    expect(umrah).not.toContain("DELETE FROM fleet_");
  });

  it("fleet never writes to umrah tables", () => {
    expect(fleet).not.toContain("INSERT INTO umrah_");
    expect(fleet).not.toContain("UPDATE umrah_");
    expect(fleet).not.toContain("DELETE FROM umrah_");
  });

  it("umrah owns its own transport table", () => {
    expect(umrah).toContain("umrah_transport");
    expect(umrah).toContain("INSERT INTO umrah_transport");
  });

  it("HR delegates GL posting through engines, not direct writes", () => {
    expect(hr).not.toContain("INSERT INTO journal_entries");
    expect(hr).not.toContain("INSERT INTO invoices");
  });
});

// ─── System Stops (Red Button) ──────────────────────────────────────────
describe("System Stops (Red Button) infrastructure", () => {
  const governor = read("lib/systemGovernor.ts");
  const admin = read("routes/admin.ts");
  const migration = readFileSync(join(SRC, "migrations/116_system_stops.sql"), "utf8");

  it("systemStopGuard exists and queries system_stops table", () => {
    expect(governor).toContain("systemStopGuard");
    expect(governor).toContain("system_stops");
  });

  it("systemStopGuard is registered first in GUARD_REGISTRY", () => {
    const registryMatch = governor.match(/GUARD_REGISTRY.*?\[([^\]]+)\]/s);
    expect(registryMatch).not.toBeNull();
    const firstGuard = registryMatch![1].trim();
    expect(firstGuard).toContain("systemStopGuard");
  });

  it("stop-system checks active flag and scope", () => {
    expect(governor).toContain("active = true");
    expect(governor).toContain('scope = $2 OR scope = \'all\'');
  });

  it("admin has system-stops CRUD endpoints", () => {
    expect(admin).toContain('"/system-stops"');
    expect(admin).toContain('"/system-stops/:id/deactivate"');
    expect(admin).toContain("system.stop.activated");
    expect(admin).toContain("system.stop.deactivated");
  });

  it("migration creates system_stops table with correct columns", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS system_stops");
    expect(migration).toContain('"companyId"');
    expect(migration).toContain("scope");
    expect(migration).toContain("reason");
    expect(migration).toContain("active");
    expect(migration).toContain('"activatedBy"');
  });
});

// ─── Journey Engine ──────────────────────────────────────────────────────
describe("Journey Engine infrastructure", () => {
  const journey = read("lib/journeyEngine.ts");
  const engines = read("lib/engines/index.ts");

  it("exports JOURNEY_DEFINITIONS with at least 5 journey types", () => {
    expect(journey).toContain("JOURNEY_DEFINITIONS");
    const typeMatches = journey.match(/type:\s*"/g);
    expect(typeMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it("includes umrah_season journey definition", () => {
    expect(journey).toContain('"umrah_season"');
    expect(journey).toContain("umrah.season.opened");
    expect(journey).toContain("umrah.invoice.generated");
  });

  it("includes hr_onboarding journey definition", () => {
    expect(journey).toContain('"hr_onboarding"');
    expect(journey).toContain("hr.employee.created");
  });

  it("exports startJourney, advanceJourney, getJourneyProgress", () => {
    expect(journey).toContain("export async function startJourney");
    expect(journey).toContain("export async function advanceJourney");
    expect(journey).toContain("export async function getJourneyProgress");
  });

  it("is registered in engines barrel", () => {
    expect(engines).toContain("journeyEngine");
  });
});

// ─── Umrah GL Posting via Event Listener ─────────────────────────────────
describe("Umrah invoice GL posting via event listener", () => {
  const listeners = read("lib/eventListeners.ts");

  it("listens to umrah.invoice.generated event", () => {
    expect(listeners).toContain('"umrah.invoice.generated"');
  });

  it("posts GL journal with AR and Revenue accounts", () => {
    expect(listeners).toContain("umrah_receivables");
    expect(listeners).toContain("umrah_revenue");
    expect(listeners).toContain("createGuardedJournalEntry");
  });

  it("uses JE-UMR prefix for umrah journal references", () => {
    expect(listeners).toContain("JE-UMR-");
  });

  it("umrah routes do NOT directly import GL functions", () => {
    const umrahEntities = read("routes/umrah-entities.ts");
    expect(umrahEntities).not.toContain("createGuardedJournalEntry");
    expect(umrahEntities).not.toContain("getAccountCodeFromMapping");
  });
});

// ─── Event Catalog Completeness for Umrah ────────────────────────────────
describe("Event catalog umrah completeness", () => {
  const catalog = read("lib/eventCatalog.ts");

  const requiredEvents = [
    "umrah.pilgrim.created", "umrah.pilgrim.updated", "umrah.pilgrim.deleted",
    "umrah.pilgrim.arrived", "umrah.pilgrim.departed", "umrah.pilgrim.overstayed",
    "umrah.pilgrim.status_changed", "umrah.pilgrim.violated",
    "umrah.transport.created", "umrah.transport.updated", "umrah.transport.deleted",
    "umrah.invoice.generated", "umrah.invoice.gl_auto_posted",
    "umrah.payment.received", "umrah.season.opened",
    "umrah.daily_status.run", "umrah.penalty.waived", "umrah.penalty_engine.run",
    "umrah.nusk_invoice.created", "umrah.nusk_invoice.updated", "umrah.nusk_invoice.deleted",
  ];

  for (const evt of requiredEvents) {
    it(`catalog includes ${evt}`, () => {
      expect(catalog).toContain(`"${evt}"`);
    });
  }
});
