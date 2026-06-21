// recurringInvoiceProcessor.ts — توليد الفواتير من القوالب المتكررة.
//
// يمسّ الدفتر — لكن **لا منطق قيد جديد**: يُعيد استخدام financialEngine.postSalesInvoice
// الذي يملك الترقيم + الضريبة + الحسابات + بوابة الفترة + القيد المتوازن + idempotency.
// المولّد مسؤول فقط عن: بناء الطلب من القالب + إدراج صفّ الفاتورة + تقديم الجدول.
//
// idempotency: sourceKey يتضمّن nextRunDate، فإعادة تشغيل نفس الاستحقاق تُعيد
// الفاتورة نفسها ولا تُكرّر القيد (عقد postSalesInvoice).
import { rawQuery, rawExecute } from "./rawdb.js";
import { computeNextRunDate } from "./recurringJournalProcessor.js";
import { todayISO } from "./businessHelpers.js";
import { logger } from "./logger.js";
import type { InsertSalesInvoiceFn, SalesInvoiceLineInput } from "./engines/financialEngine.js";

interface RecurringInvoiceTemplateRow {
  id: number;
  companyId: number;
  branchId: number | null;
  clientId: number;
  title: string;
  lines: Array<{ description: string; quantity: number; unitPriceExclTax: number; isTaxable?: boolean; taxCode?: string }>;
  currency: string;
  frequency: string;
  nextRunDate: string;
  dueInDays: number;
  notes: string | null;
}

function addDaysISO(fromDate: string, days: number): string {
  const d = new Date(fromDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

export interface RunRecurringInvoiceResult {
  templateId: number;
  generated: boolean;
  invoiceId?: number;
  invoiceNumber?: string;
  nextRunDate?: string;
  reason?: string;
}

/**
 * يولّد فاتورة واحدة من قالب متكرر. وضعان صريحان:
 *
 * - `scheduled` (افتراضي للـcron و«شغّل المستحق»): يعمل فقط إن كان مستحقًّا
 *   (nextRunDate <= today)؛ مفتاح idempotency على nextRunDate؛ **يقدّم** الجدول.
 * - `adhoc` («أصدر فاتورة الآن» اليدوي): يعمل في أي وقت؛ مفتاح على adhoc:today؛
 *   مؤرّخة باليوم؛ **لا يقدّم** nextRunDate ولا يحجب الدورة المجدوَلة (فاتورة إضافية).
 *
 * توافق خلفي: `force:true` يُترجَم إلى `adhoc` (الأسلم — لا يستهلك الدورة).
 */
export async function runRecurringInvoice(params: {
  companyId: number;
  templateId: number;
  createdBy: number;
  today?: string;
  /** @deprecated استعمل mode. force:true ⇒ mode:"adhoc". */
  force?: boolean;
  mode?: "scheduled" | "adhoc";
}): Promise<RunRecurringInvoiceResult> {
  const today = params.today || todayISO();
  const mode: "scheduled" | "adhoc" = params.mode ?? (params.force ? "adhoc" : "scheduled");
  const [tpl] = await rawQuery<RecurringInvoiceTemplateRow>(
    `SELECT id, "companyId", "branchId", "clientId", title, lines, currency, frequency, "nextRunDate"::text AS "nextRunDate", "dueInDays", notes
       FROM recurring_invoice_templates
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND active = TRUE`,
    [params.templateId, params.companyId],
  );
  if (!tpl) return { templateId: params.templateId, generated: false, reason: "القالب غير موجود أو غير نشط" };
  // scheduled لا يعمل إلا عند الاستحقاق؛ adhoc يعمل في أي وقت (فاتورة إضافية).
  if (mode === "scheduled" && tpl.nextRunDate > today) {
    return { templateId: tpl.id, generated: false, reason: "غير مستحقّ بعد", nextRunDate: tpl.nextRunDate };
  }
  if (!Array.isArray(tpl.lines) || tpl.lines.length === 0) {
    return { templateId: tpl.id, generated: false, reason: "القالب بلا سطور" };
  }

  const lines: SalesInvoiceLineInput[] = tpl.lines.map((l) => ({
    description: String(l.description),
    quantity: Number(l.quantity),
    unitPriceExclTax: Number(l.unitPriceExclTax),
    isTaxable: l.isTaxable !== false,
    taxCode: l.taxCode || "VAT_STANDARD",
  }));

  // idempotency يختلف بالوضع:
  // - scheduled: مفتاح على تاريخ الاستحقاق (الدورة) — إعادة التشغيل لا تُكرّر القيد.
  // - adhoc: مفتاح على adhoc:today — فاتورة إضافية واحدة لكل يوم، لا تحجب الدورة المجدوَلة.
  const runDate = tpl.nextRunDate;
  const sourceKey =
    mode === "adhoc"
      ? `finance:recurring_invoice:${params.companyId}:${tpl.id}:adhoc:${today}`
      : `finance:recurring_invoice:${params.companyId}:${tpl.id}:${runDate}`;

  const insertInvoice: InsertSalesInvoiceFn = async (prepared, client) => {
    const vatRate = prepared.lineBreakdown[0]?.taxRate ?? 15;
    const r = await client.query(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'sent',$10,$11,$12) RETURNING id`,
      [params.companyId, tpl.branchId, tpl.clientId, prepared.invoiceNumber, tpl.title,
       prepared.subtotalExclTax, prepared.grandTotal, prepared.taxTotal, vatRate,
       prepared.dueDate, params.createdBy, tpl.notes],
    );
    return { invoiceId: r.rows[0].id };
  };

  const { financialEngine } = await import("./engines/index.js");
  const resp = await financialEngine.postSalesInvoice(
    {
      companyId: params.companyId,
      branchId: tpl.branchId ?? 0,
      createdBy: params.createdBy,
      moduleKey: "finance",
      entityKey: "sales_invoice",
      clientId: tpl.clientId,
      invoiceDate: today,
      dueDate: addDaysISO(today, tpl.dueInDays),
      currency: tpl.currency,
      sourceRefs: { sourceType: "recurring_invoice", sourceId: tpl.id, sourceKey },
      lines,
      notes: tpl.notes ?? undefined,
    },
    insertInvoice,
  );

  if (mode === "scheduled") {
    // قدّم الجدول من تاريخ الاستحقاق (لا من اليوم) حتى لا تنزلق الدورة.
    const next = computeNextRunDate(runDate, tpl.frequency as any);
    await rawExecute(
      `UPDATE recurring_invoice_templates SET "lastRunDate" = $1, "nextRunDate" = $2, "runsCount" = "runsCount" + 1, "updatedAt" = NOW()
        WHERE id = $3 AND "companyId" = $4`,
      [runDate, next, tpl.id, params.companyId],
    );
    return { templateId: tpl.id, generated: true, invoiceId: resp.invoiceId, invoiceNumber: resp.invoiceNumber, nextRunDate: next };
  }

  // adhoc: فاتورة إضافية الآن — سجّل آخر تشغيل + عدّاد التشغيل، لكن **لا تقدّم** الجدول
  // (الدورة المجدوَلة تبقى كما هي ولا تُستهلَك).
  await rawExecute(
    `UPDATE recurring_invoice_templates SET "lastRunDate" = $1, "runsCount" = "runsCount" + 1, "updatedAt" = NOW()
      WHERE id = $2 AND "companyId" = $3`,
    [today, tpl.id, params.companyId],
  );
  return { templateId: tpl.id, generated: true, invoiceId: resp.invoiceId, invoiceNumber: resp.invoiceNumber, nextRunDate: tpl.nextRunDate };
}

/** يعالج كل القوالب المستحقّة لشركة (أو الكل) — للاستدعاء من cron أو يدويًا. */
export async function processDueRecurringInvoices(companyId: number, createdBy: number): Promise<{ processed: number; results: RunRecurringInvoiceResult[] }> {
  const today = todayISO();
  const due = await rawQuery<{ id: number }>(
    `SELECT id FROM recurring_invoice_templates
      WHERE "companyId" = $1 AND active = TRUE AND "deletedAt" IS NULL AND "nextRunDate" <= $2::date
      ORDER BY "nextRunDate" LIMIT 500`,
    [companyId, today],
  );
  const results: RunRecurringInvoiceResult[] = [];
  for (const t of due) {
    try {
      results.push(await runRecurringInvoice({ companyId, templateId: t.id, createdBy, today }));
    } catch (e) {
      logger.error(e, `[recurring-invoice] failed for template ${t.id}`);
      results.push({ templateId: t.id, generated: false, reason: "خطأ أثناء التوليد" });
    }
  }
  return { processed: results.filter((r) => r.generated).length, results };
}
