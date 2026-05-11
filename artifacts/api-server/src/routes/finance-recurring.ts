import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { z } from "zod";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog, todayISO } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { pushToDLQ } from "../lib/eventBus.js";

import {
  computeNextRunDate,
  runRecurringJournal,
  processDueRecurringJournals,
  type RecurringFrequency,
} from "../lib/recurringJournalProcessor.js";
import { logger } from "../lib/logger.js";
export type { RecurringFrequency };
export { computeNextRunDate, runRecurringJournal, processDueRecurringJournals };

export const recurringRouter = Router();

const VALID_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

const recurringJournalLineSchema = z.object({
  accountCode: z.string(),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  description: z.string().optional().nullable(),
  costCenter: z.string().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  projectId: z.coerce.number().optional().nullable(),
});

const createRecurringJournalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  active: z.boolean().default(true),
  templateLines: z.array(recurringJournalLineSchema),
  templateRef: z.string().optional(),
  templateDescription: z.string().optional(),
});

const updateRecurringJournalSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional(),
  startDate: z.string().optional(),
  nextRunDate: z.string().optional(),
  active: z.boolean().optional(),
  templateRef: z.string().optional(),
  templateDescription: z.string().optional(),
  templateLines: z.array(recurringJournalLineSchema).optional(),
});

recurringRouter.get("/recurring-journals", authorize({ feature: "finance.recurring", action: "list" }), async (req, res) => {
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

recurringRouter.get("/recurring-journals/:id", authorize({ feature: "finance.recurring", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT * FROM recurring_journals WHERE id = $1 AND "companyId" = ANY($2) AND "deletedAt" IS NULL`,
      [id, scope.allowedCompanies]
    );
    if (!row) throw new NotFoundError("القيد الدوري غير موجود");
    const history = await rawQuery<any>(
      `SELECT rr.*, je.ref AS "journalRef", je.description AS "journalDescription"
       FROM recurring_journal_runs rr
       LEFT JOIN journal_entries je ON je.id = rr."journalEntryId"
       WHERE rr."recurringJournalId" = $1 AND rr."companyId" = $2
       ORDER BY rr."createdAt" DESC LIMIT 50`,
      [id, scope.companyId]
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

recurringRouter.post("/recurring-journals", authorize({ feature: "finance.recurring", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const {
      name, description, frequency, startDate, active,
      templateLines, templateRef, templateDescription,
    } = zodParse(createRecurringJournalSchema.safeParse(req.body ?? {}));

    const freq = frequency.toLowerCase() as RecurringFrequency;
    if (!(VALID_FREQUENCIES as readonly string[]).includes(freq)) {
      throw new ValidationError("تكرار غير صالح", {
        field: "frequency",
        fix: "اختر: daily أو weekly أو monthly أو quarterly أو yearly",
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
    }).catch((err) => logger.error(err, "[audit] recurring_journal.created:"));

    res.status(201).json({ id: insertId, name, frequency: freq, startDate, nextRunDate, active });
  } catch (err) {
    handleRouteError(err, res, "Create recurring journal error:");
  }
});

recurringRouter.patch("/recurring-journals/:id", authorize({ feature: "finance.recurring", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(updateRecurringJournalSchema.safeParse(req.body ?? {}));

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
      if (!(VALID_FREQUENCIES as readonly string[]).includes(freq)) {
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
      `UPDATE recurring_journals SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
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
    }).catch((err) => logger.error(err, "[audit] recurring_journal.updated:"));

    res.json({ success: true, id });
  } catch (err) {
    handleRouteError(err, res, "Update recurring journal error:");
  }
});

recurringRouter.post("/recurring-journals/:id/run-now", authorize({ feature: "finance.recurring", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
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
    }).catch((err) => logger.error(err, "[audit] recurring_journal.run_now:"));

    res.status(201).json(result);
  } catch (err) {
    handleRouteError(err, res, "Run recurring journal error:");
  }
});

recurringRouter.delete("/recurring-journals/:id", authorize({ feature: "finance.recurring", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

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
    }).catch((err) => logger.error(err, "[audit] recurring_journal.deleted:"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete recurring journal error:");
  }
});

