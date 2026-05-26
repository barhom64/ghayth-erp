import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Credit-memo PREVIEW endpoint — audit follow-up to #1017.
// Verifies that POST /invoices/:id/credit-memo/preview:
//   1. validates with a relaxed schema (reason optional, since the
//      operator may not have a justification yet),
//   2. surfaces blockers (closed period, amount > open balance) so
//      the UI can grey the "Create Memo" button BEFORE submit,
//   3. runs planCogsReversal AGAINST THE POOL (no transaction held
//      open), mirroring the same math the commit-time handler uses,
//   4. returns the planned journal lines + per-line COGS reversal
//      snapshot so the UI can show the operator exactly which lots
//      will be restocked at what unit cost,
//   5. degrades gracefully if the planner throws.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);

const START = ROUTE.indexOf('"/invoices/:id/credit-memo/preview"');
const END = ROUTE.indexOf('"/invoices/:id/credit-memo"', START + 50);
const HANDLER = ROUTE.slice(START, END);

// ── Schema ──────────────────────────────────────────────────────────────────

describe("previewCreditMemoSchema is permissive (reason optional)", () => {
  it("declares previewCreditMemoSchema that omits the reason requirement", () => {
    expect(ROUTE).toContain("previewCreditMemoSchema");
    expect(ROUTE).toMatch(/createCreditMemoSchema\.omit\(\{ reason: true \}\)/);
  });
  it("preview handler parses with previewCreditMemoSchema (not the strict one)", () => {
    expect(HANDLER).toContain("previewCreditMemoSchema");
  });
});

// ── Read-only invariants ────────────────────────────────────────────────────

describe("preview handler is read-only", () => {
  it("authorize action is 'view' (not 'create')", () => {
    expect(HANDLER).toMatch(/action: "view"/);
  });
  it("does NOT call postJournalEntry / open a transaction / insert / update", () => {
    expect(HANDLER).not.toContain("postJournalEntry");
    expect(HANDLER).not.toContain("withTransaction");
    expect(HANDLER).not.toMatch(/INSERT\s+INTO/i);
    expect(HANDLER).not.toMatch(/UPDATE\s+\w+\s+SET/i);
  });
  it("uses the pool directly for planCogsReversal", () => {
    expect(HANDLER).toContain('await import("../lib/rawdb.js")');
    expect(HANDLER).toMatch(/await planCogsReversal\(cogsPool/);
  });
  it("memoId passed as 0 (preview only — no memo row exists yet)", () => {
    expect(HANDLER).toMatch(/memoId: 0,/);
  });
});

// ── Blockers ────────────────────────────────────────────────────────────────

describe("preview surfaces commit-time blockers up-front", () => {
  it("blocks when financial period is closed", () => {
    expect(HANDLER).toMatch(/!periodCheck\.open[\s\S]{0,200}blockers\.push/);
    expect(HANDLER).toContain("الفترة المالية مغلقة");
  });
  it("blocks when credit amount exceeds remaining open balance", () => {
    expect(HANDLER).toMatch(/creditAmount > openBalance \+ 0\.01/);
    expect(HANDLER).toContain("يتجاوز الرصيد المفتوح");
  });
  it("canIssue is false when blockers are present OR JE not balanced", () => {
    expect(HANDLER).toMatch(/canIssue: blockers\.length === 0 && isBalanced/);
  });
});

// ── COGS reversal preview ───────────────────────────────────────────────────

describe("preview runs planCogsReversal with the live ratio", () => {
  it("ratio = creditAmount / invoice.total (same math as commit handler)", () => {
    expect(HANDLER).toMatch(/reversalRatio = invoiceTotal > 0 \? creditAmount \/ invoiceTotal : 0/);
  });
  it("ratio capped at 1 in the response (cogsReversalPreview already clamps)", () => {
    expect(HANDLER).toMatch(/reversalRatio: roundTo2\(Math\.min\(reversalRatio, 1\)\)/);
  });
  it("planner failure is logged + soft-warned, not a 500", () => {
    expect(HANDLER).toMatch(/try \{\s*cogsReversalPreview = await planCogsReversal/);
    expect(HANDLER).toMatch(/catch \(err\) \{[\s\S]{0,300}logger\.warn/);
    expect(HANDLER).toContain("تعذّر حساب عكس تكلفة البضاعة");
  });
});

// ── Response payload ────────────────────────────────────────────────────────

describe("preview response payload", () => {
  it("exposes canIssue + blockers + warnings + memoDate + creditAmount", () => {
    expect(HANDLER).toMatch(/canIssue:/);
    expect(HANDLER).toMatch(/blockers,/);
    expect(HANDLER).toMatch(/warnings,/);
    expect(HANDLER).toMatch(/memoDate: memoDateStr,/);
    expect(HANDLER).toMatch(/creditAmount,/);
  });
  it("exposes netAmount + vatAmount split", () => {
    expect(HANDLER).toMatch(/netAmount: previewNet,/);
    expect(HANDLER).toMatch(/vatAmount: previewVat,/);
  });
  it("exposes cogsTotal + cogsLineSnapshots", () => {
    expect(HANDLER).toMatch(/cogsTotal: cogsReversalPreview\.totalReversed,/);
    expect(HANDLER).toContain("cogsLineSnapshots:");
  });
  it("cogsLineSnapshots map includes allocations + invoiceLineId + cogsReversed", () => {
    expect(HANDLER).toMatch(/invoiceLineId: u\.invoiceLineId/);
    expect(HANDLER).toMatch(/cogsReversed: u\.snapshot\.cogsReversed/);
    expect(HANDLER).toMatch(/allocations: u\.snapshot\.allocations/);
  });
  it("journalLines spreads the contra-revenue + VAT + AR + reversal lines", () => {
    expect(HANDLER).toMatch(/accountCode: previewSalesReturnsCode, debit: previewNet/);
    expect(HANDLER).toMatch(/accountCode: previewArCode, debit: 0, credit: creditAmount/);
    expect(HANDLER).toMatch(/\.\.\.cogsReversalPreview\.journalLines/);
  });
  it("totals includes balanced flag", () => {
    expect(HANDLER).toMatch(/totals: \{ debit: totalDebit, credit: totalCredit, balanced: isBalanced \}/);
  });
});
