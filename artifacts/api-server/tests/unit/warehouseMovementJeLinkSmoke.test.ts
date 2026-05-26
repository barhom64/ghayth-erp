import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// warehouse_movements ↔ journal_entries linkage — audit follow-up
// to the COGS campaign (#1002 / #1013 / #1017). Verifies that:
//   1. migration 211 adds warehouse_movements.journalEntryId (nullable,
//      no FK — soft pointer pattern matching invoices.journalEntryId),
//   2. applyStockMovements / applyStockReversals accept the JE id and
//      include it in their INSERTs,
//   3. invoice-approve wiring passes the post result's journalId,
//   4. credit-memo wiring retroactively stamps the JE id (since
//      applyStockReversals runs BEFORE the JE post),
//   5. schema_pre.sql declares the column.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/211_warehouse_movements_je_link.sql"),
  "utf8"
);
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/inventory/cogsPosting.ts"),
  "utf8"
);
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(join(REPO_ROOT, "db/schema_pre.sql"), "utf8");

// Isolate the two handlers we modified.
const APPROVE_START = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/approve"');
const APPROVE_END = ROUTE.indexOf("// ─────────────────────────────────────────────────────────────────────────────\n// POSTING PREVIEW", APPROVE_START);
const APPROVE = ROUTE.slice(APPROVE_START, APPROVE_END);

const MEMO_START = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/credit-memo"');
const MEMO_END = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/debit-memo"', MEMO_START);
const MEMO = ROUTE.slice(MEMO_START, MEMO_END);

// ── Migration 211 ──────────────────────────────────────────────────────────

describe("migration 211 — warehouse_movements.journalEntryId", () => {
  it("adds the column idempotently", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.warehouse_movements\s+ADD COLUMN IF NOT EXISTS "journalEntryId" integer/);
  });
  it("declares partial index on (companyId, journalEntryId WHERE not null)", () => {
    expect(MIGRATION).toContain("idx_warehouse_movements_je");
    expect(MIGRATION).toMatch(/WHERE "journalEntryId" IS NOT NULL/);
  });
  it("declares @rollback hints", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
    expect(MIGRATION).toMatch(/DROP COLUMN "journalEntryId"/);
  });
  it("documents why no FK (soft pointer like invoices.journalEntryId)", () => {
    expect(MIGRATION).toMatch(/No FK|soft pointer/i);
  });
});

describe("schema_pre.sql declares warehouse_movements.journalEntryId", () => {
  it("column listed in the warehouse_movements DDL", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.warehouse_movements ");
    const section = SCHEMA_PRE.slice(idx, idx + 2000);
    expect(section).toContain('"journalEntryId"');
  });
});

// ── Helper signatures ───────────────────────────────────────────────────────

describe("applyStockMovements + applyStockReversals accept journalEntryId", () => {
  it("applyStockMovements declares journalEntryId optional param", () => {
    expect(HELPER).toMatch(/applyStockMovements[\s\S]{0,800}journalEntryId\?: number/);
  });
  it("applyStockReversals declares journalEntryId optional param", () => {
    expect(HELPER).toMatch(/applyStockReversals[\s\S]{0,800}journalEntryId\?: number/);
  });
  it("INSERT (out path) includes journalEntryId column + bind", () => {
    expect(HELPER).toMatch(/INSERT INTO warehouse_movements[\s\S]{0,400}"journalEntryId"[\s\S]{0,400}'out'[\s\S]{0,200}journalEntryId \?\? null/);
  });
  it("INSERT (return path) includes journalEntryId column + bind", () => {
    expect(HELPER).toMatch(/INSERT INTO warehouse_movements[\s\S]{0,400}"journalEntryId"[\s\S]{0,400}'return'[\s\S]{0,200}journalEntryId \?\? null/);
  });
});

// ── Route wiring ───────────────────────────────────────────────────────────

describe("invoice-approve passes journalId to applyStockMovements", () => {
  it("call site includes journalId after createdBy", () => {
    expect(APPROVE).toMatch(/applyStockMovements\([\s\S]{0,300}scope\.activeAssignmentId \?\? 0,\s+journalId,/);
  });
});

describe("credit-memo retro-stamps journalEntryId on the warehouse_movements rows", () => {
  it("UPDATE warehouse_movements SET journalEntryId WHERE reference matches CM-{memoId}", () => {
    expect(MEMO).toMatch(/UPDATE warehouse_movements\s+SET "journalEntryId" = \$1/);
    expect(MEMO).toMatch(/reference = \$3/);
    expect(MEMO).toMatch(/type = 'return'/);
    expect(MEMO).toMatch(/"journalEntryId" IS NULL/);
  });
  it("UPDATE only runs when there are reversal lineUpdates (skips service-only memos)", () => {
    expect(MEMO).toMatch(/cogsReversalPlan\.lineUpdates\.length > 0[\s\S]{0,400}UPDATE warehouse_movements\s+SET "journalEntryId"/);
  });
  it("retroactive UPDATE happens INSIDE withTransaction (atomic with JE post)", () => {
    // The retro-UPDATE must precede the LAST `});` of withTransaction
    // (lastIndexOf — nested `});` blocks appear above it).
    const txnEnd = MEMO.lastIndexOf("    });");
    const updIdx = MEMO.indexOf('UPDATE warehouse_movements\n                SET "journalEntryId"');
    expect(updIdx).toBeGreaterThan(-1);
    expect(updIdx).toBeLessThan(txnEnd);
  });
});
