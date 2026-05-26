import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const BIZ = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/businessHelpers.ts"),
  "utf8"
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/201_journal_lines_dimensional_completion.sql"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(
  join(REPO_ROOT, "db/schema_pre.sql"),
  "utf8"
);

// ─── Finance Line-Level Allocation — Phase 2 P0 ─────────────────────────────
// journal_lines + financialEngine carry the full dimensional payload
// so per-vehicle / per-property / per-project / per-season reports
// can be computed directly from journal_lines (the GL is the source
// of analytical truth, not the source documents).

describe("journal_lines dimensional schema (migration 201)", () => {
  const NEW_COLUMNS = [
    "costCenterId", "unitId", "assetId",
    "umrahSeasonId", "umrahAgentId",
    "sourceLineTable", "sourceLineId", "dimensionJson",
  ];

  for (const col of NEW_COLUMNS) {
    it(`migration adds journal_lines.${col}`, () => {
      expect(MIGRATION).toContain(`"${col}"`);
    });
    it(`schema_pre.sql declares journal_lines.${col}`, () => {
      const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.journal_lines");
      const section = SCHEMA_PRE.slice(idx, idx + 2000);
      expect(section).toContain(`"${col}"`);
    });
  }

  it("migration creates source-line back-pointer index", () => {
    expect(MIGRATION).toContain("idx_journal_lines_source_line");
    expect(MIGRATION).toContain('"sourceLineTable", "sourceLineId"');
    expect(MIGRATION).toContain('WHERE "sourceLineTable" IS NOT NULL');
  });

  it("migration creates per-dimension aggregation indexes", () => {
    expect(MIGRATION).toContain("idx_journal_lines_dim_vehicle");
    expect(MIGRATION).toContain("idx_journal_lines_dim_property");
    expect(MIGRATION).toContain("idx_journal_lines_dim_project");
  });
});

describe("JournalEntryLine interface carries new dimensional fields", () => {
  const NEW_FIELDS = [
    "costCenterId", "unitId", "assetId",
    "umrahSeasonId", "umrahAgentId",
    "sourceLineTable", "sourceLineId", "dimensionJson",
  ];

  it("JournalEntryLine interface exists", () => {
    expect(BIZ).toContain("export interface JournalEntryLine {");
  });

  for (const field of NEW_FIELDS) {
    it(`JournalEntryLine has optional ${field}`, () => {
      const ifaceIdx = BIZ.indexOf("export interface JournalEntryLine {");
      const ifaceEnd = BIZ.indexOf("}", ifaceIdx);
      const iface = BIZ.slice(ifaceIdx, ifaceEnd);
      // optional means `field?:`
      expect(iface).toMatch(new RegExp(`\\b${field}\\?:`));
    });
  }
});

describe("createJournalEntry INSERT writes new dimensional columns", () => {
  it("INSERT statement includes all 8 new column names", () => {
    const insertIdx = BIZ.indexOf("INSERT INTO journal_lines");
    const section = BIZ.slice(insertIdx, insertIdx + 1500);
    expect(section).toContain('"costCenterId"');
    expect(section).toContain('"unitId"');
    expect(section).toContain('"assetId"');
    expect(section).toContain('"umrahSeasonId"');
    expect(section).toContain('"umrahAgentId"');
    expect(section).toContain('"sourceLineTable"');
    expect(section).toContain('"sourceLineId"');
    expect(section).toContain('"dimensionJson"');
  });

  it("INSERT also includes previously-missing dimension columns (productId, clientId, vendorId, driverId)", () => {
    const insertIdx = BIZ.indexOf("INSERT INTO journal_lines");
    const section = BIZ.slice(insertIdx, insertIdx + 1500);
    expect(section).toContain('"productId"');
    expect(section).toContain('"clientId"');
    expect(section).toContain('"vendorId"');
    expect(section).toContain('"driverId"');
  });

  it("dimensionJson is JSON.stringify'd before insert (jsonb column)", () => {
    expect(BIZ).toContain("line.dimensionJson ? JSON.stringify(line.dimensionJson) : null");
  });

  it("placeholder count covers 27 columns", () => {
    const insertIdx = BIZ.indexOf("INSERT INTO journal_lines");
    const section = BIZ.slice(insertIdx, insertIdx + 1500);
    // The VALUES clause lists $1..$27. The highest placeholder must be $27.
    expect(section).toContain("$27");
    // and not $28+ (would mean we added too many)
    expect(section).not.toMatch(/\$\b(28|29|30)\b/);
  });
});
