import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// GL integrity gaps report — period-close pre-flight.
// Verifies GET /reports/gl-integrity-gaps surfaces:
//   1. approved invoices with NULL journalEntryId,
//   2. credit_memos / debit_memos with NULL journalId,
//   3. payment_runs executed but unposted,
//   4. supplier_payment_allocations pointing at a deleted JE,
// gracefully handles missing payment_runs table (lazy-created),
// and stays read-only.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-reports.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/reports/gl-integrity-gaps"');
const HANDLER = ROUTE.slice(START);

describe("/reports/gl-integrity-gaps endpoint registration", () => {
  it("registers the endpoint scoped to finance.reports / list", () => {
    expect(HANDLER).toContain('"/reports/gl-integrity-gaps"');
    expect(HANDLER).toMatch(/feature: "finance\.reports"/);
    expect(HANDLER).toMatch(/action: "list"/);
  });
});

describe("section 1: invoices approved without JE", () => {
  it("WHERE filters status IN approved/sent/partial/paid/overdue", () => {
    expect(HANDLER).toMatch(/i\.status IN \('approved','sent','partial','partially_paid','paid','overdue'\)/);
  });
  it("requires journalEntryId IS NULL", () => {
    expect(HANDLER).toMatch(/i\."journalEntryId" IS NULL/);
  });
  it("excludes soft-deleted invoices", () => {
    expect(HANDLER).toMatch(/i\."deletedAt" IS NULL/);
  });
});

describe("section 2/3: credit_memos / debit_memos with NULL journalId", () => {
  it("credit_memos: journalId IS NULL", () => {
    expect(HANDLER).toMatch(/credit_memos cm[\s\S]{0,400}cm\."journalId" IS NULL/);
  });
  it("debit_memos: journalId IS NULL", () => {
    expect(HANDLER).toMatch(/debit_memos dm[\s\S]{0,400}dm\."journalId" IS NULL/);
  });
});

describe("section 4: payment_runs missing JE", () => {
  it("filters pr.status = 'executed' AND pr.journalId IS NULL", () => {
    expect(HANDLER).toMatch(/payment_runs pr[\s\S]{0,400}pr\.status = 'executed'[\s\S]{0,200}pr\."journalId" IS NULL/);
  });
  it("tolerates lazy-created table absence (code 42P01)", () => {
    expect(HANDLER).toMatch(/e\?\.code !== "42P01"/);
    expect(HANDLER).toMatch(/sections\.push\(\{ source: "payment_runs_missing_je", rows: \[\] \}\)/);
  });
});

describe("section 5: SPA orphans (JE soft-FK broken)", () => {
  it("LEFT JOIN journal_entries + WHERE je.id IS NULL surfaces orphans", () => {
    expect(HANDLER).toMatch(/LEFT JOIN journal_entries je[\s\S]{0,400}je\.id IS NULL/);
  });
  it("excludes soft-deleted SPA rows + requires non-null journalEntryId", () => {
    expect(HANDLER).toMatch(/spa\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/spa\."journalEntryId" IS NOT NULL/);
  });
});

describe("summary + payload", () => {
  it("totalGaps = sum of section row counts", () => {
    expect(HANDLER).toMatch(/totalGaps = sections\.reduce\(\(s, x\) => s \+ x\.rows\.length, 0\)/);
  });
  it("bySection rollup with per-source count", () => {
    expect(HANDLER).toMatch(/bySection: sections\.map/);
  });
  it("isClean flag when no gaps anywhere", () => {
    expect(HANDLER).toMatch(/isClean: totalGaps === 0/);
  });
  it("response includes filters + summary + sections", () => {
    expect(HANDLER).toContain("filters:");
    expect(HANDLER).toContain("summary,");
    expect(HANDLER).toContain("sections,");
  });
  it("response passed through maskFields", () => {
    expect(HANDLER).toContain("maskFields(req,");
  });
});

describe("date filters bind against createdAt of the entity", () => {
  for (const expr of [
    'i\\."createdAt" >= ',
    'cm\\."createdAt" >= ',
    'dm\\."createdAt" >= ',
    'pr\\."createdAt" >= ',
  ]) {
    it(`accepts startDate on ${expr.slice(0, 4)}…`, () => {
      expect(HANDLER).toMatch(new RegExp(expr));
    });
  }
});

describe("is read-only", () => {
  it("no postJournalEntry / withTransaction / INSERT / UPDATE in the handler", () => {
    const after = ROUTE.indexOf("// ─", START + 50);
    const scoped = ROUTE.slice(START, after > START ? after : ROUTE.length);
    expect(scoped).not.toContain("postJournalEntry");
    expect(scoped).not.toContain("withTransaction");
    expect(scoped).not.toMatch(/INSERT\s+INTO/i);
    expect(scoped).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
});
