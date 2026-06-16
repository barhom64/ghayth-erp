import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FIN-P4-SLICE-C — umrahInvoicingEngine opt-in migration path.
 *
 * SLICE-B published the engine wiring; SLICE-C opens the migration
 * path on the umrah side WITHOUT breaking the legacy path:
 *
 *   - Legacy `generateSalesInvoice` (production today) — stays
 *     unchanged: numbering + INSERT + manual GL line build +
 *     createGuardedJournalEntry direct. No silent behaviour flip.
 *
 *   - New `generateSalesInvoiceViaFacade` — routes through
 *     `financialEngine.postSalesInvoice` so the central engine
 *     handles numbering + tax + accounts + period + JE while the
 *     caller's INSERT callback writes the umrah_sales_invoices
 *     row.
 *
 * Routes opt in one-by-one. SLICE-D (separate) retires the legacy
 * path once every caller has migrated.
 *
 * Permanent Hard Rails:
 *   - No silent behaviour change. Both paths live; no route flipped
 *     by this slice.
 *   - The new path uses ONLY the SLICE-B façade — no direct
 *     createGuardedJournalEntry inside the new function.
 *   - sourceRefs.sourceKey is stable (not a Date.now()-volatile
 *     hash) for JE idempotency.
 *   - The caller's INSERT callback uses the prepared payload
 *     (invoiceNumber + totals + accounts) — no double issue.
 *
 * Failure modes pinned:
 *   - The new function gets deleted → §A fails.
 *   - It stops importing financialEngine → §B fails.
 *   - It calls createGuardedJournalEntry directly (bypassing the
 *     façade) → §C fails.
 *   - It silently flips routes (e.g. the legacy generateSalesInvoice
 *     starts calling the façade) → §D fails.
 *   - INSERT callback is missing or doesn't return invoiceId → §E
 *     fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const UMRAH = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

// Slice the new function body so the assertions stay scoped.
const VIA_FACADE =
  UMRAH.match(
    /export\s+async\s+function\s+generateSalesInvoiceViaFacade[\s\S]+?(?=^export\s+async\s+function\s+|^export\s+function\s+|^\/\/ ─{3})/m,
  )?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// §A — New function shipped + exported with the right shape
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §A — generateSalesInvoiceViaFacade is exported with the SLICE-B input shape", () => {
  it("function is declared async and exported", () => {
    expect(UMRAH).toMatch(
      /export\s+async\s+function\s+generateSalesInvoiceViaFacade\(\s*scope:\s*Scope,/,
    );
  });

  it("input carries the SLICE-B SalesInvoiceRequest essentials (subAgentId, clientId, seasonId, lines)", () => {
    expect(VIA_FACADE.length).toBeGreaterThan(500);
    expect(VIA_FACADE).toMatch(/subAgentId:\s*number/);
    expect(VIA_FACADE).toMatch(/clientId:\s*number/);
    expect(VIA_FACADE).toMatch(/seasonId:\s*number/);
    expect(VIA_FACADE).toMatch(/lines:\s*Array<\{/);
  });

  it("rejects an empty lines array with a ValidationError", () => {
    expect(VIA_FACADE).toMatch(
      /if\s*\(\s*!input\.lines\?\.length\s*\)[\s\S]{0,200}?throw\s+new\s+ValidationError/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Imports the financialEngine façade + InsertSalesInvoiceFn type
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §B — file imports financialEngine + InsertSalesInvoiceFn from the engine module", () => {
  it("imports the financialEngine singleton", () => {
    expect(UMRAH).toMatch(
      /import\s*\{\s*financialEngine[\s\S]{0,200}?\}\s*from\s*["']\.\/engines\/financialEngine\.js["']/,
    );
  });

  it("imports the InsertSalesInvoiceFn callback type", () => {
    expect(UMRAH).toMatch(/type\s+InsertSalesInvoiceFn/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — New function routes via financialEngine.postSalesInvoice ONLY
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §C — generateSalesInvoiceViaFacade routes via the façade and does NOT call createGuardedJournalEntry directly", () => {
  it("calls financialEngine.postSalesInvoice once with the insertInvoice callback", () => {
    expect(VIA_FACADE).toMatch(/financialEngine\.postSalesInvoice\(/);
    expect(VIA_FACADE).toMatch(/,\s*insertInvoice,?\s*\)/);
  });

  it("passes the InsertSalesInvoiceFn callback as the second argument", () => {
    expect(VIA_FACADE).toMatch(/const\s+insertInvoice:\s*InsertSalesInvoiceFn\s*=/);
  });

  it("does NOT call createGuardedJournalEntry inside the new function (bypass guard)", () => {
    expect(VIA_FACADE).not.toMatch(/createGuardedJournalEntry/);
  });

  it("does NOT issueNumber inside the new function (engine owns numbering)", () => {
    // The legacy path issues the number locally; the new path delegates.
    expect(VIA_FACADE).not.toMatch(/issueNumber\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Legacy generateSalesInvoice path stays unchanged
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §D — legacy generateSalesInvoice path is untouched (no silent flip)", () => {
  const LEGACY =
    UMRAH.match(
      /export\s+async\s+function\s+generateSalesInvoice\(\s*scope:\s*Scope[\s\S]+?(?=^export\s+async\s+function\s+|^\/\/ ─{3})/m,
    )?.[0] ?? "";

  it("legacy function still declared + body non-trivial", () => {
    expect(LEGACY.length).toBeGreaterThan(1000);
  });

  it("legacy still issues number locally via issueNumber", () => {
    expect(LEGACY).toMatch(/issueNumber\(/);
  });

  it("legacy still calls createGuardedJournalEntry directly", () => {
    expect(LEGACY).toMatch(/createGuardedJournalEntry\(/);
  });

  it("legacy does NOT silently call the new façade", () => {
    expect(LEGACY).not.toMatch(/financialEngine\.postSalesInvoice/);
    expect(LEGACY).not.toMatch(/generateSalesInvoiceViaFacade/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — INSERT callback shape is correct
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §E — INSERT callback uses prepared payload and returns invoiceId", () => {
  it("callback INSERTs into umrah_sales_invoices using prepared.invoiceNumber", () => {
    expect(VIA_FACADE).toMatch(
      /INSERT\s+INTO\s+umrah_sales_invoices[\s\S]{0,1000}?prepared\.invoiceNumber/,
    );
  });

  it("callback returns { invoiceId: result.rows[0].id }", () => {
    expect(VIA_FACADE).toMatch(/return\s*\{\s*invoiceId:\s*result\.rows\[0\]\.id\s*\}/);
  });

  it("sourceKey is stable (composed from subAgentId + seasonId + first-line description, NOT Date.now())", () => {
    expect(VIA_FACADE).toMatch(/sourceKey\s*=\s*\n?\s*`umrah:salesinv:/);
    expect(VIA_FACADE).not.toMatch(/Date\.now\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — Side effects mirror the legacy path (audit + event)
// ─────────────────────────────────────────────────────────────────────────────
describe("FIN-P4-SLICE-C §F — new path emits audit + event on successful posting", () => {
  it("emits umrah.sales_invoice.created event when postingStatus is posted", () => {
    expect(VIA_FACADE).toMatch(
      /postingStatus\s*===\s*["']posted["'][\s\S]{0,800}?emitEvent\(\s*\{[\s\S]{0,400}?action:\s*["']umrah\.sales_invoice\.created["']/,
    );
  });

  it("creates audit log when postingStatus is posted", () => {
    expect(VIA_FACADE).toMatch(
      /postingStatus\s*===\s*["']posted["'][\s\S]{0,2000}?createAuditLog\(/,
    );
  });

  it("event + audit payload carries viaFacade: true (tells inspectors which path posted)", () => {
    expect(VIA_FACADE).toMatch(/viaFacade:\s*true/);
  });
});
