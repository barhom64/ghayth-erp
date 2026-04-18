import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { criticalPathLength } from "../lib/algorithms.js";
import {
  createNotification,
  createAuditLog,
  createJournalEntry,
  checkFinancialPeriodOpen,
  getAccountCodeFromMapping,
  emitEvent,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { registerObligation, cancelObligation, markObligationMet } from "../lib/obligationsEngine.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// ZOD VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1, "اسم المشروع مطلوب"),
  description: z.string().optional().nullable(),
  clientId: z.number().optional().nullable(),
  managerId: z.number().optional().nullable(),
  startDate: z.string().min(1, "تاريخ بداية المشروع مطلوب"),
  endDate: z.string().min(1, "تاريخ نهاية المشروع مطلوب"),
  budget: z.union([z.number(), z.string()]).optional().nullable(),
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
  budget: z.union([z.number(), z.string()]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  managerId: z.number().optional().nullable(),
  spentAmount: z.union([z.number(), z.string()]).optional().nullable(),
}).partial();

const createPhaseSchema = z.object({
  name: z.string().min(1, "اسم المرحلة مطلوب"),
  orderIndex: z.number().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const createTaskSchema = z.object({
  title: z.string().min(1, "عنوان المهمة مطلوب"),
  description: z.string().optional().nullable(),
  assigneeId: z.number().optional().nullable(),
  phaseId: z.number().optional().nullable(),
  priority: z.string().optional(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.union([z.number(), z.string()]).optional().nullable(),
  dependsOn: z.array(z.number()).optional(),
});

const updateTaskSchema = z.object({
  status: z.string().optional(),
  progress: z.union([z.number(), z.string()]).optional(),
  actualHours: z.union([z.number(), z.string()]).optional(),
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
  probability: z.union([z.number(), z.string()]).optional(),
  impact: z.union([z.number(), z.string()]).optional(),
  mitigationPlan: z.string().optional().nullable(),
  responsibleId: z.number().optional().nullable(),
});

const updateRiskSchema = z.object({
  title: z.string().min(1, "عنوان المخاطرة مطلوب").optional(),
  status: z.string().optional(),
  mitigationPlan: z.string().optional().nullable(),
  probability: z.union([z.number(), z.string()]).optional(),
  impact: z.union([z.number(), z.string()]).optional(),
}).partial();

const createResourceSchema = z.object({
  employeeId: z.number().optional().nullable(),
  taskId: z.number().optional().nullable(),
  role: z.string().optional(),
  allocatedHours: z.union([z.number(), z.string()]).optional(),
  budgetAllocated: z.union([z.number(), z.string()]).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const createCostSchema = z.object({
  description: z.string().min(1, "وصف التكلفة مطلوب"),
  amount: z.union([z.number(), z.string()]).refine((v) => Number(v) > 0, { message: "المبلغ يجب أن يكون أكبر من صفر" }),
  category: z.string().optional(),
  costDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  sourceType: z.string().optional(),
});

const closeProjectSchema = z.object({}).passthrough();

const router = Router();
router.use(authMiddleware);

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

const PHASE_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
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

router.get("/", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', disableBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND p.status = $${paramIdx}`; params.push(status); paramIdx++; }

    const managerOnlyRoles = ["projects_manager"];
    if (!scope.isOwner && scope.role !== "owner" && scope.role !== "general_manager" && managerOnlyRoles.includes(scope.role) && scope.employeeId) {
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

    const rows = await rawQuery<any>(
      `SELECT p.*, cl.name AS "clientName", e.name AS "managerName" FROM projects p LEFT JOIN clients cl ON cl.id=p."clientId" LEFT JOIN employees e ON e.id=p."managerId" WHERE ${where} AND p."deletedAt" IS NULL ORDER BY p.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Projects error:"); }
});

function isFullAccess(scope: any) {
  return scope.isOwner || scope.role === "owner" || scope.role === "general_manager";
}

/**
 * Assert that the current user can access the given project.
 * Throws a typed NotFoundError when the project does not exist or the
 * caller lacks scope — handleRouteError will translate that into a 404.
 * Never returns null anymore; all callers can rely on the returned row.
 */
async function assertProjectAccess(projectId: number, scope: any): Promise<any> {
  let where = `id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
  const params: any[] = [projectId, scope.companyId];

  if (!isFullAccess(scope)) {
    if (scope.role === "projects_manager" && scope.employeeId) {
      where += ` AND "managerId" = $3`;
      params.push(scope.employeeId);
    } else if (scope.role === "employee" && scope.employeeId) {
      where += ` AND ("managerId" = $3 OR id IN (SELECT "projectId" FROM project_tasks WHERE "assigneeId" = $3))`;
      params.push(scope.employeeId);
    }
  }

  const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE ${where}`, params);
  if (!project) {
    throw new NotFoundError("المشروع غير موجود أو غير مصرح بالوصول إليه");
  }
  return project;
}

router.post("/", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية إنشاء مشاريع", { fix: "راجع مدير الحساب للحصول على صلاحية projects_manager" });
    }
    const b = req.body;
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
      const [cl] = await rawQuery<any>(
        `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.clientId, scope.companyId]
      );
      if (!cl) {
        throw new ValidationError("العميل غير موجود", { field: "clientId", fix: "اختر عميلاً مسجلاً أو اترك الحقل فارغاً" });
      }
    }
    if (b.managerId) {
      const [emp] = await rawQuery<any>(
        `SELECT id FROM employees WHERE id=$1`,
        [b.managerId]
      );
      if (!emp) {
        throw new ValidationError("مدير المشروع غير موجود", { field: "managerId", fix: "اختر موظفاً مسجلاً" });
      }
    }
    const managerId = scope.role === "projects_manager" ? scope.employeeId : b.managerId;
    const { insertId } = await rawExecute(
      `INSERT INTO projects ("companyId",name,description,"clientId","managerId","startDate","endDate",budget,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, b.name.trim(), b.description, b.clientId || null, managerId, b.startDate, b.endDate, b.budget || 0, b.status || 'planning']
    );

    if (b.phases && Array.isArray(b.phases)) {
      for (let i = 0; i < b.phases.length; i++) {
        const phase = b.phases[i];
        await rawExecute(
          `INSERT INTO project_phases ("projectId",name,"orderIndex","startDate","endDate") VALUES ($1,$2,$3,$4,$5)`,
          [insertId, phase.name, i, phase.startDate, phase.endDate]
        );
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "projects",
      entityId: insertId,
      after: { name: b.name, clientId: b.clientId, budget: b.budget, status: b.status || 'planning' },
    }).catch(console.error);

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
      } catch (obErr) { console.error("Project delivery obligation failed:", obErr); }
    }

    await emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "project.created",
      entity: "projects",
      entityId: insertId,
      details: `إنشاء مشروع ${b.name}`,
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create project error:"); }
});

router.get("/:id", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    let detailWhere = `p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`;
    const detailParams: any[] = [Number(req.params.id), scope.companyId];

    if (!scope.isOwner && scope.role !== "owner" && scope.role !== "general_manager") {
      if (scope.role === "projects_manager" && scope.employeeId) {
        detailWhere += ` AND p."managerId" = $3`;
        detailParams.push(scope.employeeId);
      } else if (scope.role === "employee" && scope.employeeId) {
        detailWhere += ` AND (p."managerId" = $3 OR p.id IN (SELECT "projectId" FROM project_tasks WHERE "assigneeId" = $3))`;
        detailParams.push(scope.employeeId);
      }
    }

    const [project] = await rawQuery<any>(`SELECT p.*, cl.name AS "clientName" FROM projects p LEFT JOIN clients cl ON cl.id=p."clientId" WHERE ${detailWhere}`, detailParams);
    if (!project) throw new NotFoundError("المشروع غير موجود");
    const phases = await rawQuery<any>(`SELECT * FROM project_phases WHERE "projectId"=$1 ORDER BY "orderIndex"`, [project.id]);
    const tasks = await rawQuery<any>(`SELECT pt.*, e.name AS "assigneeName" FROM project_tasks pt LEFT JOIN employees e ON e.id=pt."assigneeId" WHERE pt."projectId"=$1 ORDER BY pt."dueDate"`, [project.id]);

    let taskDeps: any[] = [];
    if (tasks.length > 0) {
      taskDeps = await rawQuery<any>(`SELECT * FROM project_task_dependencies WHERE "taskId" IN (${tasks.map((_: any, i: number) => `$${i + 1}`).join(',')})`, tasks.map((t: any) => t.id));
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
    const endDate = project.endDate ? new Date(project.endDate) : null;
    const isSlipping = endDate && today > endDate && project.status === 'active';

    let delayFinancialImpact = 0;
    if (isSlipping) {
      const delayDays = Math.floor((today.getTime() - endDate!.getTime()) / (1000 * 60 * 60 * 24));
      const dailyBudget = budget / Math.max(1, Math.round((endDate!.getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24)));
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

router.patch("/:id", requirePermission("projects:update"), async (req, res) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية تعديل هذا المشروع", { fix: "صلاحية projects_manager مطلوبة" });
    }
    let findQuery = `SELECT * FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    }
    const [existing] = await rawQuery<any>(findQuery, findParams);
    if (!existing) throw new NotFoundError("المشروع غير موجود");
    const b = req.body;

    // State machine — /close is the only way to reach `completed`; PATCH
    // refuses direct transitions to terminal states.
    if (b.status !== undefined && b.status !== existing.status) {
      if (!PROJECT_STATUSES.includes(b.status)) {
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
      const allowedNext = PROJECT_TRANSITIONS[existing.status] ?? [];
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
      const [emp] = await rawQuery<any>(
        `SELECT id FROM employees WHERE id=$1`,
        [b.managerId]
      );
      if (!emp) {
        throw new ValidationError("مدير المشروع غير موجود", { field: "managerId", fix: "اختر موظفاً مسجلاً" });
      }
    }

    const tracked = ["name","description","status","budget","startDate","endDate","managerId","spentAmount"] as const;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
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
    params.push(id);
    await rawExecute(`UPDATE projects SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1`, [id]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "projects",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "project.status_changed" : "project.updated",
      entity: "projects",
      entityId: id,
      before,
      after,
    }).catch(console.error);

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update project error:"); }
});

router.delete("/:id", requirePermission("projects:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      throw new ForbiddenError("لا تملك صلاحية حذف هذا المشروع", { fix: "صلاحية projects_manager مطلوبة" });
    }
    let findQuery = `SELECT id, name, status FROM projects WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    }
    const [existing] = await rawQuery<any>(findQuery, findParams);
    if (!existing) throw new NotFoundError("المشروع غير موجود");

    if (["active", "in_progress"].includes(existing.status)) {
      throw new ConflictError(
        `لا يمكن حذف مشروع بحالة "${existing.status}"`,
        { field: "status", fix: "ألغِ المشروع أو أقفله عبر /projects/:id/close قبل الحذف" }
      );
    }

    await rawExecute(`UPDATE projects SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.deleted",
      entity: "projects",
      entityId: id,
      before: { name: existing.name, status: existing.status },
      after: { deletedAt: new Date().toISOString() },
    }).catch(console.error);

    res.json({ message: "تم حذف المشروع بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete project error:"); }
});

router.post("/:id/phases", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createPhaseSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const b = req.body;
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      throw new ValidationError("اسم المرحلة مطلوب", { field: "name", fix: "أدخل اسم المرحلة" });
    }
    await assertProjectAccess(projectId, scope);
    const { insertId } = await rawExecute(
      `INSERT INTO project_phases ("projectId",name,"orderIndex","startDate","endDate") VALUES ($1,$2,$3,$4,$5)`,
      [projectId, b.name.trim(), b.orderIndex || 0, b.startDate || null, b.endDate || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM project_phases WHERE id=$1`, [insertId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.phase.created",
      entity: "project_phases",
      entityId: insertId,
      after: { projectId, name: b.name.trim() },
    }).catch(console.error);

    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create phase error:"); }
});

router.patch("/:id/phases/:phaseId/complete", requirePermission("projects:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const phaseId = Number(req.params.phaseId);

    const project = await assertProjectAccess(projectId, scope);

    const [phase] = await rawQuery<any>(`SELECT * FROM project_phases WHERE id=$1 AND "projectId"=$2`, [phaseId, projectId]);
    if (!phase) throw new NotFoundError("المرحلة غير موجودة");

    // State machine — phases must be pending or in_progress to complete
    const allowedNext = PHASE_TRANSITIONS[phase.status ?? "pending"] ?? [];
    if (!allowedNext.includes("completed")) {
      throw new ConflictError(
        `لا يمكن إكمال مرحلة حالتها "${phase.status ?? "pending"}"`,
        { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` }
      );
    }

    await rawExecute(`UPDATE project_phases SET status='completed' WHERE id=$1 AND "projectId"=$2`, [phaseId, projectId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "project.phase.completed",
      entity: "project_phases",
      entityId: phaseId,
      before: { status: phase.status ?? "pending" },
      after: { status: "completed" },
    }).catch(console.error);

    let milestoneInvoiceCreated = false;
    if (project?.clientId) {
      try {
        const allPhases = await rawQuery<any>(`SELECT id FROM project_phases WHERE "projectId"=$1`, [projectId]);
        const phaseWeight = allPhases.length > 0 ? 1 / allPhases.length : 0.25;
        const milestoneAmount = Number(project.budget) * phaseWeight;
        const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
        const yearShort = String(new Date().getFullYear()).slice(2);
        const ref = `INV-MS-${yearShort}${monthNum}-${phaseId}`;
        const vatAmount = milestoneAmount * 0.15;
        await rawExecute(
          `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,15,0,'draft',$8,$9)`,
          [scope.companyId, project.clientId, ref, `فاتورة إنجاز مرحلة: ${phase?.name || ''} - مشروع: ${project.name}`, milestoneAmount, milestoneAmount + vatAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
        );
        milestoneInvoiceCreated = true;
      } catch (milestoneInvoiceErr) {
        console.error("Failed to create milestone invoice for phase", phaseId, milestoneInvoiceErr);
      }
    }

    const tasks = await rawQuery<any>(`SELECT * FROM project_tasks WHERE "projectId"=$1`, [projectId]);
    const doneTasks = tasks.filter((t: any) => t.status === 'done').length;
    const progressPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    await rawExecute(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "deletedAt" IS NULL`, [progressPct, projectId]);

    res.json({ message: 'تم إكمال المرحلة', phase, milestoneInvoiceCreated, progressPct });
  } catch (err) { handleRouteError(err, res, "Complete phase error:"); }
});

router.post("/:id/tasks", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);

    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المهمة مطلوب", { field: "title", fix: "أدخل عنواناً واضحاً للمهمة" });
    }
    await assertProjectAccess(projectId, scope);

    if (b.assigneeId) {
      const [emp] = await rawQuery<any>(
        `SELECT id FROM employees WHERE id=$1`,
        [b.assigneeId]
      );
      if (!emp) {
        throw new ValidationError("الموظف المُكلَّف غير موجود", { field: "assigneeId", fix: "اختر موظفاً مسجلاً" });
      }
    }
    if (b.phaseId) {
      const [phase] = await rawQuery<any>(
        `SELECT id FROM project_phases WHERE id=$1 AND "projectId"=$2`,
        [b.phaseId, projectId]
      );
      if (!phase) {
        throw new ValidationError("المرحلة غير موجودة", { field: "phaseId", fix: "اختر مرحلة تابعة لهذا المشروع" });
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO project_tasks ("projectId","phaseId",title,description,"assigneeId",priority,status,"startDate","dueDate","estimatedHours") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId, b.phaseId || null, b.title.trim(), b.description || null, b.assigneeId || null, b.priority || 'medium', 'todo', b.startDate || null, b.dueDate || null, b.estimatedHours || null]
    );

    if (Array.isArray(b.dependsOn) && b.dependsOn.length > 0) {
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const depId of b.dependsOn) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2})`);
        params.push(insertId, depId);
      }
      try {
        await rawExecute(
          `INSERT INTO project_task_dependencies ("taskId","dependsOnId") VALUES ${valuesSql.join(",")} ON CONFLICT DO NOTHING`,
          params
        );
      } catch (depErr) {
        console.error(`Failed to create task dependencies for ${insertId}:`, depErr);
      }

      const placeholders = b.dependsOn.map((_: any, i: number) => `$${i + 1}`).join(',');
      const blockedDeps = await rawQuery<any>(
        `SELECT pt.status FROM project_tasks pt WHERE pt.id IN (${placeholders})`,
        b.dependsOn
      );
      const allDepsDone = blockedDeps.every((d: any) => d.status === 'done');
      if (!allDepsDone) {
        await rawExecute(`UPDATE project_tasks SET status='blocked' WHERE id=$1`, [insertId]);
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM project_tasks WHERE id=$1`, [insertId]);

    if (b.assigneeId) {
      const [assigneeAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND status = 'active' LIMIT 1`,
        [b.assigneeId]
      );
      if (assigneeAssignment) {
        createNotification({
          companyId: scope.companyId,
          assignmentId: assigneeAssignment.id,
          type: "task_assigned",
          title: "مهمة جديدة مسندة إليك",
          body: `تم إسناد المهمة "${b.title}" إليك — الأولوية: ${b.priority || 'medium'}`,
          priority: "normal",
          refType: "project_tasks",
          refId: insertId,
        }).catch(console.error);
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
    }).catch(console.error);

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
router.patch("/tasks/:taskId", requirePermission("projects:update"), async (req, res) => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const taskId = Number(req.params.taskId);
    const b = req.body;

    const [existingTask] = await rawQuery<any>(
      `SELECT pt.* FROM project_tasks pt
       JOIN projects p ON p.id = pt."projectId"
       WHERE pt.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`,
      [taskId, scope.companyId]
    );
    if (!existingTask) throw new NotFoundError("المهمة غير موجودة");
    await assertProjectAccess(existingTask.projectId, scope);

    // State machine for task status transitions
    if (b.status !== undefined && b.status !== existingTask.status) {
      if (!TASK_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة مهمة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${TASK_STATUSES.join(", ")}` }
        );
      }
      const allowedNext = TASK_TRANSITIONS[existingTask.status ?? "todo"] ?? [];
      if (!allowedNext.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المهمة من "${existingTask.status ?? "todo"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowedNext.length ? allowedNext.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
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
    await rawExecute(`UPDATE project_tasks SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "update",
      entity: "project_tasks",
      entityId: taskId,
      before,
      after,
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "status" in after ? "project.task.status_changed" : "project.task.updated",
      entity: "project_tasks",
      entityId: taskId,
      before,
      after,
    }).catch(console.error);

    const [task] = await rawQuery<any>(`SELECT * FROM project_tasks WHERE id=$1`, [taskId]);

    let unlockedTasks: any[] = [];
    if (b.status === 'done' && task?.projectId) {
      const candidateTasks = await rawQuery<any>(
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

      const candidateIds = candidateTasks.map((d: any) => Number(d.taskId));
      if (candidateIds.length > 0) {
        // 1) Single UPDATE that returns the rows that actually moved from
        //    blocked -> todo, so we don't need a follow-up SELECT per row.
        unlockedTasks = await rawQuery<any>(
          `UPDATE project_tasks SET status='todo'
           WHERE id = ANY($1) AND status='blocked'
           RETURNING *`,
          [candidateIds]
        );

        // 2) Resolve all assignment ids in one query, then notify.
        const assigneeIds = Array.from(
          new Set(unlockedTasks.map((t: any) => t.assigneeId).filter((x: any) => x != null))
        );
        if (assigneeIds.length > 0) {
          try {
            const asgnRows = await rawQuery<{ id: number; employeeId: number }>(
              `SELECT DISTINCT ON ("employeeId") id, "employeeId"
               FROM employee_assignments
               WHERE "employeeId" = ANY($1) AND status='active'
               ORDER BY "employeeId", id`,
              [assigneeIds]
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
              }).catch(console.error);
            }
          } catch (e) { console.error("Unlock notification error:", e); }
        }
      }
    }

    if (task?.projectId) {
      const allTasks = await rawQuery<any>(`SELECT * FROM project_tasks WHERE "projectId"=$1`, [task.projectId]);
      const doneTasks = allTasks.filter((t: any) => t.status === 'done').length;
      const progressPct = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : 0;
      await rawExecute(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2 AND "deletedAt" IS NULL`, [progressPct, task.projectId]);

      const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1 AND "deletedAt" IS NULL`, [task.projectId]);

      const budget = Number(project?.budget) || 0;
      const spentAmount = Number(project?.spentAmount) || 0;
      if (budget > 0 && spentAmount >= budget * 0.8) {
        console.log(`[ALERT] Project ${task.projectId} reached ${Math.round((spentAmount / budget) * 100)}% of budget`);
      }

      const endDate = project?.endDate ? new Date(project.endDate) : null;
      if (endDate && new Date() > endDate && project?.status === 'active' && progressPct < 100) {
        const delayDays = Math.floor((Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24));
        const projectDuration = Math.max(1, Math.round((endDate.getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24)));
        const dailyBudget = budget / projectDuration;
        const delayImpact = dailyBudget * delayDays;
        console.log(`[ALERT] Project ${task.projectId} is slipping: ${delayDays} days late, financial impact: ${delayImpact.toFixed(2)} SAR`);
      }
    }

    res.json({ ...task, unlockedTasks: unlockedTasks.length > 0 ? unlockedTasks : undefined });
  } catch (err) { handleRouteError(err, res, "Update project task error:"); }
});

router.get("/stats/summary", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [projects] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='completed') as completed FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [budget] = await rawQuery<any>(`SELECT COALESCE(SUM(budget),0) as "totalBudget", COALESCE(SUM("spentAmount"),0) as "totalSpent" FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [slipping] = await rawQuery<any>(`SELECT COUNT(*) as count FROM projects WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status='active' AND "endDate" < CURRENT_DATE`, [cid]);
    res.json({
      totalProjects: Number(projects.total), activeProjects: Number(projects.active),
      completedProjects: Number(projects.completed), totalBudget: Number(budget.totalBudget),
      totalSpent: Number(budget.totalSpent), slippingProjects: Number(slipping.count),
    });
  } catch (err) { handleRouteError(err, res, "Projects stats error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT MILESTONES — معالم المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/milestones", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<any>(
      `SELECT * FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY "targetDate"`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Milestones error:"); }
});

router.post("/:id/milestones", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createMilestoneSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المعلَم مطلوب", { field: "title", fix: "أدخل عنواناً واضحاً للمعلَم" });
    }
    if (!b.targetDate) {
      throw new ValidationError("تاريخ المعلَم المستهدف مطلوب", { field: "targetDate", fix: "حدد التاريخ المستهدف" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO project_milestones ("projectId","companyId",title,description,"targetDate",status,"completedDate")
       VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
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
    } catch (obErr) { console.error("Milestone obligation failed:", obErr); }

    const [row] = await rawQuery<any>(`SELECT * FROM project_milestones WHERE id=$1`, [insertId]);
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
router.patch("/milestones/:milestoneId", requirePermission("projects:update"), async (req, res) => {
  try {
    const parsed = updateMilestoneSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const id = Number(req.params.milestoneId);
    const [existing] = await rawQuery<any>(
      `SELECT * FROM project_milestones WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المعلم غير موجود");
    await assertProjectAccess(existing.projectId, scope);
    const b = req.body;

    if (b.status !== undefined && b.status !== existing.status) {
      if (!MILESTONE_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة معلَم غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${MILESTONE_STATUSES.join(", ")}` }
        );
      }
      const allowed = MILESTONE_TRANSITIONS[existing.status ?? "pending"] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المعلَم من "${existing.status ?? "pending"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.targetDate !== undefined) { params.push(b.targetDate); sets.push(`"targetDate"=$${params.length}`); }
    if (b.completedDate !== undefined) { params.push(b.completedDate); sets.push(`"completedDate"=$${params.length}`); }
    if (b.status === 'completed' && !b.completedDate) sets.push(`"completedDate"=NOW()`);
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(
      `UPDATE project_milestones SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );

    // If milestone was marked completed, mark its obligation as met
    if (b.status === 'completed') {
      await markObligationMet(scope.companyId, "project_milestone", id, "delivery").catch(console.error);
    }

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update milestone error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT RISKS — مخاطر المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/risks", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<any>(
      `SELECT * FROM project_risks WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY (probability * impact) DESC`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project risks error:"); }
});

router.post("/:id/risks", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createRiskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      throw new ValidationError("عنوان المخاطرة مطلوب", { field: "title", fix: "أدخل وصفاً مختصراً للمخاطرة" });
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
    const [row] = await rawQuery<any>(`SELECT * FROM project_risks WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create risk error:"); }
});

// P02-S5-HIGH — same bypass as milestone PATCH above. Risk PATCH only
// validated `companyId`, letting any `projects:update` user rewrite
// probability / impact / mitigation / status on risks across every
// project in the company — including projects the caller's role does
// not have read access to via `assertProjectAccess`.
router.patch("/risks/:riskId", requirePermission("projects:update"), async (req, res) => {
  try {
    const parsed = updateRiskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const id = Number(req.params.riskId);
    const [existingRisk] = await rawQuery<any>(
      `SELECT * FROM project_risks WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!existingRisk) throw new NotFoundError("المخاطرة غير موجودة");
    await assertProjectAccess(existingRisk.projectId, scope);
    const b = req.body;

    if (b.status !== undefined && b.status !== existingRisk.status) {
      if (!RISK_STATUSES.includes(b.status)) {
        throw new ValidationError(
          `حالة مخاطرة غير صالحة: ${b.status}`,
          { field: "status", fix: `اختر من: ${RISK_STATUSES.join(", ")}` }
        );
      }
      const allowed = RISK_TRANSITIONS[existingRisk.status ?? "open"] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل المخاطرة من "${existingRisk.status ?? "open"}" إلى "${b.status}"`,
          { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد"}` }
        );
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.mitigationPlan !== undefined) { params.push(b.mitigationPlan); sets.push(`"mitigationPlan"=$${params.length}`); }
    if (b.probability !== undefined) { params.push(b.probability); sets.push(`probability=$${params.length}`); }
    if (b.impact !== undefined) { params.push(b.impact); sets.push(`impact=$${params.length}`); }
    // Recompute riskScore whenever probability OR impact changes (fetch current values for the missing one)
    if (b.probability !== undefined || b.impact !== undefined) {
      const [existing] = await rawQuery<any>(
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
    if (sets.length === 0) { res.json({ ok: true }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(
      `UPDATE project_risks SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) throw new NotFoundError("المخاطرة غير موجودة");
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update risk error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT RESOURCES — تخصيص موارد المشروع
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/resources", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<any>(
      `SELECT pr.*, e.name AS "employeeName", e."jobTitle" AS "employeeJobTitle"
       FROM project_resources pr
       LEFT JOIN employees e ON e.id=pr."employeeId"
       WHERE pr."projectId"=$1 AND pr."companyId"=$2
       ORDER BY pr.id`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project resources error:"); }
});

router.post("/:id/resources", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createResourceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    const { insertId } = await rawExecute(
      `INSERT INTO project_resources ("projectId","companyId","employeeId","taskId",role,"allocatedHours","budgetAllocated","startDate","endDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [projectId, scope.companyId, b.employeeId || null, b.taskId || null,
       b.role || 'member', b.allocatedHours || 0, b.budgetAllocated || 0,
       b.startDate || null, b.endDate || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM project_resources WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create resource error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT COST TRACKING — تتبع التكاليف الفعلية
// ─────────────────────────────────────────────────────────────────────────────

router.get("/:id/costs", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
    const rows = await rawQuery<any>(
      `SELECT pc.*, e.name AS "enteredByName"
       FROM project_costs pc
       LEFT JOIN employees e ON e.id=pc."enteredBy"
       WHERE pc."projectId"=$1 AND pc."companyId"=$2
       ORDER BY pc."costDate" DESC`,
      [projectId, scope.companyId]
    );
    const [totals] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) AS "totalActual" FROM project_costs WHERE "projectId"=$1 AND "companyId"=$2`,
      [projectId, scope.companyId]
    );
    res.json({
      data: rows, total: rows.length,
      totalActual: Number(totals?.totalActual || 0),
      budget: Number(project?.budget || 0),
      variance: Number(project?.budget || 0) - Number(totals?.totalActual || 0),
    });
  } catch (err) { handleRouteError(err, res, "Project costs error:"); }
});

router.post("/:id/costs", requirePermission("projects:create"), async (req, res) => {
  try {
    const parsed = createCostSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);
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
    const costDate = b.costDate || new Date().toISOString().split('T')[0];
    const { insertId } = await rawExecute(
      `INSERT INTO project_costs ("projectId","companyId",description,amount,category,"costDate","enteredBy",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [projectId, scope.companyId, b.description, b.amount,
       b.category || 'other', costDate,
       scope.employeeId || null, b.notes || null]
    );
    // Update project spentAmount
    await rawExecute(
      `UPDATE projects SET "spentAmount"=COALESCE("spentAmount",0)+$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [b.amount, projectId, scope.companyId]
    );

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
          console.warn(
            `[projects-gl] project cost ${insertId}: financial period "${period.periodName}" is closed — GL posting skipped`
          );
          // Stamp a note in the cost row so users see the reason.
          await rawExecute(
            `UPDATE project_costs SET notes = COALESCE(notes,'') || $1 WHERE id=$2`,
            [
              ` [GL skipped: الفترة المالية "${period.periodName ?? ""}" مغلقة]`,
              insertId,
            ]
          ).catch(() => {});
        } else {
          const srcType: string = String(
            b.sourceType || b.category || "cash"
          ).toLowerCase();
          let creditFallback = "1100"; // cash default
          if (
            srcType === "ap" ||
            srcType === "vendor" ||
            srcType === "supplier" ||
            srcType === "invoice"
          )
            creditFallback = "2100";
          else if (
            srcType === "inventory" ||
            srcType === "material" ||
            srcType === "materials" ||
            srcType === "stock"
          )
            creditFallback = "1300";

          const debitCode = await getAccountCodeFromMapping(
            scope.companyId,
            "project_wip",
            "debit",
            "1350"
          );
          const creditCode = await getAccountCodeFromMapping(
            scope.companyId,
            "project_wip",
            "credit",
            creditFallback
          );

          journalEntryId = await createJournalEntry({
            companyId: scope.companyId,
            branchId: scope.branchId,
            createdBy: (scope as any).activeAssignmentId ?? scope.userId,
            ref: `PROJ-COST-${insertId}`,
            description: `تكلفة مشروع "${project.name}" — ${b.description}`,
            sourceType: "project_cost",
            sourceId: insertId,
            operationType: "project_wip",
            lines: [
              {
                accountCode: debitCode,
                debit: amount,
                credit: 0,
                projectId,
                description: b.description,
              },
              {
                accountCode: creditCode,
                debit: 0,
                credit: amount,
                projectId,
              },
            ],
          });
        }
      }
    } catch (glErr) {
      console.error(
        `[projects-gl] journal entry failed for project cost ${insertId}:`,
        glErr
      );
    }

    const [row] = await rawQuery<any>(`SELECT * FROM project_costs WHERE id=$1`, [insertId]);
    res.status(201).json({ ...row, journalEntryId });
  } catch (err) { handleRouteError(err, res, "Create project cost error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Project closure — transfers accumulated WIP balance to Project Cost expense
// and marks the project status='completed'. Must be called once per project
// after all costs have been recorded. Idempotent: if the project is already
// completed, returns without posting a duplicate entry.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/close", requirePermission("projects:update"), async (req, res) => {
  try {
    const parsed = closeProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);

    const [totals] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) AS "totalWip"
         FROM project_costs
        WHERE "projectId" = $1 AND "companyId" = $2`,
      [projectId, scope.companyId]
    );
    const totalWip = Number(totals?.totalWip || 0);

    let journalEntryId: number | null = null;
    if (totalWip > 0) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const period = await checkFinancialPeriodOpen(scope.companyId, today);
        if (!period.open) {
          console.warn(
            `[projects-gl] project close ${projectId}: financial period "${period.periodName}" is closed — GL posting skipped`
          );
        } else {
          const debitCode = await getAccountCodeFromMapping(
            scope.companyId,
            "project_cost_transfer",
            "debit",
            "5225"
          );
          const creditCode = await getAccountCodeFromMapping(
            scope.companyId,
            "project_cost_transfer",
            "credit",
            "1350"
          );
          journalEntryId = await createJournalEntry({
            companyId: scope.companyId,
            branchId: scope.branchId,
            createdBy: (scope as any).activeAssignmentId ?? scope.userId,
            ref: `PROJ-CLOSE-${projectId}`,
            description: `إقفال مشروع "${project.name}" — تحويل WIP ${totalWip.toFixed(2)} ريال إلى تكلفة المشاريع`,
            sourceType: "project_closure",
            sourceId: projectId,
            operationType: "project_cost_transfer",
            lines: [
              {
                accountCode: debitCode,
                debit: totalWip,
                credit: 0,
                projectId,
                description: "تحويل WIP إلى تكلفة المشروع",
              },
              {
                accountCode: creditCode,
                debit: 0,
                credit: totalWip,
                projectId,
              },
            ],
          });
        }
      } catch (glErr) {
        console.error(
          `[projects-gl] WIP→COGS journal entry failed for project ${projectId}:`,
          glErr
        );
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

    // Cancel all outstanding delivery/milestone obligations for this project
    // (runs after the transition commits so a failure here doesn't undo the
    // close — same semantics as before).
    try {
      await cancelObligation(scope.companyId, "project", projectId);
      const msRows = await rawQuery<any>(
        `SELECT id FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2`,
        [projectId, scope.companyId]
      );
      for (const m of msRows) {
        await cancelObligation(scope.companyId, "project_milestone", m.id).catch(() => {});
      }
    } catch (obErr) {
      console.error(`[projects] cancel obligations on close failed for project ${projectId}:`, obErr);
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

router.get("/:id/gantt", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope);

    const phases = await rawQuery<any>(
      `SELECT * FROM project_phases WHERE "projectId"=$1 ORDER BY "orderIndex"`,
      [projectId]
    );
    const tasks = await rawQuery<any>(
      `SELECT pt.*, e.name AS "assigneeName" FROM project_tasks pt LEFT JOIN employees e ON e.id=pt."assigneeId" WHERE pt."projectId"=$1 ORDER BY pt."startDate","phaseId"`,
      [projectId]
    );
    const milestones = await rawQuery<any>(
      `SELECT * FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY "targetDate"`,
      [projectId, scope.companyId]
    );
    const dependencies = tasks.length > 0
      ? await rawQuery<any>(
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

export default router;
