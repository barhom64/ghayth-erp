import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §6.2 of #1870 — the NUSK purchase JE now carries the FULL cycle
 * dimensions per operator directive:
 *
 *   1) umrahAgentId   — the main NUSK agent (from umrah_nusk_invoices.agentId).
 *                       "الوكيل الرئيسي في نسك" the operator drills by.
 *   2) umrahSeasonId  — resolved via the NUSK row's groupId → group.seasonId.
 *                       Lets purchase cost roll up to the season's margin
 *                       report alongside the matching sales.
 *   3) vendorId       — companies.nuskSupplierId on the AP line so the
 *                       supplier sub-ledger («ذمم المورد — وزارة الحج
 *                       عبر نسك») reconciles end-to-end.
 *
 * All three live INSIDE `postNuskJournalEntries` so manual NUSK creation
 * (route /umrah/nusk-invoices) and import re-evaluation (NUSK update path)
 * post identical JE shapes — no caller has to remember the dimensions.
 *
 * Failure modes pinned:
 *   • A future refactor that drops the agent dimension → drill-by-agent
 *     reports go silent on the purchase side.
 *   • A refactor that puts vendorId on BOTH lines → trial-balance vendor
 *     drill double-counts the supplier.
 *   • A refactor that drops the season JOIN → margin reports lose the
 *     purchase-side cost basis for season-rolled metrics.
 */
const IMPORT_ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);

describe("§6.2 — postNuskJournalEntries resolves the cycle dimensions in ONE query", () => {
  it("single SELECT joins umrah_groups (for season) + companies (for vendor)", () => {
    expect(IMPORT_ENGINE).toMatch(/SELECT ni\."agentId"[\s\S]{0,300}g\."seasonId"[\s\S]{0,200}c\."nuskSupplierId"/);
    expect(IMPORT_ENGINE).toMatch(/FROM umrah_nusk_invoices ni[\s\S]{0,300}LEFT JOIN umrah_groups g ON g\.id = ni\."groupId" AND g\."companyId" = ni\."companyId"/);
    expect(IMPORT_ENGINE).toMatch(/LEFT JOIN companies c\s+ON c\.id = ni\."companyId"/);
  });

  it("scopes by ni.id AND ni.companyId (defence-in-depth: no cross-tenant leak)", () => {
    expect(IMPORT_ENGINE).toMatch(/WHERE ni\.id = \$1 AND ni\."companyId" = \$2/);
  });

  it("declares the purchaseDims shape AGENT + SEASON (the keys both JE lines spread)", () => {
    expect(IMPORT_ENGINE).toMatch(/const purchaseDims = \{[\s\S]{0,200}umrahAgentId: dims\?\.agentId \?\? undefined[\s\S]{0,200}umrahSeasonId: dims\?\.seasonId \?\? undefined/);
  });

  it("vendorId is RESOLVED from companies.nuskSupplierId, NOT hardcoded", () => {
    // The operator can change which supplier represents "وزارة الحج عبر نسك"
    // by updating companies.nuskSupplierId — the engine must follow that
    // pointer, never bake in an ID.
    expect(IMPORT_ENGINE).toMatch(/const vendorId = dims\?\.nuskSupplierId \?\? undefined/);
  });
});

describe("§6.2 — AP journal lines carry the right dimensions", () => {
  it("DR cost line spreads purchaseDims (agent + season) but is vendor-LESS", () => {
    // Cost is the company's own expense — not a vendor obligation. Putting
    // vendorId on the DR side would double-count the supplier on the
    // trial-balance vendor drill.
    expect(IMPORT_ENGINE).toMatch(/accountCode: expCode, debit: totalAmount, credit: 0, description: "تكلفة خدمات نسك", \.\.\.purchaseDims \}/);
  });

  it("CR AP line spreads purchaseDims AND vendorId (supplier sub-ledger reconciles)", () => {
    expect(IMPORT_ENGINE).toMatch(/accountCode: apCode, debit: 0, credit: totalAmount, description: "مستحقات نسك", \.\.\.purchaseDims, vendorId \}/);
  });
});

describe("§6.2 — refund reversal JE preserves the same dimensions", () => {
  it("reverse DR AP line carries purchaseDims + vendorId (mirrors the original CR)", () => {
    expect(IMPORT_ENGINE).toMatch(/accountCode: apCode, debit: refundAmount, credit: 0, description: "عكس مستحقات نسك — إرجاع", \.\.\.purchaseDims, vendorId \}/);
  });

  it("reverse CR cost line carries purchaseDims, vendor-less (mirrors the original DR)", () => {
    expect(IMPORT_ENGINE).toMatch(/accountCode: expCode, debit: 0, credit: refundAmount, description: "عكس تكلفة خدمات نسك — إرجاع", \.\.\.purchaseDims \}/);
  });
});

describe("§6.2 — idempotency contract preserved", () => {
  it("AP posting still gated on existingApJeId being null (re-runs are no-ops)", () => {
    expect(IMPORT_ENGINE).toMatch(/if \(totalAmount > 0 && nuskStatus !== "cancelled" && !existingApJeId\)/);
  });

  it("refund reversal still gated on existingRefundJeId being null + status='refunded' + refundAmount > 0", () => {
    expect(IMPORT_ENGINE).toMatch(/if \(nuskStatus === "refunded" && refundAmount > 0 && !existingRefundJeId\)/);
  });

  it("createGuardedJournalEntry sourceKey is unchanged (deduplication contract intact)", () => {
    expect(IMPORT_ENGINE).toMatch(/sourceKey: `umrah_nusk_ap_\$\{nuskId\}`/);
    expect(IMPORT_ENGINE).toMatch(/sourceKey: `umrah_nusk_refund_\$\{nuskId\}`/);
  });
});
