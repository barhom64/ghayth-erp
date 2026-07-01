// معاينة مستحقّات السائق قيد الترحيل — قراءة فقط (تشغيلية بلا دفتر).
//
// كشف يعرض — قبل تشغيل المسيّر — ما سيدخله من بنود تشغيلية معتمدة وغير مُستهلكة
// لكل سائق: ساعات القيادة/التوقف المعتمدة (للفترة) × معدّل HR + مكافآت الحركات
// المعتمدة. **لا كتابة ولا قيد ولا استهلاك** — هذه نفس نصف القراءة من المسيّر،
// بلا الترحيل. تكشف الأخطاء مبكرًا (سائق بلا معدّل، مكافأة شاذة) قبل الترحيل.
//
// قفل الحدود: HR قائد الأجر — يقرأ ساعات/مكافآت الأسطول عبر عقود القراءة التي
// يكشفها الأسطول (getApprovedDriverHoursForPeriod / getApprovedMovementBonusesForCompany)
// ويطبّق معدّله. لا يكتب جداول الأسطول. الصيغة من المصدر الواحد computeHourlyDriverPay.

import { rawQuery } from "../rawdb.js";
import { getApprovedDriverHoursForPeriod } from "../fleet/driverHours.js";
import { getApprovedMovementBonusesForCompany } from "../fleet/movementBonuses.js";
import { buildDriverRateResolver, computeHourlyDriverPay } from "./driverPayRates.js";

export interface DriverDuesRow {
  assignmentId: number;
  employeeId: number | null;
  employeeName: string | null;
  departmentId: number | null;
  payType: string | null;
  drivingHours: number;
  stopHours: number;
  drivingHoursAmount: number;
  stopHoursAmount: number;
  hoursTotal: number;
  bonusTotal: number;
  bonusCount: number;
  grandTotal: number;
}

export interface DriverDuesPreview {
  period: string;
  rows: DriverDuesRow[];
  totals: {
    drivers: number;
    drivingHours: number;
    stopHours: number;
    hoursTotal: number;
    bonusTotal: number;
    grandTotal: number;
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * يجمع المستحقّات المعتمدة غير المُرحَّلة لكل تعيين سائق لفترة (YYYY-MM):
 * ساعات الفترة × معدّل HR + كل المكافآت المعتمدة المعلّقة (غير محدودة بالفترة،
 * كما يستهلكها المسيّر). يُحذف من لا له ساعات ولا مكافأة. قراءة فقط بحتة.
 */
export async function getPendingDriverDues(
  companyId: number,
  period: string,
): Promise<DriverDuesPreview> {
  const [hours, bonuses, resolveRate] = await Promise.all([
    getApprovedDriverHoursForPeriod(companyId, period),
    getApprovedMovementBonusesForCompany(companyId),
    buildDriverRateResolver(companyId),
  ]);

  const ids = new Set<number>();
  for (const h of hours) ids.add(h.assignmentId);
  for (const b of bonuses) ids.add(b.assignmentId);

  const empty: DriverDuesPreview = {
    period,
    rows: [],
    totals: { drivers: 0, drivingHours: 0, stopHours: 0, hoursTotal: 0, bonusTotal: 0, grandTotal: 0 },
  };
  if (ids.size === 0) return empty;

  // أسماء الموظفين للتعيينات (عزل إيجاري على الشركة + ضمن المجموعة فقط).
  const nameRows = await rawQuery<{
    assignmentId: number;
    employeeId: number | null;
    employeeName: string | null;
    departmentId: number | null;
  }>(
    `SELECT ea.id AS "assignmentId", ea."employeeId", e.name AS "employeeName",
            ea."departmentId"
       FROM employee_assignments ea
       LEFT JOIN employees e ON e.id = ea."employeeId"
      WHERE ea."companyId" = $1 AND ea.id = ANY($2::int[])`,
    [companyId, [...ids]],
  );
  const nameMap = new Map(nameRows.map((r) => [Number(r.assignmentId), r]));
  const hoursMap = new Map(hours.map((h) => [h.assignmentId, h]));
  const bonusMap = new Map(bonuses.map((b) => [b.assignmentId, b]));

  const rows: DriverDuesRow[] = [];
  for (const aId of ids) {
    const h = hoursMap.get(aId);
    const b = bonusMap.get(aId);
    const rate = resolveRate(aId);
    const drivingHours = h?.drivingHours ?? 0;
    const stopHours = h?.stopHours ?? 0;
    const pay = computeHourlyDriverPay(rate, drivingHours, stopHours);
    const bonusTotal = round2(b?.total ?? 0);
    const grandTotal = round2(pay.total + bonusTotal);
    if (pay.total <= 0 && bonusTotal <= 0 && drivingHours <= 0 && stopHours <= 0) continue;
    const nm = nameMap.get(aId);
    rows.push({
      assignmentId: aId,
      employeeId: nm?.employeeId != null ? Number(nm.employeeId) : null,
      employeeName: nm?.employeeName ?? null,
      departmentId: nm?.departmentId != null ? Number(nm.departmentId) : null,
      payType: rate?.payType ?? null,
      drivingHours,
      stopHours,
      drivingHoursAmount: pay.drivingHoursAmount,
      stopHoursAmount: pay.stopHoursAmount,
      hoursTotal: pay.total,
      bonusTotal,
      bonusCount: b?.rowIds.length ?? 0,
      grandTotal,
    });
  }

  rows.sort((a, b) => (a.employeeName ?? "").localeCompare(b.employeeName ?? "", "ar"));

  const totals = rows.reduce(
    (acc, r) => {
      acc.drivers += 1;
      acc.drivingHours = round2(acc.drivingHours + r.drivingHours);
      acc.stopHours = round2(acc.stopHours + r.stopHours);
      acc.hoursTotal = round2(acc.hoursTotal + r.hoursTotal);
      acc.bonusTotal = round2(acc.bonusTotal + r.bonusTotal);
      acc.grandTotal = round2(acc.grandTotal + r.grandTotal);
      return acc;
    },
    { drivers: 0, drivingHours: 0, stopHours: 0, hoursTotal: 0, bonusTotal: 0, grandTotal: 0 },
  );

  return { period, rows, totals };
}
