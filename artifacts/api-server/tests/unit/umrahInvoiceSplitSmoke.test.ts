import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §6 of #1870 — the TWO-LINE umrah invoice per operator directive:
 *
 *   1) "رسوم تأشيرة" — visa fees, exempt + pass-through at NUSK cost.
 *   2) "خدمة أرضية"  — ground service: everything else (transport,
 *      hotel, electronic, services, insurance, margin). Standard rate;
 *      VAT on margin only via the header marginBase / vatAmount math.
 *
 * The legacy 3-line split (visa + transport + services) is dropped:
 * ZATCA only needs the two pass-through-vs-margin buckets, and the
 * operator's invoice template renders cleaner with the consolidated
 * ground-service line.
 *
 * Strict regression safety: when ANY mapping is missing OR no NUSK
 * invoice matches, the engine falls back to the bundled single line —
 * same shape as before.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("§6 — canSplit gate", () => {
  it("requires the visa + services + transport product mappings to be set (transport still required to know the NUSK is mapped)", () => {
    expect(ENGINE).toMatch(/const canSplit =\s*productMap\?\.servicesProductId != null[\s\S]{0,300}productMap\?\.visaProductId != null[\s\S]{0,300}productMap\?\.transportProductId != null/);
  });

  it("NUSK cost-by-group query runs ONLY when canSplit is true (no wasted round-trip)", () => {
    expect(ENGINE).toMatch(/if \(canSplit\) \{[\s\S]{1,1000}FROM umrah_nusk_invoices/);
  });

  it("excludes cancelled NUSK rows + filters soft-deleted", () => {
    expect(ENGINE).toMatch(/"nuskStatus" NOT IN \('cancelled'\)/);
    const split = ENGINE.match(/if \(canSplit\) \{[\s\S]{1,1500}\}\n  \}/);
    expect(split).not.toBeNull();
    expect(split![0]).toMatch(/"deletedAt" IS NULL/);
  });

  it("split branch fires when canSplit AND groupCost.visa > 0 (transport is no longer required)", () => {
    // Visa is the only pass-through component now. A group whose NUSK
    // has only transport but no visa falls through to the bundled
    // single line because there's nothing to pass through.
    expect(ENGINE).toMatch(/if \(canSplit && groupCost && groupCost\.visa > 0\)/);
  });
});

describe("§6 — per-group split arithmetic", () => {
  it("visa portion is min(NUSK visaFees, lineTotal) — clamps when sales < visa cost", () => {
    expect(ENGINE).toMatch(/const visaPortion = Math\.min\(groupCost\.visa, lineTotal\)/);
  });

  it("ground-service portion = lineTotal − visa (absorbs transport + hotel + electronic + services + margin)", () => {
    // This is the operator's directive: "خدمة أرضية = الهامش (بيع−شراء)
    // مع كامل التكاليف ما عدا التأشيرة". Transport is no longer a
    // separate line; it folds into ground service.
    expect(ENGINE).toMatch(/const groundServicePortion = Math\.max\(0, lineTotal - visaPortion\)/);
  });

  it("the legacy transportPortion variable is GONE (no separate transport split)", () => {
    expect(ENGINE).not.toMatch(/const transportPortion =/);
  });

  it("the legacy servicesPortion variable is GONE (renamed to groundServicePortion)", () => {
    expect(ENGINE).not.toMatch(/const servicesPortion =/);
  });
});

describe("§6 — 2 lineItems per group", () => {
  it("line 1 — VISA: per-pilgrim quantity, visa product's account + zero-rated tax code", () => {
    expect(ENGINE).toMatch(/description: `رسوم تأشيرة عمرة — مجموعة \$\{grp\.nuskGroupNumber\}`/);
    expect(ENGINE).toMatch(/quantity: mutamerCount,\s*unitPrice: mutamerCount > 0 \? visaPortion \/ mutamerCount : visaPortion/);
    expect(ENGINE).toMatch(/productId: productMap!\.visaProductId,\s*accountCode: (?:overrideAccountCode \?\? )?productMap!\.visaAccountCode,\s*vatRate: taxCodeToVat\(productMap!\.visaTaxCode\)/);
  });

  it("line 2 — GROUND SERVICE: quantity 1, services product's account + tax code", () => {
    expect(ENGINE).toMatch(/description: `خدمة أرضية — مجموعة \$\{grp\.nuskGroupNumber\}`/);
    expect(ENGINE).toMatch(/productId: productMap!\.servicesProductId,\s*accountCode: (?:overrideAccountCode \?\? )?productMap!\.servicesAccountCode,\s*vatRate: taxCodeToVat\(productMap!\.servicesTaxCode\)/);
  });

  it("there is NO third 'نقل' line — transport folds into the ground-service line", () => {
    // The legacy "نقل — مجموعة" description must be absent.
    expect(ENGINE).not.toMatch(/description: `نقل — مجموعة/);
  });

  it("the legacy '_خدمات أرضية_' (plural) description is replaced with '_خدمة أرضية_' (singular per operator)", () => {
    // Operator's term is singular ("خدمة أرضية"), not the legacy plural.
    expect(ENGINE).not.toMatch(/description: `خدمات أرضية — مجموعة/);
  });
});

describe("§6 — fallback to bundled line", () => {
  it("when canSplit is false OR groupCost.visa is 0 → single bundled line", () => {
    expect(ENGINE).toMatch(/\} else \{[\s\S]{1,800}const servicesProductId = productMap\?\.servicesProductId \?\? null/);
  });

  it("fallback path is byte-identical to the pre-split shape (regression safety)", () => {
    expect(ENGINE).toMatch(/description: `مجموعة \$\{grp\.nuskGroupNumber\} — \$\{grp\.name \|\| ""\}`/);
  });
});

describe("§6 — VAT-on-margin invariants are preserved", () => {
  it("costBasis sums non-cancelled NUSK invoice totalAmount minus refunds (unchanged from #1457)", () => {
    expect(ENGINE).toMatch(/COALESCE\(SUM\("totalAmount" - COALESCE\("refundAmount", 0\)\), 0\) AS cost_basis/);
    expect(ENGINE).toMatch(/"nuskStatus" NOT IN \('cancelled'\)/);
  });

  it("marginBase = max(0, subtotal − costBasis) — VAT base never goes negative", () => {
    expect(ENGINE).toMatch(/const marginBase = roundTo2\(Math\.max\(0, subtotal - costBasis\)\)/);
  });

  it("sellingBelowCost flag still surfaces (operator warning when subtotal < costBasis)", () => {
    expect(ENGINE).toMatch(/const sellingBelowCost = subtotal < costBasis/);
  });
});

describe("§6 — VAT mode is operator-configurable (inclusive/exclusive)", () => {
  it("reads BOTH umrah_vat_rate AND umrah_vat_mode from system_settings — no hardcoded direction", () => {
    expect(ENGINE).toMatch(/key = 'umrah_vat_rate'/);
    expect(ENGINE).toMatch(/key = 'umrah_vat_mode'/);
  });

  it("default mode is 'inclusive' (KSA margin scheme — VAT lives inside the ground-service line)", () => {
    expect(ENGINE).toMatch(/const vatMode = .*\?\?\s*"inclusive"/);
    expect(ENGINE).toMatch(/const vatInclusive = vatMode === "inclusive"/);
  });

  it("inclusive mode: vatAmount = marginBase × rate / (100 + rate) — EXTRACTED, not added", () => {
    // Operator directive: «الضريبة مستخرَجة من الهامش الشامل (× 15/115)».
    // The legacy added formula stays as the exclusive-mode fallback.
    expect(ENGINE).toMatch(/roundTo2\(marginBase \* vatRate \/ \(100 \+ vatRate\)\)/);
  });

  it("exclusive mode: legacy add-on-top formula preserved (no regression for non-margin tenants)", () => {
    expect(ENGINE).toMatch(/roundTo2\(marginBase \* \(vatRate \/ 100\)\)/);
  });

  it("inclusive mode: total = subtotal + penalties (NO addition — VAT is already inside)", () => {
    // The whole point of inclusive: the customer-facing price equals the
    // operator-set sale price, even when ZATCA changes the rate.
    expect(ENGINE).toMatch(/vatInclusive[\s\S]{0,200}\?\s*subtotal \+ penaltiesTotal\s*\n\s*:\s*subtotal \+ penaltiesTotal \+ vatAmount/);
  });

  it("inclusive mode: VAT is extracted from the FIRST standard-rated revenue bucket — keeps JE balanced", () => {
    // Visa is zero-rated pass-through; the standard-rated ground-service
    // line absorbs the VAT extraction so revenue = sale ex-VAT and the
    // JE balances against DR AR = subtotal.
    expect(ENGINE).toMatch(/let standardRatedCode: string \| null = null/);
    expect(ENGINE).toMatch(/if \(vatInclusive && vatAmount > 0 && standardRatedCode\)/);
  });
});

describe("§6 — sales-side JE carries the client + agent + season dimensions", () => {
  it("every JE line stamped with clientId (the sub-agent's linked client = العميل)", () => {
    // Operator directive: «أبعاد البيع — الوكيل العميل + الموسم».
    // The sub-agent's clientId is the customer FK that lets the ledger
    // be sliced by who owes us; previously only umrahAgentId + season
    // were stamped.
    expect(ENGINE).toMatch(/clientId: \(subAgent\.clientId as number \| null\) \?\? undefined/);
  });

  it("umrahDims now type-includes clientId so every line spread carries it", () => {
    expect(ENGINE).toMatch(/clientId\?\s*:\s*number;/);
  });
});
