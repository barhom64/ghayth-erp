import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the wallet-overdraft guardrail on confirmVouchersImport — the
 * HARD form of PR #1464's soft red banner.
 *
 * The operator rule: "لا يمكن نشتري تأشيرة الا وفي فلوس في الحساب"
 *
 * Refuses the entire import when the cumulative new obligations would
 * push the NUSK supplier wallet below zero. Skipped when:
 *   - nuskSupplierId is unset (consistent with PR #1464's CTA path)
 *   - allowOverdraft=true is explicitly passed (audit-logged bypass
 *     for top-up-on-the-way scenarios)
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);

describe("importVouchersSchema — allowOverdraft toggle", () => {
  it("accepts allowOverdraft as an optional boolean defaulting to false", () => {
    // Default MUST be false so the guardrail is on by default —
    // making the operator opt-OUT instead of opt-IN matches the
    // user's stated rule.
    expect(ROUTE).toMatch(/allowOverdraft:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  });

  it("route handler threads allowOverdraft into the engine call", () => {
    expect(ROUTE).toMatch(/confirmVouchersImport\(importScope, normalizedRows, fileName \?\? "import-vouchers", \{ allowOverdraft \}\)/);
  });
});

describe("confirmVouchersImport — wallet-overdraft guardrail", () => {
  it("accepts an optional options bag (not a breaking signature change)", () => {
    expect(ENGINE).toMatch(/confirmVouchersImport\(\s*scope: ImportScope,\s*rows: ParsedRow\[\],\s*fileName: string,\s*options: \{ allowOverdraft\?: boolean \} = \{\}/);
  });

  it("guardrail wrapped in !options.allowOverdraft so the bypass path is clean", () => {
    expect(ENGINE).toMatch(/if \(!options\.allowOverdraft\) \{/);
  });

  it("skipped when company has no configured nuskSupplierId (consistent with wallet view CTA path)", () => {
    // The wallet endpoint returns configured:false in this case; the
    // guardrail must agree — silently passing through when there's
    // no NUSK supplier to check against.
    expect(ENGINE).toMatch(/const nuskSupplierId = cfgRes\.rows\[0\]\?\.nuskSupplierId \?\? null/);
    expect(ENGINE).toMatch(/if \(nuskSupplierId != null\)/);
  });

  it("deposits query matches the wallet-view filter set EXACTLY (no drift)", () => {
    // Same balancesApplied + reversedById guards + obligationType =
    // 'purchase_order'. The guardrail must reconcile with the
    // /umrah/nusk-wallet display on the SAME number — anything else
    // is a stale-read bug waiting to happen.
    expect(ENGINE).toMatch(/SUM\(spa\.amount\)[\s\S]{1,1000}je\."balancesApplied" = true[\s\S]{1,200}je\."reversedById" IS NULL/);
  });

  it("obligations query nets refunds + excludes cancelled (matches PR #1457 + #1464)", () => {
    expect(ENGINE).toMatch(/SUM\("totalAmount"\)[\s\S]{1,400}SUM\("refundAmount"\)[\s\S]{1,400}"nuskStatus" NOT IN \('cancelled'\)/);
  });

  it("projects the post-import balance and refuses when negative", () => {
    expect(ENGINE).toMatch(/projectedBalance = currentBalance - newObligations/);
    expect(ENGINE).toMatch(/if \(projectedBalance < 0\)/);
  });

  it("error message shows the SHORTFALL (operator's actionable number)", () => {
    // Just saying "balance insufficient" doesn't tell the operator
    // how much to deposit. The error includes "ر.س X.XX" so they
    // can act in one trip to the bank app.
    expect(ENGINE).toMatch(/الاستيراد سيتجاوز رصيد محفظة نسك بـ \$\{shortfall\.toFixed\(2\)\} ر\.س/);
  });

  it("error message mentions the allowOverdraft bypass for legitimate top-up-in-flight cases", () => {
    expect(ENGINE).toMatch(/allowOverdraft=true إذا كان التحويل في الطريق/);
  });

  it("guardrail runs INSIDE the transaction (concurrent imports can't slip past)", () => {
    // The check uses `client.query` (the same client the rest of the
    // import uses) so it sees the same snapshot. A bare rawQuery
    // outside would race against another concurrent import.
    //
    // Scope check: confirm both markers appear after the
    // confirmVouchersImport signature line, ensuring the guard is
    // inside the right function (not accidentally in the mutamers
    // confirm function).
    const fnStart = ENGINE.indexOf("export async function confirmVouchersImport");
    expect(fnStart).toBeGreaterThan(0);
    const txStart = ENGINE.indexOf("return withTransaction(async (client)", fnStart);
    const guardIdx = ENGINE.indexOf("if (!options.allowOverdraft)", fnStart);
    const supplierQueryIdx = ENGINE.indexOf('"nuskSupplierId" FROM companies', fnStart);
    expect(txStart).toBeGreaterThan(fnStart);
    expect(guardIdx).toBeGreaterThan(txStart);
    expect(supplierQueryIdx).toBeGreaterThan(guardIdx);
  });

  it("guardrail runs BEFORE the vouchers batch INSERT so a refused import leaves no orphan rows", () => {
    // If we refused after the batch insert, we'd litter
    // umrah_import_batches with rows for imports that never ran.
    // The transaction would rollback anyway, but defence-in-depth:
    // refuse first, write nothing.
    // The mutamers-confirm has its own INSERT — anchor on
    // the 'vouchers' literal so we find the right one.
    const fnStart = ENGINE.indexOf("export async function confirmVouchersImport");
    const guardIdx = ENGINE.indexOf("if (!options.allowOverdraft)", fnStart);
    const insertIdx = ENGINE.indexOf("'vouchers'", fnStart);
    expect(guardIdx).toBeGreaterThan(fnStart);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });
});
