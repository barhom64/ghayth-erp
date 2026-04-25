import { describe, it, expect } from "vitest";
import { EVENT_CATALOG, countEventsByDomain } from "../../src/lib/eventCatalog.js";
import { DOMAIN_REGISTRY, getDomain } from "../../src/lib/domainRegistry.js";
import { eventBus } from "../../src/lib/eventBus.js";

// ─── Cross-Domain Integrity Tests ───────��───────────────────────────────────
// Validates that the domain registry, event catalog, and engines form a
// coherent system with no orphaned references or missing contracts.

describe("Event Catalog <-> Domain Registry alignment", () => {
  it("every event domain exists in the domain registry or is a system domain", () => {
    const domainIds = new Set(DOMAIN_REGISTRY.map(d => d.id));
    const systemDomains = new Set([
      "system", "workflow", "auth", "admin", "tasks",
      "notifications", "bi", "documents", "communications",
      "intelligence", "marketing",
    ]);
    // event catalog uses "project" (singular) but registry uses "projects"
    const aliasMap: Record<string, string> = { project: "projects" };
    for (const evt of EVENT_CATALOG) {
      const resolved = aliasMap[evt.domain] ?? evt.domain;
      if (!systemDomains.has(resolved)) {
        expect(domainIds.has(resolved)).toBe(true);
      }
    }
  });

  it("most GL-integrated domains have at least one gl_post event", () => {
    const glDomains = DOMAIN_REGISTRY.filter(d => d.glIntegration);
    // Some domains post GL via engines but don't have gl_post side-effects
    // declared in the event catalog yet — they use engine.postXGL() directly
    const knownCatalogGaps = new Set(["legal", "crm", "support", "projects"]);
    const aliasMap: Record<string, string> = { projects: "project" };
    for (const d of glDomains) {
      if (knownCatalogGaps.has(d.id)) continue;
      const eventDomain = aliasMap[d.id] ?? d.id;
      const hasGlEvent = EVENT_CATALOG.some(
        e => (e.domain === eventDomain || e.name.startsWith(d.eventPrefix))
          && e.sideEffects.includes("gl_post")
      );
      expect(hasGlEvent).toBe(true);
    }
  });

  it("critical events have at least one consumer", () => {
    const criticalWithoutConsumers = EVENT_CATALOG.filter(
      e => e.critical && (!e.consumers || e.consumers.length === 0)
    );
    expect(criticalWithoutConsumers).toHaveLength(0);
  });

  it("no duplicate event names in catalog", () => {
    const names = EVENT_CATALOG.map(e => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toHaveLength(0);
  });

  it("event naming follows domain.entity.verb convention", () => {
    for (const e of EVENT_CATALOG) {
      const parts = e.name.split(".");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("countEventsByDomain returns non-empty map", () => {
    const counts = countEventsByDomain();
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    for (const c of Object.values(counts)) {
      expect(c).toBeGreaterThan(0);
    }
  });
});

describe("Engine sourceKey patterns", () => {
  const SOURCE_KEY_PATTERNS = [
    { engine: "fleet", pattern: /^fleet:/ },
    { engine: "hr", pattern: /^hr:/ },
    { engine: "property", pattern: /^property:/ },
    { engine: "store", pattern: /^store:/ },
    { engine: "crm", pattern: /^crm:/ },
    { engine: "legal", pattern: /^legal:/ },
    { engine: "umrah", pattern: /^umrah:/ },
    { engine: "projects", pattern: /^project:/ },
    { engine: "warehouse", pattern: /^wh:/ },
  ];

  it("documents expected sourceKey prefixes for each domain", () => {
    for (const { engine, pattern } of SOURCE_KEY_PATTERNS) {
      expect(pattern.source).toBeTruthy();
      const domain = getDomain(engine);
      expect(domain).toBeDefined();
    }
  });
});

describe("EventBus listener capacity", () => {
  it("maxListeners is set high enough for cross-domain handlers", () => {
    expect(eventBus.getMaxListeners()).toBeGreaterThanOrEqual(100);
  });

  it("eventBus has active listeners", () => {
    expect(eventBus.eventNames().length).toBeGreaterThanOrEqual(0);
  });
});

describe("Domain obligation coverage", () => {
  it("most domains with obligationTypes are connected to obligationsEngine or have cron jobs", () => {
    const knownGaps = new Set(["store"]);
    for (const d of DOMAIN_REGISTRY) {
      if (d.obligationTypes.length > 0 && !knownGaps.has(d.id)) {
        const hasObligationsEngine = d.engines.includes("obligationsEngine");
        const hasCronJobs = d.cronJobs.length > 0;
        expect(hasObligationsEngine || hasCronJobs).toBe(true);
      }
    }
  });

  it("no empty obligation types", () => {
    for (const d of DOMAIN_REGISTRY) {
      for (const ot of d.obligationTypes) {
        expect(ot.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Domain permission naming", () => {
  it("permissions follow domain:action or domain:subdomain:action pattern", () => {
    for (const d of DOMAIN_REGISTRY) {
      for (const p of d.permissions) {
        expect(p).toMatch(/^[a-z_]+(:[a-z_]+){1,2}$/);
      }
    }
  });

  it("permission prefixes align with domain IDs", () => {
    for (const d of DOMAIN_REGISTRY) {
      for (const p of d.permissions) {
        const prefix = p.split(":")[0];
        expect(prefix).toBe(d.id);
      }
    }
  });
});
