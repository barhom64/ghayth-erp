// finance-cash-in-transit.ts — النقد في الطريق (#2714، الجزء المتبقّي).
//
// يمسّ الدفتر — **لا منطق قيد جديد**: الطوران يُرحَّلان عبر postJournalEntry القائم
// (قيد متوازن + idempotency بـ sourceKey). الحسابات الثلاثة (مصدر/هدف/مقاصّة)
// يختارها المستخدم وتُتحقَّق خادميًّا (وجود + قابلية ترحيل). RBAC: finance.journal.
import { Router } from "express";
import { handleRouteError, parseId, zodParse, ValidationError, NotFoundError, ConflictError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, auditFromRequest, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";

export const cashInTransitRouter = Router();
cashInTransitRouter.use(authMiddleware);

const initiateSchema = z.object({
  sourceAccountCode: z.string().min(1, "الحساب المصدر مطلوب").max(40),
  destinationAccountCode: z.string().min(1, "الحساب الهدف مطلوب").max(40),
  clearingAccountCode: z.string().min(1, "حساب النقد في الطريق مطلوب").max(40),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجبًا"),
  currency: z.string().max(8).optional(),
  sentDate: z.string().optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  // مفتاح ثابت اختياري لمنع الترحيل المزدوج عند إعادة المحاولة.
  transferKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});

async function assertPostableMoneyAccount(companyId: number, code: string, field: string): Promise<void> {
  const [acct] = await rawQuery<{ code: string; allowPosting: boolean }>(
    `SELECT code, "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code=$2 AND "deletedAt" IS NULL LIMIT 1`,
    [companyId, code],
  );
  if (!acct) throw new ValidationError(`الحساب ${code} غير موجود`, { field });
  if (!acct.allowPosting) throw new ValidationError(`الحساب ${code} غير قابل للترحيل — اختر حسابًا فرعيًا`, { field });
}

// GET /finance/cash-in-transit?status= — قائمة التحويلات العابرة.
cashInTransitRouter.get("/cash-in-transit", authorize({ feature: "finance.journal", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM cash_in_transit_transfers WHERE ${where} ORDER BY "sentDate" DESC, id DESC LIMIT 500`, params);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List cash-in-transit error:"); }
});

// POST /finance/cash-in-transit — الطور 1: مدين المقاصّة / دائن المصدر + تتبّع.
cashInTransitRouter.post("/cash-in-transit", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(initiateSchema.safeParse(req.body ?? {}));
    if (b.sourceAccountCode === b.destinationAccountCode) throw new ValidationError("المصدر والهدف لا يكونان نفس الحساب", { field: "destinationAccountCode" });
    // حساب المقاصّة (النقد في الطريق) يجب أن يتمايز عن الطرفين، وإلا أصبح أحد القيدين
    // غسلًا والمال «يصل» أو «يخرج» في الطور الخطأ — يُفرِغ معنى التتبّع العابر.
    if (b.clearingAccountCode === b.sourceAccountCode || b.clearingAccountCode === b.destinationAccountCode) {
      throw new ValidationError("حساب النقد في الطريق يجب أن يختلف عن المصدر والهدف", { field: "clearingAccountCode" });
    }
    await assertPostableMoneyAccount(scope.companyId, b.sourceAccountCode, "sourceAccountCode");
    await assertPostableMoneyAccount(scope.companyId, b.destinationAccountCode, "destinationAccountCode");
    await assertPostableMoneyAccount(scope.companyId, b.clearingAccountCode, "clearingAccountCode");

    const amount = Number(b.amount);
    const sentDate = b.sentDate || todayISO();
    const transferKey = b.transferKey || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const sourceKey = `finance:cash_in_transit:send:${scope.companyId}:${transferKey}`;
    const ref = b.reference || `CIT-${sentDate}`;

    // الطور 1 — يُرحَّل عبر المحرك (قيد متوازن + idempotency).
    const { financialEngine } = await import("../lib/engines/index.js");
    const sent = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.userId,
      ref,
      description: b.notes || `نقد في الطريق — تحويل من ${b.sourceAccountCode}`,
      type: "transfer",
      sourceType: "cash_in_transit_send",
      sourceId: 0,
      sourceKey,
      lines: [
        { accountCode: b.clearingAccountCode, debit: amount, credit: 0, description: `نقد في الطريق — ${ref}` },
        { accountCode: b.sourceAccountCode, debit: 0, credit: amount, description: `تحويل صادر — ${ref}` },
      ],
    });

    const [row] = await rawQuery<{ id: number }>(
      `INSERT INTO cash_in_transit_transfers ("companyId","branchId","sourceAccountCode","destinationAccountCode","clearingAccountCode",amount,currency,status,"sentDate","sentJournalId",reference,notes,"createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'in_transit',$8,$9,$10,$11,$12) RETURNING id`,
      [scope.companyId, scope.branchId ?? null, b.sourceAccountCode, b.destinationAccountCode, b.clearingAccountCode, amount, b.currency ?? "SAR", sentDate, sent.journalId, b.reference ?? null, b.notes ?? null, scope.userId],
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "cash_in_transit.sent", entity: "cash_in_transit_transfers", entityId: row.id, details: JSON.stringify({ amount, journalId: sent.journalId }) }).catch((e) => logger.error(e, "cash-in-transit event failed"));
    auditFromRequest(req, "create", "cash_in_transit_transfers", row.id, { after: { amount, status: "in_transit", journalId: sent.journalId } }).catch((e) => logger.error(e, "cash-in-transit audit failed"));
    res.status(201).json({ id: row.id, status: "in_transit", journalId: sent.journalId });
  } catch (err) { handleRouteError(err, res, "Initiate cash-in-transit error:"); }
});

// POST /finance/cash-in-transit/:id/confirm — الطور 2: مدين الهدف / دائن المقاصّة.
cashInTransitRouter.post("/cash-in-transit/:id/confirm", authorize({ feature: "finance.journal", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [t] = await rawQuery<any>(`SELECT * FROM cash_in_transit_transfers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!t) throw new NotFoundError("التحويل غير موجود");
    if (t.status !== "in_transit") throw new ConflictError(`لا يمكن تأكيد تحويل بحالة "${t.status}"`);
    const arrivedDate = (req.body?.arrivedDate as string) || todayISO();
    const amount = Number(t.amount);
    const ref = t.reference || `CIT-${id}`;
    const sourceKey = `finance:cash_in_transit:arrive:${scope.companyId}:${id}`;

    const { financialEngine } = await import("../lib/engines/index.js");
    const arr = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: t.branchId ?? scope.branchId,
      createdBy: scope.userId,
      ref,
      description: `وصول نقد في الطريق — ${ref}`,
      type: "transfer",
      sourceType: "cash_in_transit_arrive",
      sourceId: id,
      sourceKey,
      lines: [
        { accountCode: t.destinationAccountCode, debit: amount, credit: 0, description: `تحويل وارد — ${ref}` },
        { accountCode: t.clearingAccountCode, debit: 0, credit: amount, description: `تصفية نقد في الطريق — ${ref}` },
      ],
    });

    const { affectedRows } = await rawExecute(
      `UPDATE cash_in_transit_transfers SET status='arrived', "arrivedDate"=$1, "arrivedJournalId"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4 AND status='in_transit'`,
      [arrivedDate, arr.journalId, id, scope.companyId],
    );
    if (!affectedRows) throw new ConflictError("تغيّرت حالة التحويل — أعد التحميل");
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "cash_in_transit.arrived", entity: "cash_in_transit_transfers", entityId: id, details: JSON.stringify({ journalId: arr.journalId }) }).catch((e) => logger.error(e, "cash-in-transit event failed"));
    auditFromRequest(req, "update", "cash_in_transit_transfers", id, { after: { status: "arrived", journalId: arr.journalId } }).catch((e) => logger.error(e, "cash-in-transit audit failed"));
    res.json({ id, status: "arrived", journalId: arr.journalId });
  } catch (err) { handleRouteError(err, res, "Confirm cash-in-transit error:"); }
});
