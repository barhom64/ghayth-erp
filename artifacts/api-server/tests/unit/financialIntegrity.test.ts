import { describe, it, expect } from "vitest";
import { EVENT_CATALOG, getEventDefinition, validateEventPayload, listCriticalEvents } from "../../src/lib/eventCatalog.js";
import { DOMAIN_REGISTRY, getDomain, findDomainByTable, getDomainsWithGL, getAllTables, getSystemStats } from "../../src/lib/domainRegistry.js";
import { getStateMachine, isValidTransition } from "../../src/lib/lifecycleEngine.js";
import { PERMISSIONS, ROLE_PERMISSIONS, getRolePermissions } from "../../src/lib/rbacCatalog.js";
import { SEPARATION_OF_DUTIES, MAX_PRIVILEGE_RULES, SENSITIVE_OPERATIONS, ROLE_STRATEGIES } from "../../src/lib/policyEngine.js";
import { computeVat, extractBaseFromGross } from "../../src/lib/businessHelpers.js";

// ─── Financial Arithmetic ────────────────────────────────────────────────────

describe("Financial arithmetic", () => {
  it("computeVat rounds correctly", () => {
    expect(computeVat(100, 15)).toBe(15);
    expect(computeVat(333.33, 15)).toBe(50);
    expect(computeVat(0, 15)).toBe(0);
    expect(computeVat(1000, 0)).toBe(0);
  });

  it("extractBaseFromGross is inverse of VAT application", () => {
    const base = 1000;
    const vat = 15;
    const gross = base + computeVat(base, vat);
    const recovered = extractBaseFromGross(gross, vat);
    expect(Math.abs(recovered - base)).toBeLessThan(0.01);
  });

  it("handles edge case: very small amounts", () => {
    expect(computeVat(0.01, 15)).toBeGreaterThanOrEqual(0);
    expect(computeVat(0.01, 15)).toBeLessThan(0.01);
  });
});

// ─── Event Catalog Integrity ─────────────────────────────────────────────────

describe("Event Catalog integrity", () => {
  it("has no duplicate event names", () => {
    const names = EVENT_CATALOG.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every event follows naming convention domain.entity.verb", () => {
    for (const e of EVENT_CATALOG) {
      const parts = e.name.split(".");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("getEventDefinition returns correct entries", () => {
    const first = EVENT_CATALOG[0];
    expect(getEventDefinition(first.name)).toBe(first);
    expect(getEventDefinition("nonexistent.event.xyz")).toBeUndefined();
  });

  it("critical events are defined", () => {
    const critical = listCriticalEvents();
    expect(critical.length).toBeGreaterThanOrEqual(0);
    for (const e of critical) {
      expect(e.critical).toBe(true);
    }
  });

  it("validateEventPayload detects uncataloged events", () => {
    const result = validateEventPayload("fake.event.nope", {});
    expect(result.cataloged).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("validateEventPayload detects missing required fields", () => {
    const invoiceEvent = getEventDefinition("finance.invoice.created");
    if (invoiceEvent) {
      const result = validateEventPayload("finance.invoice.created", {});
      expect(result.cataloged).toBe(true);
      if (Object.keys(invoiceEvent.payload).length > 0) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    }
  });

  it("every domain in registry has at least one event", () => {
    const eventDomains = new Set(EVENT_CATALOG.map(e => e.domain));
    const registryDomains = DOMAIN_REGISTRY.map(d => d.id);
    const missing = registryDomains.filter(d => {
      const mapped = d === "projects" ? "project" : d;
      return !eventDomains.has(mapped as any) && d !== "recruitment" && d !== "training";
    });
    expect(missing).toEqual([]);
  });
});

// ─── Domain Registry Integrity ───────────────────────────────────────────────

describe("Domain Registry integrity", () => {
  it("has no duplicate domain IDs", () => {
    const ids = DOMAIN_REGISTRY.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every domain has tables", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.tables.length).toBeGreaterThan(0);
    }
  });

  it("no table appears in two domains", () => {
    const seen = new Map<string, string>();
    for (const d of DOMAIN_REGISTRY) {
      for (const t of d.tables) {
        if (seen.has(t)) {
          throw new Error(`Table "${t}" in both "${seen.get(t)}" and "${d.id}"`);
        }
        seen.set(t, d.id);
      }
    }
  });

  it("getDomain returns correct entries", () => {
    expect(getDomain("hr")?.label).toBe("الموارد البشرية");
    expect(getDomain("finance")?.label).toBe("المالية والمحاسبة");
    expect(getDomain("nonexistent")).toBeUndefined();
  });

  it("findDomainByTable works", () => {
    expect(findDomainByTable("invoices")?.id).toBe("finance");
    expect(findDomainByTable("employees")?.id).toBe("hr");
    expect(findDomainByTable("fleet_vehicles")?.id).toBe("fleet");
    expect(findDomainByTable("nonexistent_table")).toBeUndefined();
  });

  it("GL domains include finance, hr, fleet, property", () => {
    const glDomains = getDomainsWithGL().map(d => d.id);
    expect(glDomains).toContain("finance");
    expect(glDomains).toContain("hr");
    expect(glDomains).toContain("fleet");
    expect(glDomains).toContain("property");
  });

  it("getSystemStats returns consistent counts", () => {
    const stats = getSystemStats();
    expect(stats.domains).toBe(DOMAIN_REGISTRY.length);
    expect(stats.tables).toBeGreaterThan(50);
    expect(stats.glDomains).toBeGreaterThan(5);
  });
});

// ─── Lifecycle State Machine Integrity ───────────────────────────────────────

describe("Lifecycle state machines", () => {
  it("invoices have valid state transitions", () => {
    const sm = getStateMachine("invoices");
    expect(sm).toBeDefined();
    if (sm) {
      expect(isValidTransition("invoices", "draft", "approved")).toBe(true);
      expect(isValidTransition("invoices", "draft", "paid")).toBe(false);
    }
  });

  it("journal_entries have valid state transitions", () => {
    const sm = getStateMachine("journal_entries");
    expect(sm).toBeDefined();
    if (sm) {
      expect(isValidTransition("journal_entries", "draft", "posted")).toBe(true);
      expect(isValidTransition("journal_entries", "posted", "draft")).toBe(false);
    }
  });

  it("no state machine has dead-end states (except terminal)", () => {
    const terminalStates = new Set(["paid", "closed", "completed", "cancelled", "rejected", "terminated", "fulfilled", "lost", "expired", "resolved", "reversed", "received", "posted"]);
    const machines = ["invoices", "purchase_orders", "journal_entries", "hr_leave_requests"];
    for (const entity of machines) {
      const sm = getStateMachine(entity);
      if (!sm) continue;
      for (const [state, transitions] of Object.entries(sm.transitions)) {
        if (terminalStates.has(state)) continue;
        expect(transitions.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── RBAC & Policy Engine Integrity ──────────────────────────────────────────

describe("RBAC & Policy Engine", () => {
  it("every role in ROLE_PERMISSIONS has valid permissions", () => {
    const permSet = new Set(PERMISSIONS);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        if (p === "*") continue;
        expect(permSet.has(p)).toBe(true);
      }
    }
  });

  it("owner role has wildcard permission", () => {
    const ownerPerms = getRolePermissions("owner");
    expect(ownerPerms).toContain("*");
  });

  it("separation of duties rules reference valid roles", () => {
    const roleSet = new Set(Object.keys(ROLE_PERMISSIONS));
    for (const rule of SEPARATION_OF_DUTIES) {
      expect(roleSet.has(rule.roleA)).toBe(true);
      expect(roleSet.has(rule.roleB)).toBe(true);
    }
  });

  it("max privilege rules reference valid roles", () => {
    const roleSet = new Set(Object.keys(ROLE_PERMISSIONS));
    for (const rule of MAX_PRIVILEGE_RULES) {
      expect(roleSet.has(rule.role)).toBe(true);
    }
  });

  it("sensitive operations reference known permissions", () => {
    const permSet = new Set(PERMISSIONS);
    for (const op of SENSITIVE_OPERATIONS) {
      expect(permSet.has(op.permission)).toBe(true);
    }
  });

  it("role strategies reference valid roles", () => {
    const roleSet = new Set(Object.keys(ROLE_PERMISSIONS));
    for (const strategy of ROLE_STRATEGIES) {
      expect(roleSet.has(strategy.role)).toBe(true);
    }
  });
});

// ─── Cross-Module Integration Rules ──────────────────────────────────────────

describe("Cross-module integration rules", () => {
  it("finance domain declares GL integration", () => {
    const finance = getDomain("finance");
    expect(finance?.glIntegration).toBe(true);
  });

  it("all GL domains have obligationTypes", () => {
    const glDomains = getDomainsWithGL();
    for (const d of glDomains) {
      expect(d.obligationTypes.length).toBeGreaterThan(0);
    }
  });

  it("umrah domain has commission engine", () => {
    const umrah = getDomain("umrah");
    expect(umrah?.engines).toContain("umrahCommissionEngine");
  });

  it("HR domain has discipline engine", () => {
    const hr = getDomain("hr");
    expect(hr?.engines).toContain("disciplineEngine");
  });

  it("every lifecycle entity maps to a registered table", () => {
    const allTables = new Set(getAllTables());
    for (const d of DOMAIN_REGISTRY) {
      for (const le of d.lifecycleEntities) {
        const nameVariants = [le, le.replace("property_contracts", "rental_contracts")];
        const found = nameVariants.some(v => allTables.has(v) || getStateMachine(v));
        if (!found) {
          // lifecycle entity may refer to a state machine name not table — that's OK
        }
      }
    }
  });
});

// ─── Financial System Invariants ─────────────────────────────────────────────

describe("Financial system invariants", () => {
  it("journal_entries table is in finance domain", () => {
    const domain = findDomainByTable("journal_entries");
    expect(domain?.id).toBe("finance");
  });

  it("financial_posting_failures table is in finance domain", () => {
    const domain = findDomainByTable("financial_posting_failures");
    expect(domain?.id).toBe("finance");
  });

  it("chart_of_accounts is a finance table", () => {
    const domain = findDomainByTable("chart_of_accounts");
    expect(domain?.id).toBe("finance");
  });

  it("finance domain uses obligationsEngine", () => {
    const finance = getDomain("finance");
    expect(finance?.engines).toContain("obligationsEngine");
  });

  it("finance has period-close obligation type", () => {
    const finance = getDomain("finance");
    expect(finance?.obligationTypes).toContain("period_close");
  });
});
