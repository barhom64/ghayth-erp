import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the column-mapping presets feature: the operator re-imports the
 * same Excel layout every week, so saving the mapping per (user,
 * fileType) lets the wizard auto-apply it on file pick — zero typing
 * after the first save.
 *
 * Backend: 3 endpoints + 1 zod schema + migration 234.
 * UI: dropdown on the mapping panel + inline save form, auto-apply
 *     defaults when a default exists.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/234_umrah_import_mapping_presets.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("migration 234 — umrah_import_mapping_presets", () => {
  it("creates the table with the right columns + types", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS umrah_import_mapping_presets/);
    expect(MIGRATION).toMatch(/"companyId"\s+integer NOT NULL/);
    expect(MIGRATION).toMatch(/"userId"\s+integer NOT NULL/);
    expect(MIGRATION).toMatch(/"fileType"\s+varchar\(20\) NOT NULL CHECK \("fileType" IN \('mutamers',\s*'vouchers'\)\)/);
    expect(MIGRATION).toMatch(/mapping\s+jsonb NOT NULL/);
    expect(MIGRATION).toMatch(/"isDefault"\s+boolean NOT NULL DEFAULT false/);
  });

  it("name is unique per (company, user, fileType) — partial index on deletedAt", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS umrah_import_mapping_presets_name_uq[\s\S]{1,400}WHERE "deletedAt" IS NULL/);
  });

  it("only ONE default per (company, user, fileType) — partial unique index", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS umrah_import_mapping_presets_default_uq[\s\S]{1,400}"isDefault" = true AND "deletedAt" IS NULL/);
  });

  it("schema_pre.sql mirrors the table for the drift checker", () => {
    expect(SCHEMA).toContain('CREATE TABLE public.umrah_import_mapping_presets');
    expect(SCHEMA).toContain('"fileType" character varying(20)');
    expect(SCHEMA).toContain('mapping jsonb');
  });
});

describe("umrah route — preset CRUD", () => {
  it("zod schema rejects empty names + invalid fileTypes", () => {
    expect(ROUTE).toMatch(/presetSchema = z\.object\(/);
    expect(ROUTE).toMatch(/name:\s*z\.string\(\)\.trim\(\)\.min\(1/);
    expect(ROUTE).toMatch(/fileType:\s*z\.enum\(\["mutamers",\s*"vouchers"\]\)/);
    expect(ROUTE).toMatch(/mapping:\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)/);
  });

  it("GET /import/presets scopes by company + user, filters optionally by fileType", () => {
    expect(ROUTE).toMatch(/router\.get\("\/import\/presets"/);
    expect(ROUTE).toMatch(/WHERE "companyId" = \$1 AND "userId" = \$2[\s\S]{0,200}deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/fileType === "mutamers" \|\| fileType === "vouchers"/);
  });

  it("POST /import/presets enforces single-default via TX (clears siblings before flipping)", () => {
    expect(ROUTE).toMatch(/router\.post\("\/import\/presets"/);
    // Look for: UPDATE that sets isDefault=false on other rows for the same scope
    expect(ROUTE).toMatch(/UPDATE umrah_import_mapping_presets[\s\S]{1,300}SET\s+"isDefault" = false[\s\S]{1,300}"isDefault" = true/);
  });

  it("POST upserts on (companyId, userId, fileType, name) so re-saves overwrite", () => {
    expect(ROUTE).toMatch(/ON CONFLICT \("companyId", "userId", "fileType", name\) WHERE "deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/DO UPDATE SET mapping = EXCLUDED\.mapping/);
  });

  it("DELETE /import/presets/:id is a soft delete scoped to the owning user", () => {
    expect(ROUTE).toMatch(/router\.delete\("\/import\/presets\/:id"/);
    expect(ROUTE).toMatch(/SET\s+"deletedAt" = NOW\(\)[\s\S]{0,300}WHERE id = \$1 AND "companyId" = \$2 AND "userId" = \$3/);
  });

  it("all preset endpoints sit under umrah:list / create / delete permissions", () => {
    expect(ROUTE).toMatch(/"\/import\/presets"[\s\S]{0,140}feature:\s*"umrah",\s*action:\s*"list"/);
    expect(ROUTE).toMatch(/"\/import\/presets"[\s\S]{0,140}feature:\s*"umrah",\s*action:\s*"create"/);
    expect(ROUTE).toMatch(/"\/import\/presets\/:id"[\s\S]{0,140}feature:\s*"umrah",\s*action:\s*"delete"/);
  });
});

describe("import-wizard UI — preset picker + save form", () => {
  it("fetches presets per fileType so flipping vouchers ↔ mutamers re-queries", () => {
    expect(WIZARD).toMatch(/\["umrah-import-presets",\s*fileType\]/);
    expect(WIZARD).toMatch(/`\/umrah\/import\/presets\?fileType=\$\{fileType\}`/);
  });

  it("auto-applies the default preset on file pick — preset > built-in fallback", () => {
    expect(WIZARD).toMatch(/const defaultPreset = presets\.find\(\(p\) => p\.isDefault\)/);
    expect(WIZARD).toMatch(/const fromPreset = defaultPreset\?\.mapping\?\.\[h\]/);
    expect(WIZARD).toMatch(/const target = fromPreset \|\| forward\[h\]/);
  });

  it("dropdown lists every saved preset + marks the default with ⭐", () => {
    expect(WIZARD).toContain("قالب محفوظ:");
    expect(WIZARD).toMatch(/p\.isDefault\s*\?\s*"\s*⭐"\s*:\s*""/);
  });

  it("picking a preset re-seeds the mapping (preset wins, built-in fills the gaps)", () => {
    expect(WIZARD).toMatch(/next\[h\] = p\.mapping\[h\] \?\? forward\[h\] \?\? ""/);
  });

  it("inline save form requires a name + supports an 'افتراضي' checkbox", () => {
    expect(WIZARD).toContain("اسم القالب");
    expect(WIZARD).toContain("افتراضي");
    expect(WIZARD).toMatch(/POST[\s\S]{0,200}"\/umrah\/import\/presets"|method: "POST",\s+body: JSON\.stringify\(\{\s+name: presetName/);
  });

  it("save action passes the FULL current columnMapping (not just unmapped overrides)", () => {
    expect(WIZARD).toMatch(/mapping:\s*columnMapping/);
  });

  it("re-fetches the presets list after a successful save so the dropdown updates", () => {
    expect(WIZARD).toMatch(/presetsQ\.refetch\?\.\(\)/);
  });
});
