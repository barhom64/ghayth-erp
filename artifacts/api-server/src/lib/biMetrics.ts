/**
 * biMetrics — سجلّ المؤشّرات الحقيقية القابلة للحساب (قائمة بيضاء).
 *
 * يحوّل KPI من «قيمة مخزّنة يدويًا» إلى «قيمة محسوبة من بيانات فعلية»، **بأمان**:
 * لا تقييم صيغ حرّة (no eval / no Function) — فقط مفاتيح معروفة مسبقًا، كلٌّ
 * مربوط باستعلام محدّد مُتفلتِر بـ companyId (نفس استعلامات /bi/overview المُثبتة).
 *
 * أي KPI تكون صيغته (`formula`) أحد المفاتيح أدناه تُحسب قيمته الحيّة عند
 * /bi/kpis/:id/refresh. مفتاح غير معروف يُرفض (422) — لا حساب اعتباطي.
 */
import { rawQuery } from "./rawdb.js";

export type BiMetricDef = {
  key: string;
  label: string;
  unit: string;
  compute: (companyId: number) => Promise<number>;
};

async function scalar(sql: string, companyId: number): Promise<number> {
  const rows = await rawQuery<{ v: number | string | null }>(sql, [companyId]);
  const v = rows[0]?.v;
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// القائمة البيضاء — تُقرأ كـ Map. كل استعلام يطابق دلالة /bi/overview المُثبتة.
const DEFS: BiMetricDef[] = [
  { key: "active_employees", label: "الموظفون النشطون", unit: "موظف",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM employee_assignments WHERE "companyId" = $1 AND status = 'active'`, c) },
  { key: "total_clients", label: "إجمالي العملاء", unit: "عميل",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL`, c) },
  { key: "total_invoices", label: "إجمالي الفواتير", unit: "فاتورة",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`, c) },
  { key: "total_projects", label: "إجمالي المشاريع", unit: "مشروع",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL`, c) },
  { key: "active_vehicles", label: "المركبات", unit: "مركبة",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM fleet_vehicles WHERE "companyId" = $1 AND "deletedAt" IS NULL`, c) },
  { key: "open_tickets", label: "تذاكر الدعم المفتوحة", unit: "تذكرة",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'open'`, c) },
  { key: "total_revenue", label: "الإيراد المُحصَّل", unit: "ريال",
    compute: (c) => scalar(`SELECT COALESCE(SUM("paidAmount"), 0) AS v FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "paidAmount" > 0`, c) },
  { key: "pending_invoices", label: "فواتير قيد التحصيل", unit: "فاتورة",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('sent','partial','overdue')`, c) },
  { key: "overdue_invoices", label: "فواتير متأخرة", unit: "فاتورة",
    compute: (c) => scalar(`SELECT COUNT(*) AS v FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('sent','overdue') AND "dueDate" < CURRENT_DATE`, c) },
];

export const BI_METRICS = new Map<string, BiMetricDef>(DEFS.map((d) => [d.key, d]));

/** قائمة المفاتيح المتاحة (للرسائل وواجهة الاختيار). */
export function biMetricKeys(): Array<{ key: string; label: string; unit: string }> {
  return DEFS.map(({ key, label, unit }) => ({ key, label, unit }));
}

/** يحسب قيمة مؤشّر معروف؛ يرمي إن كان المفتاح خارج القائمة البيضاء. */
export async function computeBiMetric(formulaKey: string, companyId: number): Promise<number> {
  const def = BI_METRICS.get(formulaKey);
  if (!def) throw new Error(`UNKNOWN_METRIC:${formulaKey}`);
  return def.compute(companyId);
}
