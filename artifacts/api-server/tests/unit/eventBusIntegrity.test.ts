import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENT_CATALOG, type EventDefinition } from "../../src/lib/eventCatalog.js";
import { DOMAIN_REGISTRY } from "../../src/lib/domainRegistry.js";

const API_SRC = join(import.meta.dirname!, "../../src");

describe("EventBus type definition", () => {
  const eventBusSource = readFileSync(join(API_SRC, "lib/eventBus.ts"), "utf8");

  it("exports eventBus singleton", () => {
    expect(eventBusSource).toContain("export const eventBus");
  });

  it("sets high max listeners to avoid memory leak warnings", () => {
    expect(eventBusSource).toMatch(/setMaxListeners\(\d+\)/);
    const match = eventBusSource.match(/setMaxListeners\((\d+)\)/);
    expect(Number(match![1])).toBeGreaterThanOrEqual(100);
  });

  it("exports registerCrossDomainHandler", () => {
    expect(eventBusSource).toContain(
      "export function registerCrossDomainHandler"
    );
  });

  it("exports pushToDLQ for dead-letter queue", () => {
    expect(eventBusSource).toContain("export function pushToDLQ");
  });

  it("exports safeEmitEvent wrapper", () => {
    expect(eventBusSource).toContain("export function safeEmitEvent");
  });

  it("DLQ flush inserts into event_dlq table", () => {
    expect(eventBusSource).toContain("INSERT INTO event_dlq");
  });
});

describe("Event catalog completeness", () => {
  it("has at least 100 events declared", () => {
    expect(EVENT_CATALOG.length).toBeGreaterThan(100);
  });

  it("no duplicate event names", () => {
    const names = EVENT_CATALOG.map((e) => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `Duplicate events: ${dupes.join(", ")}`).toEqual([]);
  });

  it("all events use dot-separated lowercase segments", () => {
    const invalid: string[] = [];
    for (const e of EVENT_CATALOG) {
      if (!/^[a-z_]+(\.[a-z_]+){1,3}$/.test(e.name)) {
        invalid.push(e.name);
      }
    }
    expect(
      invalid,
      `Events with invalid naming: ${invalid.join(", ")}`
    ).toEqual([]);
  });

  it("every event has a non-empty label", () => {
    const empty = EVENT_CATALOG.filter((e) => !e.label || e.label.trim() === "");
    expect(empty.map((e) => e.name)).toEqual([]);
  });

  it("every event has a non-empty description", () => {
    const empty = EVENT_CATALOG.filter(
      (e) => !e.description || e.description.trim() === ""
    );
    expect(empty.map((e) => e.name)).toEqual([]);
  });

  it("every event declares at least one payload field", () => {
    const empty = EVENT_CATALOG.filter(
      (e) => !e.payload || Object.keys(e.payload).length === 0
    );
    expect(empty.map((e) => e.name)).toEqual([]);
  });

  it("critical events have at least one consumer", () => {
    const unhandled = EVENT_CATALOG.filter(
      (e) => e.critical && (!e.consumers || e.consumers.length === 0)
    );
    expect(
      unhandled.map((e) => e.name),
      "Critical events without consumers"
    ).toEqual([]);
  });
});

describe("Event catalog ↔ domain registry alignment", () => {
  const domainAlias: Record<string, string> = {
    project: "projects",
  };

  const catalogDomains = new Set(
    EVENT_CATALOG.map((e) => {
      const raw = e.domain;
      return domainAlias[raw] ?? raw;
    })
  );

  const registryIds = new Set(DOMAIN_REGISTRY.map((d) => d.id));

  it("GL-integrated domains have at least one gl_post event", () => {
    const glDomains = DOMAIN_REGISTRY.filter((d) => d.glIntegration);
    const knownCatalogGaps = new Set([
      "legal",
      "crm",
      "support",
      "projects",
    ]);

    const missing: string[] = [];
    for (const domain of glDomains) {
      if (knownCatalogGaps.has(domain.id)) continue;
      const prefix = domain.eventPrefix;
      const hasGLEvent = EVENT_CATALOG.some(
        (e) =>
          e.name.startsWith(prefix) &&
          e.sideEffects.includes("gl_post")
      );
      if (!hasGLEvent) missing.push(domain.id);
    }
    expect(
      missing,
      `GL domains without gl_post events: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every event domain prefix maps to a domain registry entry (with aliases)", () => {
    const unmapped: string[] = [];
    const systemDomains = new Set([
      "workflow",
      "system",
      "auth",
      "admin",
      "marketing",
      "documents",
      "communications",
      "intelligence",
      "recruitment",
      "tasks",
      "notifications",
      "bi",
    ]);

    for (const domain of catalogDomains) {
      if (systemDomains.has(domain)) continue;
      if (!registryIds.has(domain)) {
        unmapped.push(domain);
      }
    }
    expect(
      unmapped,
      `Event domains not in registry: ${unmapped.join(", ")}`
    ).toEqual([]);
  });
});

describe("Cross-domain handler registration pattern", () => {
  it("registerCrossDomainHandler is used in at least one engine", () => {
    const enginesDir = join(API_SRC, "lib/engines");
    const { readdirSync } = require("node:fs");
    const engineFiles = readdirSync(enginesDir).filter((f: string) =>
      f.endsWith(".ts")
    );
    let usages = 0;
    for (const file of engineFiles) {
      const source = readFileSync(join(enginesDir, file), "utf8");
      if (source.includes("registerCrossDomainHandler")) usages++;
    }
    expect(usages).toBeGreaterThanOrEqual(1);
  });
});
