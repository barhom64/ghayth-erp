import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError, ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, createNotification, emitEvent, getLegalResponsible, currentPeriod, currentYear, generateRef } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { MANAGER_ROLES , HR_APPROVAL_ROLES} from "../lib/rbacCatalog.js";
import type { Request as ExpressRequest } from "express";

// Local row shapes for the requests + request_types + workflows tables.
// These tables aren't modelled in @workspace/db yet; the shapes evolve
// next to the queries that consume them.
type RequestScope = NonNullable<ExpressRequest["scope"]>;

interface RequestRow extends Record<string, unknown> {
  id: number;
  companyId?: number | null;
  branchId?: number | null;
  typeId?: number | null;
  number?: string | null;
  title: string;
  description: string;
  requesterName?: string | null;
  requester?: string | null;
  priority?: string | null;
  status: string;
  currentApprover?: number | string | null;
  data?: unknown;
  attachments?: unknown;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
  typeName?: string | null;
  // Annotated at runtime by validateRequestTransition when a manager
  // overrides the assignee. Sentinel only — never persisted.
  _isOverride?: boolean;
}

interface RequestTypeRow {
  id: number;
  companyId?: number | null;
  name: string;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  fields?: unknown;
  defaultPriority?: string | null;
  approvalChainId?: number | null;
  createdAt: string;
}

interface WorkflowRow {
  id: number;
  companyId: number;
  name: string;
  description?: string | null;
  triggerType?: string | null;
  steps?: unknown;
  isActive?: boolean | null;
  createdAt: string;
}

interface AttachmentInput {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

/* ── Zod Schemas ───────────────────────────────────────────────── */

const createRequestSchema = z.object({
  typeId: z.coerce.number({ invalid_type_error: "نوع الطلب يجب أن يكون رقماً" }).optional(),
  requesterName: z.string().optional(),
  requester: z.string().optional(),
  title: z.string({ required_error: "عنوان الطلب مطلوب" }).min(1, "عنوان الطلب مطلوب"),
  description: z.string({ required_error: "وصف الطلب مطلوب" }).min(1, "وصف الطلب مطلوب"),
  priority: z.enum(["low", "medium", "high", "critical"], { invalid_type_error: "أولوية غير صالحة" }).optional(),
  data: z.any().optional(),
  attachments: z.array(z.any()).optional(),
});

const createRequestTypeSchema = z.object({
  name: z.string({ required_error: "اسم نوع الطلب مطلوب" }).min(1, "اسم نوع الطلب مطلوب"),
  description: z.string().optional(),
  category: z.string().optional(),
  requiredFields: z.any().optional(),
  approvalFlow: z.any().optional(),
  isActive: z.boolean().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string({ required_error: "اسم سير العمل مطلوب" }).min(1, "اسم سير العمل مطلوب"),
  description: z.string().optional(),
  steps: z.any().optional(),
});

const updateRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  currentApprover: z.any().optional(),
  attachments: z.any().optional(),
  notes: z.string().optional(),
  returnReason: z.string().optional(),
});

const approveRequestSchema = z.object({
  notes: z.string().optional(),
});

const rejectRequestSchema = z.object({
  notes: z.string({ required_error: "يجب ذكر سبب الرفض" }).min(1, "يجب ذكر سبب الرفض"),
});

const returnRequestSchema = z.object({
  notes: z.string({ required_error: "يجب ذكر سبب الإرجاع" }).min(1, "يجب ذكر سبب الإرجاع"),
});

const convertRequestSchema = z.object({
  targetType: z.enum(["maintenance", "purchase", "case"], { required_error: "نوع التحويل مطلوب", invalid_type_error: "نوع التحويل غير صالح. المتاح: maintenance, purchase, case" }),
});

const VALID_REQUEST_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_review", "approved", "rejected", "returned"],
  in_review: ["approved", "rejected", "returned"],
  returned: ["pending"],
  draft: ["pending"],
  approved: ["closed"],
  rejected: [],
  closed: [],
};

async function validateRequestTransition(
  id: number,
  companyId: number,
  targetStatus: string,
  scope: RequestScope,
): Promise<RequestRow> {
  const [request] = await rawQuery<RequestRow>(
    `SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL`,
    [id, companyId]
  );
  if (!request) throw new NotFoundError("الطلب غير موجود");

  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (allowed && !allowed.includes(targetStatus)) {
    throw new ConflictError(
      `لا يمكن تغيير الحالة من "${request.status}" إلى "${targetStatus}" — انتقال غير مصرح`,
      { field: "status" }
    );
  }

  if (['approved', 'rejected', 'returned', 'in_review'].includes(targetStatus)) {
    const isCurrentApprover = String(request.currentApprover) === String(scope.activeAssignmentId);
    const isManager = MANAGER_ROLES.includes(scope.role);
    if (!isCurrentApprover && !isManager) {
      throw new ForbiddenError("غير مصرح لك بتغيير حالة هذا الطلب");
    }
    if (!isCurrentApprover && isManager) {
      request._isOverride = true;
    }
  }

  if (targetStatus === "approved") {
    const data = typeof request.data === "string" ? JSON.parse(request.data || "{}") : (request.data || {});
    const attachments = typeof request.attachments === "string" ? JSON.parse(request.attachments || "[]") : (request.attachments || []);
    const validationErrors: string[] = [];

    const requiredFields = data._requiredFields as string[] | undefined;
    if (requiredFields) {
      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === "") {
          validationErrors.push(`الحقل المطلوب "${field}" غير مكتمل`);
        }
      }
    }
    if (data._requiresAttachments && (!attachments || attachments.length === 0)) {
      validationErrors.push("المرفقات الإلزامية غير مرفقة");
    }

    if (data._budgetAccountCode && data._budgetAmount) {
      const period = currentPeriod();
      const [budget] = await rawQuery<{ amount: number | string; used: number | string }>(
        `SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`,
        [companyId, data._budgetAccountCode, period]
      );
      if (!budget) {
        validationErrors.push(`لا توجد ميزانية معرّفة للحساب "${data._budgetAccountCode}" — لا يمكن الاعتماد`);
      } else {
        const budgetAmount = Number(budget.amount);
        if (budgetAmount <= 0) {
          validationErrors.push("الميزانية المحددة صفر أو سالبة — لا يمكن الاعتماد");
        } else {
          const newUsed = Number(budget.used) + Number(data._budgetAmount);
          const utilization = (newUsed / budgetAmount) * 100;
          if (utilization > 110) {
            validationErrors.push(`تجاوز الميزانية (${Math.round(utilization)}%) — لا يمكن الاعتماد`);
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new ValidationError(
        `لا يمكن الاعتماد — شروط غير مستوفاة:\n${validationErrors.map(e => `• ${e}`).join("\n")}`,
      );
    }
  }

  return request;
}

const router = Router();

async function logCommunication(companyId: number, direction: string, subject: string, body: string, relatedType: string, relatedId: number) {
  try {
    await rawExecute(
      `INSERT INTO communications_log ("companyId", channel, direction, "fromNumber", "toNumber", subject, body, status, "relatedType", "relatedId")
       VALUES ($1, 'internal', $2, 'system', 'system', $3, $4, $5, $6, $7)`,
      [companyId, direction, subject, body, direction === 'inbound' ? 'received' : 'sent', relatedType, relatedId]
    );
  } catch (e) {
    logger.error(e, "Failed to log communication:");
  }
}

router.get("/", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const isManager = HR_APPROVAL_ROLES.includes(scope.role);
    let rows;
    if (isManager) {
      rows = await rawQuery(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE (r."companyId"=$1 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL ORDER BY r."createdAt" DESC LIMIT 500`, [scope.companyId]);
    } else {
      rows = await rawQuery(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE (r."companyId"=$1 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL AND (r."requesterId"::text=$2 OR r."currentApprover"=$3) ORDER BY r."createdAt" DESC LIMIT 500`, [scope.companyId, String(scope.activeAssignmentId), String(scope.activeAssignmentId)]);
    }
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

// RBAC v2: requests are also self-service via requests.my (selfService:true)
// so any employee can create their own request unconditionally.
router.post("/", authorize({ feature: "requests.my", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createRequestSchema.safeParse(req.body));
    const scope = req.scope!;
    const { typeId, requesterName, requester, title, description, priority, data, attachments } = parsed as any;
    const resolvedRequesterName = requesterName || requester;

    if (!title || !String(title).trim()) {
      throw new ValidationError("عنوان الطلب مطلوب", {
        field: "title",
        fix: "أدخل عنواناً مختصراً للطلب",
      });
    }
    if (!description || !String(description).trim()) {
      throw new ValidationError("وصف الطلب مطلوب", {
        field: "description",
        fix: "اكتب تفاصيل الطلب ليتمكن المختص من معالجته",
      });
    }
    if (priority && !["low", "medium", "high", "critical"].includes(priority)) {
      throw new ValidationError(`أولوية غير صالحة: ${priority}`, {
        field: "priority",
        fix: "اختر من: low, medium, high, critical",
      });
    }
    // FK pre-check on typeId so a stale id yields a clean field-tagged error
    // instead of a deep 23503.
    if (typeId) {
      const [rt] = await rawQuery<{ id: number }>(
        `SELECT id FROM request_types WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) LIMIT 1`,
        [Number(typeId), scope.companyId]
      );
      if (!rt) {
        throw new ValidationError(`نوع الطلب رقم ${typeId} غير موجود`, {
          field: "typeId",
          fix: "اختر نوع طلب مفعّلًا من القائمة",
        });
      }
    }

    const enforcedRequesterId = scope.activeAssignmentId;
    let validatedAttachments: AttachmentInput[] = [];
    if (attachments && Array.isArray(attachments)) {
      validatedAttachments = attachments.slice(0, 10).filter((a: unknown): a is Partial<AttachmentInput> => {
        const obj = a as Partial<AttachmentInput> | null;
        return !!obj && typeof obj.name === "string" && typeof obj.size === "number" && obj.size <= 5 * 1024 * 1024;
      }).map((a) => ({ name: a.name!, size: a.size!, type: a.type || "", dataUrl: a.dataUrl || "" }));
    }
    const [seqRow] = await rawQuery<{ seq: number | string }>(`SELECT nextval('request_number_seq') AS seq`).catch((e) => { logger.error(e, "requests query failed"); return [{ seq: Math.floor(Math.random() * 900000 + 100000) }] as { seq: number }[]; });
    const ref = generateRef("REQ", Number(seqRow.seq));

    const r = await rawExecute(
      `INSERT INTO requests ("typeId", "requesterId", "requesterName", title, description, status, priority, data, "companyId", attachments, ref, "requestDate", "branchId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_DATE,$12)`,
      [typeId ? Number(typeId) : null, enforcedRequesterId, resolvedRequesterName ?? null, String(title).trim(), String(description).trim(), "pending", priority || "medium", data ? JSON.stringify(data) : '{}', scope.companyId, JSON.stringify(validatedAttachments), ref, scope.branchId || null]
    );
    await logCommunication(
      scope.companyId, 'inbound',
      `طلب جديد: ${title} (${ref})`,
      `تم إنشاء طلب جديد بواسطة ${resolvedRequesterName || 'مستخدم'} - الأولوية: ${priority || 'متوسطة'} - ${description || ''}`,
      'request', r.insertId
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "requests", entityId: r.insertId,
      after: { typeId: typeId ? Number(typeId) : null, title, description, priority: priority || "medium", ref },
    }).catch((e) => logger.error(e, "requests background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "request.created", entity: "approval_requests", entityId: r.insertId }).catch((e) => logger.error(e, "requests background task failed"));
    const [row] = await rawQuery<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, ref, title, priority: priority || "medium", status: "pending" });
  } catch (err) { handleRouteError(err, res, "Create request error:"); }
});

router.get("/catalog", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const role = scope.role;
    const jobTitle = scope.jobTitle;

    interface RequestTypeListRow {
      id: number;
      name: string;
      description?: string | null;
      category?: string | null;
      requiredFields?: unknown;
      approvalFlow?: unknown;
    }
    const allTypes = await rawQuery<RequestTypeListRow>(
      `SELECT id, name, description, category, "requiredFields", "approvalFlow"
       FROM request_types
       WHERE "isActive" = true AND ("companyId" = $1 OR "companyId" IS NULL)
       ORDER BY category, name`,
      [scope.companyId]
    );

    const catalogItems = [
      { key: "leave", name: "طلب إجازة", icon: "Calendar", category: "hr", description: "تقديم طلب إجازة بأنواعها المختلفة", path: "/hr/leaves" },
      { key: "salary_advance", name: "طلب سلفة", icon: "DollarSign", category: "finance", description: "طلب سلفة على الراتب", path: "/finance/salary-advances" },
      { key: "letter", name: "طلب خطاب رسمي", icon: "FileSignature", category: "hr", description: "طلب خطاب تعريف أو شهادة خبرة", path: "/hr/official-letters" },
      { key: "custody", name: "طلب عهدة", icon: "KeyRound", category: "finance", description: "طلب عهدة مالية أو عينية", path: "/finance/custodies" },
      { key: "maintenance", name: "طلب صيانة", icon: "Wrench", category: "operations", description: "طلب صيانة لمعدات أو مرافق", path: "/support" },
      { key: "purchase", name: "طلب شراء", icon: "ShoppingCart", category: "finance", description: "طلب شراء مواد أو خدمات", path: "/finance/purchase-orders" },
      { key: "tech_support", name: "طلب دعم تقني", icon: "Headphones", category: "support", description: "طلب مساعدة تقنية أو IT", path: "/support" },
      { key: "legal_consultation", name: "استشارة قانونية", icon: "Scale", category: "legal", description: "طلب استشارة قانونية من الإدارة القانونية", path: "/legal/cases" },
    ];

    const roleBasedAccess: Record<string, string[]> = {
      owner: catalogItems.map(c => c.key),
      general_manager: catalogItems.map(c => c.key),
      hr_manager: ["leave", "salary_advance", "letter", "custody", "maintenance", "tech_support"],
      finance_manager: ["leave", "salary_advance", "custody", "purchase", "maintenance", "tech_support"],
      branch_manager: ["leave", "salary_advance", "letter", "custody", "maintenance", "purchase", "tech_support"],
      fleet_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      warehouse_manager: ["leave", "salary_advance", "letter", "maintenance", "purchase", "tech_support"],
      legal_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support", "legal_consultation"],
      projects_manager: ["leave", "salary_advance", "letter", "maintenance", "purchase", "tech_support"],
      support_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      crm_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      employee: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
    };

    let allowedKeys = new Set(roleBasedAccess[role] || roleBasedAccess["employee"]);

    const jobTitleLower = (jobTitle || "").toLowerCase();
    if (jobTitleLower.includes("محام") || jobTitleLower.includes("قانون") || jobTitleLower.includes("legal")) {
      allowedKeys.add("legal_consultation");
    }
    if (jobTitleLower.includes("محاسب") || jobTitleLower.includes("مالي") || jobTitleLower.includes("finance") || jobTitleLower.includes("accountant")) {
      allowedKeys.add("custody");
      allowedKeys.add("purchase");
      allowedKeys.add("salary_advance");
    }
    if (jobTitleLower.includes("مهندس") || jobTitleLower.includes("فني") || jobTitleLower.includes("engineer") || jobTitleLower.includes("technician")) {
      allowedKeys.add("maintenance");
      allowedKeys.add("purchase");
    }

    const filteredCatalog = catalogItems.filter(c => allowedKeys.has(c.key));

    const filteredCustomTypes = allTypes;

    res.json({
      catalog: filteredCatalog,
      customTypes: filteredCustomTypes,
      role,
      jobTitle,
    });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.get("/types", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL) ORDER BY name LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.post("/types", authorize({ feature: "requests", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createRequestTypeSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, description, category, requiredFields, approvalFlow, isActive } = parsed as any;
    const r = await rawExecute(
      `INSERT INTO request_types (name, description, category, "requiredFields", "approvalFlow", "isActive", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, description, category, requiredFields ? JSON.stringify(requiredFields) : '[]', approvalFlow ? JSON.stringify(approvalFlow) : '[]', isActive !== false, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "request_types", entityId: r.insertId, after: { name, category, isActive: isActive !== false } }).catch((e) => logger.error(e, "requests background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "request_type.created", entity: "request_types", entityId: r.insertId }).catch((e) => logger.error(e, "requests background task failed"));
    const [row] = await rawQuery<RequestTypeRow>(`SELECT * FROM request_types WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.get("/workflows", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM workflows WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.post("/workflows", authorize({ feature: "requests", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createWorkflowSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, description, steps } = parsed as any;
    const r = await rawExecute(
      `INSERT INTO workflows (name, description, steps, "companyId") VALUES ($1,$2,$3,$4)`,
      [name, description, steps ? JSON.stringify(steps) : '[]', scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "workflows", entityId: r.insertId, after: { name, description } }).catch((e) => logger.error(e, "requests background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "workflow.created", entity: "workflow_definitions", entityId: r.insertId }).catch((e) => logger.error(e, "requests background task failed"));
    const [row] = await rawQuery<WorkflowRow>(`SELECT * FROM workflows WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.get("/stats", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [total] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]);
    const [pending] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE status='pending' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]);
    const [approved] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE status='approved' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]);
    const [types] = await rawQuery(`SELECT COUNT(*) as count FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    res.json({
      totalRequests: Number(total.count),
      pendingRequests: Number(pending.count),
      approvedRequests: Number(approved.count),
      activeTypes: Number(types.count),
    });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.get("/:id", authorize({ feature: "requests", action: "view", resource: { table: "requests", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<RequestRow>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الطلب غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.patch("/:id", authorize({ feature: "requests", action: "update", resource: { table: "requests", idParam: "id" } }), async (req, res) => {
  try {
    const parsed = zodParse(updateRequestSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = parsed;

    const [existing] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM requests WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الطلب غير موجود");

    if (["closed", "rejected"].includes(existing.status) && b.status === undefined) {
      throw new ConflictError(
        `لا يمكن تعديل طلب في حالة "${existing.status}"`,
        { field: "status" }
      );
    }

    let previousStatus: string | null = existing.status;
    let patchIsOverride = false;
    if (b.status !== undefined) {
      const request = await validateRequestTransition(id, scope.companyId, b.status, scope);
      previousStatus = request?.status ?? null;
      patchIsOverride = request?._isOverride === true;
      if (patchIsOverride && !b.notes) {
        throw new ValidationError("يجب تحديد سبب التجاوز عند التدخل في طلب ليس مسنداً إليك", { field: "notes" });
      }
    }

    // Build extras for non-status fields
    const extras: Record<string, any> = {};
    if (b.title !== undefined) extras.title = b.title;
    if (b.description !== undefined) extras.description = b.description;
    if (b.priority !== undefined) extras.priority = b.priority;
    if (b.currentApprover !== undefined) extras.currentApprover = b.currentApprover;
    if (b.attachments !== undefined) extras.attachments = JSON.stringify(b.attachments);
    if (b.notes !== undefined) extras.notes = b.notes;
    if (b.returnReason !== undefined) extras.returnReason = b.returnReason;

    if (b.status !== undefined) {
      // Narrow once for the nested closures below — Object.entries / onApply
      // capture this in their own scopes and TS can't prove b.status stays
      // defined there.
      const targetStatus: string = b.status;
      // Status change — route through applyTransition
      if (['approved', 'rejected', 'returned'].includes(targetStatus)) {
        extras.reviewedBy = scope.userId;
        extras.reviewedAt = { raw: "NOW()" };
      }

      const statusAction = `request.status.${targetStatus}`;
      const allowedFromStates = Object.entries(VALID_REQUEST_TRANSITIONS)
        .filter(([, targets]) => targets.includes(targetStatus))
        .map(([from]) => from);

      const updated = await applyTransition({
        entity: "requests",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: statusAction,
        fromStates: allowedFromStates.length > 0 ? allowedFromStates : undefined,
        toState: targetStatus,
        reason: b.notes || b.returnReason || undefined,
        setExtras: Object.keys(extras).length > 0 ? extras : undefined,
        extraWhere: `"deletedAt" IS NULL`,
        after: { overrideLogged: patchIsOverride },
        onApply: async (row, client) => {
          if (['approved', 'rejected', 'in_review', 'returned'].includes(targetStatus)) {
            const statusLabels: Record<string, string> = { approved: 'معتمد', rejected: 'مرفوض', in_review: 'قيد المراجعة', returned: 'مُرجع' };
            await logCommunication(
              scope.companyId, 'outbound',
              `تحديث طلب: ${row?.title || '#' + id} — ${statusLabels[targetStatus] || targetStatus}`,
              `تم تحديث حالة الطلب رقم ${id} إلى "${statusLabels[targetStatus] || targetStatus}" - ${b.notes || row?.title || ''}`,
              'request', id
            );
            await client.query(
              `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "actionByName", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              ['request', id, targetStatus, b.notes || b.returnReason || null, scope.userId, null, scope.companyId]
            );
            if (patchIsOverride) {
              await createAuditLog({
                companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
                action: "workflow_override", entity: "requests", entityId: id,
                before: { status: previousStatus },
                after: { status: targetStatus, overriddenBy: scope.userId },
                reason: b.notes || b.returnReason || "تدخل دور أعلى",
              });
            }
          }
        },
      });
      const [row] = await rawQuery<RequestRow>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL`, [id, scope.companyId]);
      res.json(row ?? updated);
    } else {
      // No status change — simple field update
      if (Object.keys(extras).length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [col, val] of Object.entries(extras)) {
        params.push(val);
        const colName = /[A-Z]/.test(col) ? `"${col}"` : col;
        sets.push(`${colName}=$${params.length}`);
      }
      params.push(id); params.push(scope.companyId);
      const result = await rawExecute(`UPDATE requests SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
      if (result.affectedRows === 0) throw new NotFoundError("الطلب غير موجود");
      const [row] = await rawQuery<RequestRow>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL`, [id, scope.companyId]);
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "request.updated", entity: "approval_requests", entityId: id }).catch((e) => logger.error(e, "requests background task failed"));
      res.json(row);
    }
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "requests");
  }
});

// RBAC v2: approval action — approval limit applies if configured on
// the role for requests:approve.
router.post("/:id/approve", authorize({ feature: "requests", action: "approve", resource: { table: "requests", idParam: "id" } }), async (req, res) => {
  try {
    const parsed = zodParse(approveRequestSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { notes } = parsed;

    const request = await validateRequestTransition(id, scope.companyId, "approved", scope);
    const isOverride = request?._isOverride === true;
    if (isOverride && !notes) throw new ValidationError("يجب تحديد سبب التجاوز عند التدخل في طلب ليس مسنداً إليك", { field: "notes" });

    const updated = await applyTransition({
      entity: "requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "request.approved",
      fromStates: VALID_REQUEST_TRANSITIONS[request.status]?.includes("approved")
        ? [request.status]
        : ["pending", "in_review"],
      toState: "approved",
      reason: notes || undefined,
      setExtras: {
        notes: notes || null,
        reviewedBy: scope.userId,
        reviewedAt: { raw: "NOW()" },
        approvedAt: { raw: "NOW()" },
        approvedBy: scope.userId,
      },
      after: { overrideLogged: isOverride },
      onApply: async (row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
          [id, isOverride ? 'approved_override' : 'approved', isOverride ? `[تدخل] ${notes}` : (notes || null), scope.userId, scope.companyId]
        );
        if (isOverride) {
          await createAuditLog({
            companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
            action: "workflow_override", entity: "requests", entityId: id,
            before: { status: request.status, currentApprover: request.currentApprover },
            after: { status: "approved", overriddenBy: scope.userId },
            reason: notes || "تدخل دور أعلى",
          });
        }
        await logCommunication(scope.companyId, 'outbound', `طلب معتمد: ${row?.title || '#'+id}`, `تمت الموافقة على الطلب رقم ${id}${notes ? ' - '+notes : ''}`, 'request', id);
      },
      notifications: request.requesterId ? [{
        assignmentId: Number(request.requesterId),
        type: "request_approved",
        title: "تمت الموافقة على طلبك",
        body: `طلبك "${request.title || '#' + id}" تمت الموافقة عليه${notes ? `. ملاحظات: ${notes}` : ""}`,
        priority: "medium",
        refType: "request",
        refId: id,
      }] : [],
    });
    res.json({ ...updated, actualImpact: { statusChange: { from: request.status, to: "approved" }, notifications: ["إشعار لمقدم الطلب بالاعتماد"], overrideLogged: isOverride } });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "requests");
  }
});

router.post("/:id/reject", authorize({ feature: "requests", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(rejectRequestSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { notes } = parsed;
    if (!notes) throw new ValidationError("يجب ذكر سبب الرفض", { field: "notes" });

    const request = await validateRequestTransition(id, scope.companyId, "rejected", scope);
    const isOverride = request?._isOverride === true;

    const updated = await applyTransition({
      entity: "requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "request.rejected",
      fromStates: VALID_REQUEST_TRANSITIONS[request.status]?.includes("rejected")
        ? [request.status]
        : ["pending", "in_review"],
      toState: "rejected",
      reason: notes,
      setExtras: {
        notes,
        reviewedBy: scope.userId,
        reviewedAt: { raw: "NOW()" },
      },
      after: { reason: notes, overrideLogged: isOverride },
      onApply: async (row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
          [id, isOverride ? 'rejected_override' : 'rejected', isOverride ? `[تدخل] ${notes}` : notes, scope.userId, scope.companyId]
        );
        if (isOverride) {
          await createAuditLog({
            companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
            action: "workflow_override", entity: "requests", entityId: id,
            before: { status: request.status, currentApprover: request.currentApprover },
            after: { status: "rejected", overriddenBy: scope.userId },
            reason: notes,
          });
        }
        await logCommunication(scope.companyId, 'outbound', `طلب مرفوض: ${row?.title || '#'+id}`, `تم رفض الطلب رقم ${id} - السبب: ${notes}`, 'request', id);
      },
      notifications: request.requesterId ? [{
        assignmentId: Number(request.requesterId),
        type: "request_rejected",
        title: "تم رفض طلبك",
        body: `طلبك "${request.title || '#' + id}" تم رفضه. السبب: ${notes}`,
        priority: "high",
        refType: "request",
        refId: id,
      }] : [],
    });
    res.json({ ...updated, actualImpact: { statusChange: { from: request.status, to: "rejected" }, notifications: ["إشعار لمقدم الطلب بالرفض"], overrideLogged: isOverride } });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "requests");
  }
});

router.post("/:id/return", authorize({ feature: "requests", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(returnRequestSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { notes } = parsed;
    if (!notes) throw new ValidationError("يجب ذكر سبب الإرجاع", { field: "notes" });

    const request = await validateRequestTransition(id, scope.companyId, "returned", scope);
    const isOverride = request?._isOverride === true;

    const updated = await applyTransition({
      entity: "requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "request.returned",
      fromStates: VALID_REQUEST_TRANSITIONS[request.status]?.includes("returned")
        ? [request.status]
        : ["pending", "in_review"],
      toState: "returned",
      reason: notes,
      setExtras: {
        returnReason: notes,
        notes,
        reviewedBy: scope.userId,
        reviewedAt: { raw: "NOW()" },
      },
      after: { reason: notes, overrideLogged: isOverride },
      onApply: async (row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
          [id, isOverride ? 'returned_override' : 'returned', isOverride ? `[تدخل] ${notes}` : notes, scope.userId, scope.companyId]
        );
        if (isOverride) {
          await createAuditLog({
            companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
            action: "workflow_override", entity: "requests", entityId: id,
            before: { status: request.status, currentApprover: request.currentApprover },
            after: { status: "returned", overriddenBy: scope.userId },
            reason: notes,
          });
        }
        await logCommunication(scope.companyId, 'outbound', `طلب مُرجع: ${row?.title || '#'+id}`, `تم إرجاع الطلب رقم ${id} للتعديل - السبب: ${notes}`, 'request', id);
      },
      notifications: request.requesterId ? [{
        assignmentId: Number(request.requesterId),
        type: "request_returned",
        title: "تم إرجاع طلبك للتعديل",
        body: `طلبك "${request.title || '#' + id}" تم إرجاعه. السبب: ${notes}`,
        priority: "high",
        refType: "request",
        refId: id,
      }] : [],
    });
    res.json({ ...updated, actualImpact: { statusChange: { from: request.status, to: "returned" }, notifications: ["إشعار لمقدم الطلب بالإرجاع"], overrideLogged: isOverride } });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "requests");
  }
});

router.get("/:id/actions", authorize({ feature: "requests", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT aa.*, u.email as "actionByEmail" FROM approval_actions aa LEFT JOIN users u ON aa."actionBy"=u.id WHERE aa."entityType"='request' AND aa."entityId"=$1 AND aa."companyId"=$2 ORDER BY aa."createdAt" DESC`,
      [id, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.delete("/:id", authorize({ feature: "requests", action: "delete", resource: { table: "requests", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Only the requester (while still pending/draft) or a manager may delete.
    // Approved/rejected/closed/converted requests are terminal — deleting them
    // would erase the audit trail of an already-processed decision and orphan
    // any downstream entities created via convert.
    const [request] = await rawQuery<{ id: number; status: string; requesterId: number | string; convertedTo?: string | null }>(
      `SELECT id, status, "requesterId", "convertedTo" FROM requests WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!request) throw new NotFoundError("الطلب غير موجود");

    const isManager = MANAGER_ROLES.includes(scope.role);
    const isOwner = String(request.requesterId) === String(scope.activeAssignmentId);
    if (!isManager && !isOwner) {
      throw new ForbiddenError("غير مصرح لك بحذف هذا الطلب");
    }

    if (!["pending", "draft", "returned"].includes(request.status)) {
      throw new ConflictError(
        `لا يمكن حذف طلب في حالة "${request.status}". استخدم الإلغاء بدلاً من الحذف.`,
        { field: "status" }
      );
    }
    if (request.convertedTo) {
      throw new ConflictError("لا يمكن حذف طلب تم تحويله إلى كيان آخر", { field: "convertedTo" });
    }

    const result = await rawExecute(`UPDATE requests SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("الطلب غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "request",
      entityId: id,
      action: "request_deleted",
      before: { status: request.status, requesterId: request.requesterId },
    }).catch((e) => logger.error(e, "requests background task failed"));

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "request.deleted", entity: "approval_requests", entityId: id }).catch((e) => logger.error(e, "requests background task failed"));
    res.json({ message: "تم حذف الطلب بنجاح" });
  } catch (err) { handleRouteError(err, res, "requests"); }
});

router.post("/:id/convert", authorize({ feature: "requests", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(convertRequestSchema.safeParse(req.body ?? {}));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { targetType } = parsed;

    if (!["maintenance", "purchase", "case"].includes(targetType)) {
      throw new ValidationError("نوع التحويل غير صالح. المتاح: maintenance, purchase, case", { field: "targetType" });
    }

    const [request] = await rawQuery<RequestRow & { convertedTo?: string | null }>(
      `SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL) AND r."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!request) throw new NotFoundError("الطلب غير موجود");
    if (request.status !== "approved") throw new ConflictError("يمكن تحويل الطلبات المعتمدة فقط", { field: "status" });
    if (request.convertedTo) throw new ConflictError("هذا الطلب تم تحويله مسبقاً", { field: "convertedTo" });

    let createdId: number | null = null;
    let targetEndpoint = "";

    const updated = await applyTransition({
      entity: "requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "request.converted",
      fromStates: ["approved"],
      toState: "closed",
      setExtras: {
        convertedType: targetType,
        closedAt: { raw: "NOW()" },
        closedBy: scope.userId,
      },
      after: { convertedType: targetType },
      onApply: async (_row, client) => {
        if (targetType === "maintenance") {
          const { supportEngine } = await import("../lib/engines/index.js");
          const { insertId } = await supportEngine.createTicket({
            companyId: scope.companyId,
            title: `صيانة: ${request.title}`,
            description: request.description || request.title,
            priority: request.priority || "medium",
          });
          createdId = insertId;
          targetEndpoint = `/support/${insertId}`;
        } else if (targetType === "purchase") {
          const { financialEngine } = await import("../lib/engines/index.js");
          const { insertId } = await financialEngine.createPurchaseOrder({
            companyId: scope.companyId,
            ref: `PO-REQ-${id}`,
            description: request.title + (request.description ? `: ${request.description}` : ""),
            requestedBy: scope.userId,
          });
          createdId = insertId;
          targetEndpoint = `/finance/purchase-orders/${insertId}`;
        } else if (targetType === "case") {
          const legalResp = await getLegalResponsible(scope.companyId);
          const { legalEngine } = await import("../lib/engines/index.js");
          const { insertId } = await legalEngine.createCase({
            companyId: scope.companyId,
            title: `قضية: ${request.title}`,
            description: request.description || request.title,
            priority: request.priority || "medium",
            caseType: "civil",
            lawyerName: legalResp?.employeeName ?? null,
          });
          createdId = insertId;
          targetEndpoint = `/legal/cases/${insertId}`;
          if (legalResp?.assignmentId) {
            await createNotification({
              companyId: scope.companyId,
              assignmentId: legalResp.assignmentId,
              type: "legal_case_created",
              title: "قضية قانونية جديدة",
              body: `تم إنشاء قضية جديدة من طلب رقم ${id}: ${request.title}`,
              priority: "high",
              refType: "legal_case",
              refId: insertId,
            }).catch((e) => logger.error(e, "requests background task failed"));
          }
          emitEvent({
            companyId: scope.companyId,
            branchId: scope.branchId,
            userId: scope.userId,
            action: "legal.case.created",
            entity: "legal_case",
            entityId: insertId,
            after: { title: `قضية: ${request.title}`, lawyerName: legalResp?.employeeName ?? null, sourceRequestId: id },
          }).catch((e) => logger.error(e, "requests background task failed"));
        }

        await client.query(
          `UPDATE requests SET "convertedTo" = $1 WHERE id = $2 AND "companyId" = $3`,
          [createdId, id, scope.companyId]
        );
        await client.query(
          `INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('request',$1,'converted',$2,$3,$4)`,
          [id, `تحويل إلى: ${targetType} (معرف: ${createdId})`, scope.userId, scope.companyId]
        );
        await logCommunication(
          scope.companyId, 'outbound',
          `طلب محوّل: ${request.title}`,
          `تم تحويل الطلب رقم ${id} إلى ${targetType} (معرف: ${createdId})`,
          'request', id
        );
      },
    });

    res.json({
      success: true,
      message: `تم تحويل الطلب بنجاح إلى ${targetType}`,
      createdId,
      targetType,
      targetEndpoint,
    });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "requests");
  }
});

export default router;
