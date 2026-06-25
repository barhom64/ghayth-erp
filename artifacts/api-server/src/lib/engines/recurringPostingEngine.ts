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

// ── نواة المحرّك: تخطيط الترحيلات الدورية (idempotent، نقي) ──────────────────
// تأخذ profile + صفوف الفترة + مجموعة المفاتيح المُرحَّلة سابقًا، وتُرجع قائمة
// الترحيلات الواجب تنفيذها — يتخطّى المُرحَّل سابقًا (idempotency) والمبلغ ≤0.
// هذه النواة المشتركة التي تستهلكها وظائف الـcron لكل profile؛ بلا DB (المُستدعي
// يحقن مجموعة المُرحَّل سابقًا من جدول التتبّع، ويتولّى الترحيل عبر financialEngine).
export interface PlannedRecurringPosting {
  /** مفتاح idempotency (sourceKey) — يتصادم عند إعادة التشغيل. */
  sourceKey: string;
  /** نوع المصدر = مفتاح الـprofile. */
  sourceType: string;
  /** معرّف الكيان (الأصل/الموظف/…) لسجل التتبّع. */
  entityId: number;
  amount: number;
  lines: RecurringJournalLine[];
}

export function planRecurringPostings<Row extends { id: number }>(
  profile: RecurringProfile<Row>,
  rows: Row[],
  period: string,
  alreadyPosted: ReadonlySet<string>,
): PlannedRecurringPosting[] {
  const planned: PlannedRecurringPosting[] = [];
  for (const row of rows) {
    const sourceKey = profile.sourceKey(row, period);
    if (alreadyPosted.has(sourceKey)) continue;   // مُرحَّل سابقًا ⇒ تخطٍّ idempotent
    const amount = profile.amountFor(row);
    if (amount <= 0) continue;                     // لا مبلغ ⇒ تخطٍّ
    planned.push({
      sourceKey,
      sourceType: profile.key,
      entityId: Number(row.id),
      amount,
      lines: profile.journalTemplate(row, amount),
    });
  }
  return planned;
}

// ── profile استحقاق نهاية الخدمة (EOS) ───────────────────────────────────────
// يطابق صيغة الاستحقاق الشهري per-employee في hr.ts `/accruals/monthly`
// (السطر 7651-7669): 1/24 من الراتب لأول 5 سنوات، 1/12 بعدها (نظام العمل م84).
// مسار hr.ts الحالي يرحّل **إجماليًّا** (مجموع كل الموظفين في قيد واحد)؛ هذا الـ
// profile per-employee بأبعاد employee/dept/branch — تحسين دفتري يلزمه توسيع عقد
// أبعاد العمالة + بذور purpose قبل التوصيل الحيّ (المواصفة §5). دوال نقية، **غير
// موصولة حيًّا** (نفس نهج assetDepreciationProfile أول ما نزل). `id` = معرّف الموظف.
export interface EosAccrualRow {
  /** معرّف الموظف — يصير entityId في سجل التتبّع. */
  id: number;
  salary: number;
  /** سنوات الخدمة حتى نهاية الفترة (تُحسب من contractStart مقابل آخر الشهر). */
  yearsOfService: number;
  departmentId?: number | null;
  branchId?: number | null;
  /** كود مصروف استحقاق نهاية الخدمة (افتراضي 5260). */
  eosExpenseAccountCode?: string | null;
  /** كود التزام استحقاق نهاية الخدمة (افتراضي 2220). */
  eosLiabilityAccountCode?: string | null;
}

export const eosAccrualProfile: RecurringProfile<EosAccrualRow> = {
  key: "eos_accrual",

  amountFor(emp) {
    const salary = Number(emp.salary) || 0;
    if (salary <= 0) return 0;
    // > 5 سنوات ⇒ 1/12، وإلا 1/24 (يطابق hr.ts:7662-7669 + معاينة 7771).
    const monthly = Number(emp.yearsOfService) > 5 ? salary / 12 : salary / 24;
    return round2(monthly);
  },

  journalTemplate(emp, amount) {
    const employeeId = Number(emp.id);
    const departmentId = emp.departmentId ?? undefined;
    const branchId = emp.branchId ?? undefined;
    return [
      { accountCode: emp.eosExpenseAccountCode ?? "5260", debit: amount, credit: 0, employeeId, departmentId, branchId },
      { accountCode: emp.eosLiabilityAccountCode ?? "2220", debit: 0, credit: amount, employeeId, departmentId, branchId },
    ];
  },

  sourceKey(emp, period) {
    return `hr:eos_accrual:${emp.id}:${period}`;
  },
};

// ── profile استحقاق الإجازات ─────────────────────────────────────────────────
// يطابق صيغة الإجازة الشهرية per-employee في hr.ts `/accruals/monthly`
// (السطر 7655-7657): (الراتب/30) × (أيام الإجازة السنوية/12).
// CR على **2150** (التزام إجازات مستحقة — ثبّتته المالية في هجرة 365)، لا 2220
// (الخلط بين الإجازات ومخصص نهاية الخدمة خطأ محاسبي). دوال نقية، غير موصولة حيًّا.
export interface LeaveAccrualRow {
  /** معرّف الموظف — يصير entityId في سجل التتبّع. */
  id: number;
  salary: number;
  departmentId?: number | null;
  branchId?: number | null;
  /** أيام الإجازة السنوية المستحقة (افتراضي 21). */
  annualLeaveDays?: number | null;
  /** كود مصروف استحقاق الإجازات (افتراضي 5270). */
  leaveExpenseAccountCode?: string | null;
  /** كود التزام الإجازات المستحقة (افتراضي 2150). */
  leaveLiabilityAccountCode?: string | null;
}

export const leaveAccrualProfile: RecurringProfile<LeaveAccrualRow> = {
  key: "leave_accrual",

  amountFor(emp) {
    const salary = Number(emp.salary) || 0;
    if (salary <= 0) return 0;
    const dailyRate = salary / 30;
    const annualDays = Number(emp.annualLeaveDays ?? 21);
    const monthlyLeaveDays = annualDays / 12;
    return round2(dailyRate * monthlyLeaveDays);
  },

  journalTemplate(emp, amount) {
    const employeeId = Number(emp.id);
    const departmentId = emp.departmentId ?? undefined;
    const branchId = emp.branchId ?? undefined;
    return [
      { accountCode: emp.leaveExpenseAccountCode ?? "5270", debit: amount, credit: 0, employeeId, departmentId, branchId },
      { accountCode: emp.leaveLiabilityAccountCode ?? "2150", debit: 0, credit: amount, employeeId, departmentId, branchId },
    ];
  },

  sourceKey(emp, period) {
    return `hr:leave_accrual:${emp.id}:${period}`;
  },
};
