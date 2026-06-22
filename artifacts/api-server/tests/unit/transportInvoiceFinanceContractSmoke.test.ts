/**
 * حدّ معماري (#2837) — النقل لا يُصدر فاتورة بكتابة مباشرة لجداول المالية.
 *
 * مسار النقل (transport-pricing) كان يكتب invoices و invoice_lines (مملوكة
 * المالية) مباشرةً عند إصدار دفعة فوترة نقل — كتابة عابرة لحدود المسار (مواد 4–9).
 *
 * الإصلاح: نقل الكتابتين إلى عقد المالية createServiceInvoiceWithLines تستدعيه
 * النقل عبر import ديناميكي ضمن نفس المعاملة (rawExecute ينضمّ لـtxStore) — سلوكيًا
 * مطابق (نفس الأعمدة والقيم؛ الفاتورة تنشأ مسوّدة status='draft' بلا قيد محاسبي،
 * والقيد يُرحّل لاحقًا عبر اعتماد المالية القياسي). النقل يحتفظ بالترقيم/التسعير/
 * مراكز التكلفة وجداوله الخادمة (transport_service_lines / transport_invoice_links).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const TRANSPORT = read("artifacts/api-server/src/routes/transport-pricing.ts");
const FINANCE = read("artifacts/api-server/src/routes/finance-invoices.ts");

describe("#2837 — إصدار فاتورة النقل عبر عقد المالية", () => {
  it("transport-pricing لا يكتب invoices/invoice_lines مباشرة", () => {
    expect(TRANSPORT).not.toMatch(/INSERT\s+INTO\s+invoices\b/i);
    expect(TRANSPORT).not.toMatch(/INSERT\s+INTO\s+invoice_lines\b/i);
  });

  it("transport-pricing يستدعي عقد المالية", () => {
    expect(TRANSPORT).toMatch(/createServiceInvoiceWithLines/);
    expect(TRANSPORT).toMatch(/await import\("\.\/finance-invoices\.js"\)/);
  });

  it("عقد المالية موجود ويملك كتابة invoices و invoice_lines", () => {
    expect(FINANCE).toMatch(/export async function createServiceInvoiceWithLines/);
    expect(FINANCE).toMatch(/INSERT INTO invoices \("companyId","branchId","clientId",ref,description/);
    expect(FINANCE).toMatch(/INSERT INTO invoice_lines \(/);
  });

  it("العقد يُرسّخ ثوابت الفاتورة المسوّدة المملوكة للمالية (draft، paidAmount=0)", () => {
    // status='draft' وpaidAmount=0 مُرسّخان حرفيًا في العقد — لا يقرّرهما المستدعي.
    expect(FINANCE).toMatch(/VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,0,'draft'/);
  });

  it("النقل يحتفظ بجداوله الخادمة (لا تُنقل للمالية)", () => {
    expect(TRANSPORT).toMatch(/UPDATE transport_service_lines/);
    expect(TRANSPORT).toMatch(/INSERT INTO transport_invoice_links/);
  });
});
