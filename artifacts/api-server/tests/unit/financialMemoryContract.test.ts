import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  materializeTemplateLines,
  isTemplateMaterializationPostable,
  type ManualJournalTemplateLine,
} from "../../src/lib/financialMemory.js";

/**
 * FIN-FINANCIAL-MEMORY-FOUNDATION — financial memory contract.
 *
 * Generalizes the supplier-items memory (#2235) into a unified memory layer:
 * manual journal templates, expense-category memory, and supplier finance
 * defaults. Pins the hard invariant across all of them — memories carry an
 * `accountPurpose` (text) and NEVER a final accountCode; the financial engine
 * resolves the purpose. Also pins company scoping and the pure materialization
 * math (ratio×base, balance + required-dimension gating) that feeds the engine.
 */
const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");
const MIG_TEMPLATES = read("artifacts/api-server/src/migrations/362_manual_journal_templates.sql");
const MIG_EXPENSE = read("artifacts/api-server/src/migrations/363_expense_category_memory.sql");
const MIG_PAYEE = read("artifacts/api-server/src/migrations/364_supplier_finance_defaults.sql");
const ROUTER = read("artifacts/api-server/src/routes/finance-memory.ts");
const LIB = read("artifacts/api-server/src/lib/financialMemory.ts");

describe("financial-memory migrations", () => {
  it("create the three memory tables with accountPurpose and NO accountCode/accountId", () => {
    expect(MIG_TEMPLATES).toContain("CREATE TABLE IF NOT EXISTS manual_journal_templates");
    expect(MIG_TEMPLATES).toContain("CREATE TABLE IF NOT EXISTS manual_journal_template_lines");
    expect(MIG_EXPENSE).toContain("CREATE TABLE IF NOT EXISTS expense_category_memory");
    expect(MIG_PAYEE).toContain("CREATE TABLE IF NOT EXISTS supplier_finance_defaults");
    for (const m of [MIG_TEMPLATES, MIG_EXPENSE, MIG_PAYEE]) {
      expect(m).toMatch(/[Aa]ccountPurpose/); // accountPurpose / defaultAccountPurpose
      expect(m).not.toMatch(/"accountCode"/);
      expect(m).not.toMatch(/"accountId"/);
    }
  });
  it("are reversible (rollback annotation)", () => {
    expect(MIG_TEMPLATES).toContain("-- @rollback: DROP TABLE IF EXISTS manual_journal_template_lines; DROP TABLE IF EXISTS manual_journal_templates;");
    expect(MIG_EXPENSE).toContain("-- @rollback: DROP TABLE IF EXISTS expense_category_memory;");
    expect(MIG_PAYEE).toContain("-- @rollback: DROP TABLE IF EXISTS supplier_finance_defaults;");
  });
  it("reference the canonical suppliers.id (no parallel vendor entity)", () => {
    expect(MIG_TEMPLATES).toContain('"defaultSupplierId"   INTEGER REFERENCES suppliers(id)');
    expect(MIG_PAYEE).toContain('"supplierId"           INTEGER NOT NULL REFERENCES suppliers(id)');
  });
  it("keep child line table independently company-scoped", () => {
    expect(MIG_TEMPLATES).toMatch(/manual_journal_template_lines[\s\S]*"companyId"\s+INTEGER NOT NULL REFERENCES companies/);
  });
});

describe("financial-memory API contract", () => {
  it("exposes the memory endpoints", () => {
    expect(ROUTER).toContain('"/suppliers/:id/finance-defaults"');
    expect(ROUTER).toContain('"/expense-memory"');
    expect(ROUTER).toContain('"/journal-templates"');
    expect(ROUTER).toContain('"/journal-templates/:id/preview"');
  });
  it("scopes every supplier access to the caller's company (cross-company → not found)", () => {
    expect(ROUTER).toContain('SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL');
    expect(ROUTER).toContain('throw new NotFoundError("المورد غير موجود")');
  });
  it("rejects any accountCode in template lines (strict schema, purpose only)", () => {
    expect(ROUTER).toContain("accountPurpose: z.string()");
    expect(ROUTER).toContain("}).strict();");
    // no accountCode as a code field/key/assignment (prose mentions are fine).
    expect(ROUTER).not.toMatch(/accountCode\s*["':=]/);
  });
  it("never resolves/returns a GL account — purpose only", () => {
    expect(LIB).not.toMatch(/accountCode\s*["':=]/);
    expect(LIB).toContain("accountPurpose");
  });
});

describe("materializeTemplateLines (pure — feeds the engine, decides no account)", () => {
  const lines: ManualJournalTemplateLine[] = [
    { lineNo: 1, accountPurpose: "rent_expense", side: "debit", amount: null, ratio: 1, requiredDimensions: ["costCenterId"], defaultCostCenterId: null, description: null },
    { lineNo: 2, accountPurpose: "cash", side: "credit", amount: null, ratio: 1, requiredDimensions: null, defaultCostCenterId: null, description: null },
  ];
  it("resolves ratio × base into amounts", () => {
    const out = materializeTemplateLines({ lines, base: 1000, dimensions: { costCenterId: 5 } });
    expect(out[0].amount).toBe(1000);
    expect(out[1].amount).toBe(1000);
    expect(out[0].accountPurpose).toBe("rent_expense");
  });
  it("flags missing required dimensions and gates postability", () => {
    const out = materializeTemplateLines({ lines, base: 1000, dimensions: {} });
    const v = isTemplateMaterializationPostable(out);
    expect(v.missingDimensions).toContain("costCenterId");
    expect(v.postable).toBe(false);
  });
  it("is postable when balanced and all dimensions present", () => {
    const out = materializeTemplateLines({ lines, base: 1000, dimensions: { costCenterId: 5 } });
    const v = isTemplateMaterializationPostable(out);
    expect(v.balanced).toBe(true);
    expect(v.postable).toBe(true);
  });
  it("is NOT postable when unbalanced", () => {
    const unbalanced = materializeTemplateLines({
      lines: [
        { ...lines[0], requiredDimensions: null },
        { ...lines[1], ratio: 0.5 },
      ],
      base: 1000,
    });
    expect(isTemplateMaterializationPostable(unbalanced).balanced).toBe(false);
  });
});
