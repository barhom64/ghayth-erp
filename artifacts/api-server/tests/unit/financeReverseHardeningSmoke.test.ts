import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const JOURNAL = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8"
);

// ─── /journal/:id/reverse — defense-in-depth fixes ──────────────────────────
// Audit fixes #5 (reverse-of-reverse via orphaned reversedById) and
// #16 (invoice.paidAmount rollback on payment-JE reverse).

describe("Fix #5 — reverse handler rejects duplicate reversal", () => {
  it("looks for an existing reversal referencing the same original", () => {
    expect(JOURNAL).toContain('"reversalOfId" = $1');
    // Inside the reverse handler, after the basic reversedById /
    // reversalOfId checks, there's a defensive query for any
    // existing reversal pointing at the same original.
    const reverseIdx = JOURNAL.indexOf('"/journal/:id/reverse"');
    const section = JOURNAL.slice(reverseIdx, reverseIdx + 8000);
    expect(section).toMatch(/SELECT id, ref FROM journal_entries[\s\S]{0,200}"reversalOfId" = \$1/);
  });

  it("error message points at the existing reversal id", () => {
    expect(JOURNAL).toContain('معكوس مسبقاً بالقيد #${existingReversal.id}');
  });

  it("the check sits AFTER the legacy reversedById guard so the simpler error fires first", () => {
    const reversedByIdGuardIdx = JOURNAL.indexOf("هذا القيد معكوس مسبقاً بالقيد #${original.reversedById}");
    const defenseInDepthIdx = JOURNAL.indexOf('SELECT id, ref FROM journal_entries\n          WHERE "reversalOfId" = $1');
    expect(reversedByIdGuardIdx).toBeGreaterThan(-1);
    expect(defenseInDepthIdx).toBeGreaterThan(-1);
    expect(defenseInDepthIdx).toBeGreaterThan(reversedByIdGuardIdx);
  });
});

describe("Fix #16 — invoice.paidAmount rolls back when payment JE is reversed", () => {
  const reverseIdx = JOURNAL.indexOf('"/journal/:id/reverse"');
  // Widened from 9000 → 12000 after the reverse handler grew when the
  // full dimensional SELECT + map was added (silent dim-loss bug fix).
  const handler = JOURNAL.slice(reverseIdx, reverseIdx + 12000);

  it("detects payment JEs by sourceType + type", () => {
    expect(handler).toMatch(/original\.sourceType === "invoice" && original\.type === "payment"/);
  });

  it("sums the JE debit lines to find the paid delta", () => {
    expect(handler).toMatch(/SELECT COALESCE\(SUM\(debit\), 0\)::text AS total[\s\S]{0,200}journal_lines/);
  });

  it("decrements paidAmount with GREATEST() floor (no negative balances)", () => {
    expect(handler).toMatch(/GREATEST\(COALESCE\("paidAmount",0\) - \$1, 0\)/);
  });

  it("re-derives invoice.status from the new paidAmount", () => {
    expect(handler).toMatch(/CASE[\s\S]{0,500}'paid'[\s\S]{0,200}'partial'[\s\S]{0,200}'draft'/);
  });

  it("scoped to companyId + invoice id", () => {
    expect(handler).toMatch(/WHERE id = \$2 AND "companyId" = \$3 AND "deletedAt" IS NULL/);
  });
});
