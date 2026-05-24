import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Sales-return COGS reversal — audit follow-up to #1002 + #1013.
// Verifies that:
//   1. migration 210 adds cogsReversedTotal + cogsJournalEntryId to
//      credit_memos and cogsReversedAmount + cogsReversedAt +
//      cogsReversalJson to invoice_lines,
//   2. cogsPosting.ts exports planCogsReversal + applyStockReversals,
//   3. the credit-memo route plans the reversal proportionally
//      (creditAmount / invoice.total), splices the DR Inventory /
//      CR COGS lines into the memo JE, applies the restock, and
//      writes the per-line snapshot,
//   4. cumulative reversal tracking prevents over-restock on a
//      second partial memo.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/210_credit_memo_cogs_reversal.sql"),
  "utf8"
);
const HELPER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/inventory/cogsPosting.ts"),
  "utf8"
);
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8"
);
const SCHEMA_PRE = readFileSync(join(REPO_ROOT, "db/schema_pre.sql"), "utf8");

// Isolate the credit-memo handler.
const HANDLER_START = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/credit-memo"');
const HANDLER_END = ROUTE.indexOf('invoicesRouter.post("/invoices/:id/debit-memo"', HANDLER_START);
const HANDLER = ROUTE.slice(HANDLER_START, HANDLER_END);

// ── Migration 210 schema ────────────────────────────────────────────────────

describe("migration 210 — credit_memos rollup", () => {
  for (const col of ["cogsReversedTotal", "cogsJournalEntryId"]) {
    it(`adds ${col} to credit_memos`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.credit_memos[\\s\\S]{0,500}"${col}"`));
    });
  }
  it("partial index for memos that touched COGS", () => {
    expect(MIGRATION).toContain("idx_credit_memos_cogs_reversed");
    expect(MIGRATION).toMatch(/WHERE "cogsReversedTotal" > 0/);
  });
});

describe("migration 210 — invoice_lines reversal tracker", () => {
  for (const col of ["cogsReversedAmount", "cogsReversedAt", "cogsReversalJson"]) {
    it(`adds ${col} to invoice_lines`, () => {
      expect(MIGRATION).toMatch(new RegExp(`ALTER TABLE public\\.invoice_lines[\\s\\S]{0,500}"${col}"`));
    });
  }
  it("partial index for partially-reversed lines", () => {
    expect(MIGRATION).toContain("idx_invoice_lines_cogs_partially_reversed");
    expect(MIGRATION).toMatch(/WHERE "cogsReversedAmount" > 0/);
  });
});

describe("schema_pre.sql declares the new columns", () => {
  it("credit_memos carries cogsReversedTotal + cogsJournalEntryId", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.credit_memos ");
    const section = SCHEMA_PRE.slice(idx, idx + 2500);
    expect(section).toContain('"cogsReversedTotal"');
    expect(section).toContain('"cogsJournalEntryId"');
  });
  it("invoice_lines carries the reversal columns", () => {
    const idx = SCHEMA_PRE.indexOf("CREATE TABLE public.invoice_lines ");
    const section = SCHEMA_PRE.slice(idx, idx + 3000);
    expect(section).toContain('"cogsReversedAmount"');
    expect(section).toContain('"cogsReversedAt"');
    expect(section).toContain('"cogsReversalJson"');
  });
});

// ── Helper API ──────────────────────────────────────────────────────────────

describe("cogsPosting.ts reversal helpers", () => {
  for (const fn of ["planCogsReversal", "applyStockReversals"]) {
    it(`exports ${fn}`, () => {
      expect(HELPER).toMatch(new RegExp(`export (async )?function ${fn}`));
    });
  }
  it("ratio is capped at 1.0 so a buggy >1 caller can't over-restock", () => {
    expect(HELPER).toMatch(/Math\.min\(input\.ratio, 1\)/);
  });
  it("resolves accounts INVERTED (DR Inventory / CR COGS)", () => {
    expect(HELPER).toMatch(/"inventory_asset",\s*"debit"/);
    expect(HELPER).toMatch(/"cogs_default",\s*"credit"/);
  });
  it("loads invoice_lines where cogsAmount > cogsReversedAmount (skips fully-reversed)", () => {
    expect(HELPER).toMatch(/COALESCE\("cogsAmount", 0\) > COALESCE\("cogsReversedAmount", 0\)/);
  });
  it("caps each line's slice at remaining unreversed so multi-memo sums never overshoot", () => {
    expect(HELPER).toMatch(/Math\.min\(cogsAmount \* ratio, remaining\)/);
  });
  it("prorates each lot by lineRatio (preserves the original lot identity)", () => {
    expect(HELPER).toMatch(/alloc\.quantity \* lineRatio/);
    expect(HELPER).toMatch(/alloc\.extendedCost \* lineRatio/);
  });
  it("applyStockReversals writes warehouse_movements type='return'", () => {
    expect(HELPER).toContain("INSERT INTO warehouse_movements");
    expect(HELPER).toMatch(/'return'/);
  });
  it("applyStockReversals INCREMENTS the lot quantity (not decrement)", () => {
    expect(HELPER).toMatch(/UPDATE warehouse_stock_lots\s+SET quantity = quantity \+ \$1/);
  });
});

// ── Credit-memo route wiring ────────────────────────────────────────────────

describe("credit-memo route plans + applies reversal", () => {
  it("dynamically imports planCogsReversal + applyStockReversals", () => {
    expect(HANDLER).toContain('await import(\n        "../lib/inventory/cogsPosting.js"\n      )');
    expect(HANDLER).toContain("planCogsReversal");
    expect(HANDLER).toContain("applyStockReversals");
  });
  it("computes reversalRatio = creditAmount / invoice.total", () => {
    expect(HANDLER).toMatch(/reversalRatio = invoiceTotal > 0 \? creditAmount \/ invoiceTotal : 0/);
  });
  it("passes memoId so the snapshot remembers which memo did the restore", () => {
    expect(HANDLER).toMatch(/memoId: memoId \?\? 0,/);
  });
  it("splices cogsReversalPlan.journalLines into the memo JE", () => {
    expect(HANDLER).toMatch(/\.\.\.cogsReversalPlan\.journalLines,/);
  });
  it("applies stock reversals only when there are line updates", () => {
    expect(HANDLER).toMatch(/cogsReversalPlan\.lineUpdates\.length > 0/);
  });
  it("per-line UPDATE appends snapshot to cogsReversalJson (jsonb || jsonb)", () => {
    expect(HANDLER).toMatch(/UPDATE invoice_lines/);
    expect(HANDLER).toMatch(/"cogsReversedAmount" = \$1/);
    expect(HANDLER).toMatch(/COALESCE\("cogsReversalJson", '\[\]'::jsonb\) \|\| \$2::jsonb/);
  });
  it("updates credit_memos.cogsReversedTotal", () => {
    expect(HANDLER).toMatch(/UPDATE credit_memos SET "cogsReversedTotal" = \$1/);
  });
});

// ── Documentation ───────────────────────────────────────────────────────────

describe("migration 210 governance", () => {
  it("declares @rollback hints", () => {
    expect(MIGRATION).toMatch(/@rollback:/);
  });
  it("explains the FIFO-restock auditor concern", () => {
    expect(MIGRATION).toMatch(/restock-at-wrong-cost|currently oldest/i);
  });
});
