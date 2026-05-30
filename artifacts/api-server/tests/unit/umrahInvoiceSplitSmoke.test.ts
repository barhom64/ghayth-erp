import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins Phase 3d — the engine splits each group's lineTotal into 3
 * sub-lines (visa / transport / services) when ALL 3 products are
 * configured AND the group has a matching NUSK invoice.
 *
 *   تأشيرة 422 — vatRate=0 (visa product's defaultTaxCode=zero)
 *   خدمات 50  — vatRate=invoice default
 *   نقل 200   — vatRate=invoice default
 *
 * Strict regression safety: when ANY mapping is missing OR no NUSK
 * invoice matches, the engine falls back to the Phase 3c bundled
 * single line — byte-identical pre-split behaviour.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("Phase 3d — canSplit gate", () => {
  it("requires ALL 3 product mappings (visa + services + transport) to be set", () => {
    // ANY one unset → fallback to bundled single line. Operators
    // configuring partial setups (e.g., only services) don't get a
    // surprise 3-line split that would mis-route visa to the services
    // bucket.
    expect(ENGINE).toMatch(/const canSplit =\s*productMap\?\.servicesProductId != null[\s\S]{0,300}productMap\?\.visaProductId != null[\s\S]{0,300}productMap\?\.transportProductId != null/);
  });

  it("NUSK cost-by-group query runs ONLY when canSplit is true (no wasted round-trip)", () => {
    expect(ENGINE).toMatch(/if \(canSplit\) \{[\s\S]{1,1000}FROM umrah_nusk_invoices/);
  });

  it("excludes cancelled NUSK rows + filters soft-deleted (matches PR #1457 / #1464)", () => {
    expect(ENGINE).toMatch(/"nuskStatus" NOT IN \('cancelled'\)/);
    // Scope check — the umrah_nusk_invoices query inside the canSplit
    // block must have the deletedAt guard too.
    const split = ENGINE.match(/if \(canSplit\) \{[\s\S]{1,1500}\}\n  \}/);
    expect(split).not.toBeNull();
    expect(split![0]).toMatch(/"deletedAt" IS NULL/);
  });

  it("sums per group across multiple NUSK invoices (one round-trip, GROUP BY)", () => {
    // A group billed in chunks would have multiple NUSK rows. The
    // SUM + GROUP BY handles it in one shot instead of looping.
    expect(ENGINE).toMatch(/SELECT "groupId",\s*COALESCE\(SUM\("visaFees"\), 0\)\s*AS visa,\s*COALESCE\(SUM\("transportTotal"\), 0\)\s*AS transport[\s\S]{1,500}GROUP BY "groupId"/);
  });
});

describe("Phase 3d — per-group split arithmetic", () => {
  it("visa portion is min(NUSK visaFees, lineTotal) (clamps when sales < visa cost)", () => {
    // The operator can't sell below the visa pass-through; if they
    // try, the visa line still takes the full sales amount and the
    // transport/services lines clamp to 0. Pin the clamp so future
    // refactors don't accidentally let visa exceed sales.
    expect(ENGINE).toMatch(/const visaPortion = Math\.min\(groupCost\.visa, lineTotal\)/);
  });

  it("transport portion takes the remainder after visa (sequential consumption)", () => {
    expect(ENGINE).toMatch(/const transportPortion = Math\.min\(groupCost\.transport, Math\.max\(0, lineTotal - visaPortion\)\)/);
  });

  it("services portion = lineTotal - visa - transport (operator's margin + other costs)", () => {
    // The "خدمات أرضية" line absorbs hotel + electronic + insurance
    // etc. plus the operator's markup. This is the user's stated
    // rule: "فرق المبيعات عن الشراء هو بند خدمات ارضية وعليه ضريبة".
    expect(ENGINE).toMatch(/const servicesPortion = Math\.max\(0, lineTotal - visaPortion - transportPortion\)/);
  });
});

describe("Phase 3d — 3 lineItems per group", () => {
  it("visa lineItem: per-pilgrim quantity, visa product's account + taxCode", () => {
    // Per-pilgrim quantity matches NUSK's per-pilgrim visa pricing
    // (operator's "visa pass-through at fixed cost" rule).
    expect(ENGINE).toMatch(/description: `تأشيرة عمرة — مجموعة \$\{grp\.nuskGroupNumber\}`/);
    expect(ENGINE).toMatch(/quantity: mutamerCount,\s*unitPrice: mutamerCount > 0 \? visaPortion \/ mutamerCount : visaPortion/);
    expect(ENGINE).toMatch(/productId: productMap!\.visaProductId,\s*accountCode: productMap!\.visaAccountCode,\s*vatRate: taxCodeToVat\(productMap!\.visaTaxCode\)/);
  });

  it("transport lineItem: quantity 1, transport product's account + taxCode", () => {
    // Transport is typically per-trip not per-pilgrim. quantity=1
    // keeps the e-invoice line readable.
    expect(ENGINE).toMatch(/description: `نقل — مجموعة \$\{grp\.nuskGroupNumber\}`/);
    expect(ENGINE).toMatch(/productId: productMap!\.transportProductId,\s*accountCode: productMap!\.transportAccountCode,\s*vatRate: taxCodeToVat\(productMap!\.transportTaxCode\)/);
  });

  it("services lineItem: quantity 1, services product's account + taxCode", () => {
    expect(ENGINE).toMatch(/description: `خدمات أرضية — مجموعة \$\{grp\.nuskGroupNumber\}`/);
    expect(ENGINE).toMatch(/productId: productMap!\.servicesProductId,\s*accountCode: productMap!\.servicesAccountCode,\s*vatRate: taxCodeToVat\(productMap!\.servicesTaxCode\)/);
  });

  it("zero-amount visa or transport lines are SUPPRESSED (no noise on the invoice)", () => {
    // A group whose NUSK had no visa (operator handles visa
    // separately) shouldn't show "تأشيرة 0 ر.س" on the invoice.
    expect(ENGINE).toMatch(/if \(visaPortion > 0\) \{[\s\S]{0,500}lineItems\.push/);
    expect(ENGINE).toMatch(/if \(transportPortion > 0\) \{[\s\S]{0,500}lineItems\.push/);
  });

  it("services line is ALWAYS emitted, even when servicesPortion is 0", () => {
    // Pinning consistency — the e-invoice always shows the
    // 3-line structure per group (or at least services). The
    // services push must NOT be inside an `if (servicesPortion > 0)`
    // guard.
    const splitBlock = ENGINE.match(/if \(canSplit && groupCost[\s\S]{1,3500}\} else \{/);
    expect(splitBlock).not.toBeNull();
    // Find the services push and confirm it's not wrapped in a
    // > 0 guard.
    const servicesIdx = splitBlock![0].indexOf("خدمات أرضية");
    const lastGuardBeforeServices = splitBlock![0].lastIndexOf("if (", servicesIdx);
    const lastGuardSnippet = splitBlock![0].slice(lastGuardBeforeServices, servicesIdx);
    expect(lastGuardSnippet).not.toMatch(/servicesPortion > 0/);
  });
});

describe("Phase 3d — fallback to Phase 3c bundled line", () => {
  it("when canSplit is false → single bundled line with services-only routing", () => {
    expect(ENGINE).toMatch(/\} else \{[\s\S]{1,800}const servicesProductId = productMap\?\.servicesProductId \?\? null/);
  });

  it("fallback path is byte-identical to the previous Phase 3c shape (regression safety)", () => {
    // Same description format, same quantity = mutamerCount,
    // unitPrice = price, lineTotal. The Phase 3c-style push must
    // still exist in the else branch.
    expect(ENGINE).toMatch(/description: `مجموعة \$\{grp\.nuskGroupNumber\} — \$\{grp\.name \|\| ""\}`/);
  });

  it("fallback also triggers when canSplit is true but the group has no NUSK match", () => {
    // The condition `canSplit && groupCost && (groupCost.visa > 0 ||
    // groupCost.transport > 0)` ensures we only split when we
    // actually have cost data to source from. A group with no
    // matching NUSK invoice falls through to bundled.
    expect(ENGINE).toMatch(/if \(canSplit && groupCost && \(groupCost\.visa > 0 \|\| groupCost\.transport > 0\)\)/);
  });
});
