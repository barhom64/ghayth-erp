import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createJournalEntry, checkFinancialPeriodOpen, emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { assertRole } from "../lib/roleGuards.js";
import { pushToDLQ } from "../lib/eventBus.js";

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

accountsRouter.get("/chart-of-accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const accounts = await rawQuery<any>(
      `SELECT id, code, name, type, "parentCode", "parentId", level, status, "allowPosting", "isAnalytical", "currentBalance", nature
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

accountsRouter.get("/accounts", async (req, res) => {
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
      `SELECT * FROM chart_of_accounts WHERE ${where}${extraWhere} ORDER BY code`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/accounts", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["director", "owner"]);
    const b = req.body;
    if (!b.code || !b.name) {
      throw new ValidationError("رمز الحساب واسمه مطلوبان", {
        field: !b.code ? "code" : "name",
        fix: "أدخل رمز الحساب واسمه",
      });
    }
    const [dup] = await rawQuery<any>(
      `SELECT id FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, b.code]
    );
    if (dup) {
      throw new ConflictError("رمز الحساب مستخدم مسبقاً", { field: "code", fix: "اختر رمز حساب مختلف" });
    }

    let parentId: number | null = null;
    let level = 1;
    if (b.parentCode || b.parentId) {
      const parentWhere = b.parentId ? `id = $2` : `code = $2`;
      const [parent] = await rawQuery<any>(
        `SELECT id, code, level FROM chart_of_accounts WHERE "companyId" = $1 AND ${parentWhere} AND "deletedAt" IS NULL`,
        [scope.companyId, b.parentId || b.parentCode]
      );
      if (parent) {
        parentId = parent.id;
        level = (parent.level || 1) + 1;
        await rawExecute(
          `UPDATE chart_of_accounts SET "allowPosting" = false WHERE id = $1`,
          [parent.id]
        );
      }
    }

    const allowPosting = b.allowPosting !== undefined ? b.allowPosting : true;
    const r = await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, "parentCode", "parentId", level, "allowPosting", "isAnalytical", "isActive", nature)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, b.code, b.name, b.nameEn || null, b.type || "asset",
       b.parentCode || null, parentId, level, allowPosting,
       b.isAnalytical || false, b.isActive !== false, b.nature || "debit"]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.created",
      entity: "chart_of_accounts",
      entityId: r.insertId,
      details: JSON.stringify({ code: b.code, name: b.name, type: b.type }),
    }).catch((err) => pushToDLQ("event", { action: "account.created", entityId: r.insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "chart_of_accounts",
      entityId: r.insertId,
      after: { code: b.code, name: b.name, type: b.type },
    }).catch((err) => console.error("[audit] account.created:", err));

    res.status(201).json({ id: r.insertId, ...b });
  } catch (err) {
    handleRouteError(err, res, "Create account error:");
  }
});

accountsRouter.patch("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["director", "owner"]);
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("nameEn", b.nameEn);
    addField("type", b.type);
    addField("parentCode", b.parentCode);
    addField("allowPosting", b.allowPosting);
    addField("isAnalytical", b.isAnalytical);
    addField("nature", b.nature);
    addField("isActive", b.isActive);
    if (fields.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
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
    }).catch((err) => console.error("[audit] account.updated:", err));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update account error:"); }
});

accountsRouter.delete("/accounts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, ["director", "owner"]);
    const accountId = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2`,
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
      `DELETE FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 RETURNING id`,
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
    }).catch((err) => console.error("[audit] account.deleted:", err));

    res.json({ message: "تم حذف الحساب" });
  } catch (err) { handleRouteError(err, res, "Delete account error:"); }
});

accountsRouter.get("/journal", async (req, res) => {
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
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

accountsRouter.post("/journal", async (req, res) => {
  try {
    const scope = req.scope!;
    const { ref, description, lines, date: journalBodyDate } = req.body as any;
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new ValidationError("بنود القيد مطلوبة", {
        field: "lines",
        fix: "أرسل مصفوفة بنود القيد (سطرين على الأقل)",
      });
    }
    const journalDate = journalBodyDate
      ? new Date(journalBodyDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
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
    const journalId = await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: ref ?? `JE-${Date.now()}`,
      description: description ?? "",
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
    }).catch((err) => console.error("[audit] journal.created:", err));

    res.status(201).json({ id: journalId, ref, description, lines });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

accountsRouter.get("/ledger/:accountCode", async (req, res) => {
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
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = $2
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       ORDER BY je."createdAt" ASC`,
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

accountsRouter.get("/summary", async (req, res) => {
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
       WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL`,
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
