import * as XLSX from "xlsx";
import { rawQuery } from "./rawdb.js";

interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  colWidths?: number[];
}

function buildWorkbook(sheets: ExcelSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddr]) continue;
      ws[cellAddr].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E2E8F0" } },
        alignment: { horizontal: "center" },
      };
    }

    if (sheet.colWidths) {
      ws["!cols"] = sheet.colWidths.map((w) => ({ wch: w }));
    } else {
      const widths = sheet.headers.map((h) => Math.max(h.length + 4, 12));
      ws["!cols"] = widths.map((w) => ({ wch: w }));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function exportTrialBalanceExcel(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT coa.code, coa.name, coa.type,
            COALESCE(SUM(jl.debit), 0) AS "totalDebit",
            COALESCE(SUM(jl.credit), 0) AS "totalCredit",
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code
     LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
     WHERE coa."companyId" = $1
     GROUP BY coa.code, coa.name, coa.type ORDER BY coa.code`,
    params
  );

  const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };

  const sheet: ExcelSheet = {
    name: "ميزان المراجعة",
    headers: ["الرمز", "اسم الحساب", "نوع الحساب", "المدين", "الدائن", "الرصيد"],
    rows: rows.map((r) => [r.code as string, r.name as string, typeMap[r.type as string] || (r.type as string), Number(r.totalDebit), Number(r.totalCredit), Number(r.balance)]),
    colWidths: [12, 35, 16, 15, 15, 15],
  };

  const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.totalDebit), 0);
  const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.totalCredit), 0);
  sheet.rows.push(["", "المجموع", "", totalDebit, totalCredit, totalDebit - totalCredit]);

  const wb = buildWorkbook([sheet]);
  return workbookToBuffer(wb);
}

export async function exportIncomeStatementExcel(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

  const revenues = await rawQuery<Record<string, unknown>>(`SELECT coa.code, coa.name, COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter} WHERE coa."companyId" = $1 AND coa.type = 'revenue' GROUP BY coa.code, coa.name ORDER BY coa.code`, params);
  const expenses = await rawQuery<Record<string, unknown>>(`SELECT coa.code, coa.name, COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount FROM chart_of_accounts coa LEFT JOIN journal_lines jl ON jl."accountCode" = coa.code LEFT JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter} WHERE coa."companyId" = $1 AND coa.type = 'expense' GROUP BY coa.code, coa.name ORDER BY coa.code`, params);

  const totalRevenue = revenues.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalExpenses = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);

  const revenueSheet: ExcelSheet = {
    name: "الإيرادات",
    headers: ["الرمز", "اسم الحساب", "المبلغ"],
    rows: [
      ...revenues.map((r) => [r.code as string, r.name as string, Number(r.amount)]),
      ["", "إجمالي الإيرادات", totalRevenue],
    ],
    colWidths: [12, 40, 18],
  };

  const expenseSheet: ExcelSheet = {
    name: "المصروفات",
    headers: ["الرمز", "اسم الحساب", "المبلغ"],
    rows: [
      ...expenses.map((r) => [r.code as string, r.name as string, Number(r.amount)]),
      ["", "إجمالي المصروفات", totalExpenses],
      ["", "صافي الدخل", totalRevenue - totalExpenses],
    ],
    colWidths: [12, 40, 18],
  };

  const wb = buildWorkbook([revenueSheet, expenseSheet]);
  return workbookToBuffer(wb);
}

export async function exportInvoicesExcel(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND i."createdAt" >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND i."createdAt" <= $${params.length}`; }

  const invoices = await rawQuery<Record<string, unknown>>(
    `SELECT i.ref, c.name AS "clientName", i.status, i.subtotal, i."vatAmount", i.total, i."paidAmount",
            i.total - i."paidAmount" AS remaining, i."createdAt", i."dueDate"
     FROM invoices i
     LEFT JOIN clients c ON c.id = i."clientId"
     WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${dateFilter}
     ORDER BY i."createdAt" DESC`,
    params
  );

  const statusMap: Record<string, string> = { draft: "مسودة", pending: "قيد الانتظار", approved: "معتمد", paid: "مدفوع", partial: "جزئي", overdue: "متأخر", cancelled: "ملغي" };

  const sheet: ExcelSheet = {
    name: "الفواتير",
    headers: ["الرقم المرجعي", "العميل", "الحالة", "قبل الضريبة", "الضريبة", "الإجمالي", "المدفوع", "المتبقي", "تاريخ الإنشاء", "تاريخ الاستحقاق"],
    rows: invoices.map((i) => [
      i.ref as string, i.clientName as string, statusMap[i.status as string] || (i.status as string),
      Number(i.subtotal || 0), Number(i.vatAmount || 0), Number(i.total || 0),
      Number(i.paidAmount || 0), Number(i.remaining || 0),
      i.createdAt ? new Date(i.createdAt as string | Date).toLocaleDateString("ar-SA") : "",
      i.dueDate ? new Date(i.dueDate as string | Date).toLocaleDateString("ar-SA") : "",
    ]),
    colWidths: [14, 30, 12, 14, 12, 14, 14, 14, 16, 16],
  };

  const wb = buildWorkbook([sheet]);
  return workbookToBuffer(wb);
}

export async function exportPayrollExcel(companyId: number, period?: string): Promise<Buffer> {
  let filter = "";
  const params: unknown[] = [companyId];
  if (period) { params.push(period); filter = ` AND pr.period = $${params.length}`; }

  const records = await rawQuery<Record<string, unknown>>(
    `SELECT pr.period, e.name AS "employeeName", ea."jobTitle" AS position, ea.salary AS "baseSalary",
            pr."grossSalary", pr."totalDeductions", pr."netSalary",
            pr.status, pr."createdAt" AS "paidAt"
     FROM payroll_records pr
     JOIN employee_assignments ea ON ea.id = pr."employeeAssignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE pr."companyId" = $1 ${filter}
     ORDER BY pr.period DESC, e.name`,
    params
  );

  const periods = [...new Set(records.map((r) => r.period as string))];
  const sheets: ExcelSheet[] = [];

  for (const p of periods.slice(0, 12)) {
    const periodRows = records.filter((r) => r.period === p);
    const totalGross = periodRows.reduce((s: number, r: any) => s + Number(r.grossSalary || 0), 0);
    const totalNet = periodRows.reduce((s: number, r: any) => s + Number(r.netSalary || 0), 0);

    sheets.push({
      name: `رواتب ${p}`,
      headers: ["الموظف", "المسمى الوظيفي", "الراتب الأساسي", "بدل سكن", "بدل نقل", "أوفرتايم", "الراتب الإجمالي", "الاستقطاعات", "صافي الراتب", "الحالة"],
      rows: [
        ...periodRows.map((r) => [
          r.employeeName as string, (r.position as string | null) || "",
          Number(r.baseSalary || 0), Number(r.housingAllowance || 0), Number(r.transportAllowance || 0),
          Number(r.overtime || 0), Number(r.grossSalary || 0),
          Number(r.totalDeductions || 0), Number(r.netSalary || 0),
          r.status === "paid" ? "مدفوع" : r.status === "approved" ? "معتمد" : "قيد المعالجة",
        ]),
        ["الإجمالي", "", "", "", "", "", totalGross, "", totalNet, ""],
      ],
      colWidths: [25, 20, 14, 12, 12, 12, 14, 12, 14, 10],
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      name: "الرواتب",
      headers: ["لا توجد بيانات"],
      rows: [],
    });
  }

  const wb = buildWorkbook(sheets);
  return workbookToBuffer(wb);
}

export async function exportAttendanceExcel(companyId: number, startDate?: string, endDate?: string): Promise<Buffer> {
  let dateFilter = "";
  const params: unknown[] = [companyId];
  if (startDate) { params.push(startDate); dateFilter += ` AND a.date >= $${params.length}`; }
  if (endDate) { params.push(endDate); dateFilter += ` AND a.date <= $${params.length}`; }

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
    params
  );

  const statusMap: Record<string, string> = {
    present: "حاضر", absent: "غائب", late: "متأخر", leave: "إجازة",
    on_leave: "في إجازة", remote: "عن بعد", half_day: "نصف يوم",
  };

  const sheet: ExcelSheet = {
    name: "سجل الحضور",
    headers: ["الموظف", "المسمى الوظيفي", "التاريخ", "الحالة", "وقت الحضور", "وقت الانصراف", "ساعات العمل", "ملاحظات"],
    rows: records.map((r) => [
      r.employeeName as string, (r.position as string | null) || "",
      r.date ? new Date(r.date as string | Date).toLocaleDateString("ar-SA") : "",
      statusMap[r.status as string] || (r.status as string),
      (r.checkIn as string | null) || "", (r.checkOut as string | null) || "",
      r.workHours ? Number(r.workHours).toFixed(1) : "",
      (r.notes as string | null) || "",
    ]),
    colWidths: [25, 20, 14, 12, 12, 12, 12, 30],
  };

  const wb = buildWorkbook([sheet]);
  return workbookToBuffer(wb);
}

export async function exportFleetExcel(companyId: number): Promise<Buffer> {
  const vehicles = await rawQuery<Record<string, unknown>>(
    `SELECT v."plateNumber", v.make, v.model, v.year, v.status,
            fd.name AS "driverName",
            v."nextServiceDate", v."currentMileage", v.color,
            COUNT(DISTINCT t.id) AS "totalTrips",
            SUM(fl.amount) AS "totalFuelCost",
            COUNT(DISTINCT m.id) AS "maintenanceCount"
     FROM fleet_vehicles v
     LEFT JOIN fleet_drivers fd ON fd.id = v."assignedDriverId"
     LEFT JOIN fleet_trips t ON t."vehicleId" = v.id AND t."deletedAt" IS NULL
     LEFT JOIN fleet_fuel_logs fl ON fl."vehicleId" = v.id
     LEFT JOIN fleet_maintenance m ON m."vehicleId" = v.id
     WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
     GROUP BY v.id, fd.name ORDER BY v."plateNumber"`,
    [companyId]
  );

  const statusMap: Record<string, string> = {
    active: "نشط", inactive: "غير نشط", needs_service: "يحتاج صيانة", under_maintenance: "في الصيانة",
  };

  const vehicleSheet: ExcelSheet = {
    name: "المركبات",
    headers: ["رقم اللوحة", "الماركة", "الموديل", "السنة", "الحالة", "السائق", "الكيلومتر", "الرحلات", "تكلفة الوقود", "طلبات الصيانة", "موعد الصيانة القادم"],
    rows: vehicles.map((v) => [
      v.plateNumber as string, v.make as string, v.model as string, v.year as number,
      statusMap[v.status as string] || (v.status as string),
      (v.driverName as string | null) || "", Number(v.currentMileage || 0),
      Number(v.totalTrips || 0), Number(v.totalFuelCost || 0),
      Number(v.maintenanceCount || 0),
      v.nextServiceDate ? new Date(v.nextServiceDate as string | Date).toLocaleDateString("ar-SA") : "",
    ]),
    colWidths: [14, 12, 12, 8, 14, 20, 12, 10, 14, 12, 18],
  };

  const trips = await rawQuery<Record<string, unknown>>(
    `SELECT v."plateNumber", d.name AS "driverName", t."fromLocation", t."toLocation",
            t."startTime", t."endTime", t.distance, t.status
     FROM fleet_trips t
     JOIN fleet_vehicles v ON v.id = t."vehicleId"
     LEFT JOIN fleet_drivers d ON d.id = t."driverId"
     WHERE t."companyId" = $1 AND t."deletedAt" IS NULL
     ORDER BY t."startTime" DESC
     LIMIT 500`,
    [companyId]
  );

  const tripSheet: ExcelSheet = {
    name: "الرحلات",
    headers: ["اللوحة", "السائق", "من", "إلى", "وقت الانطلاق", "وقت الوصول", "المسافة (كم)", "الحالة"],
    rows: trips.map((t) => [
      t.plateNumber as string, (t.driverName as string | null) || "", (t.fromLocation as string | null) || "", (t.toLocation as string | null) || "",
      t.startTime ? new Date(t.startTime as string | Date).toLocaleString("ar-SA") : "",
      t.endTime ? new Date(t.endTime as string | Date).toLocaleString("ar-SA") : "",
      Number(t.distance || 0), (t.status as string | null) || "",
    ]),
    colWidths: [12, 20, 20, 20, 18, 18, 12, 12],
  };

  const wb = buildWorkbook([vehicleSheet, tripSheet]);
  return workbookToBuffer(wb);
}
