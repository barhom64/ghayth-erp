import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INV_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"), "utf8");
const JRN_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const CRON_SCHEDULER = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"), "utf8");
const RECURRING_PROC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/recurringJournalProcessor.ts"), "utf8");

// ─── Finance Golden Path Tests ─────────────────────────────────────────────
// P4.8 — Lock in finance domain lifecycle contracts: invoices, journal
// entries, expenses, vouchers, salary advances, customer advances.

describe("Invoice route structure", () => {
  it("invoice CRUD endpoints exist", () => {
    expect(INV_ROUTE).toContain('invoicesRouter.get("/invoices"');
    expect(INV_ROUTE).toContain('invoicesRouter.post("/invoices"');
    expect(INV_ROUTE).toContain('invoicesRouter.patch("/invoices/:id"');
    expect(INV_ROUTE).toContain('invoicesRouter.delete("/invoices/:id"');
  });

  it("invoice lifecycle endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/send"');
    expect(INV_ROUTE).toContain('"/invoices/:id/approve"');
    expect(INV_ROUTE).toContain('"/invoices/:id/payment"');
    expect(INV_ROUTE).toContain('"/invoices/:id/post"');
  });

  it("credit/debit memo endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/credit-memo"');
    expect(INV_ROUTE).toContain('"/invoices/:id/debit-memo"');
    expect(INV_ROUTE).toContain('"/invoices/:id/memos"');
  });

  it("dunning endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/dunning/preview"');
    expect(INV_ROUTE).toContain('"/dunning/send"');
    expect(INV_ROUTE).toContain('"/dunning/history"');
  });

  it("customer advance endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/customer-advances"');
    expect(INV_ROUTE).toContain('"/customer-advances/:id/apply"');
  });

  it("bad debt endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/bad-debt/preview"');
    expect(INV_ROUTE).toContain('"/bad-debt/post"');
  });

  it("tax summary and declarations endpoints exist", () => {
    expect(INV_ROUTE).toContain('"/tax/summary"');
    expect(INV_ROUTE).toContain('"/tax/declarations"');
  });

  it("invoice impact preview endpoint exists", () => {
    expect(INV_ROUTE).toContain('"/invoices/impact-preview"');
  });
});

describe("Invoice state machine", () => {
  it("defines INVOICE_STATUSES and INVOICE_TRANSITIONS", () => {
    expect(INV_ROUTE).toContain("INVOICE_STATUSES");
    expect(INV_ROUTE).toContain("INVOICE_TRANSITIONS");
  });

  it("invoice statuses include draft through cancelled", () => {
    expect(INV_ROUTE).toContain('"draft"');
    expect(INV_ROUTE).toContain('"approved"');
    expect(INV_ROUTE).toContain('"sent"');
    expect(INV_ROUTE).toContain('"partial"');
    expect(INV_ROUTE).toContain('"paid"');
    expect(INV_ROUTE).toContain('"overdue"');
    expect(INV_ROUTE).toContain('"cancelled"');
    expect(INV_ROUTE).toContain('"closed"');
    expect(INV_ROUTE).toContain('"posted"');
  });

  it("closed, cancelled, posted are terminal invoice states", () => {
    const idx = INV_ROUTE.indexOf("INVOICE_TRANSITIONS");
    const block = INV_ROUTE.slice(idx, idx + 700);
    expect(block).toContain("closed:    []");
    expect(block).toContain("cancelled: []");
    expect(block).toContain("posted:    []");
  });

  it("validates invoice status transitions", () => {
    expect(INV_ROUTE).toContain("INVOICE_TRANSITIONS[existing.status");
  });
});

describe("Journal entry state machine", () => {
  it("defines JOURNAL_TRANSITIONS", () => {
    expect(JRN_ROUTE).toContain("JOURNAL_TRANSITIONS");
  });

  it("journal statuses include draft through reversed", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("draft:");
    expect(block).toContain("pending_approval:");
    expect(block).toContain("approved:");
    expect(block).toContain("posted:");
  });

  it("reversed and cancelled are terminal journal states", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    expect(block).toContain("reversed:         []");
    expect(block).toContain("cancelled:        []");
  });

  it("posted can only transition to reversed", () => {
    const idx = JRN_ROUTE.indexOf("JOURNAL_TRANSITIONS");
    const block = JRN_ROUTE.slice(idx, idx + 500);
    const postedLine = block.slice(
      block.indexOf("posted:"),
      block.indexOf("\n", block.indexOf("posted:"))
    );
    expect(postedLine).toContain("reversed");
  });
});

describe("Journal route structure", () => {
  it("expense CRUD endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/expenses"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/expenses"');
    expect(JRN_ROUTE).toContain('journalRouter.patch("/expenses/:id"');
    expect(JRN_ROUTE).toContain('journalRouter.delete("/expenses/:id"');
  });

  it("expense approval endpoint exists", () => {
    expect(JRN_ROUTE).toContain('"/expenses/:id/approve"');
  });

  it("voucher CRUD endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/vouchers"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/vouchers"');
    expect(JRN_ROUTE).toContain('journalRouter.patch("/vouchers/:id"');
    expect(JRN_ROUTE).toContain('journalRouter.delete("/vouchers/:id"');
  });

  it("salary advance endpoints exist", () => {
    expect(JRN_ROUTE).toContain('"/salary-advances"');
    expect(JRN_ROUTE).toContain('"/salary-advances/:id/approve"');
  });

  it("journal entry endpoints exist", () => {
    expect(JRN_ROUTE).toContain('journalRouter.get("/journal"');
    expect(JRN_ROUTE).toContain('journalRouter.post("/journal"');
  });

  it("journal reverse endpoint exists", () => {
    expect(JRN_ROUTE).toContain('"/journal/:id/reverse"');
  });

  it("year-end close endpoint exists", () => {
    expect(JRN_ROUTE).toContain("year-end-close");
  });

  it("opening balances endpoints exist", () => {
    expect(JRN_ROUTE).toContain('"/opening-balances"');
    expect(JRN_ROUTE).toContain('"/opening-balances/import-csv"');
  });
});

describe("Finance lifecycle integration", () => {
  it("invoices import applyTransition", () => {
    expect(INV_ROUTE).toContain("applyTransition");
    expect(INV_ROUTE).toContain("lifecycleEngine");
  });

  it("journal imports applyTransition", () => {
    expect(JRN_ROUTE).toContain("applyTransition");
    expect(JRN_ROUTE).toContain("lifecycleEngine");
  });

  it("invoices use lifecycleErrorResponse", () => {
    expect(INV_ROUTE).toContain("lifecycleErrorResponse");
  });
});

describe("Finance event emission contract", () => {
  it("emits events on invoice operations", () => {
    expect(INV_ROUTE).toContain("emitEvent");
  });

  it("emits events on journal operations", () => {
    expect(JRN_ROUTE).toContain("emitEvent");
  });

  it("invoices create audit logs", () => {
    const auditCalls = INV_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(3);
  });

  it("journal creates audit logs", () => {
    const auditCalls = JRN_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Finance security contracts", () => {
  it("validates invoice input with zod on create", () => {
    expect(INV_ROUTE).toContain("createInvoiceSchema.safeParse");
  });

  it("validates payment input with zod", () => {
    expect(INV_ROUTE).toContain("createPaymentSchema.safeParse");
  });

  it("validates credit memo input with zod", () => {
    expect(INV_ROUTE).toContain("createCreditMemoSchema.safeParse");
  });

  it("checks financial period open before posting", () => {
    expect(INV_ROUTE).toContain("checkFinancialPeriodOpen");
    expect(JRN_ROUTE).toContain("checkFinancialPeriodOpen");
  });

  it("invoice approval uses approval chain", () => {
    expect(INV_ROUTE).toContain("initiateApprovalChain");
  });

  it("invoice approval actions: approve, reject, return", () => {
    expect(INV_ROUTE).toContain('"/invoices/:id/approve"');
    expect(INV_ROUTE).toContain('"/invoices/:id/reject"');
    expect(INV_ROUTE).toContain('"/invoices/:id/return"');
  });

  it("reverseAccountBalances is available for journal reversal", () => {
    expect(JRN_ROUTE).toContain("reverseAccountBalances");
  });

  it("attachment is required for high-value operations", () => {
    expect(JRN_ROUTE).toContain("checkAttachmentRequired");
  });
});

describe("Finance VAT handling", () => {
  it("invoice creation computes VAT", () => {
    expect(INV_ROUTE).toContain("computeVat");
  });

  it("supports extractBaseFromGross", () => {
    expect(INV_ROUTE).toContain("extractBaseFromGross");
  });
});

// ─── PG-1/2 — Scheduler GL routing invariant ──────────────────────────────
// Background (RCA PG-1/2): every automated journal entry the platform
// posts MUST go through `financialEngine.postJournalEntry` so it inherits
// the engine's three guarantees uniformly — (1) sourceKey idempotency
// (PD-6), (2) financial-period gate (PER-2), (3) account validation. A
// scheduler path that bypasses the engine — by issuing a raw INSERT or
// by calling the lower-level createJournalEntry directly — silently
// strips all three protections. The system supports two scheduled GL
// producers today: the depreciation cron (cronScheduler.ts) and the
// recurring-journal processor (recurringJournalProcessor.ts). These
// tests lock in the routing contract so a future refactor cannot quietly
// regress to a direct INSERT or a bare createJournalEntry call.

describe("PG-1/2 — Scheduler GL routing through financialEngine", () => {
  it("cronScheduler.depreciation goes through financialEngine.postJournalEntry", () => {
    // The monthly depreciation cron posts via the engine (cron at line
    // ~2198 today). The engine carries the period gate + sourceKey, so
    // a closed period or a retry hit a guarded path instead of producing
    // a duplicate depreciation entry. A regression that switches this
    // to rawExecute(`INSERT INTO journal_entries ...`) loses both
    // guarantees silently.
    expect(CRON_SCHEDULER).toContain("financialEngine.postJournalEntry");
    expect(CRON_SCHEDULER).toContain("sourceKey:");
  });

  it("cronScheduler.depreciation does not bypass with a raw journal_entries INSERT", () => {
    // Belt-and-braces: assert the cron file never issues a direct INSERT
    // INTO journal_entries. Catches a refactor that imports rawExecute
    // and re-implements the post inline.
    expect(CRON_SCHEDULER).not.toMatch(/INSERT\s+INTO\s+journal_entries/i);
  });

  it("recurringJournalProcessor goes through financialEngine.postJournalEntry", () => {
    // processDueRecurringJournals → runRecurringJournal calls the engine
    // (line ~36). Like the depreciation cron, this inherits period gate
    // + sourceKey idempotency so a re-fire (operator-triggered or
    // scheduler-triggered) collapses onto the existing JE instead of
    // duplicating.
    expect(RECURRING_PROC).toContain("financialEngine.postJournalEntry");
    expect(RECURRING_PROC).toContain("sourceKey:");
  });

  it("recurringJournalProcessor does not bypass with a raw journal_entries INSERT", () => {
    expect(RECURRING_PROC).not.toMatch(/INSERT\s+INTO\s+journal_entries/i);
  });

  it("recurringJournalProcessor does not bypass via direct createJournalEntry import", () => {
    // createJournalEntry is the lower-level primitive; the scheduler
    // must route via the engine wrapper so the sourceKey-volatility
    // guard (rejects Date.now()-style keys) fires before any post.
    expect(RECURRING_PROC).not.toMatch(/from\s+["'][^"']*businessHelpers[^"']*["'][^;]*createJournalEntry/);
  });
});

// ─── VL-1 — Voucher PATCH guard contract ────────────────────────────────────
// PATCH /vouchers/:id was a generic "edit description on any journal_entries
// row" — no status guard, no period gate, and no ref-prefix filter. An
// approved voucher's description could be silently rewritten in place,
// breaking the "approved JE is immutable" audit invariant. The fix mirrors
// PD-4 on PATCH /expenses/:id (which already had the equivalent guards):
//   • Ref-prefix filter so only RV/PV rows are addressable from this route
//   • Status guard rejecting edits on approved/rejected/cancelled/reversed
//   • Period gate rejecting edits when the voucher's `date` sits in a
//     closed period (the eventual approval would be blocked by H2 anyway)

describe("VL-1 — PATCH /vouchers/:id guards", () => {
  it("filters by RV/PV ref prefix on both SELECT and UPDATE (no leakage to other JE types)", () => {
    const idx = JRN_ROUTE.indexOf('journalRouter.patch("/vouchers/:id"');
    expect(idx).toBeGreaterThan(-1);
    const block = JRN_ROUTE.slice(idx, idx + 3500);
    // Both the precondition SELECT and the UPDATE carry the ref filter.
    // A regression that drops one would let an expense / manual-journal
    // id pass through and silently rewrite that row's description.
    const refClauseMatches = block.match(/ref LIKE 'RV%' OR ref LIKE 'PV%'/g) ?? [];
    expect(refClauseMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects edits on approved / terminal-state vouchers (VL-1)", () => {
    const idx = JRN_ROUTE.indexOf('journalRouter.patch("/vouchers/:id"');
    const block = JRN_ROUTE.slice(idx, idx + 3500);
    expect(block).toContain("TERMINAL_VOUCHER_STATES");
    expect(block).toContain('"approved"');
    expect(block).toContain('"rejected"');
    expect(block).toContain('"cancelled"');
    expect(block).toContain('"reversed"');
    expect(block).toContain("ConflictError");
  });

  it("runs the financial-period gate against the voucher's accounting date", () => {
    const idx = JRN_ROUTE.indexOf('journalRouter.patch("/vouchers/:id"');
    const block = JRN_ROUTE.slice(idx, idx + 3500);
    // Period check by the voucher's `date` (ledger date), not `createdAt`
    // (insertion time) — H2/H4 convention.
    expect(block).toContain('date::text AS "entryDate"');
    expect(block).toContain("checkFinancialPeriodOpen(scope.companyId, existing.entryDate)");
  });
});

// ─── DELETE /expenses/:id — budget reservation release ─────────────────────
// The expense CREATE path (finance-journal.ts:474) bumps `budgets.used` by
// the expense amount as a soft reservation, BEFORE the JE is even posted.
// Reject/return at finance-journal.ts:672 releases that reservation when
// the expense is killed mid-workflow. But DELETE used to be the lone
// sibling that didn't release it — every draft expense deleted before
// approval permanently inflated budgets.used by its amount. This block
// locks the release in so the parity stays.

describe("DELETE /expenses/:id — budget reservation release", () => {
  it("releases the budgets.used reservation alongside the soft-delete", () => {
    const idx = JRN_ROUTE.indexOf('journalRouter.delete("/expenses/:id"');
    expect(idx).toBeGreaterThan(-1);
    const block = JRN_ROUTE.slice(idx, idx + 3000);
    // The release SQL mirrors the reject/return path exactly: budgets.used
    // -= sum of the deleted JE's debit lines, GREATEST(0,…) flooring,
    // matched by (companyId, accountCode, period) where period is derived
    // from the JE's createdAt month.
    expect(block).toContain("UPDATE budgets b");
    expect(block).toContain("SET used = GREATEST(0, b.used - sub.total)");
    expect(block).toContain('to_char(je."createdAt"');
    expect(block).toContain("SUM(jl.debit)");
  });

  it("wraps soft-delete + ledger reversal + budget release in one transaction", () => {
    // Atomicity: if the budget release fails after the soft-delete
    // committed, you'd be back at the original silent-corruption state
    // (deleted expense but inflated budget). withTransaction makes the
    // three writes commit or roll back together.
    const idx = JRN_ROUTE.indexOf('journalRouter.delete("/expenses/:id"');
    const block = JRN_ROUTE.slice(idx, idx + 3000);
    expect(block).toContain("withTransaction(async (client)");
    // The order matters too: SELECT-and-soft-delete first, then reverse
    // balances, then release budget — all inside the same transaction.
    const softDeleteIdx = block.indexOf('UPDATE journal_entries SET "deletedAt"');
    const reverseIdx = block.indexOf("reverseAccountBalances");
    const budgetIdx = block.indexOf("UPDATE budgets b");
    expect(softDeleteIdx).toBeGreaterThan(-1);
    expect(reverseIdx).toBeGreaterThan(softDeleteIdx);
    expect(budgetIdx).toBeGreaterThan(reverseIdx);
  });
});

// ─── PATCH /invoices/:id — ZATCA-submission immutability ────────────────────
// finance-zatca.ts uses invoice.description as the line-description
// fallback when invoice_lines are missing one. Once an invoice has been
// submitted to ZATCA (zatcaStatus IS NOT NULL — accepted / submitted /
// rejected), editing the description locally creates an audit-trail
// divergence: the regulator's record shows the original text, the local
// DB shows the new one. The sanctioned correction is a credit memo +
// re-issue, not an in-place rewrite. Lock the guard in so a future
// refactor that drops the check is caught immediately.

describe("PATCH /invoices/:id — ZATCA-submission immutability", () => {
  it("rejects description edits when zatcaStatus is set", () => {
    const idx = INV_ROUTE.indexOf('invoicesRouter.patch("/invoices/:id"');
    expect(idx).toBeGreaterThan(-1);
    const block = INV_ROUTE.slice(idx, idx + 4500);
    // The guard sits inside the `description !== undefined` branch so
    // edits to OTHER fields (dueDate, status via state machine) still
    // work post-submission — only the ZATCA-material description is
    // locked.
    expect(block).toContain("existing.zatcaStatus");
    expect(block).toContain("ConflictError");
    expect(block).toMatch(/credit memo|إشعار دائن/);
  });
});
