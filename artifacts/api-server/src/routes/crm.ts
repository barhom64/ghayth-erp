import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, createNotification, emitEvent, todayISO, currentYear, toDateISO, currentMonthPadded, generateTimeRef, roundTo2 } from "../lib/businessHelpers.js";
import { registerObligation, cancelObligation, markObligationMet } from "../lib/obligationsEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

const CRM_TRANSITIONS: Record<string, readonly string[]> = {
  lead:        ["qualified", "closed_lost"],
  qualified:   ["proposal", "negotiation", "closed_lost"],
  proposal:    ["negotiation", "closed_won", "closed_lost"],
  negotiation: ["proposal", "closed_won", "closed_lost"],
  closed_won:  [],
  closed_lost: ["qualified"],
};

// ── Zod validation schemas ──────────────────────────────────────────
const createOpportunitySchema = z.object({
  title: z.string({ required_error: "عنوان الفرصة مطلوب" }).min(1, "عنوان الفرصة مطلوب"),
  clientId: z.coerce.number({ invalid_type_error: "معرّف العميل يجب أن يكون رقماً" }).optional().nullable(),
  contactName: z.string({ invalid_type_error: "اسم جهة الاتصال يجب أن يكون نصاً" }).optional().nullable(),
  contactPhone: z.string({ invalid_type_error: "رقم الهاتف يجب أن يكون نصاً" }).optional().nullable(),
  contactEmail: z.string({ invalid_type_error: "البريد الإلكتروني يجب أن يكون نصاً" }).optional().nullable(),
  source: z.string({ invalid_type_error: "المصدر يجب أن يكون نصاً" }).optional().nullable(),
  stage: z.string({ invalid_type_error: "المرحلة يجب أن تكون نصاً" }).optional(),
  value: z.coerce.number({ invalid_type_error: "قيمة الفرصة يجب أن تكون رقماً" }).min(0, "قيمة الفرصة يجب أن تكون رقماً موجباً").optional().nullable(),
  probability: z.coerce.number({ invalid_type_error: "الاحتمالية يجب أن تكون رقماً" }).min(0, "الاحتمالية يجب أن تكون بين 0 و 100").max(100, "الاحتمالية يجب أن تكون بين 0 و 100").optional().nullable(),
  expectedCloseDate: z.string({ invalid_type_error: "تاريخ الإغلاق المتوقع يجب أن يكون نصاً" }).optional().nullable(),
  assignedTo: z.coerce.number({ invalid_type_error: "معرّف الموظف المسؤول يجب أن يكون رقماً" }).optional().nullable(),
  notes: z.string({ invalid_type_error: "الملاحظات يجب أن تكون نصاً" }).optional().nullable(),
  nextFollowUp: z.string({ invalid_type_error: "تاريخ المتابعة القادمة يجب أن يكون نصاً" }).optional().nullable(),
});

const updateOpportunitySchema = z.object({
  title: z.string({ invalid_type_error: "عنوان الفرصة يجب أن يكون نصاً" }).optional(),
  clientId: z.coerce.number({ invalid_type_error: "معرّف العميل يجب أن يكون رقماً" }).optional().nullable(),
  contactName: z.string({ invalid_type_error: "اسم جهة الاتصال يجب أن يكون نصاً" }).optional().nullable(),
  contactPhone: z.string({ invalid_type_error: "رقم الهاتف يجب أن يكون نصاً" }).optional().nullable(),
  contactEmail: z.string({ invalid_type_error: "البريد الإلكتروني يجب أن يكون نصاً" }).optional().nullable(),
  source: z.string({ invalid_type_error: "المصدر يجب أن يكون نصاً" }).optional().nullable(),
  stage: z.string({ invalid_type_error: "المرحلة يجب أن تكون نصاً" }).optional(),
  status: z.string({ invalid_type_error: "الحالة يجب أن تكون نصاً" }).optional(),
  value: z.coerce.number({ invalid_type_error: "قيمة الفرصة يجب أن تكون رقماً" }).min(0, "قيمة الفرصة يجب أن تكون رقماً موجباً").optional().nullable(),
  probability: z.coerce.number({ invalid_type_error: "الاحتمالية يجب أن تكون رقماً" }).min(0, "الاحتمالية يجب أن تكون بين 0 و 100").max(100, "الاحتمالية يجب أن تكون بين 0 و 100").optional().nullable(),
  expectedCloseDate: z.string({ invalid_type_error: "تاريخ الإغلاق المتوقع يجب أن يكون نصاً" }).optional().nullable(),
  assignedTo: z.coerce.number({ invalid_type_error: "معرّف الموظف المسؤول يجب أن يكون رقماً" }).optional().nullable(),
  notes: z.string({ invalid_type_error: "الملاحظات يجب أن تكون نصاً" }).optional().nullable(),
  lostReason: z.string({ invalid_type_error: "سبب الخسارة يجب أن يكون نصاً" }).optional().nullable(),
  nextFollowUp: z.string({ invalid_type_error: "تاريخ المتابعة القادمة يجب أن يكون نصاً" }).optional().nullable(),
});

const convertOpportunitySchema = z.object({
  value: z.coerce.number({ invalid_type_error: "قيمة الصفقة يجب أن تكون رقماً" }).optional(),
  notes: z.string({ invalid_type_error: "الملاحظات يجب أن تكون نصاً" }).optional().nullable(),
});

const createActivitySchema = z.object({
  type: z.string({ required_error: "نوع النشاط مطلوب" }).min(1, "نوع النشاط مطلوب"),
  description: z.string({ required_error: "وصف النشاط مطلوب" }).min(1, "وصف النشاط مطلوب"),
  scheduledAt: z.string({ required_error: "تاريخ النشاط المجدول مطلوب" }).min(1, "تاريخ النشاط المجدول مطلوب"),
});

const followupCheckSchema = z.object({});

// Compute the due date for the CRM follow-up obligation.
// Preference order:
// 1. expectedCloseDate if set and in the future
// 2. now + stage followUpDays (min 1 day)
function computeCrmFollowUpDue(stage: string, expectedCloseDate: string | null | undefined): Date {
  const now = Date.now();
  if (expectedCloseDate) {
    const ecd = new Date(expectedCloseDate);
    if (!Number.isNaN(ecd.getTime()) && ecd.getTime() > now) return ecd;
  }
  const cfg = STAGE_AUTO_ACTIONS[stage];
  const days = Math.max(cfg?.followUpDays ?? 3, 1);
  return new Date(now + days * 86400000);
}

const STAGE_AUTO_ACTIONS: Record<string, { followUpDays: number; description: string }> = {
  lead: { followUpDays: 0, description: 'فرصة جديدة — بدء التأهيل' },
  qualified: { followUpDays: 3, description: 'متابعة خلال 3 أيام لتقديم عرض' },
  proposal: { followUpDays: 5, description: 'تذكير بالعرض + تصعيد إن لم يُرد' },
  negotiation: { followUpDays: 1, description: 'متابعة يومية حتى الإغلاق' },
  closed_won: { followUpDays: 0, description: 'إنشاء عقد + فاتورة + تحديث KPI' },
  closed_lost: { followUpDays: 0, description: 'تسجيل سبب الخسارة + تحليل' },
};

router.get("/opportunities", authorize({ feature: "crm.opportunities", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { stage, status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'o."companyId"', disableBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (stage) { where += ` AND o.stage = $${paramIdx}`; params.push(stage); paramIdx++; }
    if (status) { where += ` AND o.status = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT o.*, cl.name AS "clientName", e.name AS "assigneeName" FROM crm_opportunities o LEFT JOIN clients cl ON cl.id=o."clientId" AND cl."deletedAt" IS NULL LEFT JOIN employees e ON e.id=o."assignedTo" AND e."deletedAt" IS NULL WHERE ${where} AND o."deletedAt" IS NULL ORDER BY o.id DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "CRM opportunities error:"); }
});

router.post("/opportunities", authorize({ feature: "crm.opportunities", action: "create" }), async (req, res) => {
  // Phase C domain 2 — CRM opportunity creation, mirror of the HR Step 1
  // treatment. Adds input validation the old handler lacked (title,
  // contact-or-client, stage enum, numeric ranges), pre-checks the
  // clientId / assignedTo FKs so stale ids produce clean field-tagged
  // errors instead of deep 23503 FK errors, and keeps the existing
  // obligations engine wiring + event emission untouched.
  try {
    const parsed = zodParse(createOpportunitySchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;

    const title = (b.title ?? "").toString().trim();
    if (!title) {
      throw new ValidationError("عنوان الفرصة مطلوب", {
        field: "title",
        fix: "أدخل عنواناً موجزاً يصف الفرصة البيعية.",
      });
    }

    // Either a structured client (clientId) OR an unstructured contact
    // must be present — otherwise the opportunity has nothing to attach
    // itself to and every future follow-up sends into the void.
    if (!b.clientId && !b.contactName && !b.contactPhone) {
      throw new ValidationError("يجب تحديد العميل أو جهة اتصال", {
        field: "clientId",
        fix: "اختر عميلاً من القائمة أو أدخل اسم ورقم جهة اتصال.",
      });
    }

    const stage = (b.stage || "lead") as string;
    if (!STAGE_ORDER.includes(stage)) {
      throw new ValidationError(`مرحلة غير صالحة: ${stage}`, {
        field: "stage",
        fix: `اختر مرحلة من: ${STAGE_ORDER.join("، ")}.`,
        meta: { allowedStages: STAGE_ORDER },
      });
    }

    // A brand-new opportunity shouldn't land as already-won / already-lost.
    // The /convert endpoint is the canonical path to closed_won, and the
    // user should go through /update to change the stage. Rejecting
    // closed_* at create time makes the state machine predictable.
    if (stage === "closed_won" || stage === "closed_lost") {
      throw new ConflictError(
        `لا يمكن إنشاء فرصة مباشرة في الحالة "${stage}"`,
        {
          field: "stage",
          fix: "أنشئ الفرصة في مرحلة مبكرة ثم حرّكها خلال مسار البيع.",
          meta: { attemptedStage: stage, allowedFirstStages: STAGE_ORDER.filter(s => !s.startsWith("closed_")) },
        }
      );
    }

    const value = Number(b.value ?? 0);
    if (!Number.isFinite(value) || value < 0) {
      throw new ValidationError("قيمة الفرصة يجب أن تكون رقماً موجباً", {
        field: "value",
        fix: "أدخل قيمة رقمية ≥ 0.",
      });
    }

    const probability = b.probability === undefined || b.probability === null ? 50 : Number(b.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      throw new ValidationError("احتمالية الإغلاق يجب أن تكون بين 0 و 100", {
        field: "probability",
        fix: "أدخل نسبة مئوية بين 0 و 100.",
      });
    }

    // Pre-check: clientId must resolve to an active client in this company.
    if (b.clientId) {
      const [client] = await rawQuery<{ id: number }>(
        `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.clientId), scope.companyId]
      );
      if (!client) {
        throw new ValidationError("العميل المحدد غير موجود", {
          field: "clientId",
          fix: "اختر عميلاً من قائمة العملاء الحاليين.",
        });
      }
    }

    // Pre-check: assignedTo must resolve to an employee that exists in
    // this company. Stale ids used to fail deep as 23503 — now we
    // reject early with a field-tagged error the sales-create form can
    // highlight.
    if (b.assignedTo) {
      const [asn] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
          WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1`,
        [Number(b.assignedTo), scope.companyId]
      );
      if (!asn) {
        throw new ValidationError("الموظف المسؤول المحدد غير موجود", {
          field: "assignedTo",
          fix: "اختر مسؤولاً من قائمة الموظفين النشطين.",
        });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO crm_opportunities ("companyId",title,"clientId","contactName","contactPhone","contactEmail",source,stage,value,probability,"expectedCloseDate","assignedTo",notes,"nextFollowUp") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [scope.companyId, title, b.clientId ?? null, b.contactName ?? null, b.contactPhone ?? null, b.contactEmail ?? null, b.source ?? null, stage, value, probability, b.expectedCloseDate ?? null, b.assignedTo ?? null, b.notes ?? null, b.nextFollowUp ?? null]
    );

    const stageConfig = STAGE_AUTO_ACTIONS[stage];
    if (stageConfig && stageConfig.followUpDays > 0) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + stageConfig.followUpDays);
      try {
        await rawExecute(
          `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'follow_up',$2,$3,$4)`,
          [insertId, stageConfig.description, followUpDate.toISOString(), scope.userId]
        );
      } catch (actErr) { logger.error(actErr, "Failed to create auto activity:"); }
    }

    if (b.assignedTo) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
          [b.assignedTo, scope.companyId]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "crm_opportunity",
            title: "فرصة CRM جديدة مسندة إليك",
            body: `${title} — القيمة: ${value} ريال — المرحلة: ${stage}`,
            priority: "normal",
            refType: "crm_opportunities",
            refId: insertId,
          }).catch((e) => logger.error(e, "crm background task failed"));
        }
      } catch (e) { logger.error(e, "CRM notification error:"); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "crm_opportunities",
      entityId: insertId,
      after: { title, clientId: b.clientId ?? null, value, stage, assignedTo: b.assignedTo ?? null },
    }).catch((e) => logger.error(e, "crm background task failed"));

    // Register CRM follow-up obligation — terminal stages were filtered out
    // at validation time above so every opportunity reaching this point is
    // in a non-closed stage.
    try {
      const dueAt = computeCrmFollowUpDue(stage, b.expectedCloseDate);
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "crm_opportunity",
        entityId: insertId,
        obligationType: "follow_up",
        title: `متابعة فرصة CRM — ${title} (${stage})`,
        dueAt: dueAt.toISOString(),
        metadata: { stage, value, clientId: b.clientId ?? null, contactName: b.contactName ?? null, assignedEmployeeId: b.assignedTo ?? null },
        dedupeKey: `crm-opp-${insertId}-followup`,
        escalationSteps: [
          { hoursAfterDue: 24, notifyRole: "sales_manager" },
          { hoursAfterDue: 72, notifyRole: "general_manager" },
        ],
      });
    } catch (obErr) { logger.error(obErr, "CRM opportunity obligation failed:"); }

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "crm.opportunity.created",
      entity: "crm_opportunities",
      entityId: insertId,
      details: JSON.stringify({ title, value, stage, clientId: b.clientId ?? null, assignedTo: b.assignedTo ?? null }),
    }).catch((e) => logger.error(e, "crm background task failed"));

    res.status(201).json({ ...row, autoAction: stageConfig?.description });
  } catch (err) { handleRouteError(err, res, "Create opportunity error:"); }
});

router.patch("/opportunities/:id", authorize({ feature: "crm.opportunities", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateOpportunitySchema.safeParse(req.body));
    const scope = req.scope!;
    const oppId = parseId(req.params.id, "id");
    const b = parsed;

    const [existing] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [oppId, scope.companyId]);
    if (!existing) throw new NotFoundError("الفرصة غير موجودة");

    // Phase C domain 2 — stage transition guard. Mirrors the Support
    // TICKET_TRANSITIONS allowlist. Before this block, the PATCH handler
    // accepted any stage change from any current stage — a lead could
    // jump directly to closed_won without going through proposal /
    // negotiation, and a closed opportunity could be reopened by
    // setting stage back to lead. No guard, no error.
    //
    // The allowlist reflects the intended sales pipeline:
    //
    //   lead        → qualified | closed_lost
    //   qualified   → proposal | negotiation | closed_lost
    //   proposal    → negotiation | closed_won | closed_lost
    //   negotiation → proposal | closed_won | closed_lost
    //   closed_won  → (terminal — only /convert can land here)
    //   closed_lost → (terminal — optionally reopen via qualified)
    //
    // closed_won is intentionally NOT reachable from this PATCH in the
    // allowlist — the canonical path is /opportunities/:id/convert which
    // uses the lifecycle engine and runs handleDealWon side effects.
    // This PATCH will still honor a closed_won write for backwards
    // compat with existing tests/UIs, but we log a warning so operators
    // can migrate callers.
    if (b.stage !== undefined && b.stage !== existing.stage) {
      if (!STAGE_ORDER.includes(b.stage)) {
        throw new ValidationError(`مرحلة غير صالحة: ${b.stage}`, {
          field: "stage",
          fix: `اختر مرحلة من: ${STAGE_ORDER.join("، ")}.`,
          meta: { allowedStages: STAGE_ORDER },
        });
      }

      const allowed = CRM_TRANSITIONS[existing.stage] ?? [];
      if (!allowed.includes(b.stage)) {
        throw new ConflictError(
          `لا يمكن نقل الفرصة من "${existing.stage}" إلى "${b.stage}"`,
          {
            field: "stage",
            fix: allowed.length > 0
              ? `المراحل المسموحة من الحالة الحالية: ${allowed.join("، ")}`
              : "هذه الفرصة وصلت لمرحلة نهائية ولا تقبل تغييراً إضافياً.",
            meta: {
              currentStage: existing.stage,
              requestedStage: b.stage,
              allowedNext: allowed,
            },
          }
        );
      }

      if (b.stage === "closed_won") {
        logger.warn(`[crm] opportunity ${oppId} set to closed_won via PATCH — prefer /opportunities/${oppId}/convert`);
      }
    }

    if ((b.stage === 'closed_won' || b.stage === 'closed_lost') && existing.stage !== b.stage) {
      const hasClientInfo = existing.clientId || existing.contactName || b.clientId || b.contactName;
      if (!hasClientInfo) {
        throw new ValidationError(
          "لا يمكن إغلاق الصفقة بدون بيانات العميل",
          {
            field: "clientId",
            fix: "أضف بيانات العميل (اسم أو ID) قبل محاولة إغلاق الصفقة.",
          },
        );
      }
    }

    // Numeric range guards on value / probability — mirror the create-
    // time checks so the UPDATE path rejects the same bad inputs.
    if (b.value !== undefined && b.value !== null) {
      const v = Number(b.value);
      if (!Number.isFinite(v) || v < 0) {
        throw new ValidationError("قيمة الفرصة يجب أن تكون رقماً موجباً", {
          field: "value",
          fix: "أدخل قيمة رقمية ≥ 0.",
        });
      }
    }
    if (b.probability !== undefined && b.probability !== null) {
      const p = Number(b.probability);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        throw new ValidationError("احتمالية الإغلاق يجب أن تكون بين 0 و 100", {
          field: "probability",
          fix: "أدخل نسبة مئوية بين 0 و 100.",
        });
      }
    }

    // Pre-check assignedTo FK on update, same logic as create.
    if (b.assignedTo !== undefined && b.assignedTo !== null) {
      const [asn] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
          WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL LIMIT 1`,
        [Number(b.assignedTo), scope.companyId]
      );
      if (!asn) {
        throw new ValidationError("الموظف المسؤول المحدد غير موجود", {
          field: "assignedTo",
          fix: "اختر مسؤولاً من قائمة الموظفين النشطين.",
        });
      }
    }

    // Pre-check clientId FK on update.
    if (b.clientId !== undefined && b.clientId !== null) {
      const [client] = await rawQuery<{ id: number }>(
        `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.clientId), scope.companyId]
      );
      if (!client) {
        throw new ValidationError("العميل المحدد غير موجود", {
          field: "clientId",
          fix: "اختر عميلاً من قائمة العملاء الحاليين.",
        });
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.stage !== undefined) { params.push(b.stage); sets.push(`stage=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.lostReason !== undefined) { params.push(b.lostReason); sets.push(`"lostReason"=$${params.length}`); }
    if (b.value !== undefined) { params.push(b.value); sets.push(`value=$${params.length}`); }
    if (b.probability !== undefined) { params.push(b.probability); sets.push(`probability=$${params.length}`); }
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.assignedTo !== undefined) { params.push(b.assignedTo); sets.push(`"assignedTo"=$${params.length}`); }
    if (b.clientId !== undefined) { params.push(b.clientId || null); sets.push(`"clientId"=$${params.length}`); }
    if (b.contactName !== undefined) { params.push(b.contactName); sets.push(`"contactName"=$${params.length}`); }
    if (b.contactPhone !== undefined) { params.push(b.contactPhone); sets.push(`"contactPhone"=$${params.length}`); }
    if (b.contactEmail !== undefined) { params.push(b.contactEmail); sets.push(`"contactEmail"=$${params.length}`); }
    if (b.expectedCloseDate !== undefined) { params.push(b.expectedCloseDate || null); sets.push(`"expectedCloseDate"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.source !== undefined) { params.push(b.source); sets.push(`source=$${params.length}`); }
    if (b.nextFollowUp !== undefined) { params.push(b.nextFollowUp || null); sets.push(`"nextFollowUp"=$${params.length}`); }
    params.push(oppId, scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE crm_opportunities SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("الفرصة غير موجودة");

    let autoActions: string[] = [];

    if (b.stage && b.stage !== existing.stage) {
      const stageConfig = STAGE_AUTO_ACTIONS[b.stage];

      if (stageConfig && stageConfig.followUpDays > 0) {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + stageConfig.followUpDays);
        try {
          await rawExecute(
            `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'follow_up',$2,$3,$4)`,
            [oppId, `[تلقائي] ${stageConfig.description}`, followUpDate.toISOString(), scope.userId]
          );
          autoActions.push(`متابعة تلقائية بعد ${stageConfig.followUpDays} أيام`);
        } catch (actErr) { logger.error(actErr, "Auto activity creation failed:"); }
      }

      if (b.stage === 'proposal') {
        const escalationDate = new Date();
        escalationDate.setDate(escalationDate.getDate() + 7);
        try {
          await rawExecute(
            `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,'escalation',$2,$3,$4)`,
            [oppId, '[تلقائي] تصعيد — لم يرد العميل على العرض خلال أسبوع', escalationDate.toISOString(), scope.userId]
          );
          autoActions.push('تصعيد تلقائي بعد 7 أيام إن لم يُرد');
        } catch (e) { logger.error(e, "Escalation activity error:"); }
      }

      if (existing.assignedTo) {
        try {
          const [asgn] = await rawQuery<any>(
            `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
            [existing.assignedTo, scope.companyId]
          );
          if (asgn) {
            createNotification({
              companyId: scope.companyId,
              assignmentId: asgn.id,
              type: "crm_stage_change",
              title: `تحديث مرحلة: ${existing.title}`,
              body: `انتقلت الفرصة من "${existing.stage}" إلى "${b.stage}" — ${stageConfig?.description || ''}`,
              priority: "normal",
              refType: "crm_opportunities",
              refId: oppId,
            }).catch((e) => logger.error(e, "crm background task failed"));
          }
        } catch (e) { logger.error(e, "Stage change notification error:"); }
      }
    }

    if (b.stage === 'closed_won' && existing.stage !== 'closed_won') {
      await handleDealWon(scope, existing, b.value ?? existing.value);
      autoActions.push('إنشاء عقد + فاتورة + تحديث إيرادات العميل');
      // Mark follow-up obligation as met and emit deal-won event
      await markObligationMet(scope.companyId, "crm_opportunity", oppId, "follow_up").catch((e) => logger.error(e, "crm background task failed"));
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.deal.won",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `صفقة ناجحة: ${existing.title} — ${b.value ?? existing.value} ريال`,
      }).catch((e) => logger.error(e, "crm background task failed"));
    }

    if (b.stage === 'closed_lost' && existing.stage !== 'closed_lost') {
      autoActions.push('تسجيل سبب الخسارة');
      try {
        await rawExecute(
          `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","completedAt","createdBy") VALUES ($1,'analysis',$2,NOW(),NOW(),$3)`,
          [oppId, `تحليل خسارة: ${b.lostReason || 'غير محدد'} — القيمة المفقودة: ${existing.value} ريال`, scope.userId]
        );
      } catch (e) { logger.error(e, "Lost analysis error:"); }
      // Cancel follow-up obligation and emit deal-lost event
      await cancelObligation(scope.companyId, "crm_opportunity", oppId).catch((e) => logger.error(e, "crm background task failed"));
      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.deal.lost",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `صفقة خاسرة: ${existing.title} — السبب: ${b.lostReason || 'غير محدد'}`,
      }).catch((e) => logger.error(e, "crm background task failed"));
    }

    // Stage change (non-terminal) → refresh follow-up obligation window
    if (
      b.stage && b.stage !== existing.stage &&
      b.stage !== 'closed_won' && b.stage !== 'closed_lost'
    ) {
      try {
        await cancelObligation(scope.companyId, "crm_opportunity", oppId);
        const effectiveEcd = b.expectedCloseDate !== undefined ? b.expectedCloseDate : existing.expectedCloseDate;
        const dueAt = computeCrmFollowUpDue(b.stage, effectiveEcd);
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "crm_opportunity",
          entityId: oppId,
          obligationType: "follow_up",
          title: `متابعة فرصة CRM — ${existing.title} (${b.stage})`,
          dueAt: dueAt.toISOString(),
          metadata: { stage: b.stage, value: b.value ?? existing.value, clientId: existing.clientId, assignedEmployeeId: b.assignedTo ?? existing.assignedTo ?? null },
          dedupeKey: `crm-opp-${oppId}-followup-${b.stage}`,
          escalationSteps: [
            { hoursAfterDue: 24, notifyRole: "sales_manager" },
            { hoursAfterDue: 72, notifyRole: "general_manager" },
          ],
        });
      } catch (obErr) { logger.error(obErr, "CRM stage-change obligation refresh failed:"); }

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "crm.opportunity.stage_changed",
        entity: "crm_opportunities",
        entityId: oppId,
        details: `تغيير مرحلة: ${existing.title} — من ${existing.stage} إلى ${b.stage}`,
      }).catch((e) => logger.error(e, "crm background task failed"));
    }

    const [row] = await rawQuery<any>(`SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [oppId, scope.companyId]);

    // Build a tracked-field diff so the audit log reflects what
    // actually changed instead of just `{ stage, status }`. Same
    // pattern as PATCH /employees/:id in Step 2.
    const trackedKeys = [
      "title", "stage", "status", "value", "probability",
      "expectedCloseDate", "assignedTo", "clientId",
      "contactName", "contactPhone", "contactEmail", "source",
      "notes", "lostReason",
    ] as const;
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of trackedKeys) {
      const oldVal = (existing as any)[key];
      const newVal = (row as any)[key];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changedFields[key] = { from: oldVal ?? null, to: newVal ?? null };
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "crm_opportunities", entityId: oppId,
      before: existing,
      after: row,
      reason: `حقول معدّلة: ${Object.keys(changedFields).join("، ") || "بلا تغيير"}`,
    }).catch((e) => logger.error(e, "crm background task failed"));

    // Generic updated event for non-stage edits. The stage_changed /
    // deal.won / deal.lost events already cover lifecycle transitions,
    // so we only fire `crm.opportunity.updated` when the user touched
    // a non-lifecycle field — otherwise we'd duplicate the stage event.
    const hasNonStageChange = Object.keys(changedFields).some((k) => k !== "stage" && k !== "status");
    if (hasNonStageChange) {
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "crm.opportunity.updated",
        entity: "crm_opportunities",
        entityId: oppId,
        before: existing,
        after: row,
        details: JSON.stringify({ changedFields }),
      }).catch((e) => logger.error(e, "crm background task failed"));
    }

    res.json({ ...row, autoActions });
  } catch (err) { handleRouteError(err, res, "Update opportunity error:"); }
});

async function handleDealWon(scope: any, opp: any, dealValue: number) {
  try {
    let clientId = opp.clientId;

    if (!clientId && opp.contactName?.trim()) {
      await withTransaction(async (txClient: any) => {
        const { rows: existing } = await txClient.query(
          `SELECT id FROM clients WHERE "companyId"=$1 AND "deletedAt" IS NULL AND (name=$2 OR phone=$3 OR email=$4) LIMIT 1 FOR UPDATE`,
          [scope.companyId, opp.contactName.trim(), opp.contactPhone || '', opp.contactEmail || '']
        );
        if (existing.length > 0) {
          clientId = existing[0].id;
        } else {
          const { rows: [newRow] } = await txClient.query(
            `INSERT INTO clients ("companyId",name,phone,email,source,classification) VALUES ($1,$2,$3,$4,'crm','regular') RETURNING id`,
            [scope.companyId, opp.contactName, opp.contactPhone || null, opp.contactEmail || null]
          );
          clientId = newRow.id;
        }
        await txClient.query(`UPDATE crm_opportunities SET "clientId"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`, [clientId, opp.id, scope.companyId]);
      });
    }

    try {
      const { crmEngine } = await import("../lib/engines/index.js");
      crmEngine.requestLegalContractCreation(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        {
          ref: generateTimeRef("CTR-CRM"),
          title: `عقد خدمات - ${opp.title}`,
          contractType: "service",
          partyName: opp.contactName || 'عميل',
          startDate: todayISO(),
          endDate: toDateISO(new Date(Date.now() + 365 * 86400000)),
          value: dealValue,
        }
      );
    } catch (contractErr) {
      logger.error(contractErr, "Failed to request legal contract for deal-won:");
    }

    const monthNum = currentMonthPadded();
    const yearShort = String(currentYear()).slice(2);
    const invoiceRef = `INV-CRM-${yearShort}${monthNum}-${opp.id}`;
    const vatAmount = roundTo2(dealValue * 0.15);
    const totalAmount = roundTo2(dealValue + vatAmount);

    // Request invoice creation via CRM Engine (event-based, no direct write to finance table)
    try {
      const { crmEngine } = await import("../lib/engines/index.js");
      await crmEngine.requestInvoiceCreation(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        {
          clientId: clientId || 0,
          opportunityId: opp.id,
          ref: invoiceRef,
          description: `فاتورة أولى - ${opp.title}`,
          subtotal: dealValue,
          vatAmount,
          total: totalAmount,
          dueDate: toDateISO(new Date(Date.now() + 14 * 86400000)),
        }
      );
    } catch (invoiceErr) {
      logger.error(invoiceErr, "Failed to request invoice for deal-won:");
    }

    // GL posting via CRM Engine → Financial Engine (with period check + sourceKey)
    try {
      const { crmEngine } = await import("../lib/engines/index.js");
      await crmEngine.postDealWonGL(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        { id: opp.id, clientId: clientId || 0, amount: dealValue, vatAmount, description: `قيد فاتورة CRM — ${opp.title}` }
      );
    } catch (jeErr) {
      logger.error(jeErr, "CRM deal-won GL posting via engine failed:");
    }

    if (clientId) {
      try {
        await rawExecute(`UPDATE clients SET "totalRevenue"=COALESCE("totalRevenue",0)+$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`, [dealValue, clientId, scope.companyId]);
      } catch (revenueErr) {
        logger.error(revenueErr, "Failed to update client totalRevenue:");
      }
    }

    if (opp.assignedTo) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
          [opp.assignedTo, scope.companyId]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "deal_won",
            title: `صفقة ناجحة: ${opp.title}`,
            body: `تم إغلاق الصفقة بقيمة ${dealValue} ريال — تم إنشاء عقد وفاتورة تلقائياً`,
            priority: "normal",
            refType: "crm_opportunities",
            refId: opp.id,
          }).catch((e) => logger.error(e, "crm background task failed"));
        }
      } catch (e) { logger.error(e, "Deal won notification error:"); }
    }
  } catch (err) {
    logger.error(err, "Handle deal won error:");
  }
}

// RBAC v2: opportunity scope check (sales-rep template uses scope=self
// to limit reps to their own opportunities; managers see team/branch).
router.get("/opportunities/:id", authorize({ feature: "crm.opportunities", action: "view", resource: { table: "crm_opportunities", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT o.*, cl.name AS "clientName", e.name AS "assigneeName" FROM crm_opportunities o LEFT JOIN clients cl ON cl.id=o."clientId" AND cl."deletedAt" IS NULL LEFT JOIN employees e ON e.id=o."assignedTo" AND e."deletedAt" IS NULL WHERE o.id=$1 AND o."companyId"=$2 AND o."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الفرصة غير موجودة");

    const activities = await rawQuery<any>(
      `SELECT * FROM crm_activities WHERE "opportunityId"=$1 ORDER BY "scheduledAt" DESC LIMIT 500`,
      [row.id]
    );
    const overdueActivities = activities.filter((a: any) => !a.completedAt && new Date(a.scheduledAt) < new Date());

    res.json({
      ...row, activities, overdueActivities,
      stageConfig: STAGE_AUTO_ACTIONS[row.stage],
      nextStages: CRM_TRANSITIONS[row.stage] ?? [],
    });
  } catch (err) { handleRouteError(err, res, "Get opportunity error:"); }
});

// Explicit "convert opportunity to client" endpoint. Marks the opportunity as
// won, runs the deal-won side-effects (client + contract + invoice), then
// writes the lifecycle markers (convertedAt / convertedClientId) in the same
// atomic transition via the lifecycle engine.
router.post("/opportunities/:id/convert", authorize({ feature: "crm.opportunities", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(convertOpportunitySchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT * FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الفرصة غير موجودة");
    if (existing.convertedAt) {
      throw new ConflictError("تم تحويل هذه الفرصة مسبقاً", {
        field: "convertedAt",
        fix: "الفرصة مرتبطة بالفعل بعميل. افتح العميل من رابط الفرصة.",
        meta: { convertedAt: existing.convertedAt },
      });
    }

    const dealValue = (parsed.value as number | undefined) ?? existing.value ?? 0;

    // handleDealWon creates / resolves the client and writes a contract +
    // invoice using the global pool. It is idempotent enough for first-call
    // use and guards every side-effect with its own try/catch.
    await handleDealWon(scope, existing, dealValue);

    // Re-read the opportunity to pick up the clientId that handleDealWon may
    // have just populated, so we can mirror it into convertedClientId.
    const [afterDealWon] = await rawQuery<any>(
      `SELECT "clientId" FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    const convertedClientId = afterDealWon?.clientId ?? null;

    const updated = await applyTransition({
      entity: "crm_opportunities",
      id,
      scope,
      action: "crm.opportunity.converted",
      toState: "won",
      reason: (parsed.notes as string | undefined)?.trim(),
      setExtras: {
        stage: "closed_won",
        convertedAt: { raw: "NOW()" },
        convertedClientId,
        value: dealValue,
      },
      extraWhere: `"deletedAt" IS NULL`,
      after: { convertedClientId, stage: "closed_won" },
    });
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "crm.opportunity.converted", entity: "crm_opportunities", entityId: id,
      details: JSON.stringify({ convertedClientId, stage: "closed_won" }),
    }).catch((e) => logger.error(e, "crm background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "crm_opportunities", entityId: id,
      after: { stage: "closed_won", convertedClientId },
    }).catch((e) => logger.error(e, "crm background task failed"));
    res.json({ ...updated, event: "crm.opportunity.converted", convertedClientId });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Convert opportunity error:");
  }
});

router.delete("/opportunities/:id", authorize({ feature: "crm.opportunities", action: "delete", resource: { table: "crm_opportunities", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الفرصة غير موجودة");
    const { affectedRows } = await rawExecute(`UPDATE crm_opportunities SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("الفرصة غير موجودة");
    await cancelObligation(scope.companyId, "crm_opportunity", id).catch((e) => logger.error(e, "crm background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "crm.opportunity.deleted",
      entity: "crm_opportunities",
      entityId: id,
      details: `حذف فرصة CRM`,
    }).catch((e) => logger.error(e, "crm background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "crm_opportunities", entityId: id,
    }).catch((e) => logger.error(e, "crm background task failed"));
    res.json({ message: "تم حذف الفرصة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete opportunity error:"); }
});

// Related deals for a given opportunity: other opportunities that share the
// same clientId or contact name / phone / email. Used by the lead / opportunity
// detail page instead of fetching the full list client-side.
router.get("/opportunities/:id/related", authorize({ feature: "crm.opportunities", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [base] = await rawQuery<any>(
      `SELECT id, "clientId", "contactName", "contactPhone", "contactEmail"
         FROM crm_opportunities
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!base) throw new NotFoundError("الفرصة غير موجودة");

    const conds: string[] = [];
    const params: any[] = [scope.companyId, id];
    if (base.clientId) {
      params.push(base.clientId);
      conds.push(`"clientId" = $${params.length}`);
    }
    if (base.contactName) {
      params.push(base.contactName);
      conds.push(`"contactName" = $${params.length}`);
    }
    if (base.contactPhone) {
      params.push(base.contactPhone);
      conds.push(`"contactPhone" = $${params.length}`);
    }
    if (base.contactEmail) {
      params.push(base.contactEmail);
      conds.push(`"contactEmail" = $${params.length}`);
    }
    if (conds.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    const rows = await rawQuery<any>(
      `SELECT o.*, cl.name AS "clientName"
         FROM crm_opportunities o
         LEFT JOIN clients cl ON cl.id = o."clientId" AND cl."deletedAt" IS NULL
        WHERE o."companyId" = $1
          AND o.id <> $2
          AND o."deletedAt" IS NULL
          AND (${conds.join(" OR ")})
        ORDER BY o."createdAt" DESC
        LIMIT 50`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Related opportunities error:"); }
});

// P02-CRIT3 — both activity routes used to take `:id` from the URL
// and run straight at `crm_activities`, which is keyed only by
// `opportunityId` (no companyId on the activities table itself). The
// `crm:read` / `crm:create` permission gates only verified the
// caller has CRM perms in *some* company, not that the opportunity
// they're addressing lives in their company. So a CRM user in
// company A could read every CRM note/call/task on company B's
// pipeline by guessing IDs (read leak) and could spam fake
// activities or false trails on competitors' opportunities (write
// leak). Fixed by pre-validating the opportunity exists in the
// caller's scope — same pattern used by routes 257/687/742 in this
// file for the opportunity PATCH/DELETE side.
router.get("/opportunities/:id/activities", authorize({ feature: "crm.opportunities", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const oppId = parseId(req.params.id, "id");
    const [opp] = await rawQuery<any>(
      `SELECT id FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [oppId, scope.companyId]
    );
    if (!opp) throw new NotFoundError("الفرصة غير موجودة");
    const rows = await rawQuery<any>(`SELECT * FROM crm_activities WHERE "opportunityId"=$1 ORDER BY "createdAt" DESC LIMIT 500`, [oppId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "CRM activities error:"); }
});

router.post("/opportunities/:id/activities", authorize({ feature: "crm.opportunities", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createActivitySchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const oppId = parseId(req.params.id, "id");
    const [opp] = await rawQuery<any>(
      `SELECT id FROM crm_opportunities WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [oppId, scope.companyId]
    );
    if (!opp) throw new NotFoundError("الفرصة غير موجودة");
    const { insertId } = await rawExecute(
      `INSERT INTO crm_activities ("opportunityId",type,description,"scheduledAt","createdBy") VALUES ($1,$2,$3,$4,$5)`,
      [oppId, b.type, b.description, b.scheduledAt, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT ca.* FROM crm_activities ca JOIN crm_opportunities co ON co.id = ca."opportunityId" WHERE ca.id=$1 AND co."companyId"=$2 AND co."deletedAt" IS NULL`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "crm.activity.created", entity: "crm_activities", entityId: insertId,
      details: JSON.stringify({ opportunityId: oppId, type: b.type }),
    }).catch((e) => logger.error(e, "crm background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "crm_activities", entityId: insertId,
      after: { opportunityId: oppId, type: b.type, description: b.description },
    }).catch((e) => logger.error(e, "crm background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create activity error:"); }
});

router.get("/pipeline", authorize({ feature: "crm.leads", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const stageRows = await rawQuery<any>(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(value),0) as value FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL GROUP BY stage`,
      [scope.companyId]
    );
    const stageMap = new Map(stageRows.map((r: any) => [r.stage, r]));
    const result: any[] = STAGE_ORDER.map((stage) => {
      const row = stageMap.get(stage);
      return { stage, count: Number(row?.count ?? 0), value: Number(row?.value ?? 0), autoAction: STAGE_AUTO_ACTIONS[stage]?.description };
    });
    res.json({ data: result, total: result.length, page: 1, pageSize: result.length });
  } catch (err) { handleRouteError(err, res, "CRM pipeline error:"); }
});

router.post("/followup-check", authorize({ feature: "crm", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(followupCheckSchema.safeParse(req.body));
    const scope = req.scope!;
    const overdueActivities = await rawQuery<any>(
      `SELECT ca.*, co.title AS "oppTitle", co.stage, co."assignedTo", e.name AS "assigneeName"
       FROM crm_activities ca
       JOIN crm_opportunities co ON co.id=ca."opportunityId" AND co."deletedAt" IS NULL
       LEFT JOIN employees e ON e.id=co."assignedTo" AND e."deletedAt" IS NULL
       WHERE co."companyId"=$1 AND ca."completedAt" IS NULL AND ca."scheduledAt" < NOW()
       ORDER BY ca."scheduledAt" ASC
       LIMIT 500`,
      [scope.companyId]
    );

    const escalated: any[] = [];
    const escalationCandidates = overdueActivities
      .map((activity: any) => ({
        ...activity,
        overdueDays: Math.floor((Date.now() - new Date(activity.scheduledAt).getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .filter((a: any) => a.overdueDays >= 3 && a.assignedTo);

    // Batch-fetch active assignments for all relevant employeeIds
    const uniqueEmployeeIds = [...new Set(escalationCandidates.map((a: any) => a.assignedTo))];
    const assignmentMap = new Map<number, number>();
    if (uniqueEmployeeIds.length > 0) {
      try {
        const asgnRows = await rawQuery<any>(
          `SELECT DISTINCT ON ("employeeId") id, "employeeId" FROM employee_assignments WHERE "employeeId" = ANY($1) AND status='active'`,
          [uniqueEmployeeIds]
        );
        for (const row of asgnRows) {
          assignmentMap.set(row.employeeId, row.id);
        }
      } catch (e) { logger.error(e, "Follow-up batch assignment lookup error:"); }
    }

    for (const activity of escalationCandidates) {
      const assignmentId = assignmentMap.get(activity.assignedTo);
      if (assignmentId) {
        createNotification({
          companyId: scope.companyId,
          assignmentId,
          type: "crm_overdue",
          title: `متابعة متأخرة: ${activity.oppTitle}`,
          body: `نشاط متأخر ${activity.overdueDays} أيام: ${activity.description?.substring(0, 100)}`,
          priority: "high",
          refType: "crm_opportunities",
          refId: activity.opportunityId,
        }).catch((e) => logger.error(e, "crm background task failed"));
      }
      escalated.push({ activityId: activity.id, oppTitle: activity.oppTitle, overdueDays: activity.overdueDays });
    }

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "crm.followup.checked", entity: "crm_activities", entityId: 0,
      details: JSON.stringify({ totalOverdue: overdueActivities.length, escalated: escalated.length }),
    }).catch((e) => logger.error(e, "crm background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "crm_activities", entityId: 0,
      after: { totalOverdue: overdueActivities.length, escalated: escalated.length },
    }).catch((e) => logger.error(e, "crm background task failed"));
    res.json({ totalOverdue: overdueActivities.length, escalated: escalated.length, details: escalated });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/analytics", authorize({ feature: "crm", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const conversionRates: any[] = [];
    let prevCount: number | null = null;
    for (const stage of STAGE_ORDER) {
      const [row] = await rawQuery<any>(`SELECT COUNT(*) as count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage=$2`, [cid, stage]);
      const count = Number(row?.count ?? 0);
      const rate = prevCount !== null && prevCount > 0 ? ((count / prevCount) * 100).toFixed(1) : null;
      conversionRates.push({ stage, count, conversionFromPrev: rate });
      if (!['closed_won', 'closed_lost'].includes(stage)) prevCount = count;
    }

    const [avgDeal] = await rawQuery<any>(
      `SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt"::timestamp - "createdAt"::timestamp))/86400) AS "avgDays" FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage='closed_won'`,
      [cid]
    );
    const [revenue] = await rawQuery<any>(
      `SELECT COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) AS "wonRevenue", COALESCE(SUM(value) FILTER (WHERE status='open'),0) AS "forecast" FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
      [cid]
    );
    const [lostAnalysis] = await rawQuery<any>(
      `SELECT COUNT(*) as "lostCount", COALESCE(SUM(value),0) as "lostValue" FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage='closed_lost'`,
      [cid]
    );

    res.json({
      conversionRates,
      avgDealDays: Number(avgDeal?.avgDays || 0).toFixed(1),
      wonRevenue: Number(revenue?.wonRevenue ?? 0),
      forecastRevenue: Number(revenue?.forecast ?? 0),
      lostCount: Number(lostAnalysis?.lostCount ?? 0),
      lostValue: Number(lostAnalysis?.lostValue ?? 0),
    });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/stats", authorize({ feature: "crm", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [opp] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) as "wonValue", COALESCE(SUM(value) FILTER (WHERE status='open'),0) as "pipelineValue" FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [overdue] = await rawQuery<any>(
      `SELECT COUNT(*) as count FROM crm_activities ca JOIN crm_opportunities co ON co.id=ca."opportunityId" WHERE co."companyId"=$1 AND co."deletedAt" IS NULL AND ca."completedAt" IS NULL AND ca."scheduledAt" < NOW()`,
      [cid]
    );
    res.json({
      totalOpportunities: Number(opp.total), openOpportunities: Number(opp.open),
      wonValue: Number(opp.wonValue), pipelineValue: Number(opp.pipelineValue),
      overdueFollowUps: Number(overdue.count),
    });
  } catch (err) { handleRouteError(err, res, "CRM stats error:"); }
});

export default router;
