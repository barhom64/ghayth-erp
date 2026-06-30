import { describe, it, expect } from "vitest";
import { extractFields } from "../../src/lib/documentOcrService.js";

/**
 * م٢-ج — استخراج حقول OCR. النواة نقية بلا tesseract: نثبت أن تحويل نص OCR →
 * حقول مهيكلة حتمي وصحيح (مبلغ/تاريخ/رقم فاتورة/ضريبة)، فيراجعه البشر بثقة.
 */

describe("extractFields", () => {
  it("picks the total amount after an Arabic label", () => {
    const { fields } = extractFields("فاتورة\nالإجمالي شامل الضريبة: 1,150.00 ر.س\n");
    expect(fields.amount).toBe(1150);
  });

  it("parses Arabic-Indic digits in the amount", () => {
    const { fields } = extractFields("المبلغ: ٢٬٥٠٠٫٥٠");
    expect(fields.amount).toBe(2500.5);
  });

  it("extracts the VAT amount separately from the total", () => {
    const { fields } = extractFields("المجموع: 1000\nضريبة القيمة المضافة: 150\n");
    expect(fields.amount).toBe(1000);
    expect(fields.vatAmount).toBe(150);
  });

  it("ignores a percentage token and captures the VAT money on the same line", () => {
    // «ضريبة 15%: 150» يجب أن يُعيد 150 (المبلغ) لا 15 (النسبة) — قيمة تُخزَّن للمراجعة.
    expect(extractFields("ضريبة القيمة المضافة 15%: 150.00").fields.vatAmount).toBe(150);
    expect(extractFields("المجموع: 1000\nضريبة ١٥٪: ١٥٠").fields.vatAmount).toBe(150);
  });

  it("parses the amount after the label when a number precedes it on the line", () => {
    // رقم فاتورة قبل «الإجمالي» على نفس السطر يجب ألّا يُلتقط كمبلغ.
    expect(extractFields("INV-77 الإجمالي: 500").fields.amount).toBe(500);
    expect(extractFields("A1234 Total: 500").fields.amount).toBe(500);
  });

  it("normalises YYYY/MM/DD and DD-MM-YYYY dates to ISO", () => {
    expect(extractFields("التاريخ 2026/03/05").fields.date).toBe("2026-03-05");
    expect(extractFields("Date: 05-03-2026").fields.date).toBe("2026-03-05");
  });

  it("captures the invoice number after a label", () => {
    expect(extractFields("رقم الفاتورة: INV-2026-77").fields.invoiceNo).toBe("INV-2026-77");
    expect(extractFields("Invoice No. A1234").fields.invoiceNo).toBe("A1234");
  });

  it("captures a 15-digit ZATCA tax number", () => {
    expect(extractFields("الرقم الضريبي 300012345600003").fields.taxNumber).toBe("300012345600003");
  });

  it("is deterministic — same text yields identical fields", () => {
    const t = "فاتورة\nالإجمالي: 500\nالتاريخ 2026-01-01\nرقم الفاتورة: X9\n";
    expect(extractFields(t)).toEqual(extractFields(t));
  });

  it("for an identity docType, extracts a 10-digit ID/iqama number + expiry (not invoice fields)", () => {
    const r = extractFields("هوية وطنية\nرقم الهوية: 1012345678\nتاريخ الانتهاء 2030/05/01", "iqama");
    expect(r.fields.idNumber).toBe("1012345678");
    expect(r.fields.expiryDate).toBe("2030-05-01");
    expect(r.fields.amount).toBeUndefined();
  });

  it("identity: captures a resident iqama number (starts with 2) and labelled expiry", () => {
    const r = extractFields("إقامة\nرقم الإقامة 2087654321\nانتهاء الصلاحية 2028-12-31", "iqama");
    expect(r.fields.idNumber).toBe("2087654321");
    expect(r.fields.expiryDate).toBe("2028-12-31");
    expect(r.fieldConfidence).toBe(100);
  });

  it("for a vehicle_registration docType, extracts VIN (17) + plate + registration expiry", () => {
    const r = extractFields(
      "استمارة مركبة\nرقم الهيكل: 1HGCM82633A004352\nرقم اللوحة: ABC 1234\nانتهاء الاستمارة 2027-09-30",
      "vehicle_registration",
    );
    expect(r.fields.vinNumber).toBe("1HGCM82633A004352");
    expect(r.fields.plateNumber).toBe("ABC 1234");
    expect(r.fields.registrationExpiry).toBe("2027-09-30");
    expect(r.fields.amount).toBeUndefined();
  });

  it("for a driving_license docType, extracts the license number + class + expiry", () => {
    const r = extractFields("رخصة قيادة\nرقم الرخصة: 1098765432\nالفئة: 3\nتاريخ الانتهاء 2029-04-15", "driving_license");
    expect(r.fields.licenseNumber).toBe("1098765432");
    expect(r.fields.licenseClass).toBe("3");
    expect(r.fields.expiryDate).toBe("2029-04-15");
    expect(r.fields.amount).toBeUndefined();
  });

  it("for commercial_registration, extracts a 10-digit CR number (not the vehicle branch)", () => {
    const r = extractFields("سجل تجاري\nرقم السجل: 1010234567\nجهة الإصدار: وزارة التجارة", "commercial_registration");
    expect(r.fields.crNumber).toBe("1010234567");
    expect(r.fields.issuingAuthority).toContain("وزارة التجارة");
    expect(r.fields.plateNumber).toBeUndefined(); // ليست فرع المركبة رغم "registration"
  });

  it("scores confidence by captured critical fields (amount+date highest)", () => {
    const full = extractFields("الإجمالي: 500\nالتاريخ 2026-01-01\nرقم الفاتورة: X9\nضريبة: 75\nالرقم الضريبي 300012345600003");
    expect(full.fieldConfidence).toBe(100);
    const none = extractFields("نص لا يحوي أي حقل مالي");
    expect(none.fieldConfidence).toBe(0);
    expect(none.fields.amount).toBeNull();
  });
});
