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

// ─── Balance sheet — مَيزانية عمومية حسب نوع الحساب لحظة معينة ─────────
export async function loadBalanceSheet(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const asOf = endDate ?? startDate ?? null;
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (asOf) { params.push(asOf); dateFilter = ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, coa.type,
            (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::float8 AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1 AND coa.type IN ('asset', 'liability', 'equity')
     GROUP BY coa.code, coa.name, coa.type
     HAVING (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) <> 0
     ORDER BY coa.type, coa.code`,
    params,
  );

  const items = rows.map((r) => ({
    "الفئة": TYPE_ACCOUNT[r.type as string] ?? (r.type as string),
    "الرمز": r.code as string,
    "اسم الحساب": r.name as string,
    "الرصيد": Number(r.balance ?? 0),
  }));

  const totalAssets      = rows.filter((r) => r.type === "asset").reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const totalLiabilities = -rows.filter((r) => r.type === "liability").reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const totalEquity      = -rows.filter((r) => r.type === "equity").reduce((s, r) => s + Number(r.balance ?? 0), 0);

  return {
    entity: {
      id: entityId,
      ref: "الميزانية العمومية",
      title: "الميزانية العمومية",
      date: new Date().toLocaleDateString("ar-SA"),
      asOfDate: asOf ?? "اليوم",
      totalAssets, totalLiabilities, totalEquity,
      status: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 ? "متوازن" : "غير متوازن",
    },
    items,
  };
}

// ─── Cash flow — حركة النقدية حسب نشاط من جداول journal_lines ───────────
export async function loadCashFlow(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.type AS "activity", coa.name AS "accountName",
            COALESCE(SUM(jl.debit), 0)::float8  AS "inflow",
            COALESCE(SUM(jl.credit), 0)::float8 AS "outflow"
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl."journalId"
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
     WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
       AND coa.type = 'asset' AND coa.code LIKE '1%'
       ${dateFilter}
     GROUP BY je.type, coa.name
     ORDER BY je.type, coa.name`,
    params,
  );

  const items = rows.map((r) => ({
    "النشاط": (r.activity as string | null) ?? "غير محدد",
    "الحساب": (r.accountName as string | null) ?? "",
    "وارد": Number(r.inflow ?? 0),
    "صادر": Number(r.outflow ?? 0),
    "صافي": Number(r.inflow ?? 0) - Number(r.outflow ?? 0),
  }));

  const totalInflow  = items.reduce((s, r) => s + (r["وارد"] as number), 0);
  const totalOutflow = items.reduce((s, r) => s + (r["صادر"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "قائمة التدفقات النقدية",
      title: "قائمة التدفقات النقدية",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      totalInflow, totalOutflow, netCashFlow: totalInflow - totalOutflow,
    },
    items,
  };
}

// ─── Cash & bank statement — كل حركات حسابات النقدية والبنك ───────────
export async function loadCashBankStatement(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.ref, je."createdAt", coa.code, coa.name AS "accountName",
            jl.description, jl.debit::float8 AS debit, jl.credit::float8 AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl."journalId"
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa."companyId" = $1
     WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
       AND coa.type = 'asset' AND coa.code LIKE '1%'
       ${dateFilter}
     ORDER BY je."createdAt" DESC
     LIMIT 1000`,
    params,
  );

  const items = rows.map((r) => ({
    "المرجع": (r.ref as string | null) ?? "",
    "التاريخ": r.createdAt ? new Date(r.createdAt as string | Date).toLocaleDateString("ar-SA") : "",
    "رمز الحساب": (r.code as string | null) ?? "",
    "اسم الحساب": (r.accountName as string | null) ?? "",
    "الوصف": (r.description as string | null) ?? "",
    "مدين": Number(r.debit ?? 0),
    "دائن": Number(r.credit ?? 0),
  }));

  const totalDebit  = items.reduce((s, r) => s + (r["مدين"] as number), 0);
  const totalCredit = items.reduce((s, r) => s + (r["دائن"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "كشف الصندوق والبنك",
      title: "كشف الصندوق والبنك",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
      totalDebit, totalCredit, netMovement: totalDebit - totalCredit,
    },
    items,
  };
}

// ─── Budget variance — موازنة vs فعلي حسب الحساب ───────────────────────
export async function loadBudgetVariance(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT b."accountCode", coa.name AS "accountName",
            COALESCE(b.amount, 0)::float8 AS "budgeted",
            COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::float8 AS "actual"
     FROM budget_lines b
     JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = $1
     LEFT JOIN journal_lines jl ON jl."accountCode" = b."accountCode"
     LEFT JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE b."companyId" = $1
     GROUP BY b."accountCode", coa.name, b.amount
     ORDER BY b."accountCode"`,
    params,
  ).catch(() => []);

  const items = rows.map((r) => {
    const budgeted = Number(r.budgeted ?? 0);
    const actual = Number(r.actual ?? 0);
    return {
      "رمز الحساب": r.accountCode as string,
      "اسم الحساب": (r.accountName as string | null) ?? "",
      "الميزانية": budgeted,
      "الفعلي": actual,
      "الفرق": budgeted - actual,
      "النسبة %": budgeted !== 0 ? Number(((actual / budgeted) * 100).toFixed(1)) : 0,
    };
  });

  const totalBudget = items.reduce((s, r) => s + (r["الميزانية"] as number), 0);
  const totalActual = items.reduce((s, r) => s + (r["الفعلي"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "انحراف الميزانية",
      title: "تقرير انحراف الميزانية",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      totalBudget, totalActual, variance: totalBudget - totalActual,
    },
    items,
  };
}

// ─── General ledger — كل حركات حساب واحد خلال فترة ──────────────────────
// entityId format: "ACCOUNT_CODE:START..END" — e.g., "1100:2026-01-01..2026-03-31"
export async function loadGeneralLedger(companyId: number, entityId: string) {
  const colonAt = entityId.indexOf(":");
  const code = colonAt >= 0 ? entityId.slice(0, colonAt) : entityId;
  const range = colonAt >= 0 ? entityId.slice(colonAt + 1) : "";
  const { startDate, endDate } = parseEntityId(range);

  const params: unknown[] = [companyId, code];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const [account] = await rawQuery<Record<string, unknown>>(
    `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 LIMIT 1`,
    [companyId, code],
  );

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.ref, je."createdAt", jl.description,
            jl.debit::float8 AS debit, jl.credit::float8 AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl."journalId"
     WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
       AND jl."accountCode" = $2
       ${dateFilter}
     ORDER BY je."createdAt" ASC, je.id ASC
     LIMIT 5000`,
    params,
  );

  let running = 0;
  const items = rows.map((r) => {
    const d = Number(r.debit ?? 0), c = Number(r.credit ?? 0);
    running += d - c;
    return {
      "التاريخ": r.createdAt ? new Date(r.createdAt as string | Date).toLocaleDateString("ar-SA") : "",
      "المرجع": (r.ref as string | null) ?? "",
      "البيان": (r.description as string | null) ?? "",
      "مدين": d,
      "دائن": c,
      "الرصيد التراكمي": running,
    };
  });

  const totalDebit  = items.reduce((s, r) => s + (r["مدين"] as number), 0);
  const totalCredit = items.reduce((s, r) => s + (r["دائن"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: `دفتر أستاذ — ${account?.name ?? code}`,
      title: `دفتر أستاذ — ${account?.name ?? code}`,
      accountCode: code,
      accountName: (account?.name as string | null) ?? code,
      accountType: TYPE_ACCOUNT[account?.type as string] ?? "",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      totalDebit, totalCredit, finalBalance: running,
    },
    items,
  };
}

// ─── WHT summary — ضريبة الاستقطاع المحجوزة على المورّدين ────────────────
export async function loadWhtSummary(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."postingDate" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."postingDate" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.ref AS "journalRef", je."postingDate",
            spa."whtCategory", cat.name AS "categoryName",
            sup.name AS "supplierName", sup."taxNumber",
            spa.amount::float8 AS amount, spa."whtAmount"::float8 AS "whtAmount",
            spa."whtRate"::float8 AS "whtRate"
     FROM supplier_payment_allocations spa
     JOIN journal_entries je
       ON je.id = spa."journalEntryId" AND je."deletedAt" IS NULL
       AND je."balancesApplied" = true AND je."reversedById" IS NULL
     LEFT JOIN purchase_orders po
       ON po.id = spa."obligationId" AND spa."obligationType" = 'purchase_order'
       AND po."deletedAt" IS NULL
     LEFT JOIN suppliers sup ON sup.id = po."supplierId" AND sup."deletedAt" IS NULL
     LEFT JOIN wht_categories cat
       ON cat."companyId" = spa."companyId" AND cat.code = spa."whtCategory"
       AND cat."deletedAt" IS NULL
     WHERE spa."companyId" = $1 AND spa."deletedAt" IS NULL
       AND COALESCE(spa."whtAmount", 0) > 0
       ${dateFilter}
     ORDER BY je."postingDate" DESC
     LIMIT 5000`,
    params,
  ).catch(() => []);

  const items = rows.map((r) => ({
    "تاريخ القيد": r.postingDate ? new Date(r.postingDate as string | Date).toLocaleDateString("ar-SA") : "",
    "مرجع القيد": (r.journalRef as string | null) ?? "",
    "المورّد": (r.supplierName as string | null) ?? "",
    "الرقم الضريبي": (r.taxNumber as string | null) ?? "",
    "الفئة": (r.categoryName as string | null) ?? (r.whtCategory as string | null) ?? "",
    "المبلغ الإجمالي": Number(r.amount ?? 0),
    "نسبة الاستقطاع %": Number(r.whtRate ?? 0),
    "مبلغ الاستقطاع": Number(r.whtAmount ?? 0),
  }));

  const totalGross = items.reduce((s, r) => s + (r["المبلغ الإجمالي"] as number), 0);
  const totalWht   = items.reduce((s, r) => s + (r["مبلغ الاستقطاع"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "ملخص ضريبة الاستقطاع",
      title: "ملخص ضريبة الاستقطاع (WHT)",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
      totalGross, totalWht, totalNet: totalGross - totalWht,
    },
    items,
  };
}

// ─── Chart of accounts — دليل الحسابات الكامل ─────────────────────────────
export async function loadChartOfAccounts(companyId: number, _entityId: string) {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT code, name, type, "parentCode", "isActive"
     FROM chart_of_accounts
     WHERE "companyId" = $1 AND "deletedAt" IS NULL
     ORDER BY code`,
    [companyId],
  );

  const items = rows.map((r) => ({
    "الرمز": r.code as string,
    "اسم الحساب": r.name as string,
    "النوع": TYPE_ACCOUNT[r.type as string] ?? (r.type as string),
    "الحساب الأب": (r.parentCode as string | null) ?? "",
    "الحالة": r.isActive ? "نشط" : "موقوف",
  }));

  return {
    entity: {
      id: "all",
      ref: "دليل الحسابات",
      title: "دليل الحسابات",
      date: new Date().toLocaleDateString("ar-SA"),
      count: items.length,
    },
    items,
  };
}

// ─── Custody + advances — العهد والسلف الموظَّفة من قيود اليومية ─────────
export async function loadCustodyAdvances(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.ref, je.description, je."createdAt", je.status,
            COALESCE(SUM(jl.debit), 0)::float8 AS amount,
            CASE WHEN jl."accountCode" = '1400' THEN 'عهدة' ELSE 'سُلفة' END AS "type",
            e.name AS "employeeName"
     FROM journal_entries je
     JOIN journal_lines jl ON jl."journalId" = je.id
       AND jl."accountCode" IN ('1400', '1410')
     LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
     LEFT JOIN employees e ON e.id = ea."employeeId"
     WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
       AND (je.ref LIKE 'CUSTODY%' OR je.ref LIKE 'ADV%')
       ${dateFilter}
     GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, jl."accountCode", e.name
     ORDER BY je."createdAt" DESC
     LIMIT 1000`,
    params,
  ).catch(() => []);

  const items = rows.map((r) => ({
    "المرجع": (r.ref as string | null) ?? "",
    "النوع": (r.type as string | null) ?? "",
    "الموظف": (r.employeeName as string | null) ?? "—",
    "البيان": (r.description as string | null) ?? "",
    "التاريخ": r.createdAt ? new Date(r.createdAt as string | Date).toLocaleDateString("ar-SA") : "",
    "الحالة": (r.status as string | null) ?? "",
    "المبلغ": Number(r.amount ?? 0),
  }));

  const totalCustodies = items.filter((r) => r["النوع"] === "عهدة").reduce((s, r) => s + (r["المبلغ"] as number), 0);
  const totalAdvances  = items.filter((r) => r["النوع"] === "سُلفة").reduce((s, r) => s + (r["المبلغ"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "العهد والسلف",
      title: "تقرير العهد والسلف",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length,
      totalCustodies, totalAdvances, grandTotal: totalCustodies + totalAdvances,
    },
    items,
  };
}

// ─── Expenses analysis — تحليل المصروفات حسب الحساب ─────────────────────
export async function loadExpensesAnalysis(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::float8 AS amount,
            COUNT(DISTINCT je.id) AS "entryCount"
     FROM journal_lines jl
     JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1
      AND je."deletedAt" IS NULL AND je."balancesApplied" = true
      AND je."reversedById" IS NULL ${dateFilter}
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense'
     WHERE jl.debit > jl.credit AND jl."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     ORDER BY amount DESC
     LIMIT 500`,
    params,
  );

  const items = rows.map((r) => ({
    "رمز الحساب": r.code as string,
    "اسم الحساب": r.name as string,
    "عدد القيود": Number(r.entryCount ?? 0),
    "إجمالي المصروف": Number(r.amount ?? 0),
  }));

  const total = items.reduce((s, r) => s + (r["إجمالي المصروف"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "تحليل المصروفات",
      title: "تحليل المصروفات حسب الحساب",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length, total,
    },
    items,
  };
}

// ─── Revenue analysis — تحليل الإيرادات حسب الحساب ──────────────────────
export async function loadRevenueAnalysis(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name,
            COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::float8 AS amount,
            COUNT(DISTINCT je.id) AS "entryCount"
     FROM journal_lines jl
     JOIN journal_entries je
       ON je.id = jl."journalId" AND je."companyId" = $1
      AND je."deletedAt" IS NULL AND je."balancesApplied" = true
      AND je."reversedById" IS NULL ${dateFilter}
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue'
     WHERE jl.credit > jl.debit AND jl."deletedAt" IS NULL
     GROUP BY coa.code, coa.name
     ORDER BY amount DESC
     LIMIT 500`,
    params,
  );

  const items = rows.map((r) => ({
    "رمز الحساب": r.code as string,
    "اسم الحساب": r.name as string,
    "عدد القيود": Number(r.entryCount ?? 0),
    "إجمالي الإيراد": Number(r.amount ?? 0),
  }));

  const total = items.reduce((s, r) => s + (r["إجمالي الإيراد"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "تحليل الإيرادات",
      title: "تحليل الإيرادات حسب الحساب",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length, total,
    },
    items,
  };
}

// ─── Revenue by activity — الإيرادات حسب نوع النشاط ─────────────────────
export async function loadRevenueByActivity(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(jl."activityType", '— غير محدد —') AS "activityType",
            COALESCE(SUM(jl.credit - jl.debit), 0)::float8 AS revenue,
            COUNT(DISTINCT je.id) AS "entryCount"
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl."journalId"
      AND je."companyId" = $1 AND je."deletedAt" IS NULL
      AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode"
      AND coa.type = 'revenue' AND coa."companyId" = $1
     WHERE jl."deletedAt" IS NULL
     GROUP BY jl."activityType"
     ORDER BY revenue DESC`,
    params,
  ).catch(() => []);

  const items = rows.map((r) => ({
    "النشاط": (r.activityType as string | null) ?? "— غير محدد —",
    "عدد القيود": Number(r.entryCount ?? 0),
    "إجمالي الإيراد": Number(r.revenue ?? 0),
  }));

  const total = items.reduce((s, r) => s + (r["إجمالي الإيراد"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "الإيرادات حسب النشاط",
      title: "الإيرادات حسب نوع النشاط",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length, total,
    },
    items,
  };
}

// ─── Expenses by cost center — المصروفات حسب مركز التكلفة ─────────────
export async function loadExpensesByCostCenter(companyId: number, entityId: string) {
  const { startDate, endDate } = parseEntityId(entityId);
  const params: unknown[] = [companyId];
  let dateFilter = "";
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate)   { params.push(endDate);   dateFilter += ` AND je."createdAt" < ($${params.length}::date + 1)`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT cc.code AS "costCenterCode", cc.name AS "costCenterName", cc.type AS "costCenterType",
            COALESCE(SUM(jl.debit - jl.credit), 0)::float8 AS expense,
            COUNT(DISTINCT je.id) AS "entryCount"
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl."journalId"
      AND je."companyId" = $1 AND je."deletedAt" IS NULL
      AND je."balancesApplied" = true AND je."reversedById" IS NULL ${dateFilter}
     JOIN chart_of_accounts coa ON coa.code = jl."accountCode"
      AND coa.type = 'expense' AND coa."companyId" = $1
     LEFT JOIN cost_centers cc ON cc.id = jl."costCenterId" AND cc."companyId" = $1
     WHERE jl."deletedAt" IS NULL
     GROUP BY jl."costCenterId", cc.code, cc.name, cc.type
     ORDER BY expense DESC`,
    params,
  ).catch(() => []);

  const items = rows.map((r) => ({
    "رمز المركز": (r.costCenterCode as string | null) ?? "—",
    "اسم المركز": (r.costCenterName as string | null) ?? "— غير محدد —",
    "نوع المركز": (r.costCenterType as string | null) ?? "",
    "عدد القيود": Number(r.entryCount ?? 0),
    "إجمالي المصروف": Number(r.expense ?? 0),
  }));

  const total = items.reduce((s, r) => s + (r["إجمالي المصروف"] as number), 0);

  return {
    entity: {
      id: entityId,
      ref: "المصروفات حسب مركز التكلفة",
      title: "المصروفات حسب مركز التكلفة",
      date: new Date().toLocaleDateString("ar-SA"),
      period: startDate || endDate ? `${startDate ?? "البداية"} → ${endDate ?? "اليوم"}` : "كل الفترات",
      count: items.length, total,
    },
    items,
  };
}
