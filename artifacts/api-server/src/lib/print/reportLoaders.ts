/**
 * reportLoaders — fetchers for *batch* report entityTypes that don't have a
 * single row in any one table: trial balance, income statement, invoice list,
 * payroll register, attendance log, fleet summary, fleet-trip report.
 *
 * These replace the bespoke generators that used to live in lib/excelExport.ts
 * and the batch portion of lib/pdfExport.ts. Print Engine v2 now owns them
 * end-to-end: dataLoader → variableSubstitution → adapter (a4/excel) — one
 * pipeline, one audit row, one cliché.
 *
 * Shape contract: each loader returns
 *   { entity: { title, period?, totals?, ... }, items: [...] }
 * — `items` is what the excel adapter writes as a sheet, and what the
 * universal preset template renders as a {{entity.itemsTable}} block.
 *
 * The `entityId` passed in is a synthetic identifier that encodes filters
 * (e.g. "2025-04-01..2025-06-30" for date ranges, "2025-06" for periods).
 * batchAudit / the routes layer builds this so a print_jobs row can be
 * traced back to the exact filter set.
 */

import { rawQuery } from "../rawdb.js";

/** Parse synthetic entityId formats: "YYYY-MM-DD..YYYY-MM-DD" or "YYYY-MM". */
function parseEntityId(id: string): { startDate?: string; endDate?: string; period?: string } {
  if (!id || id === "n/a" || id === "all") return {};
  if (id.includes("..")) {
    const [s, e] = id.split("..");
    return { startDate: s || undefined, endDate: e || undefined };
  }
  if (/^\d{4}-\d{2}$/.test(id)) {
    return { period: id };
  }
  return {};
}

const STATUS_INVOICES: Record<string, string> = {
  draft: "مسودة", pending: "قيد الانتظار", approved: "معتمد", paid: "مدفوع",
  partial: "جزئي", overdue: "متأخر", cancelled: "ملغي",
};

const STATUS_PAYROLL: Record<string, string> = {
  draft: "مسودة", approved: "معتمد", paid: "مدفوع", pending: "قيد المعالجة",
};

const STATUS_ATTENDANCE: Record<string, string> = {
  present: "حاضر", absent: "غائب", late: "متأخر", leave: "إجازة",
  on_leave: "في إجازة", remote: "عن بعد", half_day: "نصف يوم",
};

const STATUS_FLEET: Record<string, string> = {
  active: "نشط", inactive: "غير نشط", needs_service: "يحتاج صيانة", under_maintenance: "في الصيانة",
};

const TYPE_ACCOUNT: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية",
  revenue: "إيرادات", expense: "مصروفات",
};

export async function loadTrialBalance(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, coa.type,
            COALESCE(SUM(jl.debit), 0)::float8  AS "totalDebit",
            COALESCE(SUM(jl.credit), 0)::float8 AS "totalCredit",
            (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::float8 AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1
     GROUP BY coa.code, coa.name, coa.type
     ORDER BY coa.code`,
    params,
  );

  const items = rows.map((r) => ({
    "الرمز": r.code as string,
    "اسم الحساب": r.name as string,
    "النوع": TYPE_ACCOUNT[r.type as string] ?? (r.type as string),
    "مدين": Number(r.totalDebit ?? 0),
    "دائن": Number(r.totalCredit ?? 0),
    "الرصيد": Number(r.balance ?? 0),
  }));
  const totalDebit  = items.reduce((s, r) => s + (r["مدين"] as number), 0);
  const totalCredit = items.reduce((s, r) => s + (r["دائن"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "ميزان المراجعة",
      title: "ميزان المراجعة",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      status: Math.abs(totalDebit - totalCredit) < 0.01 ? "متوازن" : "غير متوازن",
      totalDebit, totalCredit, difference: totalDebit - totalCredit,
    },
    items,
  };
}

export async function loadIncomeStatement(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const revenues = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::float8 AS amount
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1 AND coa.type = 'revenue'
     GROUP BY coa.code, coa.name
     ORDER BY coa.code`,
    params,
  );
  const expenses = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::float8 AS amount
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1 AND coa.type = 'expense'
     GROUP BY coa.code, coa.name
     ORDER BY coa.code`,
    params,
  );

  const totalRevenue  = revenues.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const netIncome     = totalRevenue - totalExpenses;

  const items = [
    ...revenues.map((r) => ({
      "النوع": "إيراد",
      "الرمز": r.code as string,
      "اسم الحساب": r.name as string,
      "المبلغ": Number(r.amount ?? 0),
    })),
    ...expenses.map((r) => ({
      "النوع": "مصروف",
      "الرمز": r.code as string,
      "اسم الحساب": r.name as string,
      "المبلغ": Number(r.amount ?? 0),
    })),
  ];

  return {
    entity: {
      id: entityId,
      ref: "قائمة الدخل",
      title: "قائمة الدخل",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      totalRevenue, totalExpenses, netIncome,
      status: netIncome >= 0 ? "ربح" : "خسارة",
    },
    items,
  };
}

export async function loadInvoicesReport(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND i."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND i."createdAt" <= $${params.length}`; }

  const invoices = await rawQuery<Record<string, unknown>>(
    `SELECT i.ref, c.name AS "clientName", i.status,
            i.subtotal::float8 AS subtotal, i."vatAmount"::float8 AS "vatAmount",
            i.total::float8 AS total, i."paidAmount"::float8 AS "paidAmount",
            (i.total - i."paidAmount")::float8 AS remaining,
            i."createdAt", i."dueDate"
     FROM invoices i
     LEFT JOIN clients c ON c.id = i."clientId"
     WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${dateFilter}
     ORDER BY i."createdAt" DESC`,
    params,
  );

  const items = invoices.map((i) => ({
    "الرقم المرجعي": i.ref as string,
    "العميل": (i.clientName as string | null) ?? "",
    "الحالة": STATUS_INVOICES[i.status as string] ?? (i.status as string),
    "قبل الضريبة": Number(i.subtotal ?? 0),
    "الضريبة": Number(i.vatAmount ?? 0),
    "الإجمالي": Number(i.total ?? 0),
    "المدفوع": Number(i.paidAmount ?? 0),
    "المتبقي": Number(i.remaining ?? 0),
    "تاريخ الإنشاء": i.createdAt ? new Date(i.createdAt as string | Date).toLocaleDateString("ar-SA") : "",
    "تاريخ الاستحقاق": i.dueDate ? new Date(i.dueDate as string | Date).toLocaleDateString("ar-SA") : "",
  }));

  const total = items.reduce((s, r) => s + (r["الإجمالي"] as number), 0);
  const paid  = items.reduce((s, r) => s + (r["المدفوع"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "تقرير الفواتير",
      title: "تقرير الفواتير",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
      grandTotal: total, totalPaid: paid, totalRemaining: total - paid,
    },
    items,
  };
}

export async function loadPayrollReport(companyId: number, entityId: string) {
  const { period } = parseEntityId(entityId);
  let filter = "";
  const params: unknown[] = [companyId];
  if (period) { params.push(period); filter = ` AND pr.period = $${params.length}`; }

  const records = await rawQuery<Record<string, unknown>>(
    `SELECT pr.period, e.name AS "employeeName", ea."jobTitle" AS position,
            ea.salary::float8 AS "baseSalary",
            pr."grossSalary"::float8 AS "grossSalary",
            pr."totalDeductions"::float8 AS "totalDeductions",
            pr."netSalary"::float8 AS "netSalary",
            pr.status, pr."createdAt" AS "paidAt"
     FROM payroll_records pr
     JOIN employee_assignments ea ON ea.id = pr."employeeAssignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE pr."companyId" = $1 ${filter}
     ORDER BY pr.period DESC, e.name`,
    params,
  );

  const items = records.map((r) => ({
    "الفترة": r.period as string,
    "الموظف": r.employeeName as string,
    "المسمى الوظيفي": (r.position as string | null) ?? "",
    "الراتب الأساسي": Number(r.baseSalary ?? 0),
    "الراتب الإجمالي": Number(r.grossSalary ?? 0),
    "الاستقطاعات": Number(r.totalDeductions ?? 0),
    "صافي الراتب": Number(r.netSalary ?? 0),
    "الحالة": STATUS_PAYROLL[r.status as string] ?? (r.status as string),
  }));

  const totalGross = items.reduce((s, r) => s + (r["الراتب الإجمالي"] as number), 0);
  const totalNet   = items.reduce((s, r) => s + (r["صافي الراتب"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "تقرير الرواتب",
      title: "تقرير الرواتب",
      date: new Date().toLocaleDateString("ar-SA"),
      period: period ?? "كل الفترات",
      count: items.length,
      totalGross, totalNet, totalDeductions: totalGross - totalNet,
    },
    items,
  };
}

export async function loadAttendanceReport(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND a.date >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND a.date <= $${params.length}`; }

  const records = await rawQuery<Record<string, unknown>>(
    `SELECT e.name AS "employeeName", ea."jobTitle" AS position, a.date, a.status,
            a."checkIn", a."checkOut",
            CASE WHEN a."checkIn" IS NOT NULL AND a."checkOut" IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (a."checkOut" - a."checkIn"))/3600.0, 2)
              ELSE NULL END AS "workHours",
            a.notes
     FROM attendance a
     JOIN employee_assignments ea ON ea.id = a."assignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE ea."companyId" = $1 ${dateFilter}
     ORDER BY a.date DESC, e.name`,
    params,
  );

  const items = records.map((r) => ({
    "الموظف": r.employeeName as string,
    "المسمى الوظيفي": (r.position as string | null) ?? "",
    "التاريخ": r.date ? new Date(r.date as string | Date).toLocaleDateString("ar-SA") : "",
    "الحالة": STATUS_ATTENDANCE[r.status as string] ?? (r.status as string),
    "الحضور": (r.checkIn as string | null) ?? "",
    "الانصراف": (r.checkOut as string | null) ?? "",
    "ساعات العمل": r.workHours ? Number(r.workHours) : 0,
    "ملاحظات": (r.notes as string | null) ?? "",
  }));

  return {
    entity: {
      id: entityId,
      ref: "سجل الحضور",
      title: "سجل الحضور",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
    },
    items,
  };
}

export async function loadFleetReport(companyId: number, entityId: string) {
  const vehicles = await rawQuery<Record<string, unknown>>(
    `SELECT v."plateNumber", v.make, v.model, v.year, v.status,
            fd.name AS "driverName",
            v."nextServiceDate", v."currentMileage", v.color,
            COUNT(DISTINCT t.id)::int AS "totalTrips",
            COALESCE(SUM(fl.amount), 0)::float8 AS "totalFuelCost",
            COUNT(DISTINCT m.id)::int AS "maintenanceCount"
     FROM fleet_vehicles v
     LEFT JOIN fleet_drivers fd ON fd.id = v."assignedDriverId"
     LEFT JOIN fleet_trips t ON t."vehicleId" = v.id AND t."deletedAt" IS NULL
     LEFT JOIN fleet_fuel_logs fl ON fl."vehicleId" = v.id
     LEFT JOIN fleet_maintenance m ON m."vehicleId" = v.id
     WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
     GROUP BY v.id, fd.name ORDER BY v."plateNumber"`,
    [companyId],
  );

  const items = vehicles.map((v) => ({
    "رقم اللوحة": v.plateNumber as string,
    "الماركة": v.make as string,
    "الموديل": v.model as string,
    "السنة": v.year as number,
    "الحالة": STATUS_FLEET[v.status as string] ?? (v.status as string),
    "السائق": (v.driverName as string | null) ?? "",
    "الكيلومتر": Number(v.currentMileage ?? 0),
    "الرحلات": Number(v.totalTrips ?? 0),
    "تكلفة الوقود": Number(v.totalFuelCost ?? 0),
    "طلبات الصيانة": Number(v.maintenanceCount ?? 0),
    "الصيانة القادمة": v.nextServiceDate
      ? new Date(v.nextServiceDate as string | Date).toLocaleDateString("ar-SA")
      : "",
  }));

  return {
    entity: {
      id: entityId,
      ref: "تقرير الأسطول",
      title: "تقرير الأسطول",
      date: new Date().toLocaleDateString("ar-SA"),
      count: items.length,
      totalFuelCost: items.reduce((s, r) => s + (r["تكلفة الوقود"] as number), 0),
    },
    items,
  };
}

export async function loadFleetTripsReport(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND t."startTime" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND t."startTime" <= $${params.length}`; }

  const trips = await rawQuery<Record<string, unknown>>(
    `SELECT t.id, v."plateNumber", d.name AS "driverName",
            t."fromLocation", t."toLocation",
            COALESCE(t.distance, 0)::float8 AS distance,
            COALESCE(t.cost, 0)::float8 AS cost,
            t.status, t."startTime", t."endTime"
     FROM fleet_trips t
     LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
     LEFT JOIN fleet_drivers d ON d.id = t."driverId"
     WHERE t."companyId" = $1 AND t."deletedAt" IS NULL ${dateFilter}
     ORDER BY t."startTime" DESC
     LIMIT 1000`,
    params,
  );

  const items = trips.map((t) => ({
    "رقم الرحلة": String(t.id),
    "اللوحة": (t.plateNumber as string | null) ?? "",
    "السائق": (t.driverName as string | null) ?? "",
    "من": (t.fromLocation as string | null) ?? "",
    "إلى": (t.toLocation as string | null) ?? "",
    "المسافة (كم)": Number(t.distance ?? 0),
    "التكلفة": Number(t.cost ?? 0),
    "الحالة": (t.status as string | null) ?? "",
    "وقت الانطلاق": t.startTime ? new Date(t.startTime as string | Date).toLocaleString("ar-SA") : "",
    "وقت الوصول":  t.endTime   ? new Date(t.endTime   as string | Date).toLocaleString("ar-SA") : "",
  }));

  const totalDistance = items.reduce((s, r) => s + (r["المسافة (كم)"] as number), 0);
  const totalCost     = items.reduce((s, r) => s + (r["التكلفة"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "تقرير رحلات الأسطول",
      title: "تقرير رحلات الأسطول",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
      totalDistance, totalCost,
    },
    items,
  };
}
