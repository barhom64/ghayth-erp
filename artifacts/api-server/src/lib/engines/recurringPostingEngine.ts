// ─── FIN-RECURRING-POSTING-ENGINE ───────────────────────────────────────────
// المحرّك الدوري الموحّد للترحيلات — يعمّم نمط الإهلاك التلقائي إلى عقد profiles
// واحد (مواصفة معتمدة: plans/fin-recurring-posting-engine-spec-2026-06-24.md، #2958).
//
// الخطوة 1 (§6 من المواصفة): عقد المحرّك + profile الإهلاك كدوال نقية تُعيد إنتاج
// قيود `monthlyAutoDepreciation` الحالية بالضبط (إثبات تكافؤ). **غير موصول حيًّا
// بعد** — توصيل الـcron + جدول التتبّع (migration) + الـprofiles الجديدة خطوات
// تالية تُعرض على إبراهيم كلٌّ على حدة (تمسّ الدفتر/تحتاج migration).

const round2 = (n: number) => Math.round(n * 100) / 100;

/** سطر قيد قالبيّ — يحمل الحساب والاتجاه والأبعاد الموروثة من الصف. */
export interface RecurringJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  // أبعاد دفتر مساعدة (تُورَّث من الصف)
  assetId?: number;
  employeeId?: number;
  departmentId?: number;
  branchId?: number;
  vehicleId?: number;
  propertyId?: number;
  projectId?: number;
  clientId?: number;
  costCenterId?: number;
}

/**
 * عقد الـprofile الدوري — يصف (لا يُنفّذ): صيغة المبلغ، قالب القيد، ومفتاح التكرار.
 * المحرّك المشترك (يأتي مع توصيل الـcron) يتكفّل بـ: اختيار الصفوف، بوابة الفترة،
 * الـidempotency عبر جدول التتبّع، والترحيل عبر `financialEngine.postJournalEntry`.
 */
export interface RecurringProfile<Row> {
  /** مفتاح ثابت للـprofile — يُستعمل كـsourceType مميِّز. */
  readonly key: string;
  /** المبلغ الشهري لكل صف (≤0 ⇒ يتخطّى المحرّك الصف). */
  amountFor(row: Row): number;
  /** قالب DR/CR متوازن للصف+المبلغ (أكواد الحسابات من الصف/الافتراضي). */
  journalTemplate(row: Row, amount: number): RecurringJournalLine[];
  /** مفتاح idempotency لكل (صف، فترة) — يتصادم عند إعادة التشغيل فلا ازدواج. */
  sourceKey(row: Row, period: string): string;
}

// ── profile الإهلاك — يُعيد إنتاج منطق monthlyAutoDepreciation حرفيًّا ──────────
// (cronScheduler.ts: حساب depAmount + سطرا القيد + sourceKey.)
export interface DepreciationAssetRow {
  id: number;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  currentBookValue?: number | null;
  accumulatedDepreciation: number;
  depreciationMethod?: string | null;
  /** كود مصروف الإهلاك الخاص بالأصل (افتراضي 5790). */
  depreciationAccountCode?: string | null;
  /** كود مجمّع الإهلاك الخاص بالأصل (افتراضي 1290). */
  accDepreciationAccountCode?: string | null;
}

export const assetDepreciationProfile: RecurringProfile<DepreciationAssetRow> = {
  key: "asset_depreciation",

  amountFor(asset) {
    const purchaseCost = Number(asset.purchaseCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLife = Number(asset.usefulLifeYears);
    const currentBookValue = Number(asset.currentBookValue ?? asset.purchaseCost);

    // عمر إنتاجي غير صالح ⇒ لا إهلاك (نظير `continue` في الـcron).
    if (!usefulLife || usefulLife <= 0) return 0;

    let depAmount: number;
    if (asset.depreciationMethod === "declining_balance") {
      depAmount = Math.max(0, round2(currentBookValue * (2 / usefulLife / 12)));
    } else {
      depAmount = Math.max(0, round2((purchaseCost - salvageValue) / (usefulLife * 12)));
    }

    // لا يُهلَك الأصل تحت قيمة الخردة.
    if (currentBookValue - depAmount < salvageValue) {
      depAmount = Math.max(0, currentBookValue - salvageValue);
    }
    return depAmount;
  },

  journalTemplate(asset, amount) {
    return [
      { accountCode: asset.depreciationAccountCode ?? "5790", debit: amount, credit: 0, assetId: Number(asset.id) },
      { accountCode: asset.accDepreciationAccountCode ?? "1290", debit: 0, credit: amount, assetId: Number(asset.id) },
    ];
  },

  sourceKey(asset, period) {
    return `finance:depreciation:${asset.id}:${period}`;
  },
};
