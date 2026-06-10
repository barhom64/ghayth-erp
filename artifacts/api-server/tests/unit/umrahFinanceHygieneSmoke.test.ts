import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §6 Finance Hygiene (Charter #1870) — daily 5-min check for the
 * Umrah operator: count + sum the rows that should have GL/AP linkage
 * but don't.
 *
 * Four buckets:
 *   • salesInvoices.untrackedPosting — status NOT IN draft/cancelled AND journalEntryId IS NULL
 *   • payments.untrackedPosting       — sarAmount > 0 AND journalEntryId IS NULL
 *   • nuskInvoices.untrackedAP        — nuskStatus <> cancelled AND totalAmount > 0 AND purchaseInvoiceId IS NULL
 *   • penalties.untrackedPosting      — status IN invoiced/paid AND journalEntryId IS NULL
 *
 * isClean=true when all four buckets are zero — drives the green card.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const CARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/umrah-finance-hygiene-card.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/dashboard.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/finance-hygiene"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("finance-hygiene handler not found");
  return m[0];
})();

describe("GET /umrah/finance-hygiene — endpoint contract", () => {
  it("registers under feature: umrah, action: list (operator's daily check)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("4 reads run in parallel — no serial RTT", () => {
    expect(HANDLER).toMatch(/const \[sales, payments, nusk, penalties\] = await Promise\.all\(/);
  });

  it("salesInvoices bucket excludes draft + cancelled (only postable rows count)", () => {
    expect(HANDLER).toMatch(/FROM umrah_sales_invoices[\s\S]{0,400}status NOT IN \('draft','cancelled'\)[\s\S]{0,100}"journalEntryId" IS NULL/);
  });

  it("payments bucket requires sarAmount > 0 (zero-amount rows can't be posted)", () => {
    expect(HANDLER).toMatch(/FROM umrah_payments[\s\S]{0,400}"sarAmount" > 0[\s\S]{0,100}"journalEntryId" IS NULL/);
  });

  it("nuskInvoices bucket flags AP-missing rows (purchaseInvoiceId IS NULL)", () => {
    expect(HANDLER).toMatch(/FROM umrah_nusk_invoices[\s\S]{0,400}"nuskStatus" <> 'cancelled'[\s\S]{0,200}"totalAmount" > 0[\s\S]{0,200}"purchaseInvoiceId" IS NULL/);
  });

  it("penalties bucket: invoiced/paid AND journalEntryId IS NULL (not pending/waived)", () => {
    expect(HANDLER).toMatch(/FROM umrah_penalties[\s\S]{0,400}status IN \('invoiced','paid'\)[\s\S]{0,100}"journalEntryId" IS NULL/);
  });

  it("all four reads tenant-scope on companyId + deletedAt", () => {
    expect((HANDLER.match(/"companyId" = \$1/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((HANDLER.match(/"deletedAt" IS NULL/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("response shape: 4 buckets + totalItems + totalAmountAtRisk + isClean", () => {
    expect(HANDLER).toMatch(/salesInvoices: \{ count:/);
    expect(HANDLER).toMatch(/payments:\s+\{ count:/);
    expect(HANDLER).toMatch(/nuskInvoices:\s+\{ count:/);
    expect(HANDLER).toMatch(/penalties:\s+\{ count:/);
    // ES6 shorthand `totalItems,` not `totalItems: totalItems,` — match the literal
    expect(HANDLER).toMatch(/\btotalItems\b/);
    expect(HANDLER).toMatch(/\btotalAmountAtRisk\b/);
    expect(HANDLER).toMatch(/isClean: totalItems === 0/);
  });
});

describe("UmrahFinanceHygieneCard — FE wiring", () => {
  it("queries the finance-hygiene endpoint with stable cache key", () => {
    expect(CARD).toContain('"/umrah/finance-hygiene"');
    expect(CARD).toContain('["umrah-finance-hygiene"]');
  });

  it("clean state renders the green 'كل شيء مرحَّل' card", () => {
    expect(CARD).toContain('data-testid="umrah-finance-hygiene-card-clean"');
    expect(CARD).toContain("كل شيء مرحَّل");
  });

  it("dirty state surfaces total items badge + totalAmountAtRisk banner", () => {
    expect(CARD).toContain('data-testid="umrah-finance-hygiene-card"');
    expect(CARD).toContain("totalAmountAtRisk");
    expect(CARD).toContain("المبلغ بالمخاطر");
  });

  it("each non-zero bucket renders its own row + drill link", () => {
    expect(CARD).toContain('data-testid="umrah-finance-hygiene-buckets"');
    expect(CARD).toContain("data-testid={`umrah-finance-hygiene-bucket-${key}`}");
    // 4 bucket targets — sales-invoices-summary, subagent-balances, nusk, violations
    expect(CARD).toContain("/umrah/reports/sales-invoices-summary");
    expect(CARD).toContain("/umrah/reports/subagent-balances");
    expect(CARD).toContain("/umrah/reports/nusk-invoices-summary");
    expect(CARD).toContain("/umrah/reports/violations-summary");
  });

  it("4 bucket labels are present in Arabic", () => {
    expect(CARD).toContain("فواتير بيع بدون قيد محاسبي");
    expect(CARD).toContain("دفعات بدون قيد محاسبي");
    expect(CARD).toContain("فواتير نسك بدون فاتورة شراء AP");
    expect(CARD).toContain("غرامات بدون قيد محاسبي");
  });
});

describe("Dashboard — hygiene card wired", () => {
  it("imports + renders the card right under the tabs nav", () => {
    expect(DASHBOARD).toContain('import { UmrahFinanceHygieneCard } from "@/components/shared/umrah-finance-hygiene-card"');
    expect(DASHBOARD).toContain("<UmrahFinanceHygieneCard />");
  });
});
