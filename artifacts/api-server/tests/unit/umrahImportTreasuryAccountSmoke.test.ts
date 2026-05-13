import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins gaps #2 + #3 from docs/umrah-import-gaps-fix-plan.md:
 *
 *   #2 — ImportScope carries treasuryId (cash box) so the AP JE the engine
 *        posts is tied to the cash box that will fund the supplier payment.
 *   #3 — ImportScope carries purchaseAccountCode so the operator can
 *        override the umrah-nusk-cost DR account per-batch.
 *
 * Also pins the rewiring of POST /umrah/import/vouchers from the legacy
 * `doImport` (which only wrote to umrah_pilgrims) to the engine's
 * `confirmVouchersImport` (which actually creates umrah_nusk_invoices +
 * posts the AP JE).
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/171_umrah_nusk_invoices_treasury.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);

describe("umrahImportEngine — ImportScope cash-box + account override (gaps #2 + #3)", () => {
  it("ImportScope declares treasuryId as optional integer-or-null", () => {
    expect(ENGINE).toMatch(/treasuryId\?:\s*number\s*\|\s*null/);
  });

  it("ImportScope declares purchaseAccountCode as optional string-or-null", () => {
    expect(ENGINE).toMatch(/purchaseAccountCode\?:\s*string\s*\|\s*null/);
  });

  it("postNuskJournalEntries prefers scope.purchaseAccountCode over the mapping default", () => {
    // The override path must run BEFORE the mapping lookup so operator
    // intent always wins, falling back to mapping only when unset.
    expect(ENGINE).toMatch(/scope\.purchaseAccountCode\s*[\r\n]?\s*\|\|\s*await getAccountCodeFromMapping/);
  });

  it("INSERT into umrah_nusk_invoices threads scope.treasuryId into the row", () => {
    // The column appears in the column list AND in the values bound to a
    // placeholder. Without both, the value would either be silently
    // dropped or shifted to the wrong column.
    expect(ENGINE).toMatch(/"treasuryId","createdBy"/);
    expect(ENGINE).toMatch(/scope\.treasuryId\s*\?\?\s*null,\s*[\r\n]?\s*scope\.userId/);
  });
});

describe("umrah route — /import/vouchers now wires through the engine", () => {
  it("imports confirmVouchersImport from the engine", () => {
    expect(ROUTE).toMatch(/import \{ confirmVouchersImport \}/);
  });

  it("importVouchersSchema accepts optional treasuryId + purchaseAccountCode", () => {
    expect(ROUTE).toMatch(/treasuryId:\s*z\.coerce\.number\(\)/);
    expect(ROUTE).toMatch(/purchaseAccountCode:\s*z\.string\(\)/);
  });

  it("importVouchersSchema accepts fileName so the UI's name is preserved on the batch row", () => {
    expect(ROUTE).toMatch(/fileName:\s*z\.string\(\)\.trim\(\)\.optional\(\)/);
  });

  it("the handler enriches the scope with both override fields", () => {
    expect(ROUTE).toContain("treasuryId: treasuryId ?? null,");
    expect(ROUTE).toContain("purchaseAccountCode: purchaseAccountCode ?? null,");
  });

  it("the handler calls confirmVouchersImport (NOT doImport) for vouchers", () => {
    expect(ROUTE).toMatch(/await confirmVouchersImport\(importScope,\s*importRows,\s*fileName/);
    // Regression guard: previously this route routed vouchers through
    // doImport (which writes to umrah_pilgrims, dropping NUSK data).
    expect(ROUTE).not.toMatch(/import\/vouchers"[\s\S]{1,600}await doImport\([^,]+,\s*\{\s*seasonId,\s*rows: importRows,\s*fileType: "vouchers"/);
  });

  it("guards against writes on closed seasons before invoking the engine", () => {
    expect(ROUTE).toMatch(/import\/vouchers"[\s\S]{1,400}await requireOpenSeason/);
  });
});

describe("migration 171 — adds treasuryId column + soft index", () => {
  it("adds the column with IF NOT EXISTS so re-runs are safe", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "treasuryId" integer/);
  });

  it("creates a partial index keyed on (treasuryId) WHERE deletedAt IS NULL", () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_treasury/);
    expect(MIGRATION).toMatch(/WHERE "deletedAt" IS NULL/);
  });

  it("documents the column via COMMENT ON so DBAs see the semantics", () => {
    expect(MIGRATION).toMatch(/COMMENT ON COLUMN umrah_nusk_invoices\."treasuryId"/);
  });
});

describe("schema mirror — drift checker stays clean", () => {
  it("schema_pre.sql exposes the new treasuryId column on umrah_nusk_invoices", () => {
    // The drift audit greps quoted identifiers in raw SQL against
    // schema_pre.sql. Without this mirror the new INSERT would trip the
    // guard.
    const tableBlock = SCHEMA.split(/CREATE TABLE public\.umrah_nusk_invoices\s*\(/)[1] ?? "";
    expect(tableBlock).toContain('"treasuryId" integer');
  });
});
