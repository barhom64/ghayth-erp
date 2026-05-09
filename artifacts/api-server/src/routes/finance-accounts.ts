import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { checkFinancialPeriodOpen, emitEvent, createAuditLog, todayISO, toDateISO } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { pushToDLQ } from "../lib/eventBus.js";
import { logger } from "../lib/logger.js";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
const ACCOUNT_NATURES = ["debit", "credit"] as const;

const createAccountSchema = z.object({
  code: z.string().min(1, "رمز الحساب مطلوب"),
  name: z.string().min(1, "اسم الحساب مطلوب"),
  type: z.string().refine((v) => (ACCOUNT_TYPES as readonly string[]).includes(v), { message: "نوع الحساب غير صالح" }).optional().default("asset"),
  parentCode: z.string().optional().nullable(),
  nameEn: z.string().optional().nullable(),
  nature: z.string().refine((v) => (ACCOUNT_NATURES as readonly string[]).includes(v), { message: "طبيعة الحساب غير صالحة" }).optional().default("debit"),
  allowPosting: z.boolean().optional().default(true),
  isAnalytical: z.boolean().optional().default(false),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().refine((v) => (ACCOUNT_TYPES as readonly string[]).includes(v), { message: "نوع الحساب غير صالح" }).optional(),
  parentCode: z.string().optional().nullable(),
});

const journalLineSchema = z.object({
  accountCode: z.string().min(1, "رمز الحساب مطلوب"),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  description: z.string().optional().default(""),
  costCenter: z.string().optional(),
});

const createJournalSchema = z.object({
  ref: z.string().optional(),
  description: z.string().optional().default(""),
  date: z.string().optional(),
  lines: z.array(journalLineSchema).min(1, "بنود القيد مطلوبة"),
});

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

accountsRouter.get("/chart-of-accounts", authorize({ feature: "finance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const accounts = await rawQuery<any>(
      `SELECT id, code, name, type, "parentCode", status
       FROM chart_of_accounts
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY code ASC`,
      params
    );
    res.json(accounts);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

accountsRouter.get("/accounts", authorize({ feature: "finance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const { search, type: accountType, postingOnly } = req.query as { search?: string; type?: string; postingOnly?: string };

    let extraWhere = "";
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      extraWhere += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
    }
    if (accountType && accountType.trim()) {
      params.push(accountType.trim());
      extraWhere += ` AND type = $${params.length}`;
    }
    if (postingOnly === "true") {
      extraWhere += ` AND "allowPosting" = true`;
    }

    const rows = await rawQuery(
      `SELECT * FROM chart_of_accounts WHERE ${where} AND "deletedAt" IS NULL${extraWhere} ORDER BY code LIMIT 5000`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) { logger.error(_e, "accounts list query failed");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/accounts", authorize({ feature: "finance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createAccountSchema.safeParse(req.body ?? {}));
    const [row] = await rawQuery<any>(
      `INSERT INTO chart_of_accounts ("companyId", code, name, type, "parentCode", "nameEn", nature, "allowPosting", "isAnalytical")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("companyId", code) DO NOTHING
       RETURNING *`,
      [scope.companyId, b.code, b.name, b.type, b.parentCode ?? null, b.nameEn ?? null, b.nature, b.allowPosting, b.isAnalytical]
    );
    if (!row) throw new ConflictError("رمز الحساب مستخدم مسبقاً", { field: "code", fix: "استخدم رمزاً مختلفاً للحساب" });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.created",
      entity: "chart_of_accounts",
      entityId: row.id,
      details: JSON.stringify({ code: b.code, name: b.name, type: b.type }),
    }).catch((err) => pushToDLQ("event", { action: "account.created", entityId: row.id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "chart_of_accounts",
      entityId: row.id,
      after: { code: b.code, name: b.name, type: b.type },
    }).catch((err) => logger.error(err, "[audit] account.created:"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create account error:");
  }
});

accountsRouter.patch("/accounts/:id", authorize({ feature: "finance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(updateAccountSchema.safeParse(req.body ?? {}));
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("type", b.type);
    addField("parentCode", b.parentCode);
    if (fields.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("الحساب غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.updated",
      entity: "chart_of_accounts",
      entityId: id,
      details: JSON.stringify({ fields: Object.keys(b) }),
    }).catch((err) => pushToDLQ("event", { action: "account.updated", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "chart_of_accounts",
      entityId: id,
      after: { fields: Object.keys(b) },
    }).catch((err) => logger.error(err, "[audit] account.updated:"));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update account error:"); }
});

accountsRouter.delete("/accounts/:id", authorize({ feature: "finance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const accountId = parseId(req.params.id, "id");

    const [existing] = await rawQuery<any>(
      `SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [accountId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الحساب غير موجود");

    // Referential integrity: refuse delete when journal lines reference this account code.
    const [journalUsage] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       WHERE jl."accountCode" = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`,
      [existing.code, scope.companyId]
    );
    if (Number(journalUsage?.cnt ?? 0) > 0) {
      throw new ConflictError(
        `لا يمكن حذف الحساب — يوجد ${journalUsage.cnt} سطر في القيود المحاسبية مرتبط بهذا الحساب`,
        {
          field: "accountId",
          fix: "ارحّل/احذف القيود المرتبطة قبل حذف الحساب أو قم بأرشفته فقط",
          meta: { journalLinesCount: Number(journalUsage.cnt) },
        },
      );
    }

    const rows = await rawQuery<any>(
      `UPDATE chart_of_accounts SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [accountId, scope.companyId]
    );
    if (rows.length === 0) throw new NotFoundError("الحساب غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.deleted",
      entity: "chart_of_accounts",
      entityId: accountId,
      details: JSON.stringify({ code: existing.code, name: existing.name }),
    }).catch((err) => pushToDLQ("event", { action: "account.deleted", entityId: accountId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "chart_of_accounts",
      entityId: accountId,
      after: { code: existing.code, name: existing.name, hardDelete: true },
    }).catch((err) => logger.error(err, "[audit] account.deleted:"));

    res.json({ message: "تم حذف الحساب" });
  } catch (err) { handleRouteError(err, res, "Delete account error:"); }
});

accountsRouter.get("/journal", authorize({ feature: "finance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<any>(
      `SELECT je.*, json_agg(jl.*) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) { logger.error(_e, "journal list query failed");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/journal", authorize({ feature: "finance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { ref, description, lines, date: journalBodyDate } = zodParse(createJournalSchema.safeParse(req.body ?? {}));
    const journalDate = journalBodyDate
      ? toDateISO(journalBodyDate)
      : todayISO();
    const journalPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, journalDate);
    if (!journalPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن إنشاء قيد في فترة مالية مُقفلة: ${journalPeriodCheck.periodName ?? ""}`,
        {
          field: "date",
          fix: "اختر تاريخاً ضمن فترة مالية مفتوحة، أو اطلب من المدير المالي إعادة فتح الفترة",
          meta: { periodName: journalPeriodCheck.periodName },
        },
      );
    }
    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: ref ?? `JE-${Date.now()}`,
      description: description ?? "",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual_je:${Date.now()}`,
      lines,
    });

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.created",
      entity: "journal_entries",
      entityId: journalId,
      details: JSON.stringify({ ref, lineCount: lines.length }),
    }).catch((err) => pushToDLQ("event", { action: "journal.created", entityId: journalId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "journal_entries",
      entityId: journalId,
      after: { ref, lineCount: lines.length, date: journalDate },
    }).catch((err) => logger.error(err, "[audit] journal.created:"));

    const [createdJournal] = await rawQuery<any>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json(createdJournal || { id: journalId });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

accountsRouter.get("/ledger/:accountCode", authorize({ feature: "finance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = $2 AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
       ORDER BY je."createdAt" ASC LIMIT 5000`,
      params
    );

    let runningBalance = 0;
    const movements = rows.map((r: any) => {
      runningBalance += Number(r.debit) - Number(r.credit);
      return { ...r, runningBalance };
    });

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit), 0);

    res.json({ movements, summary: { totalDebit, totalCredit, netBalance: totalDebit - totalCredit, count: movements.length } });
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

accountsRouter.get("/summary", authorize({ feature: "finance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
              COALESCE(SUM("paidAmount"),0) AS paid,
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial','overdue')),0) AS outstanding
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [exp] = await rawQuery<any>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(jl.debit),0) AS total
       FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL AND je.status = 'posted'`,
      [scope.companyId]
    );
    res.json({
      invoicesCount: Number(inv?.count ?? 0),
      totalRevenue: Number(inv?.total ?? 0),
      totalPaid: Number(inv?.paid ?? 0),
      outstanding: Number(inv?.outstanding ?? 0),
      expensesCount: Number(exp?.count ?? 0),
      totalExpenses: Number(exp?.total ?? 0),
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
