import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DOMAIN_REGISTRY } from "../../src/lib/domainRegistry.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SCRIPTS_DIR = join(REPO_ROOT, "scripts/src");

describe("Audit scripts existence", () => {
  const scripts = [
    "audit-routes.mjs",
    "audit-schema-drift.mjs",
    "audit-domain-boundaries.mjs",
    "audit-domain-routes.mjs",
    "lint-patterns.mjs",
  ];

  for (const script of scripts) {
    it(`${script} exists`, () => {
      expect(existsSync(join(SCRIPTS_DIR, script))).toBe(true);
    });
  }
});

describe("Domain boundary audit coverage", () => {
  const boundaryScript = readFileSync(
    join(SCRIPTS_DIR, "audit-domain-boundaries.mjs"),
    "utf8"
  );

  it("checks INSERT INTO pattern", () => {
    expect(boundaryScript).toContain("INSERT\\s+INTO");
  });

  it("checks UPDATE SET pattern", () => {
    expect(boundaryScript).toContain("UPDATE\\s+");
  });

  it("checks DELETE FROM pattern", () => {
    expect(boundaryScript).toContain("DELETE\\s+FROM");
  });

  it("scans routes directory", () => {
    expect(boundaryScript).toContain("routes");
  });

  it("maps each core domain route to its domain", () => {
    const requiredDomains = ["hr", "fleet", "warehouse", "legal", "crm", "properties", "projects", "umrah", "support", "store"];
    for (const domain of requiredDomains) {
      expect(
        boundaryScript,
        `Missing domain mapping: ${domain}`
      ).toContain(`"${domain}"`);
    }
  });
});

describe("Schema drift audit structure", () => {
  const schemaDrift = readFileSync(
    join(SCRIPTS_DIR, "audit-schema-drift.mjs"),
    "utf8"
  );

  it("reads the database schema SQL file", () => {
    expect(schemaDrift).toMatch(/schema\.sql|dump.*schema/i);
  });

  it("scans for rawQuery templates", () => {
    expect(schemaDrift).toContain("rawQuery");
  });

  it("exits 1 on drift detection", () => {
    expect(schemaDrift).toContain("process.exit(1)");
  });
});

describe("Route audit structure", () => {
  const routeAudit = readFileSync(
    join(SCRIPTS_DIR, "audit-routes.mjs"),
    "utf8"
  );

  it("scans page files for route mounting", () => {
    expect(routeAudit).toMatch(/pages|routes/);
  });

  it("exits 1 when orphan pages found", () => {
    expect(routeAudit).toContain("process.exit(1)");
  });
});

describe("Domain route audit structure", () => {
  const domainRouteAudit = readFileSync(
    join(SCRIPTS_DIR, "audit-domain-routes.mjs"),
    "utf8"
  );

  it("parses DOMAIN_REGISTRY", () => {
    expect(domainRouteAudit).toContain("DOMAIN_REGISTRY");
  });

  it("checks routes/index.ts for imports", () => {
    expect(domainRouteAudit).toContain("routes/index.ts");
  });

  it("exits 1 on missing mountings", () => {
    expect(domainRouteAudit).toContain("process.exit(1)");
  });
});

describe("Domain registry ↔ boundary audit table coverage", () => {
  const boundaryScript = readFileSync(
    join(SCRIPTS_DIR, "audit-domain-boundaries.mjs"),
    "utf8"
  );

  it("boundary audit monitors tables from core domains", () => {
    const coreRegistryTables = DOMAIN_REGISTRY.filter((d) =>
      ["hr", "finance", "fleet", "warehouse", "legal", "crm", "support", "store"].includes(d.id)
    ).flatMap((d) => d.tables);

    const coveredCount = coreRegistryTables.filter((t) =>
      boundaryScript.includes(`"${t}"`)
    ).length;

    expect(
      coveredCount,
      "Boundary audit should cover a significant portion of domain tables"
    ).toBeGreaterThan(10);
  });
});
