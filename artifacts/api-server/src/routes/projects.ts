import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { criticalPathLength } from "../lib/algorithms.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import {
  createNotification,
  createAuditLog,
  checkFinancialPeriodOpen,
  emitEvent,
  todayISO,
  currentYear,
  toDateISO,
  currentMonthPadded,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { registerObligation, cancelObligation, markObligationMet } from "../lib/obligationsEngine.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// ZOD VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1, "اسم المشروع مطلوب"),
  description: z.string().optional().nullable(),
  clientId: z.coerce.number().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  startDate: z.string().min(1, "تاريخ بداية المشروع مطلوب"),
  endDate: z.string().min(1, "تاريخ نهاية المشروع مطلوب"),
  budget: z.union([z.coerce.number(), z.string()]).optional().nullable(),
  status: z.string().optional(),
  phases: z.array(z.object({
    name: z.string().min(1, "اسم المرحلة مطلوب"),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
  })).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, "اسم المشروع مطلوب").optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  budget: z.union([z.coerce.number(), z.string()]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  managerId: z.coerce.number().optional().nullable(),
  spentAmount: z.union([z.coerce.number(), z.string()]).optional().nullable(),
}).partial();

const createPhaseSchema = z.object({
  name: z.string().min(1, "اسم المرحلة مطلوب"),
  orderIndex: z.coerce.number().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const createTaskSchema = z.object({
  title: z.string().min(1, "عنوان المهمة مطلوب"),
  description: z.string().optional().nullable(),
  assigneeId: z.coerce.number().optional().nullable(),
  phaseId: z.coerce.number().optional().nullable(),
  priority: z.string().optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.union([z.coerce.number(), z.string()]).optional().nullable(),
  dependsOn: z.array(z.coerce.number()).optional(),
});

const updateTaskSchema = z.object({
  status: z.string().optional(),
  progress: z.union([z.coerce.number(), z.string()]).optional(),
  actualHours: z.union([z.coerce.number(), z.string()]).optional(),
}).partial();

const createMilestoneSchema = z.object({
  title: z.string().min(1, "عنوان المعلَم مطلوب"),
  description: z.string().optional().nullable(),
  targetDate: z.string().min(1, "تاريخ المعلَم المستهدف مطلوب"),
  completedDate: z.string().optional().nullable(),
});

const updateMilestoneSchema = z.object({
  title: z.string().min(1, "عنوان المعلَم مطلوب").optional(),
  status: z.string().optional(),
  targetDate: z.string().optional().nullable(),
  completedDate: z.string().optional().nullable(),
}).partial();

const createRiskSchema = z.object({
  title: z.string().min(1, "عنوان المخاطرة مطلوب"),
  description: z.string().optional().nullable(),
  probability: z.union([z.coerce.number(), z.string()]).optional(),
  impact: z.union([z.coerce.number(), z.string()]).optional(),
  mitigationPlan: z.string().optional().nullable(),
  responsibleId: z.coerce.number().optional().nullable(),
});

const updateRiskSchema = z.object({
  title: z.string().min(1, "عنوان المخاطرة مطلوب").optional(),
  status: z.string().optional(),
  mitigationPlan: z.string().optional().nullable(),
  probability: z.union([z.coerce.number(), z.string()]).optional(),
  impact: z.union([z.coerce.number(), z.string()]).optional(),
}).partial();

const createResourceSchema = z.object({
  employeeId: z.coerce.number().optional().nullable(),
  taskId: z.coerce.number().optional().nullable(),
  role: z.string().optional(),
  allocatedHours: z.union([z.coerce.number(), z.string()]).optional(),
  budgetAllocated: z.union([z.coerce.number(), z.string()]).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const createCostSchema = z.object({
  description: z.string().min(1, "وصف التكلفة مطلوب"),
  amount: z.union([z.coerce.number(), z.string()]).refine((v) => Number(v) > 0, { message: "المبلغ يجب أن يكون أكبر من صفر" }),
  category: z.string().optional(),
  costDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  sourceType: z.string().optional(),
});

const impactPreviewSchema = z.object({
  managerId: z.coerce.number().optional().nullable(),
  budget: z.union([z.coerce.number(), z.string()]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
});

const closeProjectSchema = z.object({});

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Phase C.5 Projects audit
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_STATUSES = ["planning", "planned", "draft", "active", "in_progress", "on_hold", "completed", "cancelled", "blocked"] as const;
const PROJECT_TRANSITIONS: Record<string, readonly string[]> = {
  // completion goes through /close (handled by lifecycleEngine). PATCH can
  // only move through the non-terminal states below.
  planning:    ["active", "in_progress", "cancelled", "on_hold"],
  planned:     ["active", "in_progress", "cancelled", "on_hold"],
  draft:       ["planning", "active", "cancelled"],
  active:      ["on_hold", "blocked", "in_progress"],
  in_progress: ["active", "on_hold", "blocked"],
  on_hold:     ["active", "in_progress", "cancelled"],
  blocked:     ["active", "in_progress", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const PHASE_TRANSITIONS: Record<string, readonly string[]> = {
  pending:     ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled", "review"] as const;
const TASK_TRANSITIONS: Record<string, readonly string[]> = {
  todo:        ["in_progress", "blocked", "cancelled", "done"],
  in_progress: ["review", "done", "blocked", "cancelled"],
  review:      ["done", "in_progress", "cancelled"],
  blocked:     ["todo", "in_progress", "cancelled"],
  done:        ["in_progress"], // re-open
  cancelled:   [],
};

const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
const MILESTONE_TRANSITIONS: Record<string, readonly string[]> = {
  pending:     ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const RISK_STATUSES = ["open", "mitigated", "realized", "closed"] as const;
const RISK_TRANSITIONS: Record<string, readonly string[]> = {
  open:      ["mitigated", "realized", "closed"],
  mitigated: ["open", "closed", "realized"],
  realized:  ["mitigated", "closed"],
  closed:    [],
};

// Impact preview — shows exactly what will happen when the project is created
router.post("/impact-preview", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(impactPreviewSchema.safeParse(req.body ?? {}));
    const { managerId, budget, startDate, endDate, type } = b;

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    if (budget && Number(budget) > 0) {
      items.push({
        category: "مالي",
        label: "الميزانية المخصصة",
        value: `${Number(budget).toLocaleString("ar-SA")} ر.س سيتم حجزها في مركز تكلفة المشروع`,
        severity: "info",
      });
    }

    if (startDate && endDate) {
      const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
      items.push({
        category: "زمني",
        label: "المدة الإجمالية",
        value: `${days} يوم (${(days / 30).toFixed(1)} شهر)`,
        severity: days > 365 ? "warning" : "info",
      });
      items.push({
        category: "التزامات",
        label: "معلم إغلاق تلقائي",
        value: `سيتم تسجيل التزام إغلاق المشروع في ${new Date(endDate).toLocaleDateString("ar-SA")}`,
        severity: "info",
      });
    }

    if (managerId) {
      const [manager] = await rawQuery<Record<string, unknown>>(
        `SELECT e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`, [Number(managerId), scope.companyId]
      );
      const [[active]] = await Promise.all([
        rawQuery<Record<string, unknown>>(
          `SELECT COUNT(*)::int AS c FROM projects
           WHERE "managerId" = $1 AND "companyId" = $2
             AND "deletedAt" IS NULL AND status NOT IN ('completed','cancelled')`,
          [Number(managerId), scope.companyId]
        ),
      ]);
      const activeCount = Number(active?.c || 0);
      items.push({
        category: "الموارد",
        label: "مدير المشروع",
        value: `${manager?.name || "مدير"} يدير حالياً ${activeCount} مشروع آخر${activeCount >= 5 ? " — عبء كبير" : ""}`,
        severity: activeCount >= 5 ? "warning" : "info",
      });
    }

    items.push({
      category: "تقارير",
      label: "لوحات التحكم",
      value: "سيظهر المشروع في لوحة PMO والتقارير التنفيذية فوراً",
      severity: "info",
    });

    items.push({
      category: "التقويم",
      label: "الأحداث المجدولة",
      value: "ستُدرج المعالم والمهام تلقائياً في التقويم الموحد",
      severity: "info",
    });

    if (type === "construction" || type === "infrastructure") {
      items.push({
        category: "امتثال",
        label: "متطلبات تنظيمية",
        value: "قد يتطلب هذا النوع تصاريح بلدية / هيئة السلامة — تحقق قبل البدء",
        severity: "warning",
      });
    }

    const hasWarning = items.some((i) => i.severity === "warning");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "preview",
      entity: "projects",
      entityId: 0,
      after: { managerId, budget, startDate, endDate, type },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.impact_preview",
      entity: "projects",
      entityId: 0,
      after: { managerId, budget, startDate, endDate, type },
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.json({
      actionType: "create_project",
      employeeId: 0,
      employeeName: "",
      items,
      summary: hasWarning
        ? "المشروع جاهز — راجع التحذيرات قبل الإنشاء"
        : "جميع المؤشرات خضراء — المشروع جاهز للإنشاء",
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر المشروع");
  }
});

router.get("/", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', disableBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND p.status = $${paramIdx}`; params.push(status); paramIdx++; }

    const managerOnlyRoles = ["projects_manager"];
    if (!scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) && managerOnlyRoles.includes(scope.role) && scope.employeeId) {
      where += ` AND p."managerId" = $${paramIdx}`;
      params.push(scope.employeeId);
      paramIdx++;
    }
    const employeeOnlyRoles = ["employee"];
    if (!scope.isOwner && employeeOnlyRoles.includes(scope.role) && scope.employeeId) {
      where += ` AND (p."managerId" = $${paramIdx} OR p.id IN (SELECT "projectId" FROM project_tasks WHERE "assigneeId" = $${paramIdx}))`;
      params.push(scope.employeeId);
      paramIdx++;
    }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.*, cl.name AS "clientName", e.name AS "managerName" FROM projects p LEFT JOIN clients cl ON cl.id=p."clientId" AND cl."deletedAt" IS NULL LEFT JOIN employees e ON e.id=p."managerId" AND e."deletedAt" IS NULL WHERE ${where} AND p."deletedAt" IS NULL ORDER BY p.id DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Projects error:"); }
});

function isFullAccess(scope: any) {
  return scope.isOwner || OWNER_GM_ROLES.includes(scope.role);
}

/**
 * Assert that the current user can access the given project.
 * Throws a typed NotFoundError when the project does not exist or the
 * caller lacks scope — handleRouteError will translate that into a 404.
 * Never returns null anymore; all callers can rely on the returned row.
 */
async function assertProjectAccess(projectId: number, scope: NonNullable<import("express").Request["scope"]>): Promise<Record<string, unknown>> {
  let where = `id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
  const params: unknown[] = [projectId, scope.companyId];

  if (!isFullAccess(scope)) {
    if (scope.role === "projects_manager" && scope.employeeId) {
      where += ` AND "managerId" = $3`;
      params.push(scope.employeeId);
    } else if (scope.role === "employee" && scope.employeeId) {
      where += ` AND ("managerId" = $3 OR id IN (SELECT "projectId" FROM project_tasks WHERE "assigneeId" = $3))`;
      params.push(scope.employeeId);
    }
  }

  const [project] = await rawQuery<Record<string, unknown>>(`SELECT * FROM projects WHERE ${where}`, params);
  if (!project) {
    throw new NotFoundError("المشروع غير موجود أو غير مصرح بالوصول إليه");
  }
  return project;
}

// Closing a project freezes it: no costs/tasks/phases/resources can be added,
// and core fields cannot be updated. Cancelled projects are treated the same.
function assertProjectMutable(project: any): void {
  if (project.status === "completed" || project.status === "cancelled") {
    throw new ConflictError(
      `لا يمكن التعديل على مشروع بحالة "${project.status === "completed" ? "مغلق" : "ملغى"}"`,
      {
        field: "status",
        fix: "المشروع مقفول ولا يقبل أي تعديلات. أعد فتحه عبر صلاحية المالك إن لزم.",
        meta: { projectId: project.id, currentStatus: project.status },
      }
    );
  }
}

router.post("/", authorize({ feature: "projects.list", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createProjectSchema.safeParse(req.body));
    const scope = req.scope!;
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية إنشاء مشاريع", { fix: "راجع مدير الحساب للحصول على صلاحية projects_manager" });
    }
    const b = parsed;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المشروع مطلوب", { field: "name", fix: "أدخل اسماً واضحاً للمشروع" });
    }
    if (!b.startDate) {
      throw new ValidationError("تاريخ بداية المشروع مطلوب", { field: "startDate", fix: "حدد تاريخ بداية المشروع" });
    }
    if (!b.endDate) {
      throw new ValidationError("تاريخ نهاية المشروع مطلوب", { field: "endDate", fix: "حدد تاريخ التسليم المخطط للمشروع" });
    }
    const startD = new Date(b.startDate);
    const endD = new Date(b.endDate);
    if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
      throw new ValidationError("تواريخ المشروع غير صالحة", { field: "startDate", fix: "استخدم تنسيق YYYY-MM-DD" });
    }
    if (endD <= startD) {
      throw new ValidationError(
        "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
        { field: "endDate", fix: "اختر تاريخ نهاية لاحقاً لتاريخ البداية" }
      );
    }
    if (b.budget !== undefined && b.budget !== null && b.budget !== "") {
      const budget = Number(b.budget);
      if (!Number.isFinite(budget) || budget < 0) {
        throw new ValidationError("الميزانية غير صالحة", { field: "budget", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (b.clientId) {
      const [cl] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.clientId, scope.companyId]
      );
      if (!cl) {
        throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً مسجلاً أو اترك الحقل فارغاً" });
      }
    }
    if (b.managerId) {
      const [emp] = await rawQuery<Record<string, unknown>>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [b.managerId, scope.companyId]
      );
      if (!emp) {
        throw new ValidationError("مدير المشروع غير موجود", { field: "managerId", fix: "اختر موظفاً مسجلاً" });
      }
    }
    const managerId = scope.role === "projects_manager" ? scope.employeeId : b.managerId;
    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO projects ("companyId",name,description,"clientId","managerId","startDate","endDate",budget,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, b.name.trim(), b.description, b.clientId || null, managerId, b.startDate, b.endDate, b.budget || 0, b.status || 'planning']
      );
      insertId = ins.rows[0].id;

      if (b.phases && Array.isArray(b.phases)) {
        for (let i = 0; i < b.phases.length; i++) {
          const phase = b.phases[i];
          await client.query(
            `INSERT INTO project_phases ("projectId",name,"orderIndex","startDate","endDate") VALUES ($1,$2,$3,$4,$5)`,
            [insertId, phase.name, i, phase.startDate, phase.endDate]
          );
        }
      }
    });

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "projects",
      entityId: insertId,
      after: { name: b.name, clientId: b.clientId, budget: b.budget, status: b.status || 'planning' },
    }).catch((e) => logger.error(e, "projects background task failed"));

    // Register delivery obligation for the project's endDate
    if (b.endDate) {
      try {
        const endDate = new Date(b.endDate);
        if (endDate > new Date()) {
          await registerObligation({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            entityType: "project",
            entityId: insertId,
            obligationType: "delivery",
            title: `تسليم مشروع — ${b.name}`,
            dueAt: endDate.toISOString(),
            metadata: { clientId: b.clientId, budget: b.budget },
            dedupeKey: `project-${insertId}-delivery`,
            escalationSteps: [
              { hoursAfterDue: 0, notifyRole: "projects_manager" },
              { hoursAfterDue: 48, notifyRole: "general_manager" },
            ],
          });
        }
      } catch (obErr) { logger.error(obErr, "Project delivery obligation failed:"); }
    }

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "project.created",
      entity: "projects",
      entityId: insertId,
      details: `إنشاء مشروع ${b.name}`,
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create project error:"); }
});

router.get("/:id", authorize({ feature: "projects.list", action: "view", resource: { table: "projects", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    let detailWhere = `p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`;
    const detailParams: any[] = [id, scope.companyId];

    if (!scope.isOwner && !OWNER_GM_ROLES.includes(scope.role)) {
      if (scope.role === "projects_manager" && scope.employeeId) {
        detailWhere += ` AND p."managerId" = $3`;
        detailParams.push(scope.employeeId);
      } else if (scope.role === "employee" && scope.employeeId) {
        detailWhere += ` AND (p."managerId" = $3 OR p.id IN (SELECT "projectId" FROM project_tasks WHERE "assigneeId" = $3))`;
        detailParams.push(scope.employeeId);
      }
    }

    const [project] = await rawQuery<Record<string, unknown>>(`SELECT p.*, cl.name AS "clientName" FROM projects p LEFT JOIN clients cl ON cl.id=p."clientId" AND cl."deletedAt" IS NULL WHERE ${detailWhere}`, detailParams);
    if (!project) throw new NotFoundError("المشروع غير موجود");
    const [phases, tasks] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT * FROM project_phases WHERE "projectId"=$1 ORDER BY "orderIndex" LIMIT 500`, [project.id]),
      rawQuery<Record<string, unknown>>(`SELECT pt.*, e.name AS "assigneeName" FROM project_tasks pt LEFT JOIN employees e ON e.id=pt."assigneeId" AND e."deletedAt" IS NULL WHERE pt."projectId"=$1 AND pt."deletedAt" IS NULL ORDER BY pt."dueDate" LIMIT 500`, [project.id]),
    ]);

    let taskDeps: any[] = [];
    if (tasks.length > 0) {
      taskDeps = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_task_dependencies WHERE "taskId" IN (${tasks.map((_: any, i: number) => `$${i + 1}`).join(',')}) LIMIT 500`, tasks.map((t: any) => t.id));
    }
    const taskGraph = tasks.map((t: any) => ({
      id: t.id,
      estimatedHours: Number(t.estimatedHours) || 0,
      dependsOn: taskDeps.filter((d: any) => d.taskId === t.id).map((d: any) => d.dependsOnId),
    }));
    const criticalPathHours = tasks.length > 0 ? criticalPathLength(taskGraph) : 0;

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t: any) => t.status === 'done').length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const budget = Number(project.budget) || 0;
    const spentAmount = Number(project.spentAmount) || 0;
    const earnedValue = budget * (progressPct / 100);
    const costVariance = earnedValue - spentAmount;
    const budgetUsagePct = budget > 0 ? Math.round((spentAmount / budget) * 100) : 0;
    const budgetWarning = budgetUsagePct >= 80;

    const today = new Date();
    const endDate = project.endDate ? new Date(project.endDate as string | Date) : null;
    const isSlipping = endDate && today > endDate && project.status === 'active';

    let delayFinancialImpact = 0;
    if (isSlipping) {
      const delayDays = Math.floor((today.getTime() - endDate!.getTime()) / (1000 * 60 * 60 * 24));
      const dailyBudget = budget / Math.max(1, Math.round((endDate!.getTime() - new Date(project.startDate as string | Date).getTime()) / (1000 * 60 * 60 * 24)));
      delayFinancialImpact = dailyBudget * delayDays;
    }

    res.json({
      ...project,
      phases,
      tasks,
      criticalPathHours,
      progressPct,
      earnedValue,
      costVariance,
      budgetUsagePct,
      budgetWarning,
      isSlipping: !!isSlipping,
      delayFinancialImpact,
    });
  } catch (err) { handleRouteError(err, res, "Get project error:"); }
});

router.patch("/:id", authorize({ feature: "projects.list", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateProjectSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية تعديل هذا المشروع", { fix: "صلاحية projects_manager مطلوبة" });
    }
    let findQuery = `SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    }
    const [existing] = await rawQuery<Record<string, unknown>>(findQuery, findParams);
    if (!existing) throw new NotFoundError("المشروع غير موجود");
    const b = parsed;

    // Closed/cancelled projects are frozen — refuse any PATCH on them, even
    // edits to non-status fields. The /close endpoint is the only way out.
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new ConflictError(
        `لا يمكن تعديل مشروع بحالة "${existing.status === "completed" ? "مغلق" : "ملغى"}"`,
        {
          field: "status",
          fix: "المشروع مقفول. التعديلات على المشاريع المغلقة غير مسموحة.",
          meta: { projectId: existing.id, currentStatus: existing.status },
        }
      );
    }

    // State machine — /close is the only way to reach `completed`; PATCH
    // refuses direct transitions to terminal states.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!(PROJECT_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة مشروع غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${PROJECT_STATUSES.join(", ")}` }
        );
      }
      if (b.status === "completed") {
        throw new ConflictError(
          "لا يمكن إكمال المشروع عبر PATCH",
          { field: "status", fix: "استخدم /projects/:id/close لإقفال المشروع بالقيود المحاسبية" }
        );
      }
      const allowedNext = PROJECT_TRANSITIONS[existing.status as string] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المشروع من "${existing.status}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد (حالة نهائية)"}` }
        );
      }
    }

    if (b.budget !== undefined) {
      const budget = Number(b.budget);
      if (!Number.isFinite(budget) || budget < 0) {
        throw new ValidationError("الميزانية غير صالحة", { field: "budget", fix: "أدخل قيمة غير سالبة" });
      }
    }
    if (b.managerId !== undefined && b.managerId !== existing.managerId) {
      const [emp] = await rawQuery<Record<string, unknown>>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [b.managerId, scope.companyId]
      );
      if (!emp) {
        throw new ValidationError("مدير المشروع غير موجود", { field: "managerId", fix: "اختر موظفاً مسجلاً" });
      }
    }

    const tracked = ["name","description","status","budget","startDate","endDate","managerId","spentAmount"] as const;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const f of tracked) {
      if (b[f] === undefined) continue;
      if (b[f] === existing[f]) continue;
      params.push(b[f]);
      const col = ["startDate","endDate","managerId","spentAmount"].includes(f) ? `"${f}"` : f;
      sets.push(`${col}=$${params.length}`);
      before[f] = existing[f];
      after[f] = b[f];
    }
    if (Object.keys(after).length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE projects SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("المشروع غير موجود");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "projects",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "project.status_changed" : "project.updated",
      entity: "projects",
      entityId: id,
      before,
      after,
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update project error:"); }
});

router.delete("/:id", authorize({ feature: "projects.list", action: "delete", resource: { table: "projects", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية حذف هذا المشروع", { fix: "صلاحية projects_manager مطلوبة" });
    }
    let findQuery = `SELECT id, name, status FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    }
    const [existing] = await rawQuery<Record<string, unknown>>(findQuery, findParams);
    if (!existing) throw new NotFoundError("المشروع غير موجود");

    if (["active", "in_progress"].includes(existing.status as string)) {
      throw new ConflictError(
        `لا يمكن حذف مشروع بحالة "${existing.status}"`,
        { field: "status", fix: "ألغِ المشروع أو أقفله عبر /projects/:id/close قبل الحذف" }
      );
    }

    const { affectedRows } = await rawExecute(`UPDATE projects SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("المشروع غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "delete",
      entity: "projects",
      entityId: id,
      after: { name: existing.name, status: existing.status, deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.deleted",
      entity: "projects",
      entityId: id,
      before: { name: existing.name, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.json({ message: "تم حذف المشروع بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete project error:"); }
});

router.post("/:id/phases", authorize({ feature: "projects.tasks", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createPhaseSchema.safeParse(req.body));
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const b = parsed;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المرحلة مطلوب", { field: "name", fix: "أدخل اسم المرحلة" });
    }
    const project = await assertProjectAccess(projectId, scope);
    assertProjectMutable(project);
    const { insertId } = await rawExecute(
      `INSERT INTO project_phases ("projectId",name,"orderIndex","startDate","endDate") VALUES ($1,$2,$3,$4,$5)`,
      [projectId, b.name.trim(), b.orderIndex || 0, b.startDate || null, b.endDate || null]
    );
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_phases WHERE id=$1 AND "projectId"=$2`, [insertId, projectId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_phases",
      entityId: insertId,
      after: { projectId, name: b.name.trim(), orderIndex: b.orderIndex || 0 },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.phase.created",
      entity: "project_phases",
      entityId: insertId,
      after: { projectId, name: b.name.trim() },
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create phase error:"); }
});

router.patch("/:id/phases/:phaseId/complete", authorize({ feature: "projects.tasks", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const phaseId = parseId(req.params.phaseId, "phaseId");

    const project = await assertProjectAccess(projectId, scope);

    const [phase] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_phases WHERE id=$1 AND "projectId"=$2`, [phaseId, projectId]);
    if (!phase) throw new NotFoundError("المرحلة غير موجودة");

    // State machine — phases must be pending or in_progress to complete
    const allowedNext = PHASE_TRANSITIONS[(phase.status as string | null) ?? "pending"] ?? [];
    if (!allowedNext.includes("completed")) {
      throw new ConflictError(
        `لا يمكن إكمال مرحلة حالتها "${phase.status ?? "pending"}"`,
        { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` }
      );
    }

    await applyTransition({
      entity: "project_phases",
      id: phaseId,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "project.phase.completed",
      fromStates: ["pending", "in_progress"],
      toState: "completed",
      after: { projectId, previousStatus: phase.status ?? "pending" },
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.phase.completed",
      entity: "project_phases",
      entityId: phaseId,
      before: { status: phase.status ?? "pending" },
      after: { status: "completed" },
    }).catch((e) => logger.error(e, "projects background task failed"));

    let milestoneInvoiceCreated = false;
    if (project?.clientId) {
      try {
        const allPhases = await rawQuery<Record<string, unknown>>(`SELECT id FROM project_phases WHERE "projectId"=$1`, [projectId]);
        const phaseWeight = allPhases.length > 0 ? 1 / allPhases.length : 0.25;
        const milestoneAmount = Number(project.budget) * phaseWeight;
        const monthNum = currentMonthPadded();
        const yearShort = String(currentYear()).slice(2);
        const ref = `INV-MS-${yearShort}${monthNum}-${phaseId}`;
        const vatAmount = milestoneAmount * 0.15;
        const { projectsEngine } = await import("../lib/engines/index.js");
        projectsEngine.requestInvoiceCreation(
          { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
          {
            clientId: project.clientId as number,
            ref,
            description: `فاتورة إنجاز مرحلة: ${phase?.name || ''} - مشروع: ${project.name}`,
            subtotal: milestoneAmount,
            vatAmount,
            total: milestoneAmount + vatAmount,
            dueDate: toDateISO(new Date(Date.now() + 14 * 86400000)),
            sourceType: "project_phases",
            sourceId: phaseId,
          }
        );
        milestoneInvoiceCreated = true;
      } catch (milestoneInvoiceErr) {
        logger.error({ err: phaseId, detail: milestoneInvoiceErr }, "Failed to create milestone invoice for phase");
      }
    }

    const tasks = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_tasks WHERE "projectId"=$1 AND "deletedAt" IS NULL LIMIT 500`, [projectId]);
    const doneTasks = tasks.filter((t: any) => t.status === 'done').length;
    const progressPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    const { affectedRows } = await rawExecute(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`, [progressPct, projectId, scope.companyId]);
    if (!affectedRows) logger.warn({ projectId, progressPct }, "Project progress update matched no rows (possible race condition)");

    res.json({ message: 'تم إكمال المرحلة', phase, milestoneInvoiceCreated, progressPct });
  } catch (err) { handleRouteError(err, res, "Complete phase error:"); }
});

router.post("/:id/tasks", authorize({ feature: "projects.tasks", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createTaskSchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const projectId = parseId(req.params.id, "id");

    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المهمة مطلوب", { field: "title", fix: "أدخل عنواناً واضحاً للمهمة" });
    }
    const project = await assertProjectAccess(projectId, scope);
    assertProjectMutable(project);

    if (b.assigneeId) {
      const [emp] = await rawQuery<Record<string, unknown>>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [b.assigneeId, scope.companyId]
      );
      if (!emp) {
        throw new ValidationError("الموظف المُكلَّف غير موجود", { field: "assigneeId", fix: "اختر موظفاً مسجلاً" });
      }
    }
    if (b.phaseId) {
      const [phase] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM project_phases WHERE id=$1 AND "projectId"=$2`,
        [b.phaseId, projectId]
      );
      if (!phase) {
        throw new ValidationError("المرحلة غير موجودة", { field: "phaseId", fix: "اختر مرحلة تابعة لهذا المشروع" });
      }
    }

    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO project_tasks ("projectId","phaseId",title,description,"assigneeId",priority,status,"startDate","dueDate","estimatedHours") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [projectId, b.phaseId || null, b.title.trim(), b.description || null, b.assigneeId || null, b.priority || 'medium', 'todo', b.startDate || null, b.dueDate || null, b.estimatedHours || null]
      );
      insertId = ins.rows[0].id;

      if (Array.isArray(b.dependsOn) && b.dependsOn.length > 0) {
        const valuesSql: string[] = [];
        const params: unknown[] = [];
        for (const depId of b.dependsOn) {
          const base = params.length;
          valuesSql.push(`($${base + 1},$${base + 2})`);
          params.push(insertId, depId);
        }
        try {
          await client.query(
            `INSERT INTO project_task_dependencies ("taskId","dependsOnId") VALUES ${valuesSql.join(",")} ON CONFLICT DO NOTHING`,
            params
          );
        } catch (depErr) {
          logger.error(depErr, `Failed to create task dependencies for ${insertId}:`);
        }

        const placeholders = b.dependsOn.map((_: any, i: number) => `$${i + 1}`).join(',');
        const blockedRes = await client.query(
          `SELECT pt.status FROM project_tasks pt WHERE pt.id IN (${placeholders})`,
          b.dependsOn
        );
        const allDepsDone = blockedRes.rows.every((d: any) => d.status === 'done');
        if (!allDepsDone) {
          await client.query(`UPDATE project_tasks SET status='blocked' WHERE id=$1 AND status='todo' AND "deletedAt" IS NULL`, [insertId]);
        }
      }
    });

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT pt.* FROM project_tasks pt JOIN projects p ON p.id=pt."projectId" WHERE pt.id=$1 AND p."companyId"=$2 AND pt."deletedAt" IS NULL`, [insertId, scope.companyId]);

    if (b.assigneeId) {
      const [assigneeAssignment] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [b.assigneeId, scope.companyId]
      );
      if (assigneeAssignment) {
        createNotification({
          companyId: scope.companyId,
          assignmentId: assigneeAssignment.id as number,
          type: "task_assigned",
          title: "مهمة جديدة مسندة إليك",
          body: `تم إسناد المهمة "${b.title}" إليك — الأولوية: ${b.priority || 'medium'}`,
          priority: "normal",
          refType: "project_tasks",
          refId: insertId,
        }).catch((e) => logger.error(e, "projects background task failed"));
      }
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_tasks",
      entityId: insertId,
      after: { title: b.title, projectId, assigneeId: b.assigneeId, priority: b.priority },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.task.created",
      entity: "project_tasks",
      entityId: insertId,
      details: JSON.stringify({ projectId, title: b.title, assigneeId: b.assigneeId, priority: b.priority }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create project task error:"); }
});

// P02-S6-HIGH — same bypass as the milestone/risk PATCH fix in #39:
// task PATCH used to validate only the task's parent project belongs
// to the caller's company, but skipped `assertProjectAccess`. Every
// other task route (POST /:id/tasks at line 571, time-entries, costs,
// resources, milestones, risks) goes through `assertProjectAccess`
// which enforces per-role gates: a `projects_manager` can only mutate
// projects they manage and an `employee` only projects they have a
// task on. The PATCH bypass let any user with `projects:update` mark
// other managers' tasks "done", set actualHours, and rewrite progress
// across every project in the company — driving false project KPIs,
// auto-billing on done-state, and obligation completion. Re-route
// through `assertProjectAccess(existingTask.projectId, scope)` so the
// per-role gates apply.
router.patch("/tasks/:taskId", authorize({ feature: "projects.tasks", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateTaskSchema.safeParse(req.body));
    const scope = req.scope!;
    const taskId = parseId(req.params.taskId, "taskId");
    const b = parsed;

    const [existingTask] = await rawQuery<Record<string, unknown>>(
      `SELECT pt.* FROM project_tasks pt
       JOIN projects p ON p.id = pt."projectId"
       WHERE pt.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`,
      [taskId, scope.companyId]
    );
    if (!existingTask) throw new NotFoundError("المهمة غير موجودة");
    await assertProjectAccess(existingTask.projectId as number, scope);

    // State machine for task status transitions
    if (b.status !== undefined && b.status !== existingTask.status) {
      if (!(TASK_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة مهمة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${TASK_STATUSES.join(", ")}` }
        );
      }
      const allowedNext = TASK_TRANSITIONS[(existingTask.status as string | null) ?? "todo"] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المهمة من "${existingTask.status ?? "todo"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (b.status !== undefined && b.status !== existingTask.status) {
      params.push(b.status); sets.push(`status=$${params.length}`);
      before.status = existingTask.status; after.status = b.status;
    }
    if (b.progress !== undefined && Number(b.progress) !== Number(existingTask.progress)) {
      params.push(b.progress); sets.push(`progress=$${params.length}`);
      before.progress = existingTask.progress; after.progress = b.progress;
    }
    if (b.actualHours !== undefined && Number(b.actualHours) !== Number(existingTask.actualHours)) {
      params.push(b.actualHours); sets.push(`"actualHours"=$${params.length}`);
      before.actualHours = existingTask.actualHours; after.actualHours = b.actualHours;
    }
    if (b.status === 'done') sets.push(`"completedAt"=NOW()`);
    if (sets.length === 0) { res.json(existingTask); return; }
    params.push(taskId);
    let taskWhere = `id=$${params.length}`;
    if (b.status !== undefined && b.status !== existingTask.status) {
      params.push(existingTask.status ?? "todo");
      taskWhere += ` AND status=$${params.length}`;
    }
    // Wrap task update + unblock dependents + project progress in a single transaction
    const { task, unlockedTasks, progressPct } = await withTransaction(async (client) => {
      await client.query(`UPDATE project_tasks SET ${sets.join(",")} WHERE ${taskWhere} AND "deletedAt" IS NULL`, params);

      const taskRes = await client.query(`SELECT * FROM project_tasks WHERE id=$1 AND "deletedAt" IS NULL`, [taskId]);
      const tsk = taskRes.rows[0];

      let unlocked: any[] = [];
      if (b.status === 'done' && tsk?.projectId) {
        const candidateRes = await client.query(
          `SELECT ptd."taskId",
                  COUNT(*) FILTER (WHERE pt2.status != 'done') AS "pendingDeps"
           FROM project_task_dependencies ptd
           JOIN project_task_dependencies all_deps ON all_deps."taskId" = ptd."taskId"
           JOIN project_tasks pt2 ON pt2.id = all_deps."dependsOnId"
           WHERE ptd."dependsOnId" = $1
           GROUP BY ptd."taskId"
           HAVING COUNT(*) FILTER (WHERE pt2.status != 'done') = 0`,
          [taskId]
        );
        const candidateIds = candidateRes.rows.map((d: any) => Number(d.taskId));
        if (candidateIds.length > 0) {
          const unblockRes = await client.query(
            `UPDATE project_tasks SET status='todo'
             WHERE id = ANY($1) AND status='blocked' AND "deletedAt" IS NULL
             RETURNING *`,
            [candidateIds]
          );
          unlocked = unblockRes.rows;
        }
      }

      let pPct = 0;
      if (tsk?.projectId) {
        const allRes = await client.query(`SELECT status FROM project_tasks WHERE "projectId"=$1 AND "deletedAt" IS NULL LIMIT 500`, [tsk.projectId]);
        const doneCount = allRes.rows.filter((t: any) => t.status === 'done').length;
        pPct = allRes.rows.length > 0 ? Math.round((doneCount / allRes.rows.length) * 100) : 0;
        await client.query(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`, [pPct, tsk.projectId, scope.companyId]);
      }

      return { task: tsk, unlockedTasks: unlocked, progressPct: pPct };
    });

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "project_tasks",
      entityId: taskId,
      before,
      after,
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "project.task.status_changed" : "project.task.updated",
      entity: "project_tasks",
      entityId: taskId,
      before,
      after,
    }).catch((e) => logger.error(e, "projects background task failed"));

    // Notify assignees of unblocked tasks (fire-and-forget, outside transaction)
    if (unlockedTasks.length > 0) {
      const assigneeIds = Array.from(
        new Set(unlockedTasks.map((t: any) => t.assigneeId).filter((x: any) => x != null))
      );
      if (assigneeIds.length > 0) {
        try {
          const asgnRows = await rawQuery<{ id: number; employeeId: number }>(
            `SELECT DISTINCT ON ("employeeId") id, "employeeId"
             FROM employee_assignments
             WHERE "employeeId" = ANY($1) AND "companyId" = $2 AND status='active'
             ORDER BY "employeeId", id`,
            [assigneeIds, scope.companyId]
          );
          const empToAssignment = new Map<number, number>();
          for (const r of asgnRows) empToAssignment.set(Number(r.employeeId), Number(r.id));
          for (const t of unlockedTasks) {
            const aid = empToAssignment.get(Number(t.assigneeId));
            if (!aid) continue;
            createNotification({
              companyId: scope.companyId,
              assignmentId: aid,
              type: "task_unblocked",
              title: "مهمة أصبحت متاحة للعمل",
              body: `المهمة "${t.title}" أصبحت جاهزة — جميع المهام المعتمد عليها مكتملة`,
              priority: "normal",
              refType: "project_tasks",
              refId: t.id,
            }).catch((e) => logger.error(e, "projects background task failed"));
          }
        } catch (e) { logger.error(e, "Unlock notification error:"); }
      }
    }

    if (task?.projectId) {

      const [project] = await rawQuery<Record<string, unknown>>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [task.projectId, scope.companyId]);

      const budget = Number(project?.budget) || 0;
      const spentAmount = Number(project?.spentAmount) || 0;
      if (budget > 0 && spentAmount >= budget * 0.8 && project?.managerId) {
        const pct = Math.round((spentAmount / budget) * 100);
        const [mgrAsn] = await rawQuery<{ id: number }>(
          `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
          [project.managerId, project.companyId]
        );
        if (mgrAsn?.id) {
          createNotification({
            companyId: project.companyId as number,
            assignmentId: mgrAsn.id,
            type: "project_budget_warning",
            title: `تحذير الميزانية: ${project.name}`,
            body: `صُرف ${pct}% من ميزانية المشروع (${spentAmount} من ${budget} ريال).`,
            priority: pct >= 100 ? "urgent" : "high",
            refType: "project",
            refId: project.id as number,
          }).catch((e) => logger.error(e, "projects background task failed"));
        }
      }

      const endDate = project?.endDate ? new Date(project.endDate as string | Date) : null;
      if (endDate && new Date() > endDate && project?.status === 'active' && progressPct < 100 && project?.managerId) {
        const delayDays = Math.floor((Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24));
        const projectDuration = Math.max(1, Math.round((endDate.getTime() - new Date(project.startDate as string | Date).getTime()) / (1000 * 60 * 60 * 24)));
        const dailyBudget = budget / projectDuration;
        const delayImpact = dailyBudget * delayDays;
        const [mgrAsn] = await rawQuery<{ id: number }>(
          `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
          [project.managerId, project.companyId]
        );
        if (mgrAsn?.id) {
          createNotification({
            companyId: project.companyId as number,
            assignmentId: mgrAsn.id,
            type: "project_overdue",
            title: `تأخر المشروع: ${project.name}`,
            body: `المشروع متأخر ${delayDays} يوم — أثر مالي تقديري: ${delayImpact.toFixed(0)} ريال.`,
            priority: "high",
            refType: "project",
            refId: project.id as number,
          }).catch((e) => logger.error(e, "projects background task failed"));
        }
      }
    }

    res.json({ ...task, unlockedTasks: unlockedTasks.length > 0 ? unlockedTasks : undefined });
  } catch (err) { handleRouteError(err, res, "Update project task error:"); }
});

router.get("/stats/summary", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[projects], [budget], [slipping]] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='completed') as completed FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM(budget),0) as "totalBudget", COALESCE(SUM("spentAmount"),0) as "totalSpent" FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as count FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status='active' AND "endDate" < CURRENT_DATE`, [cid]),
    ]);
    res.json({
      totalProjects: Number(projects.total), activeProjects: Number(projects.active),
      completedProjects: Number(projects.completed), totalBudget: Number(budget.totalBudget),
      totalSpent: Number(budget.totalSpent), slippingProjects: Number(slipping.count),
    });
  } catch (err) { handleRouteError(err, res, "Projects stats error:"); }
});

router.get("/stats/overview", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [
      [counts],
      [budget],
      [taskCounts],
      slippingProjects,
      recentProjects,
      upcomingMilestones,
      openRisks,
    ] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status IN ('active','in_progress')) as active,
           COUNT(*) FILTER (WHERE status='completed') as completed,
           COUNT(*) FILTER (WHERE status='planning') as planning,
           COUNT(*) FILTER (WHERE status='on_hold') as on_hold,
           COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
           COUNT(*) FILTER (WHERE status IN ('active','in_progress') AND "endDate" < CURRENT_DATE) as slipping
         FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM(budget),0) as "totalBudget",
                COALESCE(SUM("spentAmount"),0) as "totalSpent"
         FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE pt.status='done') as done,
                COUNT(*) FILTER (WHERE pt.status='in_progress') as in_progress,
                COUNT(*) FILTER (WHERE pt.status='blocked') as blocked,
                COUNT(*) FILTER (WHERE pt.status NOT IN ('done','cancelled') AND pt."dueDate" < CURRENT_DATE) as overdue
         FROM project_tasks pt
         JOIN projects p ON pt."projectId"=p.id
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, name, status, "endDate", progress, budget, "spentAmount",
                (SELECT name FROM employees WHERE id=p."managerId" AND "deletedAt" IS NULL) as "managerName"
         FROM projects p
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
           AND p.status IN ('active','in_progress') AND p."endDate" < CURRENT_DATE
         ORDER BY p."endDate" LIMIT 10`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, name, status, progress, budget, "spentAmount", "endDate",
                (SELECT name FROM employees WHERE id=p."managerId" AND "deletedAt" IS NULL) as "managerName"
         FROM projects p
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL AND p.status IN ('active','in_progress')
         ORDER BY p."updatedAt" DESC LIMIT 8`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT pm.id, pm.title, pm."targetDate", pm.status, p.name as "projectName", p.id as "projectId"
         FROM project_milestones pm
         JOIN projects p ON pm."projectId"=p.id
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
           AND pm.status IN ('pending','in_progress')
           AND pm."targetDate" >= CURRENT_DATE
         ORDER BY pm."targetDate" LIMIT 8`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT pr.id, pr.title, pr."riskLevel", pr."riskScore", pr.status, p.name as "projectName", p.id as "projectId"
         FROM project_risks pr
         JOIN projects p ON pr."projectId"=p.id
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL AND pr.status IN ('open','realized')
         ORDER BY pr."riskScore" DESC LIMIT 8`,
        [cid]
      ),
    ]);

    res.json({
      counts: {
        total: Number(counts.total), active: Number(counts.active),
        completed: Number(counts.completed), planning: Number(counts.planning),
        onHold: Number(counts.on_hold), cancelled: Number(counts.cancelled),
        slipping: Number(counts.slipping),
      },
      budget: { total: Number(budget.totalBudget), spent: Number(budget.totalSpent) },
      tasks: {
        total: Number(taskCounts.total), done: Number(taskCounts.done),
        inProgress: Number(taskCounts.in_progress), blocked: Number(taskCounts.blocked),
        overdue: Number(taskCounts.overdue),
      },
      slippingProjects,
      recentProjects,
      upcomingMilestones,
      openRisks,
    });
  } catch (err) { handleRouteError(err, res, "Projects overview error:"); }
});

router.get("/manager/:employeeId/workload", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    if (!employeeId) throw new ValidationError("معرّف الموظف مطلوب");

    const [[counts], [taskCounts], recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('active','in_progress')) as active,
           COUNT(*) FILTER (WHERE status='on_hold') as on_hold,
           COUNT(*) FILTER (WHERE status IN ('active','in_progress') AND "endDate" < CURRENT_DATE) as slipping,
           COALESCE(SUM(budget) FILTER (WHERE status IN ('active','in_progress')),0) as "activeBudget",
           COALESCE(SUM("spentAmount") FILTER (WHERE status IN ('active','in_progress')),0) as "activeSpent"
         FROM projects
         WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "managerId"=$2`,
        [scope.companyId, employeeId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE pt.status NOT IN ('done','cancelled')) as open,
                COUNT(*) FILTER (WHERE pt.status NOT IN ('done','cancelled') AND pt."dueDate" < CURRENT_DATE) as overdue
         FROM project_tasks pt
         JOIN projects p ON pt."projectId"=p.id
         WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
           AND (p."managerId"=$2 OR pt."assigneeId"=$2)`,
        [scope.companyId, employeeId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, name, status, progress, "endDate"
         FROM projects
         WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "managerId"=$2 AND status IN ('active','in_progress','planning')
         ORDER BY "updatedAt" DESC LIMIT 5`,
        [scope.companyId, employeeId]
      ),
    ]);

    res.json({
      projects: {
        active: Number(counts.active), onHold: Number(counts.on_hold),
        slipping: Number(counts.slipping),
        activeBudget: Number(counts.activeBudget), activeSpent: Number(counts.activeSpent),
      },
      tasks: { total: Number(taskCounts.total), open: Number(taskCounts.open), overdue: Number(taskCounts.overdue) },
      recent,
    });
  } catch (err) { handleRouteError(err, res, "Manager workload error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT MILESTONES — معالم المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/milestones", authorize({ feature: "projects.tasks", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY "targetDate"`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Milestones error:"); }
});

router.post("/:id/milestones", authorize({ feature: "projects.tasks", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createMilestoneSchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المعلَم مطلوب", { field: "title", fix: "أدخل عنواناً واضحاً للمعلَم" });
    }
    if (!b.targetDate) {
      throw new ValidationError("تاريخ المعلَم المستهدف مطلوب", { field: "targetDate", fix: "حدد التاريخ المستهدف" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO project_milestones ("projectId","companyId",name,title,description,"targetDate",status,"completedDate")
       VALUES ($1,$2,$3,$3,$4,$5,'pending',$6)`,
      [projectId, scope.companyId, b.title, b.description || null, b.targetDate, b.completedDate || null]
    );

    // Register milestone obligation for its targetDate
    try {
      const targetDate = new Date(b.targetDate);
      if (targetDate > new Date()) {
        await registerObligation({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          entityType: "project_milestone",
          entityId: insertId,
          obligationType: "delivery",
          title: `معلَم — ${b.title} (${project.name})`,
          dueAt: targetDate.toISOString(),
          metadata: { projectId, projectName: project.name },
          dedupeKey: `milestone-${insertId}`,
          escalationSteps: [
            { hoursAfterDue: 0, notifyRole: "projects_manager" },
            { hoursAfterDue: 48, notifyRole: "general_manager" },
          ],
        });
      }
    } catch (obErr) { logger.error(obErr, "Milestone obligation failed:"); }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_milestones",
      entityId: insertId,
      after: { projectId, title: b.title, targetDate: b.targetDate },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.milestone.created",
      entity: "project_milestones",
      entityId: insertId,
      details: JSON.stringify({ projectId, title: b.title, targetDate: b.targetDate }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_milestones WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create milestone error:"); }
});

// P02-S5-HIGH — milestone PATCH used to validate only `companyId`, but
// every other milestone/risk route on this file (POST /:id/milestones,
// GET /:id/milestones, GET /:id/risks, POST /:id/risks, plus tasks,
// time-entries, costs etc.) goes through `assertProjectAccess` so a
// `projects_manager` can only mutate projects they manage and an
// `employee` only projects they have a task on. The PATCH bypass let
// any user with `projects:update` permission rewrite milestones on
// every project in the company (status transitions, completion dates),
// which in turn calls `markObligationMet` → triggers the obligation-
// driven invoice/delivery workflow on projects they shouldn't touch.
// Re-route through `assertProjectAccess(existing.projectId, scope)`
// after the company-scoped lookup so the same role gates apply.
router.patch("/milestones/:milestoneId", authorize({ feature: "projects.tasks", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateMilestoneSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.milestoneId, "milestoneId");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM project_milestones WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المعلم غير موجود");
    await assertProjectAccess(existing.projectId as number, scope);
    const b = parsed;

    if (b.status !== undefined && b.status !== existing.status) {
      if (!(MILESTONE_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة معلَم غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${MILESTONE_STATUSES.join(", ")}` }
        );
      }
      const allowed = MILESTONE_TRANSITIONS[(existing.status as string | null) ?? "pending"] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المعلَم من "${existing.status ?? "pending"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.targetDate !== undefined) { params.push(b.targetDate); sets.push(`"targetDate"=$${params.length}`); }
    if (b.completedDate !== undefined) { params.push(b.completedDate); sets.push(`"completedDate"=$${params.length}`); }
    if (b.status === 'completed' && !b.completedDate) sets.push(`"completedDate"=NOW()`);
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<Record<string, unknown>>(
      `UPDATE project_milestones SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new NotFoundError("المرحلة غير موجودة");

    if (b.status === 'completed') {
      await markObligationMet(scope.companyId, "project_milestone", id, "delivery").catch((e) => logger.error(e, "projects background task failed"));
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "project_milestones",
      entityId: id,
      after: { title: b.title, status: b.status, targetDate: b.targetDate },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.milestone.updated",
      entity: "project_milestones",
      entityId: id,
      details: JSON.stringify({ title: b.title, status: b.status, targetDate: b.targetDate }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update milestone error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT RISKS — مخاطر المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/risks", authorize({ feature: "projects.tasks", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM project_risks WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY (probability * impact) DESC LIMIT 500`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project risks error:"); }
});

router.post("/:id/risks", authorize({ feature: "projects.tasks", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createRiskSchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المخاطرة مطلوب", { field: "title", fix: "أدخل وصفاً مختصراً للمخاطرة" });
    }
    if (b.responsibleId) {
      const [resp] = await rawQuery<{ id: number }>(`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`, [b.responsibleId, scope.companyId]);
      if (!resp) throw new ValidationError("الموظف المسؤول غير موجود", { field: "responsibleId", fix: "اختر موظفاً من قائمة الموظفين." });
    }
    const probability = Math.min(5, Math.max(1, Number(b.probability || 3)));
    const impact = Math.min(5, Math.max(1, Number(b.impact || 3)));
    const riskScore = probability * impact;
    const riskLevel = riskScore >= 15 ? 'critical' : riskScore >= 9 ? 'high' : riskScore >= 4 ? 'medium' : 'low';
    const { insertId } = await rawExecute(
      `INSERT INTO project_risks ("projectId","companyId",title,description,probability,impact,"riskScore","riskLevel","mitigationPlan","responsibleId",status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')`,
      [projectId, scope.companyId, b.title, b.description || null,
       probability, impact, riskScore, riskLevel,
       b.mitigationPlan || null, b.responsibleId || null]
    );
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_risks WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_risks",
      entityId: insertId,
      after: { projectId, title: b.title, riskScore, riskLevel },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.risk.created",
      entity: "project_risks",
      entityId: insertId,
      details: JSON.stringify({ projectId, title: b.title, riskScore, riskLevel }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create risk error:"); }
});

// P02-S5-HIGH — same bypass as milestone PATCH above. Risk PATCH only
// validated `companyId`, letting any `projects:update` user rewrite
// probability / impact / mitigation / status on risks across every
// project in the company — including projects the caller's role does
// not have read access to via `assertProjectAccess`.
router.patch("/risks/:riskId", authorize({ feature: "projects.tasks", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateRiskSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.riskId, "riskId");
    const [existingRisk] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM project_risks WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existingRisk) throw new NotFoundError("المخاطرة غير موجودة");
    await assertProjectAccess(existingRisk.projectId as number, scope);
    const b = parsed;

    if (b.status !== undefined && b.status !== existingRisk.status) {
      if (!(RISK_STATUSES as readonly string[]).includes(b.status)) {
        throw new ValidationError(
          `حالة مخاطرة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${RISK_STATUSES.join(", ")}` }
        );
      }
      const allowed = RISK_TRANSITIONS[(existingRisk.status as string | null) ?? "open"] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المخاطرة من "${existingRisk.status ?? "open"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.mitigationPlan !== undefined) { params.push(b.mitigationPlan); sets.push(`"mitigationPlan"=$${params.length}`); }
    if (b.probability !== undefined) { params.push(b.probability); sets.push(`probability=$${params.length}`); }
    if (b.impact !== undefined) { params.push(b.impact); sets.push(`impact=$${params.length}`); }
    // Recompute riskScore whenever probability OR impact changes (fetch current values for the missing one)
    if (b.probability !== undefined || b.impact !== undefined) {
      const [existing] = await rawQuery<Record<string, unknown>>(
        `SELECT probability, impact FROM project_risks WHERE id=$1 AND "companyId"=$2`,
        [id, scope.companyId]
      );
      if (existing) {
        const prob = b.probability !== undefined ? Number(b.probability) : Number(existing.probability ?? 3);
        const imp = b.impact !== undefined ? Number(b.impact) : Number(existing.impact ?? 3);
        const score = prob * imp;
        params.push(score); sets.push(`"riskScore"=$${params.length}`);
        const lvl = score >= 15 ? 'critical' : score >= 9 ? 'high' : score >= 4 ? 'medium' : 'low';
        params.push(lvl); sets.push(`"riskLevel"=$${params.length}`);
      }
    }
    if (sets.length === 0) { res.json({ success: true }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<Record<string, unknown>>(
      `UPDATE project_risks SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("المخاطرة غير موجودة");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "project_risks",
      entityId: id,
      after: { title: b.title, status: b.status, probability: b.probability, impact: b.impact },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.risk.updated",
      entity: "project_risks",
      entityId: id,
      details: JSON.stringify({ title: b.title, status: b.status, probability: b.probability, impact: b.impact }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update risk error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT RESOURCES — تخصيص موارد المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/resources", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT pr.*, e.name AS "employeeName", ea."jobTitle" AS "employeeJobTitle"
       FROM project_resources pr
       LEFT JOIN employees e ON e.id=pr."employeeId" AND e."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea.status='active'
       WHERE pr."projectId"=$1 AND pr."companyId"=$2
       ORDER BY pr.id`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project resources error:"); }
});

router.post("/:id/resources", authorize({ feature: "projects.list", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createResourceSchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    assertProjectMutable(project);
    if (b.employeeId) {
      const [emp] = await rawQuery<{ id: number }>(`SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`, [b.employeeId, scope.companyId]);
      if (!emp) throw new ValidationError("الموظف غير موجود", { field: "employeeId", fix: "اختر موظفاً من قائمة الموظفين." });
    }
    if (b.taskId) {
      const [task] = await rawQuery<{ id: number }>(`SELECT id FROM project_tasks WHERE id = $1 AND "projectId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [b.taskId, projectId]);
      if (!task) throw new ValidationError("المهمة غير موجودة", { field: "taskId", fix: "اختر مهمة من مهام المشروع." });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO project_resources ("projectId","companyId","employeeId","taskId",role,"allocatedHours","budgetAllocated","startDate","endDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [projectId, scope.companyId, b.employeeId || null, b.taskId || null,
       b.role || 'member', b.allocatedHours || 0, b.budgetAllocated || 0,
       b.startDate || null, b.endDate || null]
    );
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_resources WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_resources",
      entityId: insertId,
      after: { projectId, employeeId: b.employeeId, role: b.role },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.resource.created",
      entity: "project_resources",
      entityId: insertId,
      details: JSON.stringify({ projectId, employeeId: b.employeeId, role: b.role }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create resource error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT COST TRACKING — تتبع التكاليف الفعلية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/costs", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    const [rows, [totals]] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT pc.*, e.name AS "enteredByName"
         FROM project_costs pc
         LEFT JOIN employees e ON e.id=pc."enteredBy" AND e."deletedAt" IS NULL
         WHERE pc."projectId"=$1 AND pc."companyId"=$2
         ORDER BY pc."costDate" DESC LIMIT 500`,
        [projectId, scope.companyId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM(amount),0) AS "totalActual" FROM project_costs WHERE "projectId"=$1 AND "companyId"=$2`,
        [projectId, scope.companyId]
      ),
    ]);
    res.json({
      data: rows, total: rows.length,
      totalActual: Number(totals?.totalActual || 0),
      budget: Number(project?.budget || 0),
      variance: Number(project?.budget || 0) - Number(totals?.totalActual || 0),
    });
  } catch (err) { handleRouteError(err, res, "Project costs error:"); }
});

router.post("/:id/costs", authorize({ feature: "projects.list", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createCostSchema.safeParse(req.body));
    const scope = req.scope!;
    const b = parsed;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);
    assertProjectMutable(project);
    if (!b.description || typeof b.description !== "string" || !b.description.trim()) {
      throw new ValidationError("وصف التكلفة مطلوب", { field: "description", fix: "أدخل وصفاً للتكلفة" });
    }
    if (!b.amount) {
      throw new ValidationError("المبلغ مطلوب", { field: "amount", fix: "أدخل قيمة التكلفة" });
    }
    const amt = Number(b.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new ValidationError("المبلغ يجب أن يكون أكبر من صفر", { field: "amount", fix: "أدخل قيمة موجبة" });
    }
    const costDate = b.costDate || todayISO();
    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO project_costs ("projectId","companyId",description,amount,category,"costDate","enteredBy",notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [projectId, scope.companyId, b.description, b.amount,
         b.category || 'other', costDate,
         scope.employeeId || null, b.notes || null]
      );
      insertId = ins.rows[0].id;
      await client.query(
        `UPDATE projects SET "spentAmount"=COALESCE("spentAmount",0)+$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
        [b.amount, projectId, scope.companyId]
      );
    });

    // ─── GL POSTING: project cost → WIP ──────────────────────────────────
    // DR WIP (1350) / CR Cash|AP|Inventory depending on source.
    // project_costs currently has no `sourceType` column (verified against
    // migrations 062_phase5 + 063_phase5_schema_fixes), so we infer the
    // credit account from request body `sourceType` if supplied, otherwise
    // from the cost `category`, else default to Cash (1100).
    let journalEntryId: number | null = null;
    try {
      const amount = Number(b.amount);
      if (amount > 0) {
        const period = await checkFinancialPeriodOpen(scope.companyId, costDate);
        if (!period.open) {
          logger.warn(
            `[projects-gl] project cost ${insertId}: financial period "${period.periodName}" is closed — GL posting skipped`
          );
          // Stamp a note in the cost row so users see the reason.
          await rawExecute(
            `UPDATE project_costs SET notes = COALESCE(notes,'') || $1 WHERE id=$2 AND "companyId"=$3`,
            [
              ` [GL skipped: الفترة المالية "${period.periodName ?? ""}" مغلقة]`,
              insertId,
              scope.companyId,
            ]
          ).catch((e) => logger.error(e, "projects background task failed"));
        } else {
          const { projectsEngine } = await import("../lib/engines/index.js");
          const glResult = await projectsEngine.postProjectCostGL(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: (scope as any).activeAssignmentId ?? scope.userId },
            { id: insertId, projectId, projectName: project.name as string, amount, description: b.description, sourceType: b.sourceType || b.category }
          );
          journalEntryId = glResult.journalId;
        }
      }
    } catch (glErr) {
      logger.error(glErr, `[projects-gl] journal entry failed for project cost ${insertId}:`);
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM project_costs WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "project_costs",
      entityId: insertId,
      after: { projectId, description: b.description, amount: b.amount, category: b.category },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.cost.created",
      entity: "project_costs",
      entityId: insertId,
      details: JSON.stringify({ projectId, description: b.description, amount: b.amount, category: b.category }),
    }).catch((e) => logger.error(e, "projects background task failed"));

    res.status(201).json({ ...row, journalEntryId });
  } catch (err) { handleRouteError(err, res, "Create project cost error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Project closure — transfers accumulated WIP balance to Project Cost expense
// and marks the project status='completed'. Must be called once per project
// after all costs have been recorded. Idempotent: if the project is already
// completed, returns without posting a duplicate entry.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/close", authorize({ feature: "projects.list", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(closeProjectSchema.safeParse(req.body));
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);

    const [totals] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(amount),0) AS "totalWip"
         FROM project_costs
        WHERE "projectId" = $1 AND "companyId" = $2`,
      [projectId, scope.companyId]
    );
    const totalWip = Number(totals?.totalWip || 0);

    let journalEntryId: number | null = null;
    if (totalWip > 0) {
      try {
        const today = todayISO();
        const period = await checkFinancialPeriodOpen(scope.companyId, today);
        if (!period.open) {
          logger.warn(
            `[projects-gl] project close ${projectId}: financial period "${period.periodName}" is closed — GL posting skipped`
          );
        } else {
          const { projectsEngine } = await import("../lib/engines/index.js");
          const glResult = await projectsEngine.postProjectClosureGL(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: (scope as any).activeAssignmentId ?? scope.userId },
            { projectId, projectName: project.name as string, totalWip }
          );
          journalEntryId = glResult.journalId;
        }
      } catch (glErr) {
        logger.error(glErr, `[projects-gl] WIP→COGS journal entry failed for project ${projectId}:`);
      }
    }

    // Drive the status transition through the lifecycle engine: atomic
    // state validation + UPDATE + event_log row + audit log + event bus
    // emission all run together. Replaces the pre-existing manual
    // pre-check + direct UPDATE + createAuditLog + emitEvent fan-out.
    try {
      await applyTransition({
        entity: "projects",
        id: projectId,
        scope: {
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
        },
        action: "project.closed",
        fromStates: ["active", "in_progress", "planning", "planned", "on_hold", "draft", "blocked"],
        toState: "completed",
        after: { totalWip, journalEntryId },
      });
    } catch (err) {
      const mapped = lifecycleErrorResponse(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "projects",
      entityId: projectId,
      after: { status: "completed", totalWip, journalEntryId },
    }).catch((e) => logger.error(e, "projects background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.closed",
      entity: "projects",
      entityId: projectId,
      after: { status: "completed", totalWip, journalEntryId },
    }).catch((e) => logger.error(e, "projects background task failed"));

    // Cancel all outstanding delivery/milestone obligations for this project
    // (runs after the transition commits so a failure here doesn't undo the
    // close — same semantics as before).
    try {
      await cancelObligation(scope.companyId, "project", projectId);
      const msRows = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2`,
        [projectId, scope.companyId]
      );
      for (const m of msRows) {
        await cancelObligation(scope.companyId, "project_milestone", m.id as number).catch((e) => logger.error(e, "projects background task failed"));
      }
    } catch (obErr) {
      logger.error(obErr, `[projects] cancel obligations on close failed for project ${projectId}:`);
    }

    // Notify the project team that the project is closed.
    try {
      const teamRows = await rawQuery<{ employeeId: number }>(
        `SELECT DISTINCT pr."employeeId" FROM project_resources pr
         WHERE pr."projectId" = $1 AND pr."employeeId" IS NOT NULL`,
        [projectId]
      );
      const managerRow = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
         WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active' LIMIT 1`,
        [project.managerId ?? 0, scope.companyId]
      );
      const recipientAssignments = new Set<number>();
      if (managerRow[0]?.id) recipientAssignments.add(managerRow[0].id);
      for (const t of teamRows) {
        const [asn] = await rawQuery<{ id: number }>(
          `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
          [t.employeeId, scope.companyId]
        );
        if (asn?.id) recipientAssignments.add(asn.id);
      }
      for (const assignmentId of recipientAssignments) {
        createNotification({
          companyId: scope.companyId,
          assignmentId,
          type: "project_closed",
          title: `تم إقفال المشروع: ${project.name}`,
          body: `تم إقفال المشروع وتحويل التكاليف (${totalWip} ريال) إلى الحسابات النهائية.`,
          priority: "normal",
          refType: "project",
          refId: projectId,
        }).catch((e) => logger.error(e, "projects background task failed"));
      }
    } catch (notifyErr) {
      logger.error(notifyErr, `[projects] notify team on close failed:`);
    }

    res.json({
      message: "تم إقفال المشروع",
      projectId,
      totalWip,
      journalEntryId,
    });
  } catch (err) { handleRouteError(err, res, "Close project error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GANTT DATA — بيانات مخطط غانت
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/gantt", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    const project = await assertProjectAccess(projectId, scope);

    const [phases, tasks, milestones] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT * FROM project_phases WHERE "projectId"=$1 ORDER BY "orderIndex" LIMIT 500`,
        [projectId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT pt.*, e.name AS "assigneeName" FROM project_tasks pt LEFT JOIN employees e ON e.id=pt."assigneeId" AND e."deletedAt" IS NULL WHERE pt."projectId"=$1 ORDER BY pt."startDate","phaseId" LIMIT 500`,
        [projectId]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT * FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY "targetDate"`,
        [projectId, scope.companyId]
      ),
    ]);
    const dependencies = tasks.length > 0
      ? await rawQuery<Record<string, unknown>>(
          `SELECT * FROM project_task_dependencies WHERE "taskId" IN (${tasks.map((_: any, i: number) => `$${i+1}`).join(',')})`,
          tasks.map((t: any) => t.id)
        )
      : [];

    // Build gantt rows
    const ganttRows = [
      ...phases.map((p: any) => ({
        id: `phase-${p.id}`, type: 'phase', title: p.name,
        start: p.startDate, end: p.endDate,
        status: p.status, progress: null,
      })),
      ...tasks.map((t: any) => ({
        id: `task-${t.id}`, type: 'task', title: t.title,
        start: t.startDate, end: t.dueDate,
        phaseId: t.phaseId ? `phase-${t.phaseId}` : null,
        status: t.status, progress: t.progress || 0,
        assigneeName: t.assigneeName,
        estimatedHours: t.estimatedHours, actualHours: t.actualHours,
        dependsOn: dependencies.filter((d: any) => d.taskId === t.id).map((d: any) => `task-${d.dependsOnId}`),
      })),
      ...milestones.map((m: any) => ({
        id: `ms-${m.id}`, type: 'milestone', title: m.title,
        start: m.targetDate, end: m.targetDate,
        status: m.status,
      })),
    ];

    res.json({
      project: { id: project.id, name: project.name, startDate: project.startDate, endDate: project.endDate, status: project.status },
      rows: ganttRows,
    });
  } catch (err) { handleRouteError(err, res, "Gantt data error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT-LINKED LETTERS — المراسلات المرتبطة بالمشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/letters", authorize({ feature: "projects.list", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = parseId(req.params.id, "id");
    await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT l.id, l.subject, l.direction, l.direction AS type, l.status, l."sentAt" AS "letterDate",
              l."senderName" AS "fromEntity", l."recipientName" AS "toEntity", l."createdAt"
       FROM correspondence l
       WHERE l."companyId" = $1
         AND l."entityType" = 'project'
         AND l."entityId" = $2
         AND l."deletedAt" IS NULL
       ORDER BY l."sentAt" DESC NULLS LAST, l."createdAt" DESC
       LIMIT 50`,
      [scope.companyId, projectId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project letters error:"); }
});

export default router;
