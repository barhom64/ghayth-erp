import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah_penalties → journal_entries traceability link.
 *
 * Before this PR umrahEngine.postPenaltyGL() called postJournalEntry()
 * and threw away the returned journalId. The GL had the entry
 * (sourceType='umrah_penalty', sourceId=penalty.id) but the penalty
 * row had no inverse pointer — every other umrah financial table
 * (agent_invoices, sales_invoices, payments, nusk_invoices) carries
 * journalEntryId for exactly this reason.
 *
 * Migration 238 adds the nullable column + partial index. The engine
 * change captures result.journalId and UPDATEs the row.
 */
const MIGRATION = readFileSync(
  join(import.meta.dirname!, "../../src/migrations/238_umrah_penalty_journal_entry_link.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  join(import.meta.dirname!, "../../../../db/schema_pre.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/engines/umrahEngine.ts"),
  "utf8",
);

describe("migration 238 — umrah_penalties.journalEntryId", () => {
  it("adds journalEntryId as nullable integer (additive — old rows stay valid)", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE umrah_penalties\s+ADD COLUMN IF NOT EXISTS "journalEntryId" integer/);
  });

  it("creates a partial index on (journalEntryId) WHERE NOT NULL for the inverse lookup", () => {
    // Partial — most legacy rows are null. Don't waste index space
    // on the null bucket.
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS umrah_penalties_journal_entry_idx\s+ON umrah_penalties \("journalEntryId"\)\s+WHERE "journalEntryId" IS NOT NULL/);
  });

  it("documents the rollback path (additive: drop the column)", () => {
    expect(MIGRATION).toMatch(/-- @rollback: ALTER TABLE umrah_penalties DROP COLUMN IF EXISTS "journalEntryId"/);
  });
});

describe("schema_pre.sql mirror", () => {
  it("the live-schema mirror has the new column (for the drift checker)", () => {
    // Scope the assertion to the umrah_penalties CREATE TABLE block —
    // not just "anywhere in the file" — so we know the column is in
    // the right table.
    const block = SCHEMA.match(/CREATE TABLE public\.umrah_penalties \(([\s\S]*?)\);/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/"journalEntryId" integer/);
  });
});

describe("umrahEngine.postPenaltyGL — populates the link after posting", () => {
  it("captures the postJournalEntry result instead of returning it directly", () => {
    expect(ENGINE).toMatch(/const result = await financialEngine\.postJournalEntry\(/);
  });

  it("UPDATEs the penalty row with journalEntryId after the JE posts", () => {
    expect(ENGINE).toMatch(/UPDATE umrah_penalties SET "journalEntryId" = \$1\s+WHERE id = \$2 AND "companyId" = \$3 AND "deletedAt" IS NULL/);
  });

  it("skips the UPDATE on idempotency re-runs (alreadyExists=true)", () => {
    // The first run posted the JE + linked the row; subsequent calls
    // shouldn't blindly re-link (the journalId stays the same anyway,
    // but the round-trip is wasted).
    expect(ENGINE).toMatch(/if \(!result\.alreadyExists\)/);
  });

  it("still returns the postJournalEntry result so existing callers keep working", () => {
    // The contract was "returns the JE result". After the engine
    // change it must STILL return the same shape so the 2 routes
    // calling it don't break.
    const fn = ENGINE.match(/async postPenaltyGL\([\s\S]*?\n {2}\}/);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/return result;/);
  });

  it("imports rawExecute from the canonical rawdb module (not duplicated)", () => {
    expect(ENGINE).toMatch(/import \{ rawExecute \} from "\.\.\/rawdb\.js"/);
  });
});
