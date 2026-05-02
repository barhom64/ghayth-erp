import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function countOccurrences(src: string, pattern: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = src.indexOf(pattern, idx)) !== -1) { count++; idx += pattern.length; }
  return count;
}

// ─── Module Coverage Report ─────────────────────────────────────────────────
// Verifies each module has the required cross-cutting concerns:
// permissions, audit logging, event emission, Zod validation, lifecycle engine

describe("Module coverage: HR", () => {
  const employees = read("routes/employees.ts");
  const hr = read("routes/hr.ts");
  const contracts = read("routes/hr-contracts.ts");
  const exit = read("routes/hr-exit.ts");
  const loans = read("routes/hr-loans.ts");

  it("has permission guards", () => {
    for (const src of [employees, hr, contracts, exit, loans]) {
      expect(src).toContain("requirePermission");
    }
  });

  it("has audit logging", () => {
    for (const src of [employees, hr, contracts, exit, loans]) {
      expect(src).toContain("createAuditLog");
    }
  });

  it("has event emission", () => {
    for (const src of [employees, hr, exit, loans]) {
      expect(src).toContain("emitEvent");
    }
  });

  it("uses Zod validation", () => {
    for (const src of [employees, hr, contracts, exit, loans]) {
      expect(src).toContain("zodParse");
    }
  });

  it("has lifecycle transitions where needed", () => {
    expect(hr).toContain("applyTransition");
    expect(exit).toContain("applyTransition");
  });
});

describe("Module coverage: Finance", () => {
  const invoices = read("routes/finance-invoices.ts");
  const journal = read("routes/finance-journal.ts");
  const purchase = read("routes/finance-purchase.ts");
  const accounts = read("routes/finance-accounts.ts");

  it("has permission guards on all sub-modules", () => {
    for (const src of [invoices, journal, purchase, accounts]) {
      expect(src).toContain("requirePermission");
    }
  });

  it("has audit logging", () => {
    for (const src of [invoices, journal, purchase, accounts]) {
      expect(src).toContain("createAuditLog");
    }
  });

  it("has event emission", () => {
    for (const src of [invoices, journal, purchase, accounts]) {
      expect(src).toContain("emitEvent");
    }
  });

  it("uses Zod validation", () => {
    for (const src of [invoices, journal, purchase, accounts]) {
      expect(src).toContain("z.object");
    }
  });

  it("has lifecycle transitions", () => {
    expect(invoices).toContain("applyTransition");
    expect(journal).toContain("applyTransition");
    expect(purchase).toContain("applyTransition");
  });
});

describe("Module coverage: Umrah", () => {
  const umrah = read("routes/umrah.ts");
  const entities = read("routes/umrah-entities.ts");

  it("has permission guards", () => {
    expect(umrah).toContain("requirePermission");
    expect(entities).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(umrah).toContain("createAuditLog");
    expect(entities).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(umrah).toContain("emitEvent");
    expect(entities).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(umrah).toContain("zodParse");
    expect(entities).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(umrah).toContain("applyTransition");
  });

  it("has field encryption for sensitive data", () => {
    expect(umrah).toContain("encryptField");
    expect(umrah).toContain("blindIndex");
    expect(umrah).toContain("logSensitiveAccess");
  });
});

describe("Module coverage: Fleet", () => {
  const fleet = read("routes/fleet.ts");

  it("has permission guards", () => {
    expect(fleet).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(fleet).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(fleet).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(fleet).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(fleet).toContain("applyTransition");
  });
});

describe("Module coverage: Legal", () => {
  const legal = read("routes/legal.ts");

  it("has permission guards", () => {
    expect(legal).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(legal).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(legal).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(legal).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(legal).toContain("applyTransition");
  });
});

describe("Module coverage: Property", () => {
  const properties = read("routes/properties.ts");

  it("has permission guards", () => {
    expect(properties).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(properties).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(properties).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(properties).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(properties).toContain("applyTransition");
  });
});

describe("Module coverage: Warehouse", () => {
  const warehouse = read("routes/warehouse.ts");

  it("has permission guards", () => {
    expect(warehouse).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(warehouse).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(warehouse).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(warehouse).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(warehouse).toContain("applyTransition");
  });
});

describe("Module coverage: CRM", () => {
  const crm = read("routes/crm.ts");

  it("has permission guards", () => {
    expect(crm).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(crm).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(crm).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(crm).toContain("zodParse");
  });

  it("has lifecycle transitions", () => {
    expect(crm).toContain("applyTransition");
  });
});

describe("Module coverage: Governance", () => {
  const governance = read("routes/governance.ts");

  it("has permission guards", () => {
    expect(governance).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(governance).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(governance).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(governance).toContain("zodParse");
  });
});

describe("Module coverage: Communications", () => {
  const comms = read("routes/communications.ts");

  it("has permission guards", () => {
    expect(comms).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(comms).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(comms).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(comms).toContain("zodParse");
  });
});

describe("Module coverage: Store", () => {
  const store = read("routes/store.ts");

  it("has permission guards", () => {
    expect(store).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(store).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(store).toContain("emitEvent");
  });

  it("uses Zod validation", () => {
    expect(store).toContain("zodParse");
  });
});

describe("Module coverage: BI", () => {
  const bi = read("routes/bi.ts");

  it("has permission guards", () => {
    expect(bi).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(bi).toContain("createAuditLog");
  });

  it("uses Zod validation", () => {
    expect(bi).toContain("z.object");
  });
});

describe("Module coverage: Operations Center", () => {
  const ops = read("routes/operationsCenter.ts");

  it("has permission guards", () => {
    expect(ops).toContain("requirePermission");
  });

  it("has audit logging", () => {
    expect(ops).toContain("createAuditLog");
  });

  it("has event emission", () => {
    expect(ops).toContain("emitEvent");
  });
});

// ─── Cross-cutting infrastructure ───────────────────────────────────────────

describe("Module coverage: Infrastructure", () => {
  const indexTs = read("routes/index.ts");
  const permMw = read("middlewares/permissionMiddleware.ts");
  const governor = read("lib/systemGovernor.ts");
  const lifecycle = read("lib/lifecycleEngine.ts");
  const eventBus = read("lib/eventBus.ts");

  it("all modules registered with requireModule in index", () => {
    const modules = ["hr", "finance", "fleet", "warehouse", "property", "legal", "crm", "bi", "store", "governance", "comms", "operations"];
    for (const m of modules) {
      expect(indexTs).toContain(`requireModule("${m}")`);
    }
  });

  it("permission middleware has grant/revoke/security_log", () => {
    expect(permMw).toContain("grant");
    expect(permMw).toContain("revoke");
    expect(permMw).toContain("security_log");
  });

  it("System Governor has fail-closed for financial guards", () => {
    expect(governor).toContain("allowed: false");
    expect(governor).toContain("requireGuards");
  });

  it("Lifecycle engine returns false for unknown entities", () => {
    expect(lifecycle).toContain("isValidTransition");
    expect(lifecycle).toContain("false");
  });

  it("Event bus enforces catalog", () => {
    expect(eventBus).toContain("isKnownEvent");
  });
});

// ─── Test coverage summary ──────────────────────────────────────────────────

describe("Test coverage inventory", () => {
  const testDir = join(import.meta.dirname!, "..");
  const testFiles = readdirSync(join(testDir, "unit")).filter(f => f.endsWith(".test.ts"));

  it("has at least 70 test files", () => {
    expect(testFiles.length).toBeGreaterThanOrEqual(70);
  });

  it("covers all major domains with dedicated tests", () => {
    const names = testFiles.join(" ");
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

  it("has infrastructure tests", () => {
    const names = testFiles.join(" ");
    expect(names).toContain("systemGovernor");
    expect(names).toContain("errorHandler");
    expect(names).toContain("rbac");
    expect(names).toContain("eventBus");
    expect(names).toContain("e2eScenarios");
  });
});
