import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { haversineKm } from "../lib/algorithms.js";
import { createNotification, createAuditLog, emitEvent, getLegalResponsible, todayISO, currentYear, toDateISO, currentMonthPadded } from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { registerObligation, cancelObligation, markObligationMet } from "../lib/obligationsEngine.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

const router = Router();

const createContractSchema = z.object({
  title: z.string().min(1, "عنوان العقد مطلوب"),
  partyName: z.string().min(1, "اسم الطرف الآخر مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().optional(),
  value: z.coerce.number().optional(),
  ref: z.string().optional(),
  contractType: z.string().optional(),
  partyContact: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const createCaseSchema = z.object({
  title: z.string().min(1, "عنوان القضية مطلوب"),
  caseType: z.string().optional(),
  priority: z.string().optional(),
  caseNumber: z.string().optional(),
  court: z.string().optional(),
  filingDate: z.string().optional(),
  opposingParty: z.string().optional(),
  lawyerName: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const createSessionSchema = z.object({
  sessionDate: z.string().min(1, "تاريخ الجلسة مطلوب"),
  location: z.string().optional(),
  judge: z.string().optional(),
  result: z.string().optional(),
  nextSessionDate: z.string().optional(),
  notes: z.string().optional(),
  hoursSpent: z.coerce.number().optional(),
  hourlyRate: z.coerce.number().optional(),
  courtLat: z.coerce.number().optional(),
  courtLon: z.coerce.number().optional(),
  officeLat: z.coerce.number().optional(),
  officeLon: z.coerce.number().optional(),
});

const createCorrespondenceSchema = z.object({
  direction: z.string().min(1, "اتجاه المراسلة مطلوب"),
  subject: z.string().min(1, "موضوع المراسلة مطلوب"),
  parties: z.string().optional(),
  correspondenceDate: z.string().optional(),
  documentRef: z.string().optional(),
  notes: z.string().optional(),
});

const createCaseCostSchema = z.object({
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  type: z.string().min(1, "نوع التكلفة مطلوب"),
  notes: z.string().optional(),
});

const createJudgmentSchema = z.object({
  judgmentDate: z.string().min(1, "تاريخ الحكم مطلوب"),
  verdict: z.string().min(1, "الحكم مطلوب"),
  amount: z.coerce.number().optional(),
  judgmentType: z.string().optional(),
  paidAmount: z.coerce.number().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  appealWindowDays: z.coerce.number().optional(),
});

const updateContractSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  partyName: z.string().optional(),
  partyContact: z.string().optional().nullable(),
  contractType: z.string().optional().nullable(),
  value: z.coerce.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const updateCaseSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  lawyerName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  court: z.string().optional().nullable(),
});

const updateJudgmentSchema = z.object({
  paidAmount: z.coerce.number().optional(),
  verdict: z.string().optional(),
  notes: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const updateFinancialRiskSchema = z.object({
  financialRisk: z.coerce.number().optional(),
  riskLevel: z.string().optional(),
});

const renewContractSchema = z.object({
  newEndDate: z.string().min(1, "تاريخ نهاية التجديد مطلوب"),
  newValue: z.coerce.number().optional().nullable(),
  notes: z.string().optional(),
});

const terminateContractSchema = z.object({
  reason: z.string().min(1, "سبب إنهاء العقد مطلوب"),
  effectiveDate: z.string().optional().nullable(),
});

const closeCaseSchema = z.object({
  closureReason: z.string().min(1, "سبب الإغلاق مطلوب"),
  outcome: z.string().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Phase C.6 Legal audit
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "renewed"] as const;
const LEGAL_CONTRACT_TRANSITIONS: Record<string, readonly string[]> = {
  // Lifecycle transitions (renew/terminate) go through the dedicated
  // /contracts/:id/{renew,terminate} endpoints. PATCH handles admin
  // corrections only — draft ↔ active is allowed, anything involving
  // terminated/renewed/expired is refused.
  draft:      ["active"],
  active:     ["draft"],
  expired:    [],
  terminated: [],
  renewed:    [],
};

const VALID_CASE_TRANSITIONS: Record<string, readonly string[]> = {
  open:        ['in_progress', 'closed'],
  in_progress: ['judgment', 'closed'],
  judgment:    ['execution', 'closed'],
  execution:   ['closed'],
  closed:      [],
};

const CASE_STATUSES = ["open", "in_progress", "judgment", "execution", "closed"] as const;

router.get("/contracts", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    conditions.push(`"deletedAt" IS NULL`);
    const rows = await rawQuery<any>(`SELECT *, ("endDate"::date - CURRENT_DATE) AS "daysToExpiry" FROM legal_contracts WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal contracts error:"); }
});

router.post("/contracts", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createContractSchema.safeParse(req.body)) as any;

    if (!b.endDate) {
      throw new ValidationError("لا يمكن إنشاء عقد بدون تاريخ نهاية", { field: "endDate", fix: "حدد تاريخ نهاية العقد" });
    }
    const sd = new Date(b.startDate);
    const ed = new Date(b.endDate);
    if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) {
      throw new ValidationError("تواريخ العقد غير صالحة", { field: "startDate", fix: "استخدم تنسيق YYYY-MM-DD" });
    }
    if (ed <= sd) {
      throw new ValidationError(
        "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية",
        { field: "endDate", fix: "تأكد من أن تاريخ النهاية أحدث من تاريخ البداية" }
      );
    }
    if (b.value !== undefined && b.value !== null && b.value !== "") {
      const v = Number(b.value);
      if (!Number.isFinite(v) || v < 0) {
        throw new ValidationError("قيمة العقد غير صالحة", { field: "value", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (b.ref) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM legal_contracts WHERE ref=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.ref, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "مرجع العقد مسجل مسبقاً",
          { field: "ref", fix: "استخدم مرجعاً فريداً أو اترك الحقل فارغاً ليُولَّد تلقائياً" }
        );
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO legal_contracts ("companyId",ref,title,"contractType","partyName","partyContact","startDate","endDate",value,status,notes,"createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, b.ref || null, b.title.trim(), b.contractType || null, b.partyName.trim(), b.partyContact || null, b.startDate, b.endDate, b.value || 0, b.status || 'draft', b.notes || null, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "legal_contracts",
      entityId: insertId,
      after: { title: b.title, partyName: b.partyName, startDate: b.startDate, endDate: b.endDate, value: b.value },
    }).catch((e) => logger.error(e, "legal background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.contract.created",
      entity: "legal_contracts",
      entityId: insertId,
      details: `عقد جديد: ${b.title} — ${b.partyName}`,
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create legal contract error:"); }
});

router.get("/contracts/renewal-alerts", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const alerts90 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL
       AND "endDate" BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '90 days' LIMIT 500`,
      [cid]
    );
    const alerts30 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL
       AND "endDate" BETWEEN CURRENT_DATE + INTERVAL '15 days' AND CURRENT_DATE + INTERVAL '30 days' LIMIT 500`,
      [cid]
    );
    const alerts14 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL
       AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days' LIMIT 500`,
      [cid]
    );

    const all = [...alerts90, ...alerts30, ...alerts14].map((r: any) => {
      const daysLeft = Number(r.daysLeft);
      let severity = 'low';
      if (daysLeft <= 14) severity = 'critical';
      else if (daysLeft <= 30) severity = 'high';
      else severity = 'medium';
      return {
        ...r, daysLeft, severity,
        message: `عقد "${r.title}" مع ${r.partyName} ينتهي خلال ${daysLeft} يوم`,
      };
    });

    res.json({ data: all, total: all.length, page: 1, pageSize: all.length });
  } catch (err) { handleRouteError(err, res, "Renewal alerts error:"); }
});

router.get("/contracts/:id", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT *, ("endDate"::date - CURRENT_DATE) AS "daysToExpiry" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("العقد غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get contract error:"); }
});

router.patch("/contracts/:id", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("العقد غير موجود");
    const b = zodParse(updateContractSchema.safeParse(req.body));

    // State machine: PATCH cannot drive lifecycle transitions (use /renew,
    // /terminate). draft ↔ active is allowed for admin corrections.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!(CONTRACT_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة عقد غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${CONTRACT_STATUSES.join(", ")}` }
        );
      }
      if (["terminated", "renewed", "expired"].includes(b.status)) {
        throw new ConflictError(
          `لا يمكن تغيير حالة العقد إلى ${b.status} عبر PATCH`,
          { field: "status", fix: "استخدم /contracts/:id/renew أو /contracts/:id/terminate" }
        );
      }
      const allowed = LEGAL_CONTRACT_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل العقد من "${existing.status}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
        );
      }
    }

    const effectiveStart = b.startDate || existing.startDate;
    const effectiveEnd = b.endDate || existing.endDate;
    if (effectiveStart && effectiveEnd && new Date(effectiveEnd) <= new Date(effectiveStart)) {
      throw new ValidationError(
        "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية",
        { field: "endDate", fix: "تأكد من أن تاريخ النهاية أحدث من تاريخ البداية" }
      );
    }
    if (b.value !== undefined) {
      const v = Number(b.value);
      if (!Number.isFinite(v) || v < 0) {
        throw new ValidationError("قيمة العقد غير صالحة", { field: "value", fix: "أدخل قيمة غير سالبة" });
      }
    }

    const tracked = ["title","status","partyName","partyContact","contractType","value","startDate","endDate","notes"] as const;
    const colMap: Record<string, string> = {
      title: "title", status: "status", partyName: '"partyName"', partyContact: '"partyContact"',
      contractType: '"contractType"', value: "value", startDate: '"startDate"', endDate: '"endDate"', notes: "notes",
    };
    const sets: string[] = [];
    const params: any[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of tracked) {
      if (b[f] === undefined) continue;
      if (b[f] === existing[f]) continue;
      params.push(b[f]);
      sets.push(`${colMap[f]}=$${params.length}`);
      before[f] = existing[f];
      after[f] = b[f];
    }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id, scope.companyId);
    await rawExecute(`UPDATE legal_contracts SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "legal_contracts",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "legal background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "legal.contract.status_changed" : "legal.contract.updated",
      entity: "legal_contracts",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update contract error:"); }
});

router.delete("/contracts/:id", requirePermission("legal:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT id, title, status FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("العقد غير موجود");
    if (existing.status === "active") {
      throw new ConflictError(
        "لا يمكن حذف عقد نشط",
        { field: "status", fix: "أنهِ العقد عبر /contracts/:id/terminate قبل الحذف" }
      );
    }
    await rawExecute(`UPDATE legal_contracts SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "legal_contracts", entityId: id,
      after: { title: existing.title, status: existing.status },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.contract.deleted",
      entity: "legal_contracts",
      entityId: id,
      before: { title: existing.title, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json({ message: "تم حذف العقد بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete contract error:"); }
});

// ---------------------------------------------------------------------------
// Lifecycle endpoints: renew and terminate
// ---------------------------------------------------------------------------

router.post("/contracts/:id/renew", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { newEndDate, newValue, notes } = zodParse(renewContractSchema.safeParse(req.body ?? {}));
    const [current] = await rawQuery<any>(
      `SELECT id, "endDate", value, "renewalCount" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!current) throw new NotFoundError("العقد غير موجود");
    if (new Date(newEndDate) <= new Date(current.endDate)) {
      throw new ValidationError(
        "تاريخ نهاية التجديد يجب أن يكون بعد تاريخ النهاية الحالي",
        {
          field: "newEndDate",
          fix: "اختر تاريخاً لاحقاً لتاريخ النهاية الحالي",
        },
      );
    }

    const setExtras: Record<string, any> = {
      endDate: newEndDate,
      renewedAt: { raw: "NOW()" },
      renewalCount: { raw: `COALESCE("renewalCount", 0) + 1` },
    };
    if (newValue !== undefined && newValue !== null) {
      setExtras.value = newValue;
    }
    if (notes) {
      setExtras.notes = notes;
    }

    const updated = await applyTransition({
      entity: "legal_contracts",
      id,
      scope,
      action: "legal.contract.renewed",
      fromStates: ["active", "draft", "expired"],
      toState: "active",
      reason: notes ?? undefined,
      setExtras,
      extraWhere: `"deletedAt" IS NULL`,
      after: {
        endDate: newEndDate,
        value: newValue ?? current.value,
        renewalCount: (current.renewalCount ?? 0) + 1,
      },
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "legal_contracts", entityId: id,
      after: { newEndDate, newValue: newValue ?? current.value, renewalCount: (current.renewalCount ?? 0) + 1 },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.contract.renewed",
      entity: "legal_contracts",
      entityId: id,
      details: JSON.stringify({ newEndDate, newValue, renewalCount: (current.renewalCount ?? 0) + 1 }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json({ ...updated, event: "legal.contract.renewed" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Renew contract error:");
  }
});

router.post("/contracts/:id/terminate", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason, effectiveDate } = zodParse(terminateContractSchema.safeParse(req.body ?? {}));

    const updated = await applyTransition({
      entity: "legal_contracts",
      id,
      scope,
      action: "legal.contract.terminated",
      fromStates: ["active", "draft"],
      toState: "terminated",
      reason,
      setExtras: {
        terminationDate: effectiveDate ?? { raw: "NOW()" },
        terminationReason: reason,
        endDate: effectiveDate ?? { raw: "CURRENT_DATE" },
      },
      extraWhere: `"deletedAt" IS NULL`,
      after: {
        terminationReason: reason,
        terminationDate: effectiveDate ?? new Date().toISOString(),
      },
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "legal_contracts", entityId: id,
      after: { status: "terminated", terminationReason: reason, terminationDate: effectiveDate ?? new Date().toISOString() },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.contract.terminated",
      entity: "legal_contracts",
      entityId: id,
      details: JSON.stringify({ reason, effectiveDate }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json({ ...updated, event: "legal.contract.terminated" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Terminate contract error:");
  }
});

router.get("/cases", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    conditions.push(`"deletedAt" IS NULL`);
    const rows = await rawQuery<any>(`SELECT * FROM legal_cases WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal cases error:"); }
});

router.post("/cases", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createCaseSchema.safeParse(req.body)) as any;

    if (!b.caseType || typeof b.caseType !== "string" || !b.caseType.trim()) {
      throw new ValidationError("نوع القضية مطلوب", { field: "caseType", fix: "اختر نوع القضية (مدنية، تجارية، جنائية، ...)" });
    }
    if (b.priority && !["low", "medium", "high", "critical"].includes(b.priority)) {
      throw new ValidationError(
        `أولوية غير صالحة: ${b.priority}`,
        { field: "priority", fix: "اختر من: low, medium, high, critical" }
      );
    }
    if (b.caseNumber) {
      const [dup] = await rawQuery<any>(
        `SELECT id FROM legal_cases WHERE "caseNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.caseNumber, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "رقم القضية مسجل مسبقاً",
          { field: "caseNumber", fix: "استخدم رقماً فريداً أو اتركه فارغاً ليُولَّد تلقائياً" }
        );
      }
    }

    // Always resolve a responsible lawyer: if caller didn't supply one, fall back
    // to legal_manager → general_manager → owner so the case never lands in
    // open-with-NULL-assignee limbo.
    let lawyerName: string | null = b.lawyerName || null;
    const responsible = await getLegalResponsible(scope.companyId);
    if (!lawyerName && responsible) lawyerName = responsible.employeeName;

    const { insertId } = await rawExecute(
      `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType",court,"filingDate","opposingParty","lawyerName",status,priority,description,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, b.caseNumber, b.title, b.caseType, b.court, b.filingDate, b.opposingParty, lawyerName, b.status || 'open', b.priority || 'medium', b.description, b.notes ?? null]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_cases", entityId: insertId,
      after: { title: b.title, caseType: b.caseType, status: 'open', priority: b.priority || 'medium', lawyerName },
    }).catch((e) => logger.error(e, "legal background task failed"));

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "legal.case.created", entity: "legal_cases", entityId: insertId,
      details: `قضية جديدة: ${b.title || b.caseNumber || ''}`,
    }).catch((e) => logger.error(e, "legal background task failed"));

    // Notify the responsible lawyer so the case appears in their inbox.
    if (responsible) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: responsible.assignmentId,
        type: "legal_case_assigned",
        title: "قضية قانونية جديدة مسندة إليك",
        body: `تم إسناد القضية "${b.title || b.caseNumber || insertId}" إليك — الرجاء المتابعة`,
        priority: b.priority === 'high' ? 'high' : 'normal',
        refType: "legal_case",
        refId: insertId,
        actionUrl: `/legal/cases/${insertId}`,
      }).catch((e) => logger.error(e, "legal background task failed"));
    }

    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create legal case error:"); }
});

router.get("/cases/:id", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("القضية غير موجودة");

    const sessions = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE "caseId"=$1 AND "deletedAt" IS NULL ORDER BY "sessionDate" DESC LIMIT 500`, [row.id]);

    res.json({ ...row, sessions, allowedTransitions: VALID_CASE_TRANSITIONS[row.status] || [] });
  } catch (err) { handleRouteError(err, res, "Get case error:"); }
});

router.patch("/cases/:id", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القضية غير موجودة");
    const b = zodParse(updateCaseSchema.safeParse(req.body));

    if (b.status !== undefined && b.status !== existing.status) {
      if (!(CASE_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة قضية غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${CASE_STATUSES.join(", ")}` }
        );
      }
      const allowed = VALID_CASE_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن الانتقال من "${existing.status}" إلى "${b.status}"`,
          {
            field: "status",
            fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}`,
            meta: { allowedTransitions: allowed },
          }
        );
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.priority !== undefined) { params.push(b.priority); sets.push(`priority=$${params.length}`); }
    if (b.lawyerName !== undefined) { params.push(b.lawyerName); sets.push(`"lawyerName"=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.court !== undefined) { params.push(b.court); sets.push(`court=$${params.length}`); }
    if (sets.length <= 1 && params.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE legal_cases SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "legal_cases", entityId: id,
      before: { status: existing.status }, after: { status: b.status || existing.status },
    }).catch((e) => logger.error(e, "legal background task failed"));

    // Lifecycle events + closure notification so no case ends silently.
    if (b.status !== undefined && b.status !== existing.status) {
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: `legal.case.${b.status}`, entity: "legal_cases", entityId: id,
        details: `القضية #${id} انتقلت من ${existing.status} إلى ${b.status}`,
        before: { status: existing.status }, after: { status: b.status },
      }).catch((e) => logger.error(e, "legal background task failed"));

      if (b.status === 'closed') {
        const responsible = await getLegalResponsible(scope.companyId);
        if (responsible) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: responsible.assignmentId,
            type: "legal_case_closed",
            title: "قضية قانونية مغلقة",
            body: `تم إغلاق القضية "${existing.title || existing.caseNumber || id}"`,
            priority: "normal",
            refType: "legal_case",
            refId: id,
            actionUrl: `/legal/cases/${id}`,
          }).catch((e) => logger.error(e, "legal background task failed"));
        }
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("القضية غير موجودة");
    res.json({ ...row, allowedTransitions: VALID_CASE_TRANSITIONS[row.status] || [] });
  } catch (err) { handleRouteError(err, res, "Update case error:"); }
});

router.delete("/cases/:id", requirePermission("legal:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT id, title, status FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القضية غير موجودة");
    if (["open", "in_progress", "judgment", "execution"].includes(existing.status)) {
      throw new ConflictError(
        `لا يمكن حذف قضية بحالة "${existing.status}"`,
        { field: "status", fix: "أغلق القضية عبر /cases/:id/close قبل الحذف" }
      );
    }
    await rawExecute(`UPDATE legal_cases SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "legal_cases", entityId: id,
      after: { title: existing.title, status: existing.status },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.case.deleted",
      entity: "legal_cases",
      entityId: id,
      before: { title: existing.title, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json({ message: "تم حذف القضية بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete case error:"); }
});

/** Close a legal case — cancels all outstanding obligations and emits event */
router.post("/cases/:id/close", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(closeCaseSchema.safeParse(req.body ?? {}));

    const updated = await applyTransition<any>({
      entity: "legal_cases",
      id,
      scope,
      action: "legal.case.closed",
      fromStates: ["open", "in_progress", "on_hold", "judgment", "execution"],
      toState: "closed",
      reason: b.closureReason,
      extraWhere: '"deletedAt" IS NULL',
      onApply: async (_row, _client) => {
        // Cancel all open obligations tied to this case
        await cancelObligation(scope.companyId, "legal_case", id);
      },
      after: { reason: b.closureReason, outcome: b.outcome },
    });

    res.json({ ...updated, event: "legal.case.closed" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Close case error:");
  }
});

router.get("/cases/:caseId/sessions", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const [legalCase] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!legalCase) throw new NotFoundError("القضية غير موجودة");
    const rows = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE "caseId"=$1 AND "deletedAt" IS NULL ORDER BY "sessionDate" DESC LIMIT 500`, [caseId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal sessions error:"); }
});

router.post("/cases/:caseId/sessions", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSessionSchema.safeParse(req.body)) as any;
    const caseId = parseId(req.params.caseId, "caseId");

    const sd = new Date(b.sessionDate);
    if (Number.isNaN(sd.getTime())) {
      throw new ValidationError("تاريخ الجلسة غير صالح", { field: "sessionDate", fix: "استخدم تنسيق YYYY-MM-DD" });
    }

    const [legalCase] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!legalCase) throw new NotFoundError("القضية غير موجودة أو غير مصرح بها");
    if (legalCase.status === "closed") {
      throw new ConflictError(
        "لا يمكن إضافة جلسات لقضية مغلقة",
        { field: "status", fix: "أعد فتح القضية أولاً" }
      );
    }

    let distanceToCourtKm: number | null = null;
    if (b.courtLat && b.courtLon && b.officeLat && b.officeLon) {
      distanceToCourtKm = haversineKm(
        Number(b.officeLat), Number(b.officeLon),
        Number(b.courtLat), Number(b.courtLon)
      );
    }

    const { insertId } = await rawExecute(
      `INSERT INTO legal_sessions ("caseId","sessionDate",location,judge,result,"nextSessionDate",notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [caseId, b.sessionDate, b.location, b.judge, b.result, b.nextSessionDate, b.notes]
    );

    if (legalCase.lawyerName) {
      try {
        const [lawyerEmp] = await rawQuery<any>(
          `SELECT ea.id AS "assignmentId" FROM employees e
           JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea.status='active'
           WHERE ea."companyId"=$1 AND e.name ILIKE $2 LIMIT 1`,
          [scope.companyId, `%${legalCase.lawyerName}%`]
        );
        if (lawyerEmp?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: lawyerEmp.assignmentId,
            type: "legal_session",
            title: `جلسة قضائية: ${legalCase.title}`,
            body: `جلسة بتاريخ ${b.sessionDate} — ${b.location || legalCase.court || ''} ${distanceToCourtKm ? `(${distanceToCourtKm.toFixed(1)} كم)` : ''}`,
            priority: legalCase.priority === 'high' ? 'high' : 'normal',
            refType: "legal_sessions",
            refId: insertId,
          }).catch((e) => logger.error(e, "legal background task failed"));
        }
      } catch (notifErr) { logger.error(notifErr, "Lawyer notification error:"); }
    }

    if (legalCase.status === 'open') {
      await applyTransition({
        entity: "legal_cases",
        id: caseId,
        scope,
        action: "legal.case.in_progress",
        fromStates: ["open"],
        toState: "in_progress",
        extraWhere: '"deletedAt" IS NULL',
        reason: `جلسة جديدة بتاريخ ${b.sessionDate}`,
      });
    }

    // Register obligation for this hearing
    try {
      const sessionDate = new Date(b.sessionDate);
      if (sessionDate > new Date()) {
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "legal_case",
          entityId: caseId,
          obligationType: "hearing",
          title: `جلسة قضائية — ${legalCase.title} (${legalCase.caseNumber || `#${caseId}`})`,
          dueAt: sessionDate.toISOString(),
          metadata: { sessionId: insertId, court: legalCase.court, location: b.location, judge: b.judge },
          dedupeKey: `legal-session-${insertId}`,
          escalationSteps: [
            { hoursAfterDue: 0, notifyRole: "lawyer" },
            { hoursAfterDue: 24, notifyRole: "legal_manager" },
          ],
        });
      }
      // If a next session date is set, register it too
      if (b.nextSessionDate) {
        const nextDate = new Date(b.nextSessionDate);
        if (nextDate > new Date()) {
          await registerObligation({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            entityType: "legal_case",
            entityId: caseId,
            obligationType: "hearing",
            title: `جلسة قادمة — ${legalCase.title}`,
            dueAt: nextDate.toISOString(),
            metadata: { court: legalCase.court, priorSessionId: insertId },
            dedupeKey: `legal-case-${caseId}-next-${b.nextSessionDate}`,
          });
        }
      }
    } catch (obErr) { logger.error(obErr, "Legal session obligation failed:"); }

    let invoiceId: number | null = null;
    let invoiceError: string | null = null;
    let journalEntryId: number | null = null;
    if (b.hoursSpent && b.hourlyRate) {
      const billingAmount = Number(b.hoursSpent) * Number(b.hourlyRate);
      const [vatSetting] = await rawQuery<any>(`SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'vat_rate' LIMIT 1`, [scope.companyId]);
      const vatRate = vatSetting ? Number(vatSetting.value) / 100 : 0.15;
      const vatAmount = billingAmount * vatRate;
      const monthNum = currentMonthPadded();
      const yearShort = String(currentYear()).slice(2);
      const ref = `INV-LEGAL-${yearShort}${monthNum}-${insertId}`;
      const { legalEngine } = await import("../lib/engines/index.js");
      try {
        legalEngine.requestInvoiceCreation(
          { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
          {
            ref,
            description: `أتعاب قانونية - جلسة ${b.sessionDate} - ${legalCase.title}`,
            subtotal: billingAmount,
            vatAmount,
            total: billingAmount + vatAmount,
            dueDate: toDateISO(new Date(Date.now() + 30 * 86400000)),
            sourceType: "legal_sessions",
            sourceId: insertId,
          }
        );
        invoiceId = insertId;
      } catch (invoiceErr) {
        logger.error(invoiceErr, "Failed to request legal session invoice:");
        invoiceError = "فشل إنشاء فاتورة الأتعاب";
      }

      try {
        const glResult = await legalEngine.postLegalSessionFeeGL(
          { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId ?? scope.userId },
          { id: insertId, caseTitle: legalCase.title, sessionDate: b.sessionDate, billingAmount, vatAmount }
        );
        journalEntryId = glResult.journalId;
      } catch (glErr) {
        logger.error(glErr, "Legal session fee GL failed:");
      }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_case_sessions", entityId: insertId,
      after: { caseId, sessionDate: b.sessionDate, location: b.location, judge: b.judge },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.session.created",
      entity: "legal_sessions",
      entityId: insertId,
      details: JSON.stringify({ caseId, sessionDate: b.sessionDate, location: b.location, judge: b.judge }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE id=$1 AND "deletedAt" IS NULL`, [insertId]);
    res.status(201).json({ ...row, distanceToCourtKm, invoiceId, invoiceError, journalEntryId, calendarTaskCreated: !!legalCase.lawyerName });
  } catch (err) { handleRouteError(err, res, "Create session error:"); }
});

router.get("/stats", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [contracts] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active FROM legal_contracts WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [cases] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COUNT(*) FILTER (WHERE status='in_progress') as "inProgress" FROM legal_cases WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [expiring] = await rawQuery<any>(`SELECT COUNT(*) as count FROM legal_contracts WHERE "companyId"=$1 AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND status='active' AND "deletedAt" IS NULL`, [cid]);
    const [sessions] = await rawQuery<any>(`SELECT COUNT(*) as upcoming FROM legal_sessions ls JOIN legal_cases lc ON lc.id=ls."caseId" WHERE lc."companyId"=$1 AND lc."deletedAt" IS NULL AND ls."sessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`, [cid]);
    const [contingent] = await rawQuery<any>(`SELECT COALESCE(SUM("financialRisk"),0) as total FROM legal_cases WHERE "companyId"=$1 AND status NOT IN ('closed') AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "legal query failed"); return [{ total: 0 }]; });
    res.json({
      totalContracts: Number(contracts.total), activeContracts: Number(contracts.active),
      totalCases: Number(cases.total), openCases: Number(cases.open), inProgressCases: Number(cases.inProgress),
      expiringContracts: Number(expiring.count), upcomingSessions: Number(sessions.upcoming),
      contingentLiabilities: Number(contingent?.total || 0),
    });
  } catch (err) { handleRouteError(err, res, "Legal stats error:"); }
});

router.get("/cases/:caseId/correspondence", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!lc) throw new NotFoundError("القضية غير موجودة");
    const rows = await rawQuery<any>(`SELECT * FROM legal_correspondence WHERE "caseId"=$1 ORDER BY "correspondenceDate" DESC LIMIT 500`, [caseId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal correspondence error:"); }
});

router.post("/cases/:caseId/correspondence", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const b = zodParse(createCorrespondenceSchema.safeParse(req.body)) as any;
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!lc) throw new NotFoundError("القضية غير موجودة");
    const { insertId } = await rawExecute(
      `INSERT INTO legal_correspondence ("caseId","companyId",direction,subject,parties,"correspondenceDate","documentRef",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [caseId, scope.companyId, b.direction || 'outgoing', b.subject, b.parties, b.correspondenceDate || todayISO(), b.documentRef || null, b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_correspondence WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_case_correspondence", entityId: insertId,
      after: { caseId, direction: b.direction, subject: b.subject },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.correspondence.created",
      entity: "legal_case_correspondence",
      entityId: insertId,
      details: JSON.stringify({ caseId, direction: b.direction, subject: b.subject }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create correspondence error:"); }
});

// ─── Case Costs — مصاريف القضية ─────────────────────────────────────────────
router.post("/cases/:caseId/costs", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const b = zodParse(createCaseCostSchema.safeParse(req.body));

    const [legalCase] = await rawQuery<any>(
      `SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [caseId, scope.companyId]
    );
    if (!legalCase) throw new NotFoundError("القضية غير موجودة");

    // Update the case's financialRisk to accumulate costs
    await rawExecute(
      `UPDATE legal_cases SET "financialRisk"=COALESCE("financialRisk",0)+$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`,
      [b.amount, caseId, scope.companyId]
    );

    // Post the case cost to GL
    try {
      const { legalEngine } = await import("../lib/engines/index.js");
      await legalEngine.postCaseCostGL(
        { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
        { caseId, amount: b.amount, type: b.type },
      );
    } catch (glErr) {
      logger.error(glErr, "Legal case cost GL error:");
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_case_costs", entityId: caseId,
      after: { caseId, amount: b.amount, type: b.type, notes: b.notes },
    }).catch((e) => logger.error(e, "legal background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.case.cost_added",
      entity: "legal_cases",
      entityId: caseId,
      details: `مصروف قانوني: ${b.type} — ${b.amount.toLocaleString()} ريال — قضية #${caseId}`,
    }).catch((e) => logger.error(e, "legal background task failed"));

    const [updated] = await rawQuery<any>(
      `SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [caseId, scope.companyId]
    );
    res.status(201).json({ caseId, amount: b.amount, type: b.type, notes: b.notes ?? null, case: updated });
  } catch (err) { handleRouteError(err, res, "Create case cost error:"); }
});

router.get("/cases/:caseId/judgments", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!lc) throw new NotFoundError("القضية غير موجودة");
    const rows = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE "caseId"=$1 AND "companyId"=$2 ORDER BY "judgmentDate" DESC LIMIT 500`, [caseId, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal judgments error:"); }
});

router.post("/cases/:caseId/judgments", requirePermission("legal:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = parseId(req.params.caseId, "caseId");
    const b = zodParse(createJudgmentSchema.safeParse(req.body)) as any;
    if (b.amount !== undefined && b.amount !== null) {
      const amt = Number(b.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        throw new ValidationError("قيمة الحكم غير صالحة", { field: "amount", fix: "أدخل قيمة غير سالبة" });
      }
    }
    const [lc] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!lc) throw new NotFoundError("القضية غير موجودة");
    const { insertId } = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO legal_judgments ("caseId","companyId","judgmentDate","judgmentType",verdict,amount,"paidAmount","dueDate",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [caseId, scope.companyId, b.judgmentDate, b.judgmentType || 'judgment', b.verdict, b.amount || 0, b.paidAmount || 0, b.dueDate || null, b.notes || null]
      );
      const insertId = insertRes.rows[0]?.id ?? 0;
      if (b.amount && Number(b.amount) > 0) {
        await client.query(`UPDATE legal_cases SET "financialRisk"=COALESCE("financialRisk",0)+$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3`, [Number(b.amount), caseId, scope.companyId]);
      }
      return { insertId };
    });

    // Register appeal deadline obligation (30 days after judgment by default)
    try {
      const judgmentDate = new Date(b.judgmentDate);
      const appealDeadline = new Date(judgmentDate);
      appealDeadline.setDate(appealDeadline.getDate() + Number(b.appealWindowDays || 30));
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "legal_case",
        entityId: caseId,
        obligationType: "approval",
        title: `مهلة الاستئناف — ${lc.title} (${lc.caseNumber || `#${caseId}`})`,
        dueAt: appealDeadline.toISOString(),
        metadata: { judgmentId: insertId, judgmentDate: b.judgmentDate, verdict: b.verdict, amount: b.amount },
        dedupeKey: `legal-judgment-${insertId}-appeal`,
        escalationSteps: [
          { hoursAfterDue: 0, notifyRole: "legal_manager" },
          { hoursAfterDue: 24, notifyRole: "general_manager" },
        ],
      });

      // Register payment obligation if judgment has a payment dueDate
      if (b.dueDate && Number(b.amount) > 0) {
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "legal_case",
          entityId: caseId,
          obligationType: "payment",
          title: `تنفيذ حكم — ${lc.title} (${Number(b.amount).toLocaleString()} ريال)`,
          dueAt: new Date(b.dueDate).toISOString(),
          metadata: { judgmentId: insertId, amount: b.amount },
          dedupeKey: `legal-judgment-${insertId}-payment`,
          escalationSteps: [
            { hoursAfterDue: 0, notifyRole: "finance_manager" },
            { hoursAfterDue: 72, notifyRole: "general_manager" },
          ],
        });
      }

      await emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "legal.case.judgment",
        entity: "legal_judgments",
        entityId: insertId,
        details: `حكم بقضية ${lc.title}: ${b.verdict || ""} — ${b.amount || 0} ريال`,
      });
    } catch (obErr) { logger.error(obErr, "Legal judgment obligation failed:"); }

    if (b.amount && Number(b.amount) > 0) {
      const { legalEngine } = await import("../lib/engines/index.js");
      const isInFavor = b.verdict === "in_favor" || b.verdict === "لصالح الشركة";
      legalEngine.postSettlementGL(
        { companyId: scope.companyId, branchId: scope.branchId ?? 0, createdBy: scope.userId },
        { caseId, amount: Number(b.amount), isInFavor },
      ).catch((e: unknown) => logger.error(e, "Legal settlement GL error:"));
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_case_judgments", entityId: insertId,
      after: { caseId, judgmentDate: b.judgmentDate, judgmentType: b.judgmentType, verdict: b.verdict, amount: b.amount },
    }).catch((e) => logger.error(e, "legal background task failed"));

    const [row] = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create judgment error:"); }
});

router.patch("/cases/:caseId/judgments/:id", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const caseId = parseId(req.params.caseId, "caseId");
    const b = zodParse(updateJudgmentSchema.safeParse(req.body));

    const [existingJ] = await rawQuery<any>(
      `SELECT * FROM legal_judgments WHERE id=$1 AND "caseId"=$2 AND "companyId"=$3`,
      [id, caseId, scope.companyId]
    );
    if (!existingJ) throw new NotFoundError("الحكم غير موجود");

    if (b.paidAmount !== undefined) {
      const p = Number(b.paidAmount);
      if (!Number.isFinite(p) || p < 0) {
        throw new ValidationError("مبلغ السداد غير صالح", { field: "paidAmount", fix: "أدخل قيمة غير سالبة" });
      }
      if (p > Number(existingJ.amount || 0)) {
        throw new ValidationError(
          "مبلغ السداد أكبر من قيمة الحكم",
          { field: "paidAmount", fix: `المبلغ الأقصى هو ${existingJ.amount}` }
        );
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.paidAmount !== undefined) { params.push(b.paidAmount); sets.push(`"paidAmount"=$${params.length}`); }
    if (b.verdict !== undefined) { params.push(b.verdict); sets.push(`verdict=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    params.push(id); params.push(caseId); params.push(scope.companyId);
    await rawExecute(`UPDATE legal_judgments SET ${sets.join(",")} WHERE id=$${params.length - 2} AND "caseId"=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    // Mark payment obligation met if fully paid
    if (row && Number(row.paidAmount || 0) >= Number(row.amount || 0) && Number(row.amount || 0) > 0) {
      await markObligationMet(
        (req.scope as any).companyId,
        "legal_case",
        caseId,
        "payment"
      ).catch((e) => logger.error(e, "legal background task failed"));
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "legal_case_judgments", entityId: id,
      after: { caseId, paidAmount: b.paidAmount, verdict: b.verdict, dueDate: b.dueDate },
    }).catch((e) => logger.error(e, "legal background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.judgment.updated",
      entity: "legal_judgments",
      entityId: id,
      details: JSON.stringify({ caseId, paidAmount: b.paidAmount, verdict: b.verdict, dueDate: b.dueDate }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update judgment error:"); }
});

router.patch("/cases/:id/financial-risk", requirePermission("legal:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { financialRisk, riskLevel } = zodParse(updateFinancialRiskSchema.safeParse(req.body));
    const [existing] = await rawQuery<any>(
      `SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("القضية غير موجودة");

    if (financialRisk !== undefined) {
      const fr = Number(financialRisk);
      if (!Number.isFinite(fr) || fr < 0) {
        throw new ValidationError("قيمة المخاطرة المالية غير صالحة", { field: "financialRisk", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (riskLevel && !["low", "medium", "high", "critical"].includes(riskLevel)) {
      throw new ValidationError(
        `مستوى المخاطرة غير صالح: ${riskLevel}`,
        { field: "riskLevel", fix: "اختر من: low, medium, high, critical" }
      );
    }

    await rawExecute(
      `UPDATE legal_cases SET "financialRisk"=$1, "riskLevel"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [financialRisk || 0, riskLevel || 'medium', id, scope.companyId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "legal_cases",
      entityId: id,
      before: { financialRisk: existing.financialRisk, riskLevel: existing.riskLevel },
      after: { financialRisk: financialRisk || 0, riskLevel: riskLevel || 'medium' },
    }).catch((e) => logger.error(e, "legal background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "legal.case.risk_updated",
      entity: "legal_cases",
      entityId: id,
      details: JSON.stringify({ financialRisk: financialRisk || 0, riskLevel: riskLevel || 'medium' }),
    }).catch((e) => logger.error(e, "legal background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Financial risk update error:"); }
});

router.get("/sessions/:id", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT s.*, lc."caseNumber", lc.title AS "caseTitle"
       FROM legal_sessions s
       JOIN legal_cases lc ON lc.id = s."caseId" AND lc."companyId" = $2 AND lc."deletedAt" IS NULL
       WHERE s.id = $1`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الجلسة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Legal session detail error:"); }
});

router.get("/judgments/:id", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT j.*, lc."caseNumber", lc.title AS "caseTitle"
       FROM legal_judgments j
       JOIN legal_cases lc ON lc.id = j."caseId" AND lc."companyId" = $2 AND lc."deletedAt" IS NULL
       WHERE j.id = $1`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الحكم غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Legal judgment detail error:"); }
});

router.get("/correspondence/:id", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT c.*, lc."caseNumber", lc.title AS "caseTitle"
       FROM legal_correspondence c
       JOIN legal_cases lc ON lc.id = c."caseId" AND lc."companyId" = $2 AND lc."deletedAt" IS NULL
       WHERE c.id = $1`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المراسلة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Legal correspondence detail error:"); }
});

router.get("/sessions/upcoming", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 14;
    const rows = await rawQuery<any>(
      `SELECT ls.*, lc.title AS "caseTitle", lc."lawyerName", lc.priority,
              (ls."sessionDate"::date - CURRENT_DATE) AS "daysUntil"
       FROM legal_sessions ls
       JOIN legal_cases lc ON lc.id=ls."caseId"
       WHERE lc."companyId"=$1 AND lc."deletedAt" IS NULL AND ls."sessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL
       ORDER BY ls."sessionDate" ASC`,
      [scope.companyId, days]
    );
    const alerts = rows.map((r: any) => ({
      ...r,
      alertLevel: Number(r.daysUntil) <= 1 ? 'critical' : Number(r.daysUntil) <= 7 ? 'high' : 'medium',
    }));
    res.json({ data: alerts, total: alerts.length });
  } catch (err) { handleRouteError(err, res, "Upcoming sessions error:"); }
});

router.get("/judgments/financial-report", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT lj.*, lc.title AS "caseTitle", lc."caseNumber", lc."riskLevel"
       FROM legal_judgments lj
       JOIN legal_cases lc ON lc.id=lj."caseId"
       WHERE lj."companyId"=$1
       ORDER BY lj."judgmentDate" DESC`,
      [scope.companyId]
    );
    const [totals] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) AS "totalAmount", COALESCE(SUM("paidAmount"),0) AS "totalPaid"
       FROM legal_judgments WHERE "companyId"=$1`,
      [scope.companyId]
    );
    const [contingent] = await rawQuery<any>(
      `SELECT COALESCE(SUM("financialRisk"),0) AS total FROM legal_cases WHERE "companyId"=$1 AND status NOT IN ('closed') AND "deletedAt" IS NULL`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "legal query failed"); return [{ total: 0 }]; });
    res.json({
      data: rows,
      totalAmount: Number(totals?.totalAmount || 0),
      totalPaid: Number(totals?.totalPaid || 0),
      outstanding: Number(totals?.totalAmount || 0) - Number(totals?.totalPaid || 0),
      contingentLiabilities: Number(contingent?.total || 0),
    });
  } catch (err) { handleRouteError(err, res, "Judgments financial report error:"); }
});

router.get("/financial-report", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cases = await rawQuery<any>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM("financialRisk"),0) AS risk
       FROM legal_cases WHERE "companyId"=$1 AND "deletedAt" IS NULL GROUP BY status`,
      [scope.companyId]
    );
    const [totals] = await rawQuery<any>(
      `SELECT COUNT(*) AS "totalCases",
              COALESCE(SUM("financialRisk"),0) AS "totalRisk"
       FROM legal_cases WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [judgments] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) AS "totalJudgments",
              COALESCE(SUM("paidAmount"),0) AS "totalPaid"
       FROM legal_judgments WHERE "companyId"=$1`,
      [scope.companyId]
    ).catch((e) => { logger.error(e, "legal query failed"); return [{ totalJudgments: 0, totalPaid: 0 }]; });
    res.json({
      data: {
        byStatus: cases,
        totalCases: Number(totals?.totalCases || 0),
        totalRisk: Number(totals?.totalRisk || 0),
        totalJudgments: Number(judgments?.totalJudgments || 0),
        totalPaid: Number(judgments?.totalPaid || 0),
        outstanding: Number(judgments?.totalJudgments || 0) - Number(judgments?.totalPaid || 0),
      }
    });
  } catch (err) { handleRouteError(err, res, "Legal financial report error:"); }
});

export default router;
