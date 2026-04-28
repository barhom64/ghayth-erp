import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { emitEvent, createAuditLog, toDateISO, todayISO } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { pushToDLQ } from "../lib/eventBus.js";

export const recurringRouter = Router();
recurringRouter.use(authMiddleware);


export type RecurringFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export function computeNextRunDate(fromDate: string | Date, frequency: RecurringFrequency): string {
  const d = new Date(fromDate);
  switch (frequency) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return toDateISO(d);
}

recurringRouter.get("/recurring-journals", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, {
      companyColumn: '"companyId"',
      disableBranchScope: true,
    });
    const { active, frequency } = req.query as { active?: string; frequency?: string };
    let extra = ` AND "deletedAt" IS NULL`;
    if (active === "true") extra += ` AND active = TRUE`;
    if (active === "false") extra += ` AND active = FALSE`;
    if (frequency) { params.push(frequency); extra += ` AND frequency = $${params.length}`; }

    const rows = await rawQuery<any>(
      `SELECT id, "companyId", "branchId", name, description, frequency,
              "startDate", "nextRunDate", "lastRunDate", active,
              "templateLines", "templateRef", "templateDescription",
              "createdBy", "runsCount", "createdAt", "updatedAt"
       FROM recurring_journals
       WHERE ${where}${extra}
       ORDER BY "nextRunDate" ASC, "createdAt" DESC
       LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List recurring journals error:");
  }
});

recurringRouter.get("/recurring-journals/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(
      `SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = ANY($2) AND "deletedAt" IS NULL`,
      [id, scope.allowedCompanies]
    );
    if (!row) throw new NotFoundError("القيد الدوري غير موجود");
    const history = await rawQuery<any>(
      `SELECT rr.*, je.ref AS "journalRef", je.description AS "journalDescription"
       FROM recurring_journal_runs rr
       LEFT JOIN journal_entries je ON je.id = rr."journalEntryId"
       WHERE rr."recurringJournalId" = $1
       ORDER BY rr."createdAt" DESC LIMIT 50`,
      [id]
    );
    res.json({ ...row, history });
  } catch (err) {
    handleRouteError(err, res, "Get recurring journal error:");
  }
});

function validateTemplateLines(lines: any): { ok: true; lines: any[] } | { ok: false; error: string } {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { ok: false, error: "يجب إدخال بندين على الأقل" };
  }
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit <= 0) {
    return { ok: false, error: `القالب غير متوازن: مدين=${totalDebit.toFixed(2)} ≠ دائن=${totalCredit.toFixed(2)}` };
  }
  for (const l of lines) {
    if (!l.accountCode) return { ok: false, error: "يجب تحديد رمز الحساب لكل بند" };
  }
  return {
    ok: true,
    lines: lines.map((l: any) => ({
      accountCode: String(l.accountCode),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: l.description ?? null,
      costCenter: l.costCenter ?? null,
      departmentId: l.departmentId ?? null,
      projectId: l.projectId ?? null,
    })),
  };
}

recurringRouter.post("/recurring-journals", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const {
      name, description, frequency, startDate, active = true,
      templateLines, templateRef, templateDescription,
    } = req.body as any;

    if (!name || !String(name).trim()) {
      throw new ValidationError("اسم القيد الدوري مطلوب", {
        field: "name",
        fix: "أدخل اسماً واضحاً",
      });
    }
    const freq = String(frequency || "").toLowerCase() as RecurringFrequency;
    if (!["daily", "weekly", "monthly", "quarterly", "yearly"].includes(freq)) {
      throw new ValidationError("تكرار غير صالح", {
        field: "frequency",
        fix: "اختر: daily أو weekly أو monthly أو quarterly أو yearly",
      });
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new ValidationError("تاريخ البدء مطلوب", {
        field: "startDate",
        fix: "استخدم الصيغة YYYY-MM-DD",
      });
    }
    const v = validateTemplateLines(templateLines);
    if (!v.ok) {
      throw new ValidationError(v.error, {
        field: "templateLines",
        fix: "أرسل بنود القالب متوازنة (مدين = دائن) مع رمز حساب لكل بند",
      });
    }

    const nextRunDate = startDate; // first run on startDate
    const { insertId } = await rawExecute(
      `INSERT INTO recurring_journals
         ("companyId","branchId",name,description,frequency,"startDate","nextRunDate",active,
          "templateLines","templateRef","templateDescription","createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW(),NOW())`,
      [
        scope.companyId, scope.branchId, name, description ?? null, freq,
        startDate, nextRunDate, !!active,
        JSON.stringify(v.lines), templateRef ?? null, templateDescription ?? null,
        scope.activeAssignmentId,
      ]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recurring_journal.created",
      entity: "recurring_journals",
      entityId: insertId,
      details: JSON.stringify({ name, frequency: freq, startDate }),
    }).catch((err) => pushToDLQ("event", { action: "recurring_journal.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "recurring_journals",
      entityId: insertId,
      after: { name, frequency: freq, startDate, lineCount: v.lines.length },
    }).catch((err) => console.error("[audit] recurring_journal.created:", err));

    res.status(201).json({ id: insertId, name, frequency: freq, startDate, nextRunDate, active });
  } catch (err) {
    handleRouteError(err, res, "Create recurring journal error:");
  }
});

recurringRouter.patch("/recurring-journals/:id", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = Number(req.params.id);
    const b = req.body as any;

    const [existing] = await rawQuery<any>(
      `SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القيد الدوري غير موجود");

    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any, cast = "") => {
      if (val !== undefined) {
        params.push(val);
        fields.push(`"${col}" = $${params.length}${cast}`);
      }
    };
    addField("name", b.name);
    addField("description", b.description);
    if (b.frequency !== undefined) {
      const freq = String(b.frequency).toLowerCase();
      if (!["daily", "weekly", "monthly", "quarterly", "yearly"].includes(freq)) {
        throw new ValidationError("تكرار غير صالح", {
          field: "frequency",
          fix: "اختر: daily أو weekly أو monthly أو quarterly أو yearly",
        });
      }
      addField("frequency", freq);
    }
    addField("startDate", b.startDate);
    addField("nextRunDate", b.nextRunDate);
    addField("active", b.active);
    addField("templateRef", b.templateRef);
    addField("templateDescription", b.templateDescription);
    if (b.templateLines !== undefined) {
      const v = validateTemplateLines(b.templateLines);
      if (!v.ok) {
        throw new ValidationError(v.error, {
          field: "templateLines",
          fix: "أرسل بنود القالب متوازنة (مدين = دائن) مع رمز حساب لكل بند",
        });
      }
      params.push(JSON.stringify(v.lines));
      fields.push(`"templateLines" = $${params.length}::jsonb`);
    }
    if (fields.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    fields.push(`"updatedAt" = NOW()`);
    params.push(id);
    params.push(scope.companyId);
    await rawExecute(
      `UPDATE recurring_journals SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length}`,
      params
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recurring_journal.updated",
      entity: "recurring_journals",
      entityId: id,
      details: JSON.stringify({ fields: Object.keys(b) }),
    }).catch((err) => pushToDLQ("event", { action: "recurring_journal.updated", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "recurring_journals",
      entityId: id,
      after: { fields: Object.keys(b) },
    }).catch((err) => console.error("[audit] recurring_journal.updated:", err));

    res.json({ success: true, id });
  } catch (err) {
    handleRouteError(err, res, "Update recurring journal error:");
  }
});

export async function runRecurringJournal(params: {
  companyId: number;
  recurring: any;
  triggeredBy: "scheduler" | "manual";
  actorAssignmentId?: number;
  branchId?: number;
}): Promise<{ success: boolean; journalId?: number; ref?: string; error?: string }> {
  const { companyId, recurring, triggeredBy, actorAssignmentId, branchId } = params;
  try {
    const lines = typeof recurring.templateLines === "string"
      ? JSON.parse(recurring.templateLines)
      : recurring.templateLines;
    const ref = `${recurring.templateRef || `REC-${recurring.id}`}-${todayISO()}`;
    const description = recurring.templateDescription || recurring.description || recurring.name;

    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId,
      branchId: branchId ?? recurring.branchId ?? 0,
      createdBy: actorAssignmentId ?? recurring.createdBy ?? 0,
      ref,
      description,
      type: "recurring",
      sourceType: "recurring_journal",
      sourceId: recurring.id,
      sourceKey: `finance:recurring:${recurring.id}:${todayISO()}`,
      lines,
    });

    const today = todayISO();
    const next = computeNextRunDate(today, recurring.frequency);
    await rawExecute(
      `UPDATE recurring_journals
         SET "lastRunDate" = $1, "nextRunDate" = $2, "runsCount" = "runsCount" + 1, "updatedAt" = NOW()
       WHERE id = $3`,
      [today, next, recurring.id]
    );
    await rawExecute(
      `INSERT INTO recurring_journal_runs
         ("companyId","recurringJournalId","journalEntryId","runDate",status,"triggeredBy")
       VALUES ($1,$2,$3,$4,'success',$5)`,
      [companyId, recurring.id, journalId, today, triggeredBy]
    );

    return { success: true, journalId, ref };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await rawExecute(
      `INSERT INTO recurring_journal_runs
         ("companyId","recurringJournalId","runDate",status,error,"triggeredBy")
       VALUES ($1,$2,$3,'failed',$4,$5)`,
      [companyId, recurring.id, todayISO(), msg, triggeredBy]
    ).catch(console.error);
    return { success: false, error: msg };
  }
}

recurringRouter.post("/recurring-journals/:id/run-now", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = Number(req.params.id);
    const [recurring] = await rawQuery<any>(
      `SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!recurring) throw new NotFoundError("القيد الدوري غير موجود");
    const result = await runRecurringJournal({
      companyId: scope.companyId,
      recurring,
      triggeredBy: "manual",
      actorAssignmentId: scope.activeAssignmentId,
      branchId: scope.branchId,
    });
    if (!result.success) {
      throw new IntegrationError(
        result.error || "فشل تنفيذ القيد الدوري",
        {
          field: "recurringJournalId",
          fix: "راجع رسالة الخطأ في سجل التشغيل، وتأكد أن قالب القيد لا يزال صالحاً",
          meta: { recurringId: id },
        },
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recurring_journal.run_now",
      entity: "recurring_journals",
      entityId: id,
      details: JSON.stringify({ journalId: result.journalId, ref: result.ref }),
    }).catch((err) => pushToDLQ("event", { action: "recurring_journal.run_now", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "run_now",
      entity: "recurring_journals",
      entityId: id,
      after: { journalId: result.journalId, ref: result.ref, triggeredBy: "manual" },
    }).catch((err) => console.error("[audit] recurring_journal.run_now:", err));

    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Run recurring journal error:");
  }
});

recurringRouter.delete("/recurring-journals/:id", requirePermission("finance:delete"), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id, name FROM recurring_journals WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القيد الدوري غير موجود");

    await rawExecute(
      `UPDATE recurring_journals SET "deletedAt" = NOW(), active = FALSE, "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recurring_journal.deleted",
      entity: "recurring_journals",
      entityId: id,
      details: JSON.stringify({ name: existing.name }),
    }).catch((err) => pushToDLQ("event", { action: "recurring_journal.deleted", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "recurring_journals",
      entityId: id,
      after: { name: existing.name, softDelete: true },
    }).catch((err) => console.error("[audit] recurring_journal.deleted:", err));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete recurring journal error:");
  }
});

/**
 * Scheduler entry point: run all active recurring journals whose
 * nextRunDate is on or before today. Invoked by the daily cron job.
 */
export async function processDueRecurringJournals(): Promise<string> {
  const due = await rawQuery<any>(
    `SELECT * FROM recurring_journals
     WHERE active = TRUE AND "deletedAt" IS NULL AND "nextRunDate" <= CURRENT_DATE`
  );
  let ok = 0;
  let failed = 0;
  for (const r of due) {
    const result = await runRecurringJournal({
      companyId: r.companyId,
      recurring: r,
      triggeredBy: "scheduler",
      branchId: r.branchId ?? undefined,
    });
    if (result.success) ok++; else failed++;
  }
  return `Recurring journals: ${ok} success, ${failed} failed, ${due.length} due`;
}
