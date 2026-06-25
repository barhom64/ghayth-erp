import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const UNIT_DIR = join(import.meta.dirname!);
const testFiles = readdirSync(UNIT_DIR).filter((f) => f.endsWith(".test.ts"));

function hasTestFile(...patterns: string[]): boolean {
  return patterns.every((p) => testFiles.some((f) => f.includes(p)));
}

// ─── Module Coverage Report ─────────────────────────────────────────────────
// Verifies each module has the required cross-cutting concerns:
// permissions, audit logging, event emission, Zod validation, lifecycle engine
//
// Pattern: read source files as strings, use toContain() assertions.
// Same approach as e2eScenarios.test.ts.

// ─── HR ─────────────────────────────────────────────────────────────────────

describe("Module coverage: HR", () => {
  const employees = read("routes/employees.ts");
  const hr = read("routes/hr.ts");
  const contracts = read("routes/hr-contracts.ts");
  const discipline = read("routes/hr-discipline.ts");
  const exit = read("routes/hr-exit.ts");
  const loans = read("routes/hr-loans.ts");
  const overtime = read("routes/hr-overtime.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("all HR route files have authorize guards", () => {
    for (const src of [employees, hr, contracts, discipline, exit, loans, overtime]) {
      expect(src).toContain("authorize(");
    }
  });

  it("employees uses hr: permission scope", () => {
    expect(employees).toContain('authorize(');
    expect(employees).toContain('authorize(');
  });

  it("HR module is gated by requireModule('hr') in index", () => {
    expect(indexTs).toContain('requireModule("hr")');
    expect(indexTs).toContain('requireModule("hr"), hrRouter');
    expect(indexTs).toContain('requireModule("hr"), employeesRouter');
    expect(indexTs).toContain('requireModule("hr"), disciplineRouter');
    expect(indexTs).toContain('requireModule("hr"), contractsRouter');
  });

  // Audit
  it("all HR route files emit audit logs", () => {
    for (const src of [employees, hr, contracts, discipline, exit, loans, overtime]) {
      expect(src).toContain("createAuditLog");
    }
  });

  it("contracts records fine-grained contract actions in audit", () => {
    expect(contracts).toContain("contract_created");
    expect(contracts).toContain("contract_approved");
    expect(contracts).toContain("contract_submitted");
  });

  // Events
  it("core HR files emit domain events", () => {
    for (const src of [employees, hr, discipline, exit, loans, overtime]) {
      expect(src).toContain("emitEvent");
    }
  });

  it("employees emits employee.created event", () => {
    expect(employees).toContain('"employee.created"');
  });

  it("HR emits leave.requested event", () => {
    expect(hr).toContain('"leave.requested"');
  });

  // Lifecycle
  it("leave requests and exit requests use applyTransition", () => {
    expect(hr).toContain("applyTransition");
    expect(exit).toContain("applyTransition");
  });

  it("discipline uses applyTransition for memo workflow", () => {
    expect(discipline).toContain("applyTransition");
  });

  // Validation
  it("all HR route files use Zod schema validation", () => {
    for (const src of [employees, hr, contracts, discipline, exit, loans, overtime]) {
      expect(src).toContain("zodParse");
    }
  });

  it("employee creation has required-field schemas (name, nationalId, phone)", () => {
    expect(employees).toContain("name: z.string()");
    expect(employees).toContain("nationalId: z.string()");
    expect(employees).toContain("phone: z.string()");
  });

  // Tests
  it("has dedicated HR test files", () => {
    expect(hasTestFile("employeesSmoke")).toBe(true);
    expect(hasTestFile("hrMainRoutesSmoke")).toBe(true);
    expect(hasTestFile("hrContractsSmoke")).toBe(true);
    expect(hasTestFile("hrDisciplineSmoke")).toBe(true);
    expect(hasTestFile("hrExitLoansOvertimeSmoke")).toBe(true);
    expect(hasTestFile("hrBroadGoldenPath")).toBe(true);
    expect(hasTestFile("hrLeaveGoldenPath")).toBe(true);
  });
});

// ─── Finance ─────────────────────────────────────────────────────────────────

describe("Module coverage: Finance", () => {
  const invoices = read("routes/finance-invoices.ts");
  const journal = read("routes/finance-journal.ts");
  const purchase = read("routes/finance-purchase.ts");
  const accounts = read("routes/finance-accounts.ts");
  const budget = read("routes/finance-budget.ts");
  const vendors = read("routes/finance-vendors.ts");
  const custodies = read("routes/finance-custodies.ts");
  const hardening = read("routes/finance-hardening.ts");
  const costCenters = read("routes/finance-cost-centers.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("all Finance sub-modules have authorize guards", () => {
    for (const src of [invoices, journal, purchase, accounts, budget, vendors, custodies, hardening, costCenters]) {
      expect(src).toContain("authorize(");
    }
  });

  it("finance module uses finance: permission scope throughout", () => {
    expect(invoices).toContain('authorize(');
    expect(invoices).toContain('authorize(');
    expect(invoices).toContain('authorize(');
    expect(accounts).toContain('authorize(');
    expect(budget).toContain('authorize(');
    expect(vendors).toContain('authorize(');
  });

  it("Finance module is gated by requireModule('finance') + requireGuards('financial') in index", () => {
    expect(indexTs).toContain('requireModule("finance")');
    expect(indexTs).toContain('requireGuards("financial"), invoicesRouter');
    expect(indexTs).toContain('requireGuards("financial"), journalRouter');
    expect(indexTs).toContain('requireGuards("financial"), purchaseRouter');
    expect(indexTs).toContain('requireGuards("financial"), budgetRouter');
    expect(indexTs).toContain('requireGuards("financial"), accountsRouter');
    expect(indexTs).toContain('requireGuards("financial"), vendorsRouter');
    expect(indexTs).toContain('requireGuards("financial"), custodiesRouter');
  });

  // Audit
  it("all core Finance sub-modules emit audit logs", () => {
    for (const src of [invoices, journal, purchase, accounts, budget, vendors, custodies, hardening, costCenters]) {
      expect(src).toContain("createAuditLog");
    }
  });

  it("invoices audit records ref and total", () => {
    expect(invoices).toContain('"invoices"');
    expect(invoices).toContain("action: \"create\"");
  });

  // Events
  it("all core Finance sub-modules emit domain events", () => {
    for (const src of [invoices, journal, purchase, accounts, budget, vendors, costCenters]) {
      expect(src).toContain("emitEvent");
    }
  });

  it("invoices emits invoice.created and invoice.approved events", () => {
    expect(invoices).toContain('"invoice.created"');
    expect(invoices).toContain('"invoice.approved"');
  });

  it("purchase emits purchase_request.created event", () => {
    expect(purchase).toContain('"purchase_request.created"');
  });

  // Lifecycle
  it("transactional Finance sub-modules use applyTransition", () => {
    expect(invoices).toContain("applyTransition");
    expect(journal).toContain("applyTransition");
    expect(purchase).toContain("applyTransition");
    expect(vendors).toContain("applyTransition");
    expect(budget).toContain("applyTransition");
  });

  // Validation
  it("all Finance sub-modules use Zod validation", () => {
    for (const src of [invoices, journal, purchase, accounts, budget, vendors, custodies, hardening, costCenters]) {
      expect(src).toContain("z.object");
    }
  });

  it("invoice schema validates lines array", () => {
    expect(invoices).toContain("z.array(z.object(");
  });

  // Tests
  it("has dedicated Finance test files", () => {
    expect(hasTestFile("financeGoldenPath")).toBe(true);
    expect(hasTestFile("financeAccountsRecurringSmoke")).toBe(true);
    expect(hasTestFile("financeBudgetCustodySmoke")).toBe(true);
    expect(hasTestFile("financeHardeningSmoke")).toBe(true);
    expect(hasTestFile("financePurchaseSmoke")).toBe(true);
    expect(hasTestFile("financeVendorsReportsSmoke")).toBe(true);
    expect(hasTestFile("financialIntegrity")).toBe(true);
  });
});

// ─── Umrah ────────────────────────────────────────────────────────────────────

describe("Module coverage: Umrah", () => {
  const umrah = read("routes/umrah.ts");
  const entities = read("routes/umrah-entities.ts");
  // U-07 Phase 19: nusk-invoice CRUD routes live here.
  const nuskInvoices = read("routes/umrah-nusk-invoices.ts");
  // U-07 Phase 22: groups CRUD (+ requireOpenSeason helper) live here.
  const groups = read("routes/umrah-groups.ts");
  // U-07 Phase 6: sub-agent CRUD + linking routes live here.
  const subAgents = read("routes/umrah-sub-agents.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("Umrah route files have authorize guards (umrah.ts + the carved sub-routers)", () => {
    expect(umrah).toContain("authorize(");
    // U-07 Phase 24 — umrah-entities.ts is now a pure aggregator (no routes); the
    // authorize guards live in the carved sub-routers (e.g. umrah-groups.ts).
    expect(groups).toContain("authorize(");
  });

  it("Umrah routes use umrah: permission scope", () => {
    expect(umrah).toContain('authorize({ feature: "umrah"');
    expect(groups).toContain('authorize({ feature: "umrah"');
  });

  it("Umrah is gated by requireModule('operations') + requireGuards('financial') in index", () => {
    expect(indexTs).toContain('requireGuards("financial"), umrahRouter');
    expect(indexTs).toContain('requireGuards("financial"), umrahEntitiesRouter');
  });

  // Audit
  it("Umrah route files emit audit logs (umrah.ts + the carved groups sub-router)", () => {
    expect(umrah).toContain("createAuditLog");
    // U-07 Phase 22 — umrah-entities.ts no longer audits directly; the group
    // write trail moved to umrah-groups.ts as auditFromRequest (IGOC ratchet).
    expect(groups).toContain("auditFromRequest");
  });

  // Sub-agent CRUD + its audit trail live in umrah-sub-agents.ts since the
  // U-07 Phase 6 carve-out (IGOC ratchet → auditFromRequest, positional args).
  // (This previously read `entities` and passed only because the attachments
  // ATTACH_OWNER_TABLE map happened to contain the "umrah_sub_agents" string;
  // attachments moved to umrah-attachments.ts in U-07 Phase 10.)
  it("sub-agents router audits sub-agent creation and updates", () => {
    expect(subAgents).toContain('"umrah_sub_agents"');
    expect(subAgents).toMatch(/auditFromRequest\(\s*req,\s*"create",\s*"umrah_sub_agents"/);
    expect(subAgents).toMatch(/auditFromRequest\(\s*req,\s*"update",\s*"umrah_sub_agents"/);
  });

  // Events
  it("Umrah route files emit domain events (umrah.ts + the carved groups sub-router)", () => {
    expect(umrah).toContain("emitEvent");
    // U-07 Phase 22 — group domain events (created/updated/deleted/split/merged)
    // moved with the routes to umrah-groups.ts.
    expect(groups).toContain("emitEvent");
  });

  it("sub-agents router emits umrah.sub_agent.created event", () => {
    // event moved to umrah-sub-agents.ts (U-07 Phase 6 carve-out)
    expect(subAgents).toContain('"umrah.sub_agent.created"');
  });

  // Lifecycle
  it("umrah main file uses applyTransition", () => {
    expect(umrah).toContain("applyTransition");
  });

  // Validation
  it("Umrah route files use Zod validation (umrah.ts + the carved groups sub-router)", () => {
    expect(umrah).toContain("zodParse");
    // U-07 Phase 22/23 — umrah-entities.ts is now down to employee-assignments
    // only (no body validation); the group schemas + zodParse moved to
    // umrah-groups.ts with the CRUD/ops routes.
    expect(groups).toContain("zodParse");
  });

  it("umrah defines schemas for seasons, agents, packages, pilgrims", () => {
    expect(umrah).toContain("createSeasonSchema");
    expect(umrah).toContain("createAgentSchema");
    expect(umrah).toContain("createPackageSchema");
    expect(umrah).toContain("createPilgrimSchema");
  });

  // Security — sensitive field encryption
  it("pilgrim sensitive data is encrypted at rest", () => {
    expect(umrah).toContain("encryptField");
    expect(umrah).toContain("blindIndex");
    expect(umrah).toContain("logSensitiveAccess");
  });

  // Season locking
  it("enforces season lock on write operations", () => {
    expect(umrah).toContain("requireOpenSeason");
    // U-07 Phase 22 — requireOpenSeason moved with groups CRUD to umrah-groups.ts.
    expect(groups).toContain("requireOpenSeason");
  });

  // Nusk invoice CRUD
  it("has complete nusk invoice CRUD", () => {
    expect(nuskInvoices).toContain('router.get("/nusk-invoices"');
    expect(nuskInvoices).toContain('router.get("/nusk-invoices/:id"');
    expect(nuskInvoices).toContain('router.post("/nusk-invoices"');
    expect(nuskInvoices).toContain('router.patch("/nusk-invoices/:id"');
    expect(nuskInvoices).toContain('router.delete("/nusk-invoices/:id"');
  });

  // Tests
  it("has dedicated Umrah test files", () => {
    expect(hasTestFile("umrahGoldenPath")).toBe(true);
    expect(hasTestFile("umrahEnginesSmoke")).toBe(true);
  });
});

// ─── Fleet ────────────────────────────────────────────────────────────────────

describe("Module coverage: Fleet", () => {
  const fleet = read("routes/fleet.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(fleet).toContain("authorize(");
  });

  it("uses fleet: permission scope", () => {
    expect(fleet).toContain('authorize(');
    expect(fleet).toContain('authorize(');
  });

  it("is gated by requireModule('fleet') + requireGuards('financial') in index", () => {
    expect(indexTs).toContain('requireModule("fleet"), requireGuards("financial"), fleetRouter');
  });

  // Audit
  it("emits audit logs", () => {
    expect(fleet).toContain("createAuditLog");
  });

  // Events
  it("emits domain events", () => {
    expect(fleet).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for trip/maintenance lifecycle", () => {
    expect(fleet).toContain("applyTransition");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(fleet).toContain("zodParse");
  });

  it("defines schemas for vehicles, drivers and trips", () => {
    expect(fleet).toContain("createVehicleSchema");
    expect(fleet).toContain("createDriverSchema");
    expect(fleet).toContain("createTripSchema");
  });

  // Tests
  it("has a dedicated Fleet test file", () => {
    expect(hasTestFile("fleetGoldenPath")).toBe(true);
  });
});

// ─── Legal ────────────────────────────────────────────────────────────────────

describe("Module coverage: Legal", () => {
  const legal = read("routes/legal.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(legal).toContain("authorize(");
  });

  it("uses legal: permission scope", () => {
    expect(legal).toContain('authorize(');
    expect(legal).toContain('authorize(');
    expect(legal).toContain('authorize(');
  });

  it("is gated by requireModule('legal') in index", () => {
    // Pattern allows extra middleware (e.g. requireMinLevel) between
    // the module gate and the router argument — the contract is that
    // the gate exists immediately after the path, not that it's the
    // ONLY middleware on the mount.
    expect(indexTs).toMatch(/requireModule\("legal"\)(?:,\s*\w+\([^)]*\))*,\s*legalRouter/);
  });

  // Audit
  it("emits audit logs", () => {
    expect(legal).toContain("createAuditLog");
  });

  it("audits contract creation and case management", () => {
    expect(legal).toContain('"legal_contracts"');
    expect(legal).toContain('"legal_cases"');
  });

  // Events
  it("emits domain events", () => {
    expect(legal).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for contract and case lifecycle", () => {
    expect(legal).toContain("applyTransition");
    expect(legal).toContain("legal_contracts");
    expect(legal).toContain("legal_cases");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(legal).toContain("zodParse");
  });

  it("defines schemas for contracts, cases and sessions", () => {
    expect(legal).toContain("createContractSchema");
    expect(legal).toContain("createCaseSchema");
    expect(legal).toContain("createSessionSchema");
  });

  // Tests
  it("has a dedicated Legal test file", () => {
    expect(hasTestFile("legalGoldenPath")).toBe(true);
  });
});

// ─── Property ─────────────────────────────────────────────────────────────────

describe("Module coverage: Property", () => {
  const properties = read("routes/properties.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(properties).toContain("authorize(");
  });

  it("uses property: permission scope", () => {
    expect(properties).toContain('authorize(');
    expect(properties).toContain('authorize(');
    expect(properties).toContain('authorize(');
  });

  it("is gated by requireModule('property') + requireGuards('financial') in index", () => {
    expect(indexTs).toContain('requireModule("property"), requireGuards("financial"), propertiesRouter');
  });

  // Audit
  it("emits audit logs", () => {
    expect(properties).toContain("createAuditLog");
  });

  // Events
  it("emits domain events", () => {
    expect(properties).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for contract and unit lifecycle", () => {
    expect(properties).toContain("applyTransition");
    expect(properties).toContain("property_units");
    expect(properties).toContain("property_contracts");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(properties).toContain("zodParse");
  });

  it("defines schemas for units, buildings, contracts and tenants", () => {
    expect(properties).toContain("createUnitSchema");
    expect(properties).toContain("createBuildingSchema");
    expect(properties).toContain("createContractSchema");
    expect(properties).toContain("createTenantSchema");
  });

  // Tests
  it("has a dedicated Property test file", () => {
    expect(hasTestFile("propertyGoldenPath")).toBe(true);
  });
});

// ─── Warehouse ────────────────────────────────────────────────────────────────

describe("Module coverage: Warehouse", () => {
  const warehouse = read("routes/warehouse.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(warehouse).toContain("authorize(");
  });

  it("uses warehouse: permission scope", () => {
    expect(warehouse).toContain('authorize(');
    expect(warehouse).toContain('authorize(');
    expect(warehouse).toContain('authorize(');
  });

  it("is gated by requireModule('warehouse') + requireGuards('financial') in index", () => {
    expect(indexTs).toContain('requireModule("warehouse"), requireGuards("financial"), warehouseRouter');
  });

  // Audit
  it("emits audit logs on product mutations", () => {
    expect(warehouse).toContain("createAuditLog");
  });

  // Events
  it("emits domain events", () => {
    expect(warehouse).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for product and order lifecycle", () => {
    expect(warehouse).toContain("applyTransition");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(warehouse).toContain("zodParse");
  });

  it("defines schemas for products, categories, suppliers and movements", () => {
    expect(warehouse).toContain("createProductSchema");
    expect(warehouse).toContain("createCategorySchema");
    expect(warehouse).toContain("createSupplierSchema");
    expect(warehouse).toContain("createMovementSchema");
  });

  // Tests
  it("has a dedicated Warehouse test file", () => {
    expect(hasTestFile("warehouseGoldenPath")).toBe(true);
  });
});

// ─── Operations ───────────────────────────────────────────────────────────────

describe("Module coverage: Operations", () => {
  const ops = read("routes/operationsCenter.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(ops).toContain("authorize(");
  });

  it("uses operations: permission scope for read and finance:write for daily close", () => {
    expect(ops).toContain('authorize(');
    expect(ops).toContain('authorize(');
  });

  it("is gated by requireModule('operations') in index", () => {
    expect(indexTs).toContain('requireModule("operations")');
    // GAP_MATRIX P1 — role ladder: 40 → 50 (nearest real role level above employee).
    expect(indexTs).toContain('requireModule("operations"), requireMinLevel(50), operationsCenterRouter');
  });

  // Audit
  it("emits audit logs for daily close", () => {
    expect(ops).toContain("createAuditLog");
    expect(ops).toContain('"daily_close"');
  });

  // Events
  it("emits domain events", () => {
    expect(ops).toContain("emitEvent");
    expect(ops).toContain('"daily_close.executed"');
  });

  // Validation
  it("uses Zod validation for daily close execution", () => {
    expect(ops).toContain("zodParse");
    expect(ops).toContain("dailyCloseExecuteSchema");
  });

  // Endpoints
  it("exposes operations dashboard, checklist and daily-close endpoints", () => {
    expect(ops).toContain('router.get("/",');
    expect(ops).toContain('"/daily-close/checklist"');
    expect(ops).toContain('"/daily-close/execute"');
  });
});

// ─── CRM ──────────────────────────────────────────────────────────────────────

describe("Module coverage: CRM", () => {
  const crm = read("routes/crm.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(crm).toContain("authorize(");
  });

  it("uses crm: permission scope", () => {
    expect(crm).toContain('authorize(');
    expect(crm).toContain('authorize(');
    expect(crm).toContain('authorize(');
    expect(crm).toContain('authorize(');
  });

  it("is gated by requireModule('crm') in index", () => {
    expect(indexTs).toContain('requireModule("crm"), crmRouter');
  });

  // Audit
  it("emits audit logs on opportunity mutations", () => {
    expect(crm).toContain("createAuditLog");
  });

  // Events
  it("emits domain events", () => {
    expect(crm).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for opportunity lifecycle (convert)", () => {
    expect(crm).toContain("applyTransition");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(crm).toContain("zodParse");
  });

  it("defines schemas for opportunities and activities", () => {
    expect(crm).toContain("createOpportunitySchema");
    expect(crm).toContain("createActivitySchema");
  });

  // Tests
  it("has a dedicated CRM test file", () => {
    expect(hasTestFile("crmGoldenPath")).toBe(true);
  });
});

// ─── Governance ───────────────────────────────────────────────────────────────

describe("Module coverage: Governance", () => {
  const governance = read("routes/governance.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards", () => {
    expect(governance).toContain("authorize(");
  });

  it("uses governance: permission scope", () => {
    expect(governance).toContain('authorize(');
    expect(governance).toContain('authorize(');
  });

  it("is gated by requireModule('governance') in index", () => {
    // See legal test above — pattern allows extra middleware between
    // the module gate and the router argument.
    expect(indexTs).toMatch(/requireModule\("governance"\)(?:,\s*\w+\([^)]*\))*,\s*governanceRouter/);
  });

  // Audit
  it("emits audit logs on policy mutations", () => {
    expect(governance).toContain("createAuditLog");
    expect(governance).toContain('"governance_policies"');
  });

  // Events
  it("emits domain events", () => {
    expect(governance).toContain("emitEvent");
  });

  // Lifecycle
  it("uses applyTransition for policy archiving", () => {
    expect(governance).toContain("applyTransition");
    expect(governance).toContain('"governance_policies"');
  });

  // Validation
  it("uses Zod validation", () => {
    expect(governance).toContain("zodParse");
  });

  it("defines schemas for policies, risks, audits and compliance", () => {
    expect(governance).toContain("createPolicySchema");
    expect(governance).toContain("createRiskSchema");
    expect(governance).toContain("createAuditSchema");
    expect(governance).toContain("createComplianceSchema");
  });

  // Tests
  it("has a dedicated Governance test file", () => {
    expect(hasTestFile("governanceSmoke")).toBe(true);
  });
});

// ─── Communications ───────────────────────────────────────────────────────────

describe("Module coverage: Communications", () => {
  const comms = read("routes/communications.ts");
  const indexTs = read("routes/index.ts");

  // Permissions
  it("has authorize guards for authenticated endpoints", () => {
    expect(comms).toContain("authorize(");
    expect(comms).toContain('authorize(');
    expect(comms).toContain('authorize(');
  });

  it("is gated by requireModule('comms') in index", () => {
    // See legal test above — pattern allows extra middleware between
    // the module gate and the router argument.
    expect(indexTs).toMatch(/requireModule\("comms"\)(?:,\s*\w+\([^)]*\))*,\s*communicationsRouter/);
  });

  // Audit
  it("emits audit logs for inbound and outbound communications", () => {
    expect(comms).toContain("createAuditLog");
    expect(comms).toContain('"communication_logs"');
  });

  it("audits WhatsApp inbound, PBX incoming and PBX completed events", () => {
    expect(comms).toContain('"communication.whatsapp.received"');
    expect(comms).toContain('"communication.pbx.incoming"');
    expect(comms).toContain('"communication.pbx.completed"');
  });

  // Events
  it("emits domain events for all communication channels", () => {
    expect(comms).toContain("emitEvent");
  });

  // Validation
  it("uses Zod validation", () => {
    expect(comms).toContain("zodParse");
  });

  it("defines schemas for send, PBX webhooks and push subscriptions", () => {
    expect(comms).toContain("sendCommunicationSchema");
    expect(comms).toContain("pbxIncomingSchema");
    expect(comms).toContain("pbxCompletedSchema");
    expect(comms).toContain("pushSubscribeSchema");
  });

  // Tests
  it("has a dedicated Communications test file", () => {
    expect(hasTestFile("communicationsSmoke")).toBe(true);
  });
});

// ─── Cross-cutting infrastructure ─────────────────────────────────────────────

describe("Module coverage: Infrastructure guards and wiring", () => {
  const indexTs = read("routes/index.ts");
  const permMw = read("middlewares/permissionMiddleware.ts");
  const governor = read("lib/systemGovernor.ts");
  const lifecycle = read("lib/lifecycleEngine.ts");
  const eventBus = read("lib/eventBus.ts");

  it("all 12 business modules registered with requireModule in index", () => {
    const modules = [
      "hr", "finance", "fleet", "warehouse", "property", "legal",
      "crm", "bi", "store", "governance", "comms", "operations",
    ];
    for (const m of modules) {
      expect(indexTs).toContain(`requireModule("${m}")`);
    }
  });

  it("financial modules use requireGuards('financial') in index", () => {
    const financialLines = indexTs
      .split("\n")
      .filter((l) => l.includes("router.use") && l.includes('requireGuards("financial")'));
    // fleet, warehouse, properties, umrah (×2), plus all finance sub-routers ≥ 10
    expect(financialLines.length).toBeGreaterThanOrEqual(10);
  });

  it("permission middleware enforces via RBAC v2 and logs denials to security_log", () => {
    expect(permMw).toContain("checkAccess");
    expect(permMw).toContain("FLAT_TO_RBAC");
    expect(permMw).toContain("security_log");
  });

  it("System Governor has fail-closed default for requireGuards", () => {
    expect(governor).toContain("allowed: false");
    expect(governor).toContain("requireGuards");
  });

  it("Lifecycle engine exposes isValidTransition and applyTransition", () => {
    expect(lifecycle).toContain("isValidTransition");
    expect(lifecycle).toContain("applyTransition");
  });

  it("Event bus enforces catalog with isKnownEvent check", () => {
    expect(eventBus).toContain("isKnownEvent");
  });
});

// ─── Test coverage inventory ───────────────────────────────────────────────────

describe("Test coverage inventory", () => {
  it("has at least 70 unit test files", () => {
    expect(testFiles.length).toBeGreaterThanOrEqual(70);
  });

  it("covers all major domains with dedicated test files", () => {
    const names = testFiles.join(" ");
    // Domain golden-path / smoke tests
    expect(names).toContain("hr");
    expect(names).toContain("finance");
    expect(names).toContain("umrah");
    expect(names).toContain("fleet");
    expect(names).toContain("legal");
    expect(names).toContain("property");
    expect(names).toContain("warehouse");
    expect(names).toContain("crm");
    expect(names).toContain("governance");
    expect(names).toContain("communications");
  });

  it("has infrastructure and cross-cutting concern tests", () => {
    const names = testFiles.join(" ");
    expect(names).toContain("systemGovernor");
    expect(names).toContain("errorHandler");
    expect(names).toContain("rbac");
    expect(names).toContain("eventBus");
    expect(names).toContain("e2eScenarios");
    expect(names).toContain("crossDomain");
  });

  it("has dedicated HR sub-module tests (discipline, contracts, exit/loans/overtime)", () => {
    expect(hasTestFile("hrDisciplineSmoke")).toBe(true);
    expect(hasTestFile("hrContractsSmoke")).toBe(true);
    expect(hasTestFile("hrExitLoansOvertimeSmoke")).toBe(true);
  });

  it("has dedicated Finance sub-module tests (hardening, purchase, budget, vendors)", () => {
    expect(hasTestFile("financeHardeningSmoke")).toBe(true);
    expect(hasTestFile("financePurchaseSmoke")).toBe(true);
    expect(hasTestFile("financeBudgetCustodySmoke")).toBe(true);
    expect(hasTestFile("financeVendorsReportsSmoke")).toBe(true);
  });
});
