// ─── Bad-debt write-off — derecognise an uncollectable receivable (FIN bad_debt) ──
// A specific customer invoice deemed uncollectable is written off against the
// doubtful-debt allowance (standard allowance method), AND — per ZATCA VAT
// bad-debt relief (KSA VAT Implementing Regulations, "Adjustment for bad debts",
// 12 months + written off + customer notified) — the OUTPUT VAT previously
// accounted on the supply is reversed (recovered). This mirrors the credit-memo
// VAT reversal (finance-invoices.ts POST /invoices/:id/credit-memo) so the
// tax-code output-VAT account nets to zero exactly as it does on a return.
//
//   DR bad_debt_allowance (1135)    = net portion   (consume the monthly provision)
//   DR invoice_vat_payable (2131/…) = VAT portion   (reverse output VAT — Art. 40)
//   CR invoice_ar (1131, clientId)  = outstanding    (remove the receivable, gross)
//
// The invoice is marked `written_off` (a terminal state; migration 451) so it
// drops out of AR aging — the monthly provision then RELEASES its allowance share
// next run (DR 1135 / CR 5820), so the loss is recognised once, not twice.
//
// Idempotent per invoice via sourceKey `finance:bad_debt_writeoff:{companyId}:
// {invoiceId}` + the terminal status → a retry is a no-op. Atomic (JE + status)
// via withTransaction, joining the engine's post reentrantly (rawdb SAVEPOINT).
//
// The VAT-relief eligibility (≥12 months since supply + customer notified in
// writing) is enforced upstream at the approval endpoint; this engine posts the
// approved entry.
import { withTransaction } from "../rawdb.js";
import { checkFinancialPeriodOpen, todayISO } from "../businessHelpers.js";
import { resolveVatLegAccount, buildVatLeg } from "../vatLeg.js";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** مخصص الديون المشكوك في تحصيلها (يُستهلَك بالشطب). */
export const WRITEOFF_ALLOWANCE_FALLBACK = "1135";
/** ذمم العملاء (عملاء محليون) — الطرف الدائن. */
export const WRITEOFF_AR_FALLBACK = "1131";
/** ضريبة القيمة المضافة المستحقة (تُعكَس — تخفيف الديون المعدومة). */
export const WRITEOFF_VAT_PAYABLE_FALLBACK = "2131";

export type WriteOffSkip = "not_found" | "already_written_off" | "no_balance" | "period_closed";

export interface PostWriteOffResult {
  posted: boolean;
  reason?: WriteOffSkip;
  journalId?: number | null;
  invoiceId: number;
  outstanding: number;
  net: number;
  vat: number;
}

/**
 * Post a bad-debt write-off for a single customer invoice: DR allowance (net) +
 * DR output-VAT (vat, reversed) / CR AR (outstanding gross), then mark the
 * invoice `written_off`. Idempotent via sourceKey + terminal status. Returns
 * posted=false with a reason for the no-op cases.
 */
export async function postBadDebtWriteOff(opts: {
  companyId: number;
  branchId: number;
  invoiceId: number;
  createdBy: number;
  reason?: string | null;
  asOf?: string | null;
}): Promise<PostWriteOffResult> {
  const { companyId, invoiceId } = opts;
  const targetDate = opts.asOf || todayISO();

  const periodCheck = await checkFinancialPeriodOpen(companyId, targetDate);
  if (!periodCheck.open) {
    return { posted: false, reason: "period_closed", invoiceId, outstanding: 0, net: 0, vat: 0 };
  }

  const { financialEngine } = await import("../engines/index.js");
  const { getOutputVatAccountCode } = await import("../taxCodes.js");
  const [allowanceCode, arCode, vatPayableFallback] = await Promise.all([
    financialEngine.resolveAccountCode(companyId, "bad_debt_allowance", "debit", WRITEOFF_ALLOWANCE_FALLBACK),
    financialEngine.resolveAccountCode(companyId, "invoice_ar", "credit", WRITEOFF_AR_FALLBACK),
    financialEngine.resolveAccountCode(companyId, "invoice_vat_payable", "debit", WRITEOFF_VAT_PAYABLE_FALLBACK),
  ]);

  let out: PostWriteOffResult = { posted: false, reason: "not_found", invoiceId, outstanding: 0, net: 0, vat: 0 };

  await withTransaction(async (client) => {
    const invRes = await client.query(
      `SELECT id, ref, "clientId", "branchId", status, total, "vatAmount", "paidAmount", "taxCode"
         FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
      [invoiceId, companyId],
    );
    const invoice = invRes.rows[0];
    if (!invoice) { out = { posted: false, reason: "not_found", invoiceId, outstanding: 0, net: 0, vat: 0 }; return; }
    if (invoice.status === "written_off") {
      out = { posted: false, reason: "already_written_off", invoiceId, outstanding: 0, net: 0, vat: 0 };
      return;
    }

    const total = round2(Number(invoice.total));
    const outstanding = round2(total - Number(invoice.paidAmount ?? 0));
    if (outstanding <= 0.01) { out = { posted: false, reason: "no_balance", invoiceId, outstanding: 0, net: 0, vat: 0 }; return; }

    // جزء الضريبة من المتبقّي = تناسب من ضريبة المخرجات الفعلية المسجَّلة على الفاتورة
    // (يتعامل مع السداد الجزئي)؛ الصافي = المتبقّي − الضريبة.
    const invoiceVat = round2(Number(invoice.vatAmount ?? 0));
    const vat = total > 0.01 ? round2(outstanding * (invoiceVat / total)) : 0;
    const net = round2(outstanding - vat);

    // نفس حساب رمز ضريبة الفاتورة الذي رُحّل عند الاعتماد، وإلا الاحتياطي العام —
    // فتُغلق تسوية حساب الضريبة صفرًا (يطابق عكس الإشعار الدائن).
    const vatPayableCode = resolveVatLegAccount(
      invoice.taxCode ? await getOutputVatAccountCode(companyId, invoice.taxCode as string) : null,
      vatPayableFallback,
    );

    const branchId = Number(invoice.branchId ?? opts.branchId);
    const result = await financialEngine.postJournalEntry({
      companyId,
      branchId,
      createdBy: opts.createdBy,
      ref: `WRITEOFF-INV-${invoiceId}`,
      description: `شطب دين معدوم — الفاتورة ${invoice.ref ?? invoiceId}${opts.reason ? ` — ${opts.reason}` : ""}`,
      sourceType: "bad_debt_writeoff",
      sourceId: invoiceId,
      sourceKey: `finance:bad_debt_writeoff:${companyId}:${invoiceId}`,
      lines: [
        { accountCode: allowanceCode, debit: net, credit: 0, clientId: invoice.clientId },
        ...buildVatLeg({ amount: vat, side: "debit", accountCode: vatPayableCode, clientId: invoice.clientId }),
        { accountCode: arCode, debit: 0, credit: outstanding, clientId: invoice.clientId },
      ],
    });

    // علّم الفاتورة مشطوبة فقط عندما رحّل هذا الاستدعاء القيد (لا إعادة تشغيل)،
    // وذرّيًّا مع القيد. تخرج من التقادم → المخصّص الشهري يحرّر نصيبها لاحقًا.
    if (!result.alreadyExists) {
      await client.query(
        `UPDATE invoices SET status = 'written_off'
           WHERE id = $1 AND "companyId" = $2 AND status <> 'written_off'`,
        [invoiceId, companyId],
      );
    }

    out = {
      posted: !result.alreadyExists,
      reason: result.alreadyExists ? "already_written_off" : undefined,
      journalId: result.journalId,
      invoiceId,
      outstanding,
      net,
      vat,
    };
  });

  return out;
}
