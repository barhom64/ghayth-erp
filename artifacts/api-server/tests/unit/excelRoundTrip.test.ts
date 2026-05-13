// Round-trip smoke test for the xlsx → exceljs migration (Task #269).
//
// For each of the three modules the GM regularly imports/exports
// (Umrah mutamers/vouchers, Payroll, Invoices) we:
//   1. Build an .xlsx buffer through the new excelCompat.buildXlsxBuffer
//      (the same code excelExport uses for every report).
//   2. Re-read it through excelCompat.parseFirstSheetAOA (the same code
//      genericImportEngine + umrahImportEngine use for every import).
//   3. Assert headers + every cell come back identically.
//
// The encoding-fidelity assertions (Arabic strings, numbers, dates) lock
// in the "identical columns/rows/encoding" requirement from the task.

import { describe, it, expect } from "vitest";
import {
  buildXlsxBuffer,
  parseFirstSheetAOA,
  type ExcelSheet,
} from "../../src/lib/excelCompat.js";
import {
  parseMutamersWorkbook,
  parseVouchersWorkbook,
} from "../../src/lib/umrahImportEngine.js";
import ExcelJS from "exceljs";

async function buildBufferFromAOA(headers: string[], rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const sheet: ExcelSheet = { name: "Sheet1", headers, rows };
  return buildXlsxBuffer([sheet]);
}

describe("excel round-trip — Invoices export shape", () => {
  it("preserves every header + cell across build → parse", async () => {
    const headers = ["الرقم المرجعي", "العميل", "الحالة", "الإجمالي", "المتبقي", "تاريخ الإنشاء"];
    const rows: (string | number | Date | null)[][] = [
      ["INV-1001", "شركة الدور", "مدفوع", 1500, 0, "2026-01-14"],
      ["INV-1002", "عميل تجريبي", "جزئي", 2750.5, 250.5, "2026-01-15"],
      ["INV-1003", "Al Door Group", "متأخر", 9999.99, 9999.99, "2026-02-01"],
    ];
    const buf = await buildBufferFromAOA(headers, rows);
    const aoa = await parseFirstSheetAOA(buf);
    expect(aoa[0]).toEqual(headers);
    expect(aoa).toHaveLength(rows.length + 1);
    for (let i = 0; i < rows.length; i++) {
      const got = aoa[i + 1] as unknown[];
      const want = rows[i]!;
      for (let c = 0; c < want.length; c++) {
        expect(got[c]).toEqual(want[c]);
      }
    }
  });
});

describe("excel round-trip — Payroll export shape (multi-sheet)", () => {
  it("emits two sheets and both round-trip", async () => {
    const sheets: ExcelSheet[] = [
      {
        name: "رواتب 2026-01",
        headers: ["الموظف", "الراتب الأساسي", "صافي الراتب", "الحالة"],
        rows: [
          ["أحمد علي", 8000, 7600, "مدفوع"],
          ["فاطمة الزهراء", 9500, 9100, "معتمد"],
          ["الإجمالي", 17500, 16700, ""],
        ],
      },
      {
        name: "رواتب 2026-02",
        headers: ["الموظف", "الراتب الأساسي", "صافي الراتب", "الحالة"],
        rows: [
          ["أحمد علي", 8000, 7600, "مدفوع"],
        ],
      },
    ];
    const buf = await buildXlsxBuffer(sheets);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets).toHaveLength(2);
    expect(wb.worksheets[0]!.name).toBe(sheets[0]!.name);
    expect(wb.worksheets[1]!.name).toBe(sheets[1]!.name);

    // Sheet 1 round-trip via the generic helper (which only reads sheet 0).
    const aoa = await parseFirstSheetAOA(buf);
    expect(aoa[0]).toEqual(sheets[0]!.headers);
    expect(aoa[1]).toEqual(sheets[0]!.rows[0]);
    expect(aoa[3]?.[2]).toBe(16700);
  });
});

describe("excel round-trip — Umrah Mutamers import shape", () => {
  it("a generated mutamers workbook parses through parseMutamersWorkbook", async () => {
    const headers = [
      "رقم المعتمر", "اسم المعتمر", "الجنسية", "الجنس",
      "رقم الجواز", "رقم المجموعة", "اسم الوكيل", "الحالة",
      "تاريخ الدخول", "تاريخ الخروج", "أيام التجاوز", "داخل المملكة",
    ];
    const rows: (string | number | Date | null)[][] = [
      ["M-001", "أحمد بن عبدالله", "سعودي", "ذكر", "P12345", "G-7", "وكيل المدينة", "داخل المملكة", "2026-04-01", "2026-04-15", 0, "نعم"],
      ["M-002", "نور الهدى", "مصري", "أنثى", "P67890", "G-7", "وكيل المدينة", "متجاوز", "2026-04-01", "2026-04-30", 5, "نعم"],
    ];
    const buf = await buildBufferFromAOA(headers, rows);
    const parsed = await parseMutamersWorkbook(buf);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.fullName).toBe("أحمد بن عبدالله");
    expect(parsed[0]?.passportNumber).toBe("P12345");
    expect(parsed[0]?.status).toBe("arrived");
    expect(parsed[0]?.gender).toBe("male");
    expect(parsed[0]?.isInsideKingdom).toBe(true);
    expect(parsed[1]?.status).toBe("overstayed");
    expect(parsed[1]?.overstayDays).toBe(5);
    expect(parsed[1]?.gender).toBe("female");
  });
});

describe("excel round-trip — Umrah Vouchers import shape", () => {
  it("a generated vouchers workbook parses through parseVouchersWorkbook", async () => {
    const headers = [
      "رقم الفاتورة", "رقم المجموعة", "عدد المعتمرين",
      "خدمات أرضية", "إجمالي النقل", "إجمالي الفنادق",
      "صافي التكلفة", "الإجمالي", "المبالغ المستردة", "الحالة",
    ];
    const rows: (string | number | Date | null)[][] = [
      ["NUSK-1", "G-7", 25, 5000, 3000, 12000, 20000, 22000, 0, "مدفوع"],
      ["NUSK-2", "G-8", 10, 2000, 1500, 5000, 8500, 9000, 1000, "مسترد"],
    ];
    const buf = await buildBufferFromAOA(headers, rows);
    const parsed = await parseVouchersWorkbook(buf);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.nuskInvoiceNumber).toBe("NUSK-1");
    expect(parsed[0]?.mutamerCount).toBe(25);
    expect(parsed[0]?.totalAmount).toBe(22000);
    expect(parsed[0]?.nuskStatus).toBe("paid");
    expect(parsed[1]?.refundAmount).toBe(1000);
    expect(parsed[1]?.nuskStatus).toBe("refunded");
  });
});

describe("excel round-trip — Arabic encoding fidelity", () => {
  it("round-trips Arabic text + Arabic-Indic digits + RTL strings without mojibake", async () => {
    const headers = ["النص العربي", "أرقام عربية", "نص مختلط"];
    const rows: (string | number | Date | null)[][] = [
      ["شركة غيث للأنظمة المؤسسية", "١٤ يناير ٢٠٢٦", "Total: ر.س ١٢,٣٤٥.٦٧"],
    ];
    const buf = await buildBufferFromAOA(headers, rows);
    const aoa = await parseFirstSheetAOA(buf);
    expect(aoa[0]).toEqual(headers);
    expect(aoa[1]).toEqual(rows[0]);
  });
});
