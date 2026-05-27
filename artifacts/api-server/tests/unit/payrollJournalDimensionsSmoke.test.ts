import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const BUSINESS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/businessHelpers.ts"),
  "utf8",
);
const HR_ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/hrEngine.ts"),
  "utf8",
);
const HR_EXIT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"),
  "utf8",
);
const HR_LOANS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-loans.ts"),
  "utf8",
);
const FINANCE_JOURNAL = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/224_journal_lines_branch_id.sql"),
  "utf8",
);

// ─── Payroll JE dimensional consistency (financial-integrity gap #6) ──────
// The four payroll-related JE posting sites (payroll run, EOS settlement,
// salary advance, loan disbursement) all had access to per-employee
// breakdown but were dropping departmentId / branchId before posting.
// These smoke tests lock the fix so future refactors can't quietly
// revert.

describe("migration 224 — journal_lines.branchId column", () => {
  it("adds the column idempotently", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.journal_lines/);
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS "branchId" integer');
  });
  it("indexes the column for branch-slicing reports", () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_journal_lines_branchid/);
    expect(MIGRATION).toContain('WHERE "branchId" IS NOT NULL');
  });
  it("documents the per-line vs entry-level intent", () => {
    expect(MIGRATION).toContain("Per-line branch attribution");
  });
});

describe("JournalEntryLine + INSERT path accept branchId", () => {
  it("type declares branchId?: number", () => {
    expect(BUSINESS).toMatch(/branchId\?:\s*number/);
  });
  it("INSERT INTO journal_lines lists branchId as a column", () => {
    const insertBlock = BUSINESS.match(/INSERT INTO journal_lines\s*\(([\s\S]*?)\) VALUES/);
    expect(insertBlock).not.toBeNull();
    expect(insertBlock![1]).toContain('"branchId"');
  });
  it("INSERT params append line.branchId ?? null", () => {
    expect(BUSINESS).toContain("line.branchId ?? null");
  });
});

describe("hrEngine.postPayrollRunGL — breakdown threads branchId", () => {
  it("debit-line type accepts branchId", () => {
    const block = HR_ENGINE.match(/const debitLines:[\s\S]{0,400}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("branchId?: number");
  });
  it("per-employee dims object includes branchId conditionally", () => {
    // Anchor on `employeeId: e.employeeId` to isolate the payroll dims
    // literal from the loan/exit dims literals elsewhere in the file.
    const dimsMatch = HR_ENGINE.match(/const dims = \{\s*\n?\s*employeeId: e\.employeeId,[\s\S]{0,400}?\};/);
    expect(dimsMatch).not.toBeNull();
    expect(dimsMatch![0]).toContain("e.branchId != null");
    expect(dimsMatch![0]).toContain("branchId: e.branchId");
    expect(dimsMatch![0]).toContain("e.departmentId != null");
  });
  it("emits a logger.warn on breakdown-reconciliation failure", () => {
    expect(HR_ENGINE).toMatch(/logger\.warn\(\s*\{[\s\S]{0,400}grossDiff[\s\S]{0,200}breakdown failed reconciliation/);
  });
  it("emits a logger.warn when no breakdown is supplied at all", () => {
    expect(HR_ENGINE).toMatch(/logger\.warn\([\s\S]{0,300}no per-employee breakdown supplied/);
  });
});

describe("hrEngine.postExitSettlementGL — accepts dept/branch", () => {
  it("signature declares departmentId + branchId on exit param", () => {
    const sig = HR_ENGINE.match(/postExitSettlementGL\([\s\S]{0,600}?\)/);
    expect(sig).not.toBeNull();
    expect(sig![0]).toContain("departmentId?: number | null");
    expect(sig![0]).toContain("branchId?: number | null");
  });
  it("builds a shared dims object spread on every line", () => {
    // The function constructs `const dims = { employeeId, ...(departmentId), ...(branchId) }`
    // then spreads it on the EOS expense, leave expense, and payable lines.
    const dimsBlock = HR_ENGINE.match(/const dims = \{\s*\n?\s*employeeId: exit\.employeeId,[\s\S]{0,300}\};/);
    expect(dimsBlock).not.toBeNull();
    expect(dimsBlock![0]).toContain("exit.departmentId != null");
    expect(dimsBlock![0]).toContain("exit.branchId != null");
  });
});

describe("hr-exit route — resolves and passes dept/branch", () => {
  it("selects departmentId + branchId from employee_assignments before posting EOS", () => {
    expect(HR_EXIT).toMatch(/SELECT "departmentId", "branchId" FROM employee_assignments/);
  });
  it("passes them into postExitSettlementGL", () => {
    // Grab a generous window starting at the engine call so we cover
    // the multi-line argument list without depending on brace counts.
    const start = HR_EXIT.indexOf("postExitSettlementGL(");
    expect(start).toBeGreaterThan(0);
    const block = HR_EXIT.slice(start, start + 800);
    expect(block).toContain("departmentId: asn?.departmentId");
    expect(block).toContain("branchId: asn?.branchId");
  });
});

describe("hrEngine.postLoanDisbursementGL — accepts dept/branch", () => {
  it("signature accepts departmentId + branchId", () => {
    const sig = HR_ENGINE.match(/postLoanDisbursementGL\([\s\S]{0,400}?\)/);
    expect(sig).not.toBeNull();
    expect(sig![0]).toContain("departmentId?: number | null");
    expect(sig![0]).toContain("branchId?: number | null");
  });
  it("spreads dims on both legs of the disbursement entry", () => {
    // Both DR (loan receivable) and CR (cash) lines must spread the dims.
    const lines = HR_ENGINE.match(/lines: \[\s*\{[\s\S]{0,250}\.\.\.dims[\s\S]{0,250}\.\.\.dims[\s\S]{0,50}\}/);
    expect(lines).not.toBeNull();
  });
});

describe("hr-loans route — resolves and passes dept/branch", () => {
  it("looks up assignment dimensions inside the transaction", () => {
    expect(HR_LOANS).toMatch(/SELECT "departmentId", "branchId" FROM employee_assignments/);
  });
  it("passes departmentId + branchId into postLoanDisbursementGL", () => {
    const start = HR_LOANS.indexOf("postLoanDisbursementGL(");
    expect(start).toBeGreaterThan(0);
    const block = HR_LOANS.slice(start, start + 800);
    expect(block).toContain("departmentId: asn?.departmentId");
    expect(block).toContain("branchId: asn?.branchId");
  });
});

describe("finance-journal salary-advance route — applies dims to both legs", () => {
  it("looks up the employee's active assignment for dept/branch", () => {
    expect(FINANCE_JOURNAL).toMatch(/SELECT "departmentId", "branchId" FROM employee_assignments/);
    expect(FINANCE_JOURNAL).toMatch(/status = 'active'/);
  });
  it("both advance JE lines spread empDims", () => {
    // The two-line entry: receivable DR + cash CR, both should spread empDims.
    const arr = FINANCE_JOURNAL.match(/const advanceLines = \[[\s\S]{0,400}?\];/);
    expect(arr).not.toBeNull();
    const matches = arr![0].match(/\.\.\.empDims/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
