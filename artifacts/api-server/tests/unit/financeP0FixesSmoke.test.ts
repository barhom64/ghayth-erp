import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INVOICES = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"), "utf8");
const JOURNAL  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const HARDENING = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-hardening.ts"), "utf8");
const MIGRATION_206 = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/206_drop_duplicate_journal_lines_fk.sql"),
  "utf8"
);
const SCHEMA_POST = readFileSync(join(REPO_ROOT, "db/schema_post.sql"), "utf8");

// ─── P0 audit fix batch ─────────────────────────────────────────────────────

describe("Fix #1 — invoices.journalEntryId now persisted on approve", () => {
  it("approve handler updates invoices.journalEntryId with the new JE id", () => {
    const idx = INVOICES.indexOf("journalId = result.journalId;");
    expect(idx).toBeGreaterThan(-1);
    const after = INVOICES.slice(idx, idx + 800);
    expect(after).toMatch(/UPDATE invoices SET "journalEntryId" = \$1[\s\S]{0,200}WHERE id = \$2 AND "companyId" = \$3/);
  });
});

describe("Fix #2 — manual JE hardening rejects negatives + tight threshold", () => {
  const idx = HARDENING.indexOf('"/journal-manual"');
  const handler = HARDENING.slice(idx, idx + 4500);

  it("rejects negative debit/credit on the hardening path", () => {
    expect(handler).toMatch(/d < 0 \|\| c < 0/);
    expect(handler).toContain("لا يُسمح بمبالغ سالبة");
  });
  it("rejects both-sides non-zero on a single line", () => {
    expect(handler).toMatch(/d > 0 && c > 0/);
    expect(handler).toContain("لا يُسمح بمدين ودائن في نفس البند");
  });
  it("uses the strict >= 0.005 imbalance threshold", () => {
    expect(handler).toMatch(/Math\.abs\(totalDebit - totalCredit\) >= 0\.005/);
  });
});

describe("Fix #3 — year-end closing uses accounting date, not insertion timestamp", () => {
  const idx = JOURNAL.indexOf("async function buildYearEndClosingLines");
  const fn = JOURNAL.slice(idx, idx + 2500);

  it("filters by je.date, not je.createdAt", () => {
    // The legacy `je."createdAt" >= $2` is gone
    expect(fn).not.toMatch(/je\."createdAt" >= \$2/);
    // The fix uses je.date >= $2
    expect(fn).toMatch(/je\.date >= \$2/);
    expect(fn).toMatch(/je\.date <= \$3::date/);
  });

  it("applies the standard balancesApplied + reversedById filter", () => {
    expect(fn).toContain('je."balancesApplied" = true');
    expect(fn).toContain('je."reversedById" IS NULL');
  });
});

describe("Fix #4 — duplicate FK on journal_lines.journalId dropped", () => {
  it("migration 206 drops the snake_case duplicate", () => {
    expect(MIGRATION_206).toContain("DROP CONSTRAINT IF EXISTS journal_lines_journal_id_fk");
  });

  it("schema_post.sql no longer declares the duplicate", () => {
    expect(SCHEMA_POST).not.toContain("ADD CONSTRAINT journal_lines_journal_id_fk FOREIGN KEY");
  });

  it("the canonical fkey (no cascade) stays", () => {
    expect(SCHEMA_POST).toContain('ADD CONSTRAINT "journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES public.journal_entries(id)');
  });

  it("rollback note documents the cascade behaviour being removed", () => {
    expect(MIGRATION_206).toContain("ON DELETE CASCADE");
    expect(MIGRATION_206).toContain("@rollback");
  });
});
