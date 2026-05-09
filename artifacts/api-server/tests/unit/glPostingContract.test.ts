import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DOMAIN_REGISTRY } from "../../src/lib/domainRegistry.js";

const ENGINES_DIR = join(import.meta.dirname!, "../../src/lib/engines");

const engineFiles = readdirSync(ENGINES_DIR).filter(
  (f) => f.endsWith("Engine.ts") && f !== "domainEngineBase.ts"
);

const engineSources = engineFiles.map((f) => ({
  name: f,
  source: readFileSync(join(ENGINES_DIR, f), "utf8"),
}));

describe("GLPostingRequest contract", () => {
  const baseSrc = readFileSync(join(ENGINES_DIR, "domainEngineBase.ts"), "utf8");

  it("defines GLPostingRequest with required fields", () => {
    const requiredFields = [
      "companyId",
      "branchId",
      "createdBy",
      "ref",
      "description",
      "sourceType",
      "sourceId",
      "sourceKey",
      "lines",
    ];
    for (const field of requiredFields) {
      expect(baseSrc, `Missing field: ${field}`).toContain(field);
    }
  });

  it("defines DomainEngine interface", () => {
    expect(baseSrc).toContain("export interface DomainEngine");
    expect(baseSrc).toContain("domainId");
    expect(baseSrc).toContain("label");
  });
});

describe("GL posting method consistency", () => {
  for (const { name, source } of engineSources) {
    const glMethods = [...source.matchAll(/async (post\w+GL)\(/g)].map(
      (m) => m[1]
    );

    if (glMethods.length === 0) continue;

    describe(name, () => {
      it("has at least one GL posting method", () => {
        expect(glMethods.length).toBeGreaterThanOrEqual(1);
      });

      it("all GL methods call financialEngine.postJournalEntry", () => {
        for (const method of glMethods) {
          expect(
            source,
            `${name}:${method} should call financialEngine.postJournalEntry`
          ).toContain("financialEngine.postJournalEntry");
        }
      });

      it("imports financialEngine", () => {
        expect(source).toContain("financialEngine");
      });
    });
  }
});

describe("SourceKey naming convention", () => {
  const allSourceKeys: { engine: string; key: string }[] = [];

  for (const { name, source } of engineSources) {
    const matches = [...source.matchAll(/sourceKey:\s*`([^`]+)`/g)];
    for (const m of matches) {
      allSourceKeys.push({ engine: name, key: m[1] });
    }
  }

  it("at least 20 sourceKeys defined across engines", () => {
    expect(allSourceKeys.length).toBeGreaterThanOrEqual(20);
  });

  it("all sourceKeys use domain:entity:id pattern", () => {
    const invalid: string[] = [];
    for (const { engine, key } of allSourceKeys) {
      const staticPart = key.replace(/\$\{[^}]+\}/g, "ID");
      if (!/^[a-z_]+:[a-z_]+:.+$/.test(staticPart)) {
        invalid.push(`${engine}: ${key}`);
      }
    }
    expect(
      invalid,
      `SourceKeys not matching domain:entity:id: ${invalid.join(", ")}`
    ).toEqual([]);
  });

  it("sourceKey domain prefixes match engine domainId", () => {
    const domainMap: Record<string, string> = {
      "hrEngine.ts": "hr",
      "fleetEngine.ts": "fleet",
      "propertiesEngine.ts": "property",
      "legalEngine.ts": "legal",
      "crmEngine.ts": "crm",
      "projectsEngine.ts": "project",
      "warehouseEngine.ts": "warehouse",
      "supportEngine.ts": "support",
      "storeEngine.ts": "store",
      "umrahEngine.ts": "umrah",
    };

    const mismatches: string[] = [];
    for (const { engine, key } of allSourceKeys) {
      const expectedDomain = domainMap[engine];
      if (!expectedDomain) continue;
      const keyDomain = key.split(":")[0];
      if (keyDomain !== expectedDomain) {
        mismatches.push(`${engine}: ${key} (expected prefix "${expectedDomain}")`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("no duplicate sourceKey templates (across different engines)", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const { engine, key } of allSourceKeys) {
      const prev = seen.get(key);
      if (prev && prev !== engine) dupes.push(`${key} in ${prev} and ${engine}`);
      seen.set(key, engine);
    }
    expect(dupes).toEqual([]);
  });
});

describe("GLPostingResult usage", () => {
  for (const { name, source } of engineSources) {
    if (!source.includes("GLPostingResult")) continue;

    it(`${name} returns GLPostingResult from GL methods`, () => {
      expect(source).toContain("GLPostingResult");
    });
  }
});

describe("GL-integrated domains have engine GL methods", () => {
  const glDomains = DOMAIN_REGISTRY.filter((d) => d.glIntegration);
  const engineWithGL = new Set<string>();

  for (const { name, source } of engineSources) {
    if (/async post\w+GL\(/.test(source) || /async postJournalEntry\(/.test(source)) {
      engineWithGL.add(name);
    }
  }

  const knownGaps = new Set(["governance", "training", "recruitment"]);

  for (const domain of glDomains) {
    if (knownGaps.has(domain.id)) continue;

    it(`${domain.id} domain has an engine with GL methods`, () => {
      const expectedEngines = domain.engines
        .filter((e) => e.endsWith("Engine"))
        .map((e) => `${e}.ts`);

      const hasGL = expectedEngines.some((e) => engineWithGL.has(e));
      expect(
        hasGL,
        `${domain.id}: none of [${expectedEngines.join(", ")}] have GL methods`
      ).toBe(true);
    });
  }
});
