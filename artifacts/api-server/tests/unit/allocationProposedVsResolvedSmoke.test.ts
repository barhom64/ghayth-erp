import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ALLOC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/accountingAllocation.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/225_allocation_results_proposed_vs_pinned.sql"),
  "utf8",
);
const REPORT = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/finance/overrides-report.tsx"),
  "utf8",
);

// ─── Manual Overrides "before/after" contract (audit gap #7) ──────────────
// User scenario: تقرير Manual Overrides — جدول يعرض كل تعديل يدوي على
// الحساب/مركز التكلفة مع actor, reason, before/after.
//
// The resolver previously stored only the OUTCOME (resolvedAccountCode +
// costCenterId + status='manual_override'). The "before/after" semantics
// require also storing what the resolver WOULD have picked if no
// caller-supplied pin had been applied — that's the "before" half.
// Migration 225 + resolver changes deliver that.

describe("migration 225 — accounting_allocation_results gains proposed* columns", () => {
  it("adds proposedAccountId + proposedAccountCode idempotently", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "proposedAccountId" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "proposedAccountCode" varchar/);
  });

  it("adds proposedCostCenterId + proposedDimensionsJson", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "proposedCostCenterId" integer/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "proposedDimensionsJson" jsonb/);
  });

  it("creates the override-diff partial index", () => {
    expect(MIGRATION).toContain("idx_allocation_results_override_diff");
    expect(MIGRATION).toContain(`WHERE "resolutionStatus" = 'manual_override'`);
  });
});

describe("AllocationResult declares proposed* fields", () => {
  it("AllocationResult interface declares proposedAccountCode + proposedAccountId + proposedCostCenterId", () => {
    const ifaceStart = ALLOC.indexOf("export interface AllocationResult");
    const ifaceEnd = ALLOC.indexOf("}", ifaceStart);
    const iface = ALLOC.slice(ifaceStart, ifaceEnd);
    expect(iface).toMatch(/proposedAccountCode\?:/);
    expect(iface).toMatch(/proposedAccountId\?:/);
    expect(iface).toMatch(/proposedCostCenterId\?:/);
  });
});

describe("resolveLineAllocation computes proposal on the manual_override path", () => {
  it("imports computeRuleProposal and calls it when caller pins an account", () => {
    // The manual-override branch must invoke computeRuleProposal to
    // capture the "before" half BEFORE returning. Search the function
    // body for the call.
    expect(ALLOC).toContain("async function computeRuleProposal");
    const overrideBranch = ALLOC.match(/if \(input\.accountCode \|\| input\.accountId\)\s*\{[\s\S]{0,1500}?\}/);
    expect(overrideBranch).not.toBeNull();
    expect(overrideBranch![0]).toContain("computeRuleProposal");
  });

  it("the manual-override return populates proposedAccountCode + proposedCostCenterId", () => {
    const overrideBranch = ALLOC.match(/if \(input\.accountCode \|\| input\.accountId\)\s*\{[\s\S]{0,1500}?\};/);
    expect(overrideBranch).not.toBeNull();
    expect(overrideBranch![0]).toContain("proposedAccountCode: ruleProposal.accountCode");
    expect(overrideBranch![0]).toContain("proposedAccountId: ruleProposal.accountId");
    expect(overrideBranch![0]).toContain("proposedCostCenterId: ruleProposal.costCenterId");
  });

  it("the resolved-path return also populates proposed* (equal to resolved* — uniform query shape)", () => {
    // The 'resolved' return is the one ending with `ruleId: matched.id`.
    // It must also set proposedAccountCode + proposedCostCenterId to the
    // same values so reports don't need NULL-handling on this status.
    const resolvedRet = ALLOC.match(/status: "resolved",[\s\S]{0,500}?\};/);
    expect(resolvedRet).not.toBeNull();
    expect(resolvedRet![0]).toContain("proposedAccountCode: accountCode");
    expect(resolvedRet![0]).toContain("proposedAccountId: accountId");
    expect(resolvedRet![0]).toContain("proposedCostCenterId: costCenterId");
  });

  it("computeRuleProposal is best-effort — wraps in try/catch and returns nulls on error", () => {
    const fn = ALLOC.slice(ALLOC.indexOf("async function computeRuleProposal"));
    expect(fn).toContain("try {");
    expect(fn).toMatch(/catch \{[\s\S]{0,200}?return \{ accountCode: null, accountId: null, costCenterId: null, ruleId: null \};/);
  });

  it("computeRuleProposal strips the pin before searching for rules", () => {
    // resolveLineAllocation must call computeRuleProposal with
    // accountCode + accountId blanked so the proposal is purely
    // rule-driven, not echoing the pin.
    expect(ALLOC).toMatch(/computeRuleProposal\(\{\s*\.\.\.input,\s*accountCode: undefined,\s*accountId: undefined,\s*\}\)/);
  });
});

describe("writeAllocationResult persists proposed* on INSERT + UPDATE", () => {
  it("INSERT INTO accounting_allocation_results lists the 4 new columns", () => {
    const insertBlock = ALLOC.match(/INSERT INTO accounting_allocation_results \([\s\S]{0,1200}?VALUES/);
    expect(insertBlock).not.toBeNull();
    expect(insertBlock![0]).toContain('"proposedAccountId"');
    expect(insertBlock![0]).toContain('"proposedAccountCode"');
    expect(insertBlock![0]).toContain('"proposedCostCenterId"');
    expect(insertBlock![0]).toContain('"proposedDimensionsJson"');
  });

  it("ON CONFLICT DO UPDATE also refreshes proposed* (so re-resolves don't lose history)", () => {
    const onConflict = ALLOC.match(/ON CONFLICT[\s\S]{0,1500}?"resolvedAt" = NOW\(\)/);
    expect(onConflict).not.toBeNull();
    expect(onConflict![0]).toContain('"proposedAccountId" = EXCLUDED."proposedAccountId"');
    expect(onConflict![0]).toContain('"proposedAccountCode" = EXCLUDED."proposedAccountCode"');
    expect(onConflict![0]).toContain('"proposedCostCenterId" = EXCLUDED."proposedCostCenterId"');
  });

  it("INSERT places proposed* in the param list (with ?? null fallbacks)", () => {
    expect(ALLOC).toContain("result.proposedAccountId ?? null");
    expect(ALLOC).toContain("result.proposedAccountCode ?? null");
    expect(ALLOC).toContain("result.proposedCostCenterId ?? null");
  });
});

describe("overrides-report UI renders the before/after diff", () => {
  it("OverrideRow interface declares the 3 proposed* fields", () => {
    expect(REPORT).toContain("proposedAccountId: number | null");
    expect(REPORT).toContain("proposedAccountCode: string | null");
    expect(REPORT).toContain("proposedCostCenterId: number | null");
  });

  it("table has explicit Before / After columns for the account code", () => {
    expect(REPORT).toMatch(/header: "اقترح \(Before\)"/);
    expect(REPORT).toMatch(/header: "اختار \(After\)"/);
  });

  it("table has Before / After columns for the cost centre", () => {
    expect(REPORT).toMatch(/header: "مركز التكلفة المقترح"/);
    expect(REPORT).toMatch(/header: "مركز التكلفة المختار"/);
  });

  it("After column highlights changes in bold + status-warning tone", () => {
    // The render fn marks `changed = proposedAccountCode != null && !==`,
    // then renders with font-bold text-status-warning-foreground.
    const renderMatch = REPORT.match(/key: "resolvedAccountCode"[\s\S]{0,600}?render:[\s\S]{0,500}?text-status-warning-foreground/);
    expect(renderMatch).not.toBeNull();
  });

  it("CSV export includes Before, After, and a 'تغيير؟' yes/no column", () => {
    expect(REPORT).toContain("اقترح الحساب (Before)");
    expect(REPORT).toContain("الحساب الفعلي (After)");
    expect(REPORT).toContain('"تغيير؟"');
    expect(REPORT).toMatch(/acctChanged \|\| ccChanged \? "نعم" : "لا"/);
  });
});
