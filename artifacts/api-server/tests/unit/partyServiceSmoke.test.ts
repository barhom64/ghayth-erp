import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PARTY_SOURCES } from "../../src/lib/partyService.js";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SERVICE = read("lib/partyService.ts");
const MIGRATION = read("migrations/249_party_model.sql");
// P3 — domain mounts moved to _domain-mounts.ts.
const INDEX = read("routes/index.ts") + "\n" + read("routes/_domain-mounts.ts");

describe("party model — migration 249", () => {
  it("creates both registry tables", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS parties/);
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS party_links/);
  });
  it("has the national-id dedup unique index", () => {
    expect(MIGRATION).toMatch(/UNIQUE INDEX[\s\S]*parties[\s\S]*"companyId", "nationalId"[\s\S]*WHERE "nationalId" IS NOT NULL/);
  });
  it("links are unique per entity row", () => {
    expect(MIGRATION).toMatch(/UNIQUE \("companyId", "entityTable", "entityId"\)/);
  });
  it("is additive only (no ALTER of existing tables; DROPs only target party tables)", () => {
    expect(MIGRATION).not.toMatch(/\bALTER TABLE\b/i);
    const drops = MIGRATION.match(/DROP TABLE IF EXISTS (\w+)/gi) ?? [];
    for (const d of drops) expect(d).toMatch(/part(y|ies)/i);
  });
});

describe("party model — source mapping", () => {
  const expected = [
    "employees", "clients", "suppliers", "umrah_agents", "umrah_sub_agents",
    "umrah_pilgrims", "property_owners", "fleet_drivers", "tenants",
  ];
  it("covers all 9 person-like silo tables", () => {
    expect(PARTY_SOURCES.map((s) => s.table).sort()).toEqual([...expected].sort());
  });
  it("every source has a name column + role", () => {
    for (const s of PARTY_SOURCES) {
      expect(s.nameCol).toBeTruthy();
      expect(s.role).toBeTruthy();
    }
  });
  it("national-id sources are the ones with a known id column", () => {
    const withNatId = PARTY_SOURCES.filter((s) => s.natIdCol).map((s) => s.table).sort();
    expect(withNatId).toEqual(["employees", "property_owners", "tenants", "umrah_pilgrims"].sort());
  });
});

describe("party model — service + wiring", () => {
  it("exports the core operations", () => {
    for (const fn of ["upsertParty", "linkEntity", "registerEntityParty", "getParty360", "backfillCompany"]) {
      expect(SERVICE).toContain(`export async function ${fn}`);
    }
  });
  it("dedups by nationalId then phone", () => {
    expect(SERVICE).toMatch(/WHERE "companyId"=\$1 AND "nationalId"=\$2/);
    expect(SERVICE).toMatch(/"nationalId" IS NULL AND phone=\$2/);
  });
  it("backfill skips already-linked rows (idempotent)", () => {
    expect(SERVICE).toMatch(/NOT EXISTS[\s\S]*party_links/);
  });
  it("/parties router is mounted", () => {
    expect(INDEX).toContain('import partiesRouter from "./parties.js"');
    expect(INDEX).toMatch(/router\.use\("\/parties", partiesRouter\)/);
  });
});
