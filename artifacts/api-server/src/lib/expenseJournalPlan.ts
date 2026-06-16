// expenseJournalPlan.ts
//
// FIN-P8-JOURNAL-PREVIEW (#2238) — **المُجمِّع المشترك لقيد المصروف.**
//
// مصدر واحد لشكل سطور قيد المصروف، يستخدمه:
//   • مسار الحفظ      POST /finance/expenses           (يُجمِّع ثم يُرحِّل)
//   • مسار المعاينة   POST /finance/expenses/impact-preview (يُجمِّع ثم يُقيّم بلا كتابة DB)
//
// القاعدة المعمارية (من #2238): **لا تكرار منطق القيد** — لا في الواجهة ولا في
// preview موازٍ. البابان يستدعيان نفس `buildExpenseEntityLink` + `buildExpenseLines`،
// وكلاهما يمرّ على `assertDimensionContract` (عقد البُعد #2233). دوال نقية بلا I/O،
// فالقياس والاشتقاق قابلان للاختبار وحدةً دون قاعدة بيانات.

import { ValidationError } from "./errorHandler.js";
import { assertDimensionContract, type DimensionContractLine } from "./financePostingPolicy.js";

/** الأبعاد المحمولة على سطر المصروف (مسطّحة كما يُدرجها posting). */
export type ExpenseEntityLink = Record<string, any>;

export interface ExpenseLinkInput {
  /** الحساب الذي اختاره المُدخِل (قد يتجاوزه lineAllocation.accountCode). */
  accountCode?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | string | null;
  projectId?: number | string | null;
  costCenter?: string | null;
  /** مخرجات LineAllocationPanel — تتجاوز القيم المشتقّة آليًا. */
  lineAllocation?: Record<string, any> | null;
}

/**
 * يبني خريطة الأبعاد (entityLink) من نوع الكيان المرتبط + المشروع + مركز التكلفة،
 * ثم يطبّق تجاوزات lineAllocation فوقها. يعيد أيضًا تجاوز كود الحساب إن وُجد.
 * مطابق تمامًا لمنطق مسار الحفظ — مستخرَج هنا حتى يتشارك البابان نفس المصدر.
 */
export function buildExpenseEntityLink(input: ExpenseLinkInput): {
  entityLink: ExpenseEntityLink;
  accountCodeOverride: string | null;
} {
  const entityLink: ExpenseEntityLink = {};
  const t = input.relatedEntityType ?? null;
  const rid = input.relatedEntityId != null ? Number(input.relatedEntityId) : null;
  if (t === "employee" && rid) entityLink.employeeId = rid;
  if (t === "vehicle" && rid) entityLink.vehicleId = rid;
  if (t === "property" && rid) entityLink.propertyId = rid;
  if (t === "contract" && rid) entityLink.contractId = rid;
  if ((t === "supplier" || t === "vendor") && rid) entityLink.vendorId = rid;
  if ((t === "customer" || t === "client") && rid) entityLink.clientId = rid;
  if (input.projectId) entityLink.projectId = Number(input.projectId);
  if (input.costCenter) entityLink.costCenter = input.costCenter;

  let accountCodeOverride = input.accountCode ?? null;
  const la = input.lineAllocation;
  if (la) {
    if (la.accountCode) accountCodeOverride = la.accountCode;
    if (la.costCenterId != null) entityLink.costCenterId = la.costCenterId;
    if (la.activityType) entityLink.activityType = la.activityType;
    if (la.projectId != null) entityLink.projectId = la.projectId;
    if (la.vehicleId != null) entityLink.vehicleId = la.vehicleId;
    if (la.propertyId != null) entityLink.propertyId = la.propertyId;
    if (la.unitId != null) entityLink.unitId = la.unitId;
    if (la.assetId != null) entityLink.assetId = la.assetId;
    if (la.contractId != null) entityLink.contractId = la.contractId;
    if (la.umrahAgentId != null) entityLink.umrahAgentId = la.umrahAgentId;
    if (la.clientId != null) entityLink.clientId = la.clientId;
    if (la.vendorId != null) entityLink.vendorId = la.vendorId;
    if (la.driverId != null) entityLink.driverId = la.driverId;
    if (la.productId != null) entityLink.productId = la.productId;
    if (la.umrahSeasonId != null) entityLink.umrahSeasonId = la.umrahSeasonId;
    if (la.departmentId != null) entityLink.departmentId = la.departmentId;
    if (la.employeeId != null) entityLink.employeeId = la.employeeId;
    if (la.manualOverrideReason) entityLink.manualOverrideReason = la.manualOverrideReason;
  }
  return { entityLink, accountCodeOverride };
}

/** دور السطر في القيد — يستخدمه عرض المعاينة لاشتقاق التسمية والسبب. */
export type ExpenseLineRole = "expense" | "vat_input" | "source";

export interface PlannedExpenseLine extends Record<string, unknown> {
  accountCode: string;
  debit: number;
  credit: number;
  role: ExpenseLineRole;
}

export interface BuildExpenseLinesInput {
  /** كود حساب المصروف بعد كل التجاوزات (الحساب الفرعي/lineAllocation/المُحلِّل). */
  expenseAccountCode: string;
  baseAmount: number;
  vatAmount: number;
  vatInputAccountCode?: string | null;
  sourceAccountCode: string;
  totalWithVat: number;
  entityLink: ExpenseEntityLink;
  /** توزيع متعدّد لمراكز التكلفة (يستبدل سطر المصروف الواحد بسطر لكل مركز). */
  costCenterSplits?: Array<{ costCenterId: number; amount: number }> | null;
}

/**
 * يُجمِّع سطور قيد المصروف بنفس ترتيب مسار الحفظ:
 *   1) سطر/سطور المصروف المدينة (سطر واحد، أو سطر لكل مركز تكلفة عند التوزيع).
 *   2) سطر ضريبة المدخلات المدين (إن وُجدت ضريبة).
 *   3) سطر مصدر الصرف/ذمة المورد الدائن (بإجمالي القيمة مع الضريبة).
 * كل سطر يحمل نفس entityLink. دالة نقية — تُنتج مصفوفة قابلة للترحيل أو للمعاينة.
 */
export function buildExpenseLines(input: BuildExpenseLinesInput): PlannedExpenseLine[] {
  const lines: PlannedExpenseLine[] = [];
  if (input.costCenterSplits && input.costCenterSplits.length > 0) {
    for (const leg of input.costCenterSplits) {
      lines.push({
        accountCode: input.expenseAccountCode,
        debit: leg.amount,
        credit: 0,
        ...input.entityLink,
        costCenterId: leg.costCenterId,
        role: "expense",
      });
    }
  } else {
    lines.push({
      accountCode: input.expenseAccountCode,
      debit: input.baseAmount,
      credit: 0,
      ...input.entityLink,
      role: "expense",
    });
  }
  if (input.vatAmount > 0 && input.vatInputAccountCode) {
    lines.push({
      accountCode: input.vatInputAccountCode,
      debit: input.vatAmount,
      credit: 0,
      ...input.entityLink,
      role: "vat_input",
    });
  }
  lines.push({
    accountCode: input.sourceAccountCode,
    debit: 0,
    credit: input.totalWithVat,
    ...input.entityLink,
    role: "source",
  });
  return lines;
}

export interface PlanBlocker {
  /** رمز ثابت يقرأه الـfrontend لتعطيل الحفظ. */
  code: "unbalanced" | "account_not_found" | "dimension_contract" | "payment_source";
  field?: string;
  message: string;
}

export interface ExpensePlanEvaluation {
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  blockers: PlanBlocker[];
  warnings: string[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const DIM_KEYS: (keyof DimensionContractLine)[] = [
  "vehicleId",
  "propertyId",
  "projectId",
  "vendorId",
  "clientId",
];

/**
 * يُقيّم خطة القيد قبل الترحيل (بلا كتابة DB):
 *   • التوازن (مدين = دائن).
 *   • وجود الحساب وقابليته للترحيل — إن مُرِّرت `knownAccountCodes` (مجموعة الأكواد
 *     الموجودة القابلة للترحيل)، فأي كود خارجها → blocker «الحساب غير موجود».
 *   • عقد البُعد (#2233) — أي رفض من `assertDimensionContract` يصبح blocker،
 *     والتحذيرات تُجمَّع كما هي.
 * دالة نقية: لا I/O — `knownAccountCodes` تُحقَن من المُستدعي (الـendpoint يستعلم DB).
 */
export function evaluateExpensePlan(args: {
  lines: Array<Record<string, any>>;
  knownAccountCodes?: Set<string> | null;
}): ExpensePlanEvaluation {
  const lines = args.lines;
  const totalDebit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const blockers: PlanBlocker[] = [];
  const warnings: string[] = [];

  if (!balanced) {
    blockers.push({
      code: "unbalanced",
      message: `القيد غير متوازن: مدين ${totalDebit.toLocaleString("ar-SA")} ≠ دائن ${totalCredit.toLocaleString("ar-SA")}`,
    });
  }

  if (args.knownAccountCodes) {
    const seen = new Set<string>();
    for (const l of lines) {
      const code = l.accountCode ? String(l.accountCode).trim() : "";
      if (!code || seen.has(code)) continue;
      seen.add(code);
      if (!args.knownAccountCodes.has(code)) {
        blockers.push({
          code: "account_not_found",
          field: "accountCode",
          message: `الحساب «${code}» غير موجود أو غير قابل للترحيل — لا يمكن إنشاء القيد`,
        });
      }
    }
  }

  try {
    const dimLines: DimensionContractLine[] = lines.map((l) => {
      const dl: DimensionContractLine = { accountCode: l.accountCode ?? null };
      for (const k of DIM_KEYS) (dl as any)[k] = (l as any)[k] ?? null;
      return dl;
    });
    const r = assertDimensionContract({ lines: dimLines });
    warnings.push(...r.warnings);
  } catch (e) {
    if (e instanceof ValidationError) {
      blockers.push({
        code: "dimension_contract",
        field: (e as any).field,
        message: e.message,
      });
    } else {
      throw e;
    }
  }

  return { balanced, totalDebit, totalCredit, blockers, warnings };
}
