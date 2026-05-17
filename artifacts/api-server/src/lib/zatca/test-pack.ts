/**
 * Compliance test pack runner.
 *
 * ZATCA requires every seller to pass a 6-invoice test pack before
 * promoting their compliance CSID to production. The pack covers
 * three Standard invoices (regular / debit note / credit note) and
 * three Simplified invoices (regular / debit note / credit note).
 * Each invoice must have specific characteristics — taxable items,
 * exempt items, percentage / amount discounts — so ZATCA can confirm
 * the seller's UBL builder + signing pipeline handles all the
 * branches.
 *
 * Spec reference: ZATCA Compliance & Enablement Toolbox §3 (test pack
 * specifications) — the 6 templates below are the abstract shapes;
 * the concrete XML is generated at runtime from the seller's
 * settings (CRN, VAT, address) so each seller's pack is unique.
 *
 * Usage from a one-off CLI script (week 4-5):
 *
 *   const pack = buildTestPackTemplates();
 *   const results = await runComplianceTestPack({
 *     env: "sandbox",
 *     creds: complianceCsidCreds,
 *     templates: pack,
 *     buildSignedXml: (template) => signTemplate(template, sellerSettings),
 *   });
 *   if (results.allPassed) await promoteToProduction();
 *
 * The runner is intentionally **not wired into a route handler** —
 * onboarding is operator-driven (CFO + DevOps confirm before
 * promoting to production, both because the test pack triggers real
 * ZATCA-side audit entries and because the production CSID has to be
 * stored carefully).
 */
import { complianceInvoiceCheck } from "./client.js";
import type { ClearanceResult, ZatcaEnvironment } from "./types.js";
import type { ZatcaCredentials, InvoiceSubmission } from "./index.js";

export type TestPackInvoiceKind =
  | "standard.regular"
  | "standard.debit_note"
  | "standard.credit_note"
  | "simplified.regular"
  | "simplified.debit_note"
  | "simplified.credit_note";

/**
 * Abstract description of one of the six test-pack invoices. The
 * runner doesn't build the XML itself — it asks the caller's
 * `buildSignedXml` callback to produce the final signed bytes given
 * this template (the caller has access to the seller's certificate
 * and private key, which the runner deliberately doesn't).
 */
export interface TestPackTemplate {
  kind: TestPackInvoiceKind;
  /** Stable identifier ZATCA echoes back in error messages. */
  invoiceRef: string;
  /** Whether the invoice is Standard (B2B) or Simplified (B2C). */
  family: "standard" | "simplified";
  /**
   * Invoice type code to embed in <cbc:InvoiceTypeCode>:
   *   388 — regular tax invoice
   *   381 — credit note
   *   383 — debit note
   */
  invoiceTypeCode: "388" | "381" | "383";
  /**
   * Spec §3.2: each test-pack invoice must include a taxable line.
   * `taxableAmount` is the line's net amount; `vatRate` defaults to
   * 15% per the current KSA rate.
   */
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate?: number; // default 0.15
    /** Set to true to mark the line as exempt — exercises the E branch. */
    exempt?: boolean;
  }>;
  /**
   * Some pack entries require a percentage or fixed-amount document-
   * level discount. Leave undefined for the discount-free templates.
   */
  documentDiscount?: { type: "percent" | "amount"; value: number };
}

/**
 * The canonical 6-invoice test-pack shape. Concrete amounts are
 * arbitrary — ZATCA only cares about the structure (taxable + exempt
 * lines, discount, debit/credit-note references).
 */
export function buildTestPackTemplates(): TestPackTemplate[] {
  const baseDate = new Date().toISOString().slice(0, 10); // utc-ok: synthetic test-pack label only, not a tenant date
  return [
    {
      kind: "standard.regular",
      invoiceRef: `TP-STD-REG-${baseDate}`,
      family: "standard",
      invoiceTypeCode: "388",
      lines: [
        { description: "خدمة استشارية", quantity: 1, unitPrice: 1000 },
        { description: "بند معفى", quantity: 1, unitPrice: 200, exempt: true },
      ],
    },
    {
      kind: "standard.debit_note",
      invoiceRef: `TP-STD-DBN-${baseDate}`,
      family: "standard",
      invoiceTypeCode: "383",
      lines: [{ description: "تسوية إضافة", quantity: 1, unitPrice: 150 }],
    },
    {
      kind: "standard.credit_note",
      invoiceRef: `TP-STD-CRN-${baseDate}`,
      family: "standard",
      invoiceTypeCode: "381",
      lines: [{ description: "إرجاع جزئي", quantity: 1, unitPrice: 250 }],
    },
    {
      kind: "simplified.regular",
      invoiceRef: `TP-SIM-REG-${baseDate}`,
      family: "simplified",
      invoiceTypeCode: "388",
      lines: [
        { description: "بيع نقطة بيع", quantity: 2, unitPrice: 50 },
        { description: "خصم محدود", quantity: 1, unitPrice: 30 },
      ],
      documentDiscount: { type: "percent", value: 10 },
    },
    {
      kind: "simplified.debit_note",
      invoiceRef: `TP-SIM-DBN-${baseDate}`,
      family: "simplified",
      invoiceTypeCode: "383",
      lines: [{ description: "تسوية موقع", quantity: 1, unitPrice: 25 }],
    },
    {
      kind: "simplified.credit_note",
      invoiceRef: `TP-SIM-CRN-${baseDate}`,
      family: "simplified",
      invoiceTypeCode: "381",
      lines: [{ description: "استرداد POS", quantity: 1, unitPrice: 75 }],
      documentDiscount: { type: "amount", value: 5 },
    },
  ];
}

export interface RunOptions {
  env: ZatcaEnvironment;
  creds: ZatcaCredentials;
  templates: TestPackTemplate[];
  /**
   * Caller-provided XML builder + signer. The runner stays out of
   * the certificate / private-key plumbing on purpose — those should
   * never leave the route handler that fetched them from
   * zatca_settings (encrypted at rest).
   */
  buildSignedXml: (
    template: TestPackTemplate,
  ) => Promise<{ signedXmlBase64: string; invoiceUuid: string; invoiceHashBase64: string }>;
  /** Optional cancel signal so the operator can abort mid-pack. */
  signal?: AbortSignal;
}

export interface RunOutcome {
  allPassed: boolean;
  perInvoice: Array<{
    template: TestPackTemplate;
    result: ClearanceResult | null;
    error?: string;
  }>;
}

/**
 * Run the 6-invoice test pack sequentially (NOT in parallel — the
 * spec implies an order check, and a sequential run also keeps the
 * audit log readable). Stops on transport-level failure but
 * continues past per-invoice rejections so the operator gets the
 * full picture of which templates failed.
 */
export async function runComplianceTestPack(opts: RunOptions): Promise<RunOutcome> {
  const out: RunOutcome = { allPassed: true, perInvoice: [] };

  for (const template of opts.templates) {
    if (opts.signal?.aborted) {
      out.allPassed = false;
      out.perInvoice.push({
        template,
        result: null,
        error: "operator aborted before this invoice was submitted",
      });
      continue;
    }

    let signed: Awaited<ReturnType<RunOptions["buildSignedXml"]>>;
    try {
      signed = await opts.buildSignedXml(template);
    } catch (err) {
      out.allPassed = false;
      out.perInvoice.push({
        template,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const submission: InvoiceSubmission = {
      invoiceUuid: signed.invoiceUuid,
      invoiceHashBase64: signed.invoiceHashBase64,
      signedXmlBase64: signed.signedXmlBase64,
    };

    try {
      const result = await complianceInvoiceCheck({
        env: opts.env,
        creds: opts.creds,
        submission,
        signal: opts.signal,
      });
      if (result.status === "rejected") out.allPassed = false;
      out.perInvoice.push({ template, result });
    } catch (err) {
      out.allPassed = false;
      out.perInvoice.push({
        template,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}
