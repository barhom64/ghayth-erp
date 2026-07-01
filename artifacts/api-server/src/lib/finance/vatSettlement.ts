// ─── تسوية ضريبة القيمة المضافة (#2280) — قيد إقفال الإقرار عند السداد لهيئة الزكاة والضريبة ──
//
// النظام يحتسب إقرار ض.ق.م بدقّة (تقرير /reports/vat-reconciliation) لكنه لم يكن
// يُرحّل قيدَ التسوية عند دفع الإقرار — فيبقى حسابا الضريبة (مخرجات 2131 / مدخلات
// 1180) يتراكمان بلا تصفية. هذا القيد يُصفّرهما للفترة ويُسجّل صافي المسدَّد/المستردّ:
//
//   صافي مستحق (مخرجات > مدخلات):
//     مدين  ض.مخرجات (2131) = مخرجات الفترة
//     دائن  ض.مدخلات (1180) = مدخلات الفترة
//     دائن  النقد            = الصافي المدفوع (مخرجات − مدخلات)
//
//   صافي مستردّ (مدخلات > مخرجات): يُقلب طرف النقد إلى مدين بالفرق.
//
// القيد متوازن بالبناء. idempotent عبر ref `VAT-SETTLE-{من}_{إلى}` + sourceKey —
// لا جدول تتبّع ولا هجرة (ref القيد هو حارس الازدواج، كنمط مخصص الديون).
import { rawQuery } from "../rawdb.js";
import { checkFinancialPeriodOpen } from "../businessHelpers.js";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface VatSettlementLine {
  accountCode: string;
  debit: number;
  credit: number;
}

/** حوّل مبلغًا موقّعًا إلى طرف {debit, credit} (موجب=مدين، سالب=دائن). */
function signedLeg(accountCode: string, signedDebit: number): VatSettlementLine {
  const v = round2(signedDebit);
  return { accountCode, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 };
}

/**
 * Pure: من (مخرجات الفترة، مدخلات الفترة) → سطور قيد التسوية المتوازنة، أو null
 * حين لا شيء لتسويته (كلاهما صفر). لتصفية الحسابين:
 *   • ض.مخرجات (2131) رصيده دائن ⇒ يُصفَّر بمدينٍ = مخرجات الفترة.
 *   • ض.مدخلات (1180) رصيده مدين ⇒ يُصفَّر بدائنٍ = مدخلات الفترة (مدين موقّع = −مدخلات).
 *   • النقد يمتصّ الصافي: مستحق ⇒ دائن؛ مستردّ ⇒ مدين.
 * متوازن دائمًا: Σالمدين − Σالدائن = مخرجات − مدخلات − (مخرجات − مدخلات) = 0.
 */
export function buildVatSettlementLines(opts: {
  outputVat: number; // مخرجات الفترة = Σ(دائن − مدين) على 2131
  inputVat: number; // مدخلات الفترة = Σ(مدين − دائن) على 1180
  outputCode: string;
  inputCode: string;
  cashCode: string;
}): { lines: VatSettlementLine[]; netDue: number } | null {
  const output = round2(opts.outputVat);
  const input = round2(opts.inputVat);
  const netDue = round2(output - input); // موجب = مستحق الدفع؛ سالب = مستردّ

  const lines: VatSettlementLine[] = [];
  if (output !== 0) lines.push(signedLeg(opts.outputCode, output)); // مدين المخرجات (تصفية رصيده الدائن)
  if (input !== 0) lines.push(signedLeg(opts.inputCode, -input)); // دائن المدخلات (تصفية رصيده المدين)
  if (netDue !== 0) lines.push(signedLeg(opts.cashCode, -netDue)); // مستحق ⇒ دائن نقد؛ مستردّ ⇒ مدين نقد

  if (lines.length === 0) return null;
  return { lines, netDue };
}

// حركة حسابَي الضريبة خلال الفترة — نفس منطق تقرير /reports/vat-reconciliation
// تمامًا (حُرّاس je: deletedAt IS NULL · balancesApplied · reversedById IS NULL).
// ض.ق.م على مستوى تسجيل الشركة (لا فرع) فلا فلترة فرع هنا.
const VAT_PERIOD_MOVEMENT_SQL = `
  SELECT jl."accountCode",
         SUM(COALESCE(jl.debit, 0))::float8  AS debit,
         SUM(COALESCE(jl.credit, 0))::float8 AS credit
    FROM journal_lines jl
    JOIN journal_entries je
      ON je.id = jl."journalId"
     AND je."deletedAt" IS NULL
     AND je."balancesApplied" = true
     AND je."reversedById" IS NULL
   WHERE je."companyId" = $1
     AND jl."accountCode" IN ($2, $3)
     AND jl."deletedAt" IS NULL
     AND je."date" >= $4
     AND je."date" < ($5::date + 1)
   GROUP BY jl."accountCode"`;

export interface PostVatSettlementResult {
  posted: boolean;
  reason?: "period_closed" | "nothing_to_settle" | "already_posted";
  journalId?: number | null;
  outputVat: number;
  inputVat: number;
  netDue: number;
}

/**
 * احسب مخرجات/مدخلات الفترة من الدفتر (نفس منطق التقرير) ورحّل قيد التسوية
 * (idempotent عبر ref + sourceKey). لا يمسّ إلا حسابَي الضريبة والنقد.
 */
export async function postVatSettlement(opts: {
  companyId: number;
  branchId: number;
  startDate: string; // YYYY-MM-DD (بداية فترة الإقرار)
  endDate: string; // YYYY-MM-DD (نهايتها، شاملة)
  paymentDate: string; // YYYY-MM-DD (تاريخ السداد لهيئة الزكاة والضريبة)
  createdBy: number;
  /** حساب النقد/البنك المُسدَّد منه؛ افتراضيًّا يُحلّ vat_settlement_cash→1111. */
  cashAccountCode?: string | null;
  notes?: string | null;
}): Promise<PostVatSettlementResult> {
  const { companyId } = opts;

  const periodCheck = await checkFinancialPeriodOpen(companyId, opts.paymentDate);
  if (!periodCheck.open) {
    return { posted: false, reason: "period_closed", outputVat: 0, inputVat: 0, netDue: 0 };
  }

  const { financialEngine } = await import("../engines/index.js");
  const [outputCode, inputCode, cashCodeResolved] = await Promise.all([
    financialEngine.resolveAccountCode(companyId, "vat_output", "credit", "2131"),
    financialEngine.resolveAccountCode(companyId, "vat_input", "debit", "1180"),
    financialEngine.resolveAccountCode(companyId, "vat_settlement_cash", "credit", "1111"),
  ]);
  const cashCode = opts.cashAccountCode || cashCodeResolved;

  const rows = await rawQuery<{ accountCode: string; debit: number; credit: number }>(
    VAT_PERIOD_MOVEMENT_SQL,
    [companyId, outputCode, inputCode, opts.startDate, opts.endDate],
  );
  let outputVat = 0; // Σ(دائن − مدين) على المخرجات
  let inputVat = 0; // Σ(مدين − دائن) على المدخلات
  for (const r of rows) {
    const debit = Number(r.debit ?? 0);
    const credit = Number(r.credit ?? 0);
    if (r.accountCode === outputCode) outputVat = round2(outputVat + (credit - debit));
    else if (r.accountCode === inputCode) inputVat = round2(inputVat + (debit - credit));
  }

  const built = buildVatSettlementLines({ outputVat, inputVat, outputCode, inputCode, cashCode });
  if (!built) {
    return { posted: false, reason: "nothing_to_settle", outputVat, inputVat, netDue: 0 };
  }

  const ref = `VAT-SETTLE-${opts.startDate}_${opts.endDate}`;
  const result = await financialEngine.postJournalEntry({
    companyId,
    branchId: opts.branchId,
    createdBy: opts.createdBy,
    ref,
    description:
      `تسوية ضريبة القيمة المضافة ${opts.startDate}→${opts.endDate} — ` +
      `مخرجات ${outputVat} / مدخلات ${inputVat} / صافٍ ${built.netDue}` +
      (opts.notes ? ` — ${opts.notes}` : ""),
    sourceType: "vat_settlement",
    sourceId: 0,
    sourceKey: `finance:vat_settlement:${companyId}:${opts.startDate}:${opts.endDate}`,
    postingDate: opts.paymentDate,
    lines: built.lines,
  });

  return {
    posted: !result.alreadyExists,
    reason: result.alreadyExists ? "already_posted" : undefined,
    journalId: result.journalId,
    outputVat,
    inputVat,
    netDue: built.netDue,
  };
}
