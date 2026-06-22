/**
 * Ledger-line invariants for the manual-journal create page after the
 * 2026-06 table→DataTable conversion. The conversion moved the line inputs
 * (account / description / debit / credit) and the per-line allocation panel
 * out of a raw <table> into <DataTable> columns + renderRowExtras WITHOUT
 * touching the ledger-line logic. Static source-reading smoke (mirrors
 * finance-cycle-closure.test.tsx) — asserts the load-bearing journal plumbing
 * is intact so the conversion can never silently break the posted lines:
 *   • balance = sum(debit) vs sum(credit), gated strictly positive;
 *   • the debit/credit/account cell inputs still write to updateLine(i, …);
 *   • the per-line allocation still writes to updateLine(row._idx, …);
 *   • the submit payload maps every line and is hard-gated on isBalanced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx"),
  "utf8",
);

describe("journal-manual-create — ledger-line invariants survive the DataTable conversion", () => {
  it("balances debit vs credit (sum, gated strictly positive)", () => {
    expect(SRC).toContain("const totalDebit = roundMoney(form.lines.reduce((s, l) => s + roundMoney(l.debit), 0));");
    expect(SRC).toContain("const totalCredit = roundMoney(form.lines.reduce((s, l) => s + roundMoney(l.credit), 0));");
    expect(SRC).toContain("const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;");
  });

  it("the cell inputs still write each field to its line via updateLine", () => {
    expect(SRC).toMatch(/onChange=\{v => updateLine\(i, "debit", v\)\}/);
    expect(SRC).toMatch(/onChange=\{v => updateLine\(i, "credit", v\)\}/);
    expect(SRC).toMatch(/updateLine\(i, "accountCode", v\)/);
    // the per-line allocation panel (renderRowExtras) keeps its line index via _idx
    expect(SRC).toMatch(/updateLine\(row\._idx, "allocation"/);
  });

  it("submit maps every line's fields + allocation and is hard-gated on balance", () => {
    expect(SRC).toContain("lines: form.lines.map((l) => ({");
    expect(SRC).toContain("accountCode: l.accountCode,");
    expect(SRC).toContain("debit: l.debit,");
    expect(SRC).toContain("credit: l.credit,");
    expect(SRC).toContain("...buildAllocationPayload(l.allocation ?? {}),");
    expect(SRC).toContain('balance: !isBalanced ? "القيد غير متوازن');
    expect(SRC).toContain("disabled={createMutation.isPending || !isBalanced}");
  });

  it("renders the lines through the shared DataTable, not a raw table", () => {
    expect(SRC).toContain("<DataTable<JournalLine & { _idx: number }>");
    expect(SRC).not.toMatch(/<table\b/);
  });
});
