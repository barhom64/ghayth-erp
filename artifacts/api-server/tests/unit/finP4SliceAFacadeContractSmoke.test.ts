import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P4-SLICE-A — postSalesInvoice façade CONTRACT smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + FIN-P4-CONTRACT #2257 §3/§4):
 *   - Pins the request / response interface shapes published on the
 *     financial engine as the canonical sales-invoice façade.
 *   - Pins that the impl is a stub (SLICE-B ships the wiring).
 *   - Pins that NO caller has migrated to the façade yet (SLICE-C
 *     ships the umrah swap).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine wiring exercised here.
 *   - No JE / AR / numbering call hit.
 *   - No FE / migration / route change.
 *
 * Failure modes pinned:
 *   - SalesInvoiceRequest loses a contract field → §A fails.
 *   - SalesInvoiceResponse loses a contract field → §B fails.
 *   - postSalesInvoice gets quietly deleted from the engine → §C fails.
 *   - Someone implements the stub before the contract is locked → §D
 *     fails (the SLICE-B gate must remain explicit until SLICE-B lands).
 *   - A caller swaps to postSalesInvoice prematurely → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const ENGINE_PATH = join(
  REPO_ROOT,
  "artifacts/api-server/src/lib/engines/financialEngine.ts",
);
const ENGINE = readFileSync(ENGINE_PATH, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// §A — SalesInvoiceRequest carries the OPERATIONAL envelope
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-A §A — SalesInvoiceRequest carries the canonical fields", () => {
  // Anchor on the interface block once so each field check is scoped.
  const REQUEST_BLOCK =
    ENGINE.match(/export\s+interface\s+SalesInvoiceRequest\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("interface is exported", () => {
    expect(REQUEST_BLOCK.length).toBeGreaterThan(0);
  });

  for (const field of [
    "companyId",
    "branchId",
    "createdBy",
    "moduleKey",
    "entityKey",
    "clientId",
    "sourceRefs",
    "lines",
  ]) {
    it(`carries '${field}'`, () => {
      expect(REQUEST_BLOCK).toMatch(new RegExp(`\\b${field}\\b`));
    });
  }

  it("declares SalesInvoiceLineInput as the per-line type", () => {
    expect(ENGINE).toMatch(/export\s+interface\s+SalesInvoiceLineInput\s*\{/);
    expect(REQUEST_BLOCK).toMatch(/lines:\s*SalesInvoiceLineInput\[\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — SalesInvoiceResponse carries the FINANCIAL outputs
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-A §B — SalesInvoiceResponse carries the canonical fields", () => {
  const RESPONSE_BLOCK =
    ENGINE.match(/export\s+interface\s+SalesInvoiceResponse\s*\{[\s\S]+?^\}/m)?.[0] ?? "";

  it("interface is exported", () => {
    expect(RESPONSE_BLOCK.length).toBeGreaterThan(0);
  });

  for (const field of [
    "invoiceNumber",
    "invoiceId",
    "journalEntryId",
    "arAccountCode",
    "revenueAccountCode",
    "taxAccountCode",
    "period",
    "postingStatus",
    // SLICE-B additions:
    "lineBreakdown",
    "totals",
  ]) {
    it(`carries '${field}'`, () => {
      expect(RESPONSE_BLOCK).toMatch(new RegExp(`\\b${field}\\b`));
    });
  }

  it("revenueAccountCode is an array (per-line)", () => {
    expect(RESPONSE_BLOCK).toMatch(/revenueAccountCode:\s*string\[\]/);
  });

  it("postingStatus is a 'posted' | 'deferred' | 'failed' union", () => {
    expect(RESPONSE_BLOCK).toMatch(
      /postingStatus:\s*["']posted["']\s*\|\s*["']deferred["']\s*\|\s*["']failed["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — postSalesInvoice is published on the engine implementation
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-A §C — postSalesInvoice method is published", () => {
  it("FinancialEngineImpl declares async postSalesInvoice(request, insertInvoice) returning Promise<SalesInvoiceResponse>", () => {
    // SLICE-B widened the signature from `(request)` to
    // `(request, insertInvoice)` so the engine doesn't need to know
    // which table the caller writes its operational row into.
    expect(ENGINE).toMatch(
      /async\s+postSalesInvoice\(\s*request:\s*SalesInvoiceRequest,\s*insertInvoice:\s*InsertSalesInvoiceFn\s*,?\s*\)\s*:\s*Promise<SalesInvoiceResponse>/,
    );
  });

  it("exports the InsertSalesInvoiceFn callback type", () => {
    expect(ENGINE).toMatch(/export\s+type\s+InsertSalesInvoiceFn\s*=/);
  });

  it("exports the PreparedSalesInvoiceForInsert payload type", () => {
    expect(ENGINE).toMatch(/export\s+interface\s+PreparedSalesInvoiceForInsert/);
  });

  it("financialEngine singleton is exported (so callers reach the method)", () => {
    expect(ENGINE).toMatch(/export\s+const\s+financialEngine\s*=\s*new\s+FinancialEngineImpl\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Implementation shipped (SLICE-B): body wires numbering + tax +
//       accounts + period gate + GL posting via the central helpers.
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-A §D — SLICE-B engine wiring is present", () => {
  it("body no longer throws the SLICE-B-not-implemented gate", () => {
    expect(ENGINE).not.toMatch(/FIN-P4-SLICE-B not implemented/);
  });

  it("body calls issueNumber({moduleKey, entityKey})", () => {
    expect(ENGINE).toMatch(
      /issueNumber\(\s*\{[\s\S]{0,500}?moduleKey:\s*request\.moduleKey[\s\S]{0,200}?entityKey:\s*request\.entityKey/,
    );
  });

  it("body calls computeTaxFromTaxCode per line", () => {
    expect(ENGINE).toMatch(/computeTaxFromTaxCode\(\s*\{[\s\S]{0,400}?taxCode:\s*line\.taxCode/);
  });

  it("body resolves AR + revenue accounts via getAccountCodeFromMapping", () => {
    expect(ENGINE).toMatch(/getAccountCodeFromMapping\(\s*request\.companyId,\s*arOperation/);
    expect(ENGINE).toMatch(/getAccountCodeFromMapping\(\s*request\.companyId,\s*revOperation/);
  });

  it("body gates on checkFinancialPeriodOpen and returns 'deferred' if closed", () => {
    expect(ENGINE).toMatch(/checkFinancialPeriodOpen\(\s*request\.companyId,\s*invoiceDate\s*\)/);
    expect(ENGINE).toMatch(/postingStatus:\s*["']deferred["']/);
  });

  it("body posts via createGuardedJournalEntry inside withTransaction", () => {
    expect(ENGINE).toMatch(
      /withTransaction\(\s*async\s*\(\s*client\s*\)[\s\S]{0,2000}?createGuardedJournalEntry\(/,
    );
  });

  it("imports issueNumber + computeTaxFromTaxCode (now actively used)", () => {
    expect(ENGINE).toMatch(/import\s*\{\s*issueNumber\s*\}\s*from\s*["']\.\.\/numberingService\.js["']/);
    expect(ENGINE).toMatch(
      /import\s*\{\s*computeTaxFromTaxCode\s*\}\s*from\s*["']\.\.\/taxCodes\.js["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — No caller has migrated to the façade yet (SLICE-C hasn't shipped)
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-A §E — no caller invokes postSalesInvoice yet", () => {
  // The ENGINE source itself references the symbol (declaration +
  // type annotations + smoke-relevant strings). Any USE outside the
  // engine file would mean SLICE-C shipped without the gate.
  const UMRAH_INVOICING = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
    "utf8",
  );

  it("umrahInvoicingEngine still uses createGuardedJournalEntry directly", () => {
    expect(UMRAH_INVOICING).toMatch(/createGuardedJournalEntry/);
  });

  it("umrahInvoicingEngine does NOT call financialEngine.postSalesInvoice", () => {
    expect(UMRAH_INVOICING).not.toMatch(/financialEngine\.postSalesInvoice/);
    expect(UMRAH_INVOICING).not.toMatch(/postSalesInvoice\(/);
  });
});
