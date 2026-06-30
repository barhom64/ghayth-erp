import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P4-SLICE-B — engine wiring smoke.
 *
 * SLICE-A shipped the contract surface (interfaces + stub method).
 * SLICE-B replaces the stub with the actual wiring:
 *   issueNumber → computeTaxFromTaxCode → getAccountCodeFromMapping
 *   → checkFinancialPeriodOpen → withTransaction → caller INSERT
 *   → createGuardedJournalEntry → return SalesInvoiceResponse.
 *
 * SLICE-C (next) swaps umrahInvoicingEngine off the direct
 * createGuardedJournalEntry path onto this façade.
 *
 * Permanent Hard Rails:
 *   - The engine NEVER inserts the operational row itself — the
 *     caller's `insertInvoice` callback owns the INSERT. The engine
 *     only knows numbering/tax/accounts/period/JE.
 *   - createGuardedJournalEntry stays the single allowed GL entry
 *     point (doctrine §1.1). The façade just centralises the chain.
 *   - No caller has migrated yet (SLICE-C ships the umrah swap) — §F
 *     pins the absence so SLICE-C explicitly opens the gate.
 *
 * Failure modes pinned:
 *   - Engine stops calling issueNumber → §A fails.
 *   - Engine stops computing per-line tax → §B fails.
 *   - Engine stops resolving accounts via mapping → §C fails.
 *   - Engine forgets the period gate → §D fails.
 *   - Engine inlines INSERT instead of delegating to callback → §E fails.
 *   - A caller migrates without ratification → §F fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ENGINE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/engines/financialEngine.ts"),
  "utf8",
);

// Slice the postSalesInvoice method body so each assertion is scoped.
const METHOD =
  ENGINE.match(
    /async\s+postSalesInvoice\(\s*request:\s*SalesInvoiceRequest,\s*insertInvoice:[\s\S]+?(?=^\}\s*$|^\s{2}async\s|^\s{2}\w+\(|\nexport const)/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — Numbering via numberingService.issueNumber
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §A — postSalesInvoice calls numberingService.issueNumber", () => {
  it("method body is located + non-trivial", () => {
    expect(METHOD.length).toBeGreaterThan(500);
  });

  it("calls issueNumber({moduleKey, entityKey, companyId, branchId, entityTable, actorId, expectedTiming})", () => {
    expect(METHOD).toMatch(/issueNumber\(\s*\{/);
    expect(METHOD).toMatch(/moduleKey:\s*request\.moduleKey/);
    expect(METHOD).toMatch(/entityKey:\s*request\.entityKey/);
    expect(METHOD).toMatch(/companyId:\s*request\.companyId/);
    expect(METHOD).toMatch(/branchId:\s*request\.branchId/);
    expect(METHOD).toMatch(/entityTable:\s*request\.sourceRefs\.sourceType/);
    expect(METHOD).toMatch(/actorId:\s*request\.createdBy/);
    // Unified to 'on_draft' — the route-level creation paths for the same
    // entities (finance/sales_invoice, umrah/umrah_agent_invoice) issue at
    // 'on_draft', so a single scheme can only satisfy both the route and the
    // engine when both declare the same timing. expectedTiming is a pure
    // consistency assertion and does not change when the number is allocated.
    expect(METHOD).toMatch(/expectedTiming:\s*["']on_draft["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Per-line tax via computeTaxFromTaxCode
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §B — per-line tax via computeTaxFromTaxCode", () => {
  it("loops over request.lines + calls computeTaxFromTaxCode per line", () => {
    expect(METHOD).toMatch(/for\s*\(\s*const\s+line\s+of\s+request\.lines\s*\)/);
    expect(METHOD).toMatch(/computeTaxFromTaxCode\(\s*\{[\s\S]{0,400}?taxCode:\s*line\.taxCode/);
  });

  it("non-taxable lines (isTaxable=false) skip the tax service", () => {
    // The branch must explicitly check isTaxable so a buggy mapping
    // can't turn a VAT-exempt line into a taxable one.
    expect(METHOD).toMatch(/line\.isTaxable\s*\?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — AR + revenue + VAT accounts via getAccountCodeFromMapping
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §C — accounts resolved via getAccountCodeFromMapping", () => {
  it("resolves the AR account with operation `<moduleKey>_ar`, side 'debit'", () => {
    expect(METHOD).toMatch(/const\s+arOperation\s*=\s*`\$\{request\.moduleKey\}_ar`/);
    expect(METHOD).toMatch(
      /getAccountCodeFromMapping\(\s*request\.companyId,\s*arOperation,\s*["']debit["']/,
    );
  });

  it("resolves the revenue account per line with operation `<moduleKey>_revenue`, side 'credit'", () => {
    expect(METHOD).toMatch(/const\s+revOperation\s*=\s*`\$\{request\.moduleKey\}_revenue`/);
    expect(METHOD).toMatch(
      /getAccountCodeFromMapping\(\s*request\.companyId,\s*revOperation,\s*["']credit["']/,
    );
  });

  it("resolves the VAT output account when taxTotal > 0 (operation 'vat_output')", () => {
    expect(METHOD).toMatch(
      /if\s*\(\s*taxTotal\s*>\s*0\s*\)[\s\S]{0,400}?getAccountCodeFromMapping\(\s*request\.companyId,\s*["']vat_output["']/,
    );
  });

  it("uses generic fallback codes (1210 AR / 4110 revenue / 2310 VAT) when mapping is absent", () => {
    expect(METHOD).toMatch(/["']1210["']/);
    expect(METHOD).toMatch(/["']4110["']/);
    expect(METHOD).toMatch(/["']2310["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Period gate + deferred posting status
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §D — period gate honored", () => {
  it("calls checkFinancialPeriodOpen(companyId, invoiceDate)", () => {
    expect(METHOD).toMatch(
      /checkFinancialPeriodOpen\(\s*request\.companyId,\s*invoiceDate\s*\)/,
    );
  });

  it("returns postingStatus='deferred' when the period is closed (does NOT throw)", () => {
    expect(METHOD).toMatch(/postingStatus:\s*["']deferred["']/);
    // The deferred branch must surface invoiceNumber + totals so the
    // caller can decide whether to queue. invoiceId is 0 (not yet inserted).
    expect(METHOD).toMatch(/invoiceId:\s*0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Caller-driven INSERT + createGuardedJournalEntry inside one transaction
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §E — operational INSERT delegated to caller + JE inside withTransaction", () => {
  it("opens withTransaction before calling insertInvoice + createGuardedJournalEntry", () => {
    expect(METHOD).toMatch(/withTransaction\(\s*async\s*\(\s*client\s*\)/);
  });

  it("calls the caller's insertInvoice(prepared, client) callback", () => {
    expect(METHOD).toMatch(/insertInvoice\(\s*prepared,\s*client\s*\)/);
  });

  it("guards against a callback that returns no invoiceId", () => {
    expect(METHOD).toMatch(/insertInvoice callback returned no invoiceId/);
  });

  it("posts the JE via createGuardedJournalEntry (NOT a raw INSERT INTO journal_entries)", () => {
    expect(METHOD).toMatch(/createGuardedJournalEntry\(/);
    expect(METHOD).not.toMatch(/INSERT\s+INTO\s+journal_entries/i);
  });

  it("AR line is a single debit against grandTotal", () => {
    expect(METHOD).toMatch(
      /accountCode:\s*arAccountCode,\s*debit:\s*grandTotal,\s*credit:\s*0/,
    );
  });

  it("revenue + VAT lines are credits", () => {
    expect(METHOD).toMatch(
      /accountCode:\s*l\.revenueAccountCode,\s*debit:\s*0,\s*credit:\s*l\.lineTotalExclTax/,
    );
    expect(METHOD).toMatch(
      /accountCode:\s*taxAccountCode,\s*debit:\s*0,\s*credit:\s*taxTotal/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — SLICE-C: opt-in migration path exists alongside the legacy path
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-B §F — umrahInvoicingEngine exposes both paths", () => {
  const UMRAH_INVOICING = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
    "utf8",
  );

  it("legacy generateSalesInvoice still calls createGuardedJournalEntry directly", () => {
    expect(UMRAH_INVOICING).toMatch(/createGuardedJournalEntry/);
  });

  it("new generateSalesInvoiceViaFacade calls financialEngine.postSalesInvoice", () => {
    expect(UMRAH_INVOICING).toMatch(/financialEngine\.postSalesInvoice/);
    expect(UMRAH_INVOICING).toMatch(
      /export\s+async\s+function\s+generateSalesInvoiceViaFacade\(/,
    );
  });
});
