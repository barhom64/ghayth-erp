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
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { checkFinancialPeriodOpen, emitEvent, createAuditLog, todayISO, toDateISO } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { requestIdempotencyToken, markIdempotencyReplay, isDryRun } from "../lib/requestIdempotency.js";

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

interface ChartOfAccountsBriefRow {
  id: number;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  status: string;
}

interface ChartOfAccountsRow extends ChartOfAccountsBriefRow {
  companyId: number;
  nameEn: string | null;
  nature: string;
  allowPosting: boolean;
  isAnalytical: boolean;
  parentId: number | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface JournalCountRow { cnt: string | number }
interface IdRow { id: number }

interface JournalEntryWithLinesRow {
  id: number;
  companyId: number;
  branchId: number | null;
  ref: string;
  description: string;
  status: string;
  createdAt: string;
  createdBy: number | null;
  deletedAt: string | null;
  lines: unknown;
}

interface AccountLedgerHeadRow {
  name: string;
  type: string;
  code: string;
}

interface LedgerEntryRow {
  id: number;
  ref: string;
  description: string;
  date: string;
  debit: number | string | null;
  credit: number | string | null;
}

interface FinanceStatsRow {
  totalRevenue: number | string;
  paidThisMonth: number | string;
  pendingAmount: number | string;
  overdueAmount: number | string;
}

interface InvoiceSummaryRow {
  count: number | string;
  total: number | string;
  paid: number | string;
  outstanding: number | string;
}

interface ExpenseSummaryRow {
  count: number | string;
  total: number | string;
}

/**
 * SUB-1 guard: validate a proposed parent for a chart-of-accounts account.
 * Walks the parent's ancestry with a depth-bounded recursive CTE and rejects:
 *   - a parent that does not exist,
 *   - a cycle (the child appearing among its own would-be ancestors — this
 *     also catches an account set as its own parent),
 *   - a parent whose `type` differs from the account's type.
 * The depth bound keeps a pre-existing corrupt cycle in the data from
 * looping the recursion.
 */
async function assertValidAccountParent(
  companyId: number,
  childCode: string,
  childType: string,
  parentCode: string,
): Promise<void> {
  const ancestry = await rawQuery<{ code: string; type: string }>(
    `WITH RECURSIVE ancestry AS (
       SELECT code, "parentCode", type, 1 AS depth
         FROM chart_of_accounts
        WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL
       UNION ALL
       SELECT c.code, c."parentCode", c.type, a.depth + 1
         FROM chart_of_accounts c
         JOIN ancestry a ON c.code = a."parentCode"
        WHERE c."companyId" = $1 AND c."deletedAt" IS NULL AND a.depth < 64
     )
     SELECT code, type FROM ancestry ORDER BY depth`,
    [companyId, parentCode],
  );
  if (ancestry.length === 0) {
    throw new ValidationError(`الحساب الأب "${parentCode}" غير موجود`, {
      field: "parentCode",
      fix: "اختر رمز حساب أب موجوداً ضمن دليل الحسابات",
    });
  }
  if (ancestry.some((a) => a.code === childCode)) {
    throw new ConflictError(
      `لا يمكن جعل "${parentCode}" أباً للحساب "${childCode}" — ينشئ ذلك حلقة في شجرة الحسابات`,
      { field: "parentCode", fix: "اختر حساباً أب ليس فرعاً من هذا الحساب" },
    );
  }
  const parentType = ancestry[0]!.type;
  if (parentType !== childType) {
    throw new ValidationError(
      `نوع الحساب الأب (${parentType}) لا يطابق نوع الحساب (${childType})`,
      { field: "parentCode", fix: "يجب أن يكون الحساب الأب من نفس نوع الحساب الفرعي" },
    );
  }
}

accountsRouter.get("/chart-of-accounts", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const accounts = await rawQuery<ChartOfAccountsBriefRow>(
      `SELECT id, code, name, type, "parentCode", status
       FROM chart_of_accounts
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY code ASC`,
      params
    );
    res.json(maskFields(req, accounts));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

accountsRouter.get("/accounts", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
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
      `SELECT c.*, (SELECT p.id FROM chart_of_accounts p WHERE p.code = c."parentCode" AND p."companyId" = c."companyId" AND p."deletedAt" IS NULL LIMIT 1) AS "parentId" FROM chart_of_accounts c WHERE ${where} AND c."deletedAt" IS NULL${extraWhere} ORDER BY c.code LIMIT 5000`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (_e) { logger.error(_e, "accounts list query failed");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/accounts", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createAccountSchema.safeParse(req.body ?? {}));
    if (b.parentCode) {
      await assertValidAccountParent(scope.companyId, b.code, b.type, b.parentCode);
    }
    const [row] = await rawQuery<ChartOfAccountsRow>(
      `INSERT INTO chart_of_accounts ("companyId", code, name, type, "parentCode", "nameEn", nature, "allowPosting", "isAnalytical")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("companyId", code) DO NOTHING
       RETURNING *`,
      [scope.companyId, b.code, b.name, b.type, b.parentCode ?? null, b.nameEn ?? null, b.nature, b.allowPosting, b.isAnalytical]
    );
    if (!row) throw new ConflictError("رمز الحساب مستخدم مسبقاً", { field: "code", fix: "استخدم رمزاً مختلفاً للحساب" });

    // Compute parentId from parentCode
    if (b.parentCode) {
      await rawExecute(
        `UPDATE chart_of_accounts SET "parentId" = (
          SELECT p.id FROM chart_of_accounts p WHERE p.code = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
        ) WHERE id = $3`,
        [b.parentCode, scope.companyId, row.id]
      );
    }

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

accountsRouter.patch("/accounts/:id", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(updateAccountSchema.safeParse(req.body ?? {}));

    // SUB-1: when the parent link or the account type changes, re-validate
    // the effective parent — it must exist, not create a cycle, and share
    // the account's type.
    if (b.parentCode !== undefined || b.type !== undefined) {
      const [existing] = await rawQuery<{ code: string; type: string; parentCode: string | null }>(
        `SELECT code, type, "parentCode" FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحساب غير موجود");

      // COA-4: changing an account's `type` retroactively re-classifies every
      // posting already booked to it — any financial statement built on
      // `type` would silently change. Refuse a type change once the account
      // carries journal lines (mirrors the DELETE handler's usage guard);
      // correct via a new correctly-typed account + a reversing entry.
      if (b.type !== undefined && b.type !== existing.type) {
        const [typeUsage] = await rawQuery<JournalCountRow>(
          `SELECT COUNT(*) AS cnt FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId"
           WHERE jl."accountCode" = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL`,
          [existing.code, scope.companyId],
        );
        if (Number(typeUsage?.cnt ?? 0) > 0) {
          throw new ConflictError(
            `لا يمكن تغيير نوع الحساب "${existing.code}" — مرتبط به ${typeUsage.cnt} سطر في القيود المحاسبية`,
            {
              field: "type",
              fix: "النوع جزء من التصنيف المحاسبي؛ أنشئ حساباً جديداً بالنوع الصحيح وأجرِ ترحيلاً تصحيحياً",
              meta: { journalLinesCount: Number(typeUsage.cnt) },
            },
          );
        }
      }

      const effectiveType = b.type ?? existing.type;
      const effectiveParentCode = b.parentCode !== undefined ? b.parentCode : existing.parentCode;
      if (effectiveParentCode) {
        await assertValidAccountParent(scope.companyId, existing.code, effectiveType, effectiveParentCode);
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const addField = (col: string, val: unknown) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
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
    const rows = await rawQuery<ChartOfAccountsRow>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`, params);
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

accountsRouter.delete("/accounts/:id", authorize({ feature: "finance.accounts", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const accountId = parseId(req.params.id, "id");

    const [existing] = await rawQuery<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [accountId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الحساب غير موجود");

    // Referential integrity: refuse delete when journal lines reference this account code.
    const [journalUsage] = await rawQuery<JournalCountRow>(
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

    const rows = await rawQuery<IdRow>(
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

accountsRouter.get("/journal", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(jl.*) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (_e) { logger.error(_e, "journal list query failed");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/journal", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
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
    const idempotencyToken = requestIdempotencyToken(req);
    const journalRef = ref ?? `JE-${idempotencyToken}`;

    if (isDryRun(req)) {
      const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
      res.json({
        dryRun: true,
        ref: journalRef,
        description: description ?? "",
        postingDate: journalDate,
        lines,
        totals: { totalDebit, totalCredit },
      });
      return;
    }

    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: journalRef,
      description: description ?? "",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual_je:${journalRef}:${idempotencyToken}`,
      lines,
      postingDate: journalDate,
    });
    markIdempotencyReplay(req, res, alreadyExists);

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

    const [createdJournal] = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdJournal || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

// NOTE: This `POST /journal` (feature=finance.accounts) and the one in
// finance-journal.ts (feature=finance.journal) are intentionally parallel
// endpoints — they share an HTTP path but have different RBAC features so a
// user with one permission cannot post via the other. Both now route
// through financialEngine.postJournalEntry, so there is no duplicated
// booking logic — only the RBAC wrapping differs. Do NOT consolidate them
// without first auditing every frontend caller, because changing the
// authorize() feature will silently revoke access for some operator roles.

accountsRouter.get("/ledger/:accountCode", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const [accountRow] = await rawQuery<AccountLedgerHeadRow>(
      `SELECT name, type, code FROM chart_of_accounts WHERE code = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [accountCode, scope.companyId]
    );

    const rows = await rawQuery<LedgerEntryRow>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = $2 AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.status = 'posted' ${dateFilter}
       ORDER BY je."createdAt" ASC LIMIT 5000`,
      params
    );

    let runningBalance = 0;
    const movements = rows.map((r) => {
      runningBalance += Number(r.debit) - Number(r.credit);
      return { ...r, runningBalance };
    });

    const totalDebit = rows.reduce((s: number, r) => s + Number(r.debit), 0);
    const totalCredit = rows.reduce((s: number, r) => s + Number(r.credit), 0);

    res.json(maskFields(req, {
      account: { code: accountCode, name: accountRow?.name, type: accountRow?.type },
      entries: movements,
      summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: movements.length }
    }));
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

accountsRouter.get("/stats", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<FinanceStatsRow>(
      `SELECT COALESCE(SUM(total),0) AS "totalRevenue",
              COALESCE(SUM("paidAmount") FILTER(WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)),0) AS "paidThisMonth",
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial')),0) AS "pendingAmount",
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status = 'overdue'),0) AS "overdueAmount"
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    res.json(maskFields(req, inv || { totalRevenue: 0, paidThisMonth: 0, pendingAmount: 0, overdueAmount: 0 }));
  } catch (err) { handleRouteError(err, res, "finance stats error"); }
});

accountsRouter.get("/summary", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<InvoiceSummaryRow>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
              COALESCE(SUM("paidAmount"),0) AS paid,
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial','overdue')),0) AS outstanding
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [exp] = await rawQuery<ExpenseSummaryRow>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(jl.debit),0) AS total
       FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL AND je.status = 'posted'`,
      [scope.companyId]
    );
    res.json(maskFields(req, {
      invoicesCount: Number(inv?.count ?? 0),
      totalRevenue: Number(inv?.total ?? 0),
      totalPaid: Number(inv?.paid ?? 0),
      outstanding: Number(inv?.outstanding ?? 0),
      expensesCount: Number(exp?.count ?? 0),
      totalExpenses: Number(exp?.total ?? 0),
    }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
