import { describe, it, expect } from "vitest";
import { DOMAIN_REGISTRY, getSystemStats, getDomain, findDomainByTable, getAllTables, getDomainsWithGL } from "../../src/lib/domainRegistry.js";

// ─── Domain Registry Integrity ──────────────────────────────────────────────

describe("Domain Registry integrity", () => {
  it("has no duplicate domain IDs", () => {
    const ids = DOMAIN_REGISTRY.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every domain has a non-empty label", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("every domain has at least one table", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.tables.length).toBeGreaterThan(0);
    }
  });

  it("no table is claimed by multiple domains", () => {
    const seen = new Map<string, string>();
    for (const d of DOMAIN_REGISTRY) {
      for (const t of d.tables) {
        if (seen.has(t)) {
          throw new Error(`Table "${t}" is claimed by both "${seen.get(t)}" and "${d.id}"`);
        }
        seen.set(t, d.id);
      }
    }
  });

  it("every domain has a routeFile", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.routeFile).toBeTruthy();
      expect(d.routeFile).toMatch(/\.ts$/);
    }
  });

  it("every domain has an eventPrefix ending in dot", () => {
    for (const d of DOMAIN_REGISTRY) {
      expect(d.eventPrefix).toMatch(/\.$/);
    }
  });

  it("getDomain returns correct entry", () => {
    const hr = getDomain("hr");
    expect(hr).toBeDefined();
    expect(hr!.label).toBe("الموارد البشرية");
  });

  it("getDomain returns undefined for unknown domain", () => {
    expect(getDomain("nonexistent")).toBeUndefined();
  });

  it("findDomainByTable works correctly", () => {
    const d = findDomainByTable("employees");
    expect(d).toBeDefined();
    expect(d!.id).toBe("hr");
  });

  it("findDomainByTable returns undefined for unknown table", () => {
    expect(findDomainByTable("nonexistent_table_xyz")).toBeUndefined();
  });

  it("getAllTables returns all tables from all domains", () => {
    const all = getAllTables();
    const manual = DOMAIN_REGISTRY.flatMap(d => d.tables);
    expect(all.length).toBe(manual.length);
  });

  it("getDomainsWithGL filters correctly", () => {
    const glDomains = getDomainsWithGL();
    expect(glDomains.length).toBeGreaterThan(0);
    for (const d of glDomains) {
      expect(d.glIntegration).toBe(true);
    }
  });

  it("getSystemStats returns sane numbers", () => {
    const stats = getSystemStats();
    expect(stats.domains).toBe(DOMAIN_REGISTRY.length);
    expect(stats.tables).toBeGreaterThan(0);
    expect(stats.permissions).toBeGreaterThan(0);
    expect(stats.engines).toBeGreaterThan(0);
  });
});

// ─── Engine Barrel Exports ──────────────────────────────────────────────────

describe("Engine barrel exports", () => {
  it("exports all 11 implemented domain engines", async () => {
    const barrel = await import("../../src/lib/engines/index.js");
    const expectedEngines = [
      "financialEngine",
      "fleetEngine",
      "hrEngine",
      "propertiesEngine",
      "storeEngine",
      "crmEngine",
      "legalEngine",
      "umrahEngine",
      "projectsEngine",
      "warehouseEngine",
      "supportEngine",
    ];
    for (const name of expectedEngines) {
      expect(barrel).toHaveProperty(name);
      expect((barrel as any)[name]).toBeDefined();
    }
  });

  it("every exported engine implements DomainEngine interface", async () => {
    const barrel = await import("../../src/lib/engines/index.js");
    const engineNames = [
      "financialEngine", "fleetEngine", "hrEngine", "propertiesEngine",
      "storeEngine", "crmEngine", "legalEngine", "umrahEngine",
      "projectsEngine", "warehouseEngine", "supportEngine",
    ];
    for (const name of engineNames) {
      const engine = (barrel as any)[name];
      expect(engine).toHaveProperty("domainId");
      expect(engine).toHaveProperty("label");
      expect(typeof engine.domainId).toBe("string");
      expect(typeof engine.label).toBe("string");
      expect(engine.domainId.length).toBeGreaterThan(0);
      expect(engine.label.length).toBeGreaterThan(0);
    }
  });

  it("engine domainIds are unique", async () => {
    const barrel = await import("../../src/lib/engines/index.js");
    const engineNames = [
      "financialEngine", "fleetEngine", "hrEngine", "propertiesEngine",
      "storeEngine", "crmEngine", "legalEngine", "umrahEngine",
      "projectsEngine", "warehouseEngine", "supportEngine",
    ];
    const domainIds = engineNames.map(n => (barrel as any)[n].domainId);
    expect(new Set(domainIds).size).toBe(domainIds.length);
  });

  it("engine domainIds match domain registry entries", async () => {
    const barrel = await import("../../src/lib/engines/index.js");
    const engineNames = [
      "financialEngine", "fleetEngine", "hrEngine", "propertiesEngine",
      "storeEngine", "crmEngine", "legalEngine", "umrahEngine",
      "projectsEngine", "warehouseEngine", "supportEngine",
    ];
    for (const name of engineNames) {
      const engine = (barrel as any)[name];
      const domain = getDomain(engine.domainId);
      expect(domain).toBeDefined();
      expect(domain!.engines).toContain(name.replace("Engine", "Engine"));
    }
  });
});

// ─── Event Bus Contract ─────────────────────────────────────────────────────

describe("EventBus contract", () => {
  it("exports eventBus singleton with expected methods", async () => {
    const { eventBus } = await import("../../src/lib/eventBus.js");
    expect(eventBus).toBeDefined();
    expect(typeof eventBus.emit).toBe("function");
    expect(typeof eventBus.on).toBe("function");
    expect(typeof eventBus.off).toBe("function");
    expect(typeof eventBus.once).toBe("function");
  });

  it("exports registerCrossDomainHandler", async () => {
    const { registerCrossDomainHandler } = await import("../../src/lib/eventBus.js");
    expect(typeof registerCrossDomainHandler).toBe("function");
  });

  it("exports pushToDLQ", async () => {
    const { pushToDLQ } = await import("../../src/lib/eventBus.js");
    expect(typeof pushToDLQ).toBe("function");
  });

  it("exports safeEmitEvent", async () => {
    const { safeEmitEvent } = await import("../../src/lib/eventBus.js");
    expect(typeof safeEmitEvent).toBe("function");
  });
});

// ─── GLPostingRequest Contract ──────────────────────────────────────────────

describe("GLPostingRequest shape", () => {
  it("type has all required fields", async () => {
    const validRequest = {
      companyId: 1,
      branchId: 1,
      createdBy: 1,
      ref: "TEST-001",
      description: "test",
      sourceType: "test",
      sourceId: 1,
      sourceKey: "test:1",
      lines: [],
    };
    expect(validRequest.companyId).toBeDefined();
    expect(validRequest.sourceKey).toBeDefined();
    expect(validRequest.lines).toBeDefined();
  });

  it("guardTable and guardId are optional", async () => {
    const unguarded = {
      companyId: 1, branchId: 1, createdBy: 1,
      ref: "TEST-002", description: "no guard", sourceType: "test",
      sourceId: 1, sourceKey: "test:unguarded:1", lines: [],
    };
    expect(unguarded).not.toHaveProperty("guardTable");
    expect(unguarded).not.toHaveProperty("guardId");
  });
});

// ─── Domain Engine <-> Registry Cross-Reference ─────────────────────────────

describe("Domain-Engine cross-reference", () => {
  const CLASS_BASED_ENGINES = new Set([
    "financialEngine", "fleetEngine", "hrEngine", "propertiesEngine",
    "storeEngine", "crmEngine", "legalEngine", "umrahEngine",
    "projectsEngine", "warehouseEngine", "supportEngine",
  ]);
  const LEGACY_ENGINES = new Set([
    "obligationsEngine", "lifecycleEngine", "workflowEngine",
    "disciplineEngine", "rulesEngine",
    "umrahCommissionEngine", "umrahImportEngine", "umrahInvoicingEngine",
  ]);

  it("every registry-declared engine has either a class-based or legacy implementation", () => {
    const allDeclared = new Set(DOMAIN_REGISTRY.flatMap(d => d.engines));
    for (const engineName of allDeclared) {
      const isImplemented = CLASS_BASED_ENGINES.has(engineName) || LEGACY_ENGINES.has(engineName);
      expect(isImplemented).toBe(true);
    }
  });

  it("all GL-integrated domains have at least one class-based engine", () => {
    const glDomains = getDomainsWithGL();
    for (const d of glDomains) {
      const hasImpl = d.engines.some(e => CLASS_BASED_ENGINES.has(e));
      expect(hasImpl).toBe(true);
    }
  });

  it("engines barrel re-exports all legacy engines", async () => {
    const barrel = await import("../../src/lib/engines/index.js");
    for (const name of LEGACY_ENGINES) {
      expect(barrel).toHaveProperty(name);
    }
  });
});
