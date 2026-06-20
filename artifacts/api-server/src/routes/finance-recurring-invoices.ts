// finance-recurring-invoices.ts — قوالب الفوترة المتكررة للعملاء.
//
// هذه الدفعة: CRUD للقوالب فقط — **غير دفتري** (تخزين الجداول الزمنية). التوليد
// الفعلي للفواتير (يمسّ الدفتر) دفعة لاحقة عبر financialEngine.postSalesInvoice.
// RBAC: finance.recurring (نفس صلاحية القيود المتكررة — لا توسعة). Audit/Event.
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, parseId, zodParse, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";

export const recurringInvoicesRouter = Router();
recurringInvoicesRouter.use(authMiddleware);

// سطر يطابق SalesInvoiceLineInput (financialEngine.postSalesInvoice) ليكون
// التوليد لاحقًا تحويلًا مباشرًا بلا منطق قيد جديد.
const lineSchema = z.object({
  description: z.string().min(1, "وصف السطر مطلوب").max(500),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
  unitPriceExclTax: z.coerce.number().min(0, "السعر لا يكون سالبًا"),
  isTaxable: z.boolean().optional().default(true),
  taxCode: z.string().max(40).optional().default("VAT_STANDARD"),
});

const FREQ = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

const createSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  title: z.string().min(1, "العنوان مطلوب").max(300),
  lines: z.array(lineSchema).min(1, "أضف سطرًا واحدًا على الأقل").max(100),
  currency: z.string().max(8).optional(),
  frequency: z.enum(FREQ),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  dueInDays: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
  active: z.boolean().optional(),
  branchId: z.coerce.number().optional(),
});

// GET /finance/recurring-invoices?active= — قوالب الشركة.
recurringInvoicesRouter.get("/recurring-invoices", authorize({ feature: "finance.recurring", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { active } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (active === "true") where += ` AND active = TRUE`;
    if (active === "false") where += ` AND active = FALSE`;
    const rows = await rawQuery(`SELECT * FROM recurring_invoice_templates WHERE ${where} ORDER BY "nextRunDate", id`, params);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List recurring invoices error:"); }
});

// POST /finance/recurring-invoices — إنشاء قالب. nextRunDate = startDate أولًا.
recurringInvoicesRouter.post("/recurring-invoices", authorize({ feature: "finance.recurring", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSchema.safeParse(req.body ?? {}));
    const [client] = await rawQuery<{ id: number }>(`SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.clientId, scope.companyId]);
    if (!client) throw new ValidationError("العميل غير موجود", { field: "clientId" });
    const [row] = await rawQuery(
      `INSERT INTO recurring_invoice_templates ("companyId","branchId","clientId",title,lines,currency,frequency,"startDate","nextRunDate","dueInDays",notes,active,"createdBy")
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8,$9,$10,$11,$12) RETURNING *`,
      [scope.companyId, b.branchId ?? scope.branchId ?? null, b.clientId, b.title, JSON.stringify(b.lines), b.currency ?? "SAR", b.frequency, b.startDate, b.dueInDays ?? 30, b.notes ?? null, b.active ?? true, scope.userId],
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "recurring_invoice.created", entity: "recurring_invoice_templates", entityId: row.id, details: JSON.stringify({ clientId: b.clientId, frequency: b.frequency }) }).catch((e) => logger.error(e, "recurring invoice event failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "recurring_invoice_templates", entityId: row.id, after: { title: b.title, frequency: b.frequency, clientId: b.clientId } }).catch((e) => logger.error(e, "recurring invoice audit failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create recurring invoice error:"); }
});

// PATCH /finance/recurring-invoices/:id — تعديل قالب (لا توليد هنا).
recurringInvoicesRouter.patch("/recurring-invoices/:id", authorize({ feature: "finance.recurring", action: "update", resource: { table: "recurring_invoice_templates", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(createSchema.partial().omit({ clientId: true }).extend({ nextRunDate: z.string().optional() }).safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (b.title !== undefined) set("title", b.title);
    if (b.lines !== undefined) { params.push(JSON.stringify(b.lines)); sets.push(`lines = $${params.length}::jsonb`); }
    if (b.currency !== undefined) set("currency", b.currency);
    if (b.frequency !== undefined) set("frequency", b.frequency);
    if (b.nextRunDate !== undefined) set("nextRunDate", b.nextRunDate);
    if (b.dueInDays !== undefined) set("dueInDays", b.dueInDays);
    if (b.notes !== undefined) set("notes", b.notes ?? null);
    if (b.active !== undefined) set("active", b.active);
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث", { field: "body" });
    sets.push(`"updatedAt" = NOW()`);
    params.push(id); params.push(scope.companyId);
    const [row] = await rawQuery(
      `UPDATE recurring_invoice_templates SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("القالب غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "recurring_invoice_templates", entityId: id }).catch((e) => logger.error(e, "recurring invoice audit failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update recurring invoice error:"); }
});

// DELETE /finance/recurring-invoices/:id — حذف ناعم.
recurringInvoicesRouter.delete("/recurring-invoices/:id", authorize({ feature: "finance.recurring", action: "delete", resource: { table: "recurring_invoice_templates", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE recurring_invoice_templates SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("القالب غير موجود");
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "recurring_invoice.deleted", entity: "recurring_invoice_templates", entityId: id }).catch((e) => logger.error(e, "recurring invoice event failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "recurring_invoice_templates", entityId: id }).catch((e) => logger.error(e, "recurring invoice audit failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete recurring invoice error:"); }
});
