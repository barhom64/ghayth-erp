import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
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

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', branchColumn: 'p."branchId"', enforceBranchScope: true });
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
      `SELECT p.*, cl.name AS "clientName" FROM projects p LEFT JOIN clients cl ON cl.id=p."clientId" WHERE ${where} AND p."deletedAt" IS NULL ORDER BY p.id DESC`,
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
 * Returns the project row, or null if access denied (response already sent).
 */
async function assertProjectAccess(projectId: number, scope: any, res: any): Promise<any | null> {
  let where = `id=$1 AND "companyId"=$2`;
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
    res.status(404).json({ error: "المشروع غير موجود أو غير مصرح بالوصول إليه" });
    return null;
  }
  return project;
}

router.post("/", requirePermission("projects:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      res.status(403).json({ error: "لا تملك صلاحية إنشاء مشاريع" });
      return;
    }
    const b = req.body;
    const managerId = scope.role === "projects_manager" ? scope.employeeId : b.managerId;
    const { insertId } = await rawExecute(
      `INSERT INTO projects ("companyId",name,description,"clientId","managerId","startDate","endDate",budget,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, b.name, b.description, b.clientId, managerId, b.startDate, b.endDate, b.budget || 0, b.status || 'planning']
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
    let detailWhere = `p.id=$1 AND p."companyId"=$2`;
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
    if (!project) { res.status(404).json({ error: "المشروع غير موجود" }); return; }
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
    const scope = req.scope!;
    const id = Number(req.params.id);
    let findQuery = `SELECT id, "managerId" FROM projects WHERE id=$1 AND "companyId"=$2`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    } else if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      res.status(403).json({ error: "لا تملك صلاحية تعديل هذا المشروع" });
      return;
    }
    const [existing] = await rawQuery<any>(findQuery, findParams);
    if (!existing) { res.status(404).json({ error: "المشروع غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.budget !== undefined) { params.push(b.budget); sets.push(`budget=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.managerId !== undefined) { params.push(b.managerId); sets.push(`"managerId"=$${params.length}`); }
    if (b.spentAmount !== undefined) { params.push(b.spentAmount); sets.push(`"spentAmount"=$${params.length}`); }
    params.push(id);
    await rawExecute(`UPDATE projects SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update project error:"); }
});

router.delete("/:id", requirePermission("projects:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    let findQuery = `SELECT id FROM projects WHERE id=$1 AND "companyId"=$2`;
    const findParams: any[] = [id, scope.companyId];
    if (!isFullAccess(scope) && scope.role === "projects_manager" && scope.employeeId) {
      findQuery += ` AND "managerId"=$3`;
      findParams.push(scope.employeeId);
    } else if (!isFullAccess(scope) && scope.role !== "projects_manager") {
      res.status(403).json({ error: "لا تملك صلاحية حذف هذا المشروع" });
      return;
    }
    const [existing] = await rawQuery<any>(findQuery, findParams);
    if (!existing) { res.status(404).json({ error: "المشروع غير موجود" }); return; }
    await rawExecute(`UPDATE projects SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المشروع بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete project error:"); }
});

router.post("/:id/phases", requirePermission("projects:create"), async (req, res) => {
  try {
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO project_phases ("projectId",name,"orderIndex","startDate","endDate") VALUES ($1,$2,$3,$4,$5)`,
      [Number(req.params.id), b.name, b.orderIndex || 0, b.startDate, b.endDate]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM project_phases WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create phase error:"); }
});

router.patch("/:id/phases/:phaseId/complete", requirePermission("projects:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const phaseId = Number(req.params.phaseId);

    const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1 AND "companyId"=$2`, [projectId, scope.companyId]);
    if (!project) { res.status(404).json({ error: "المشروع غير موجود" }); return; }

    const [phase] = await rawQuery<any>(`SELECT * FROM project_phases WHERE id=$1 AND "projectId"=$2`, [phaseId, projectId]);
    if (!phase) { res.status(404).json({ error: "المرحلة غير موجودة" }); return; }

    await rawExecute(`UPDATE project_phases SET status='completed' WHERE id=$1 AND "projectId"=$2`, [phaseId, projectId]);

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
    await rawExecute(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2`, [progressPct, projectId]);

    res.json({ message: 'تم إكمال المرحلة', phase, milestoneInvoiceCreated, progressPct });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/:id/tasks", requirePermission("projects:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const { insertId } = await rawExecute(
      `INSERT INTO project_tasks ("projectId","phaseId",title,description,"assigneeId",priority,status,"startDate","dueDate","estimatedHours") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [projectId, b.phaseId, b.title, b.description, b.assigneeId, b.priority || 'medium', 'todo', b.startDate, b.dueDate, b.estimatedHours]
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

router.patch("/tasks/:taskId", requirePermission("projects:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const taskId = Number(req.params.taskId);
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.progress !== undefined) { params.push(b.progress); sets.push(`progress=$${params.length}`); }
    if (b.actualHours !== undefined) { params.push(b.actualHours); sets.push(`"actualHours"=$${params.length}`); }
    if (b.status === 'done') sets.push(`"completedAt"=NOW()`);
    if (sets.length === 0) { res.json({ ok: true }); return; }
    params.push(taskId);
    await rawExecute(`UPDATE project_tasks SET ${sets.join(",")} WHERE id=$${params.length}`, params);

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
      await rawExecute(`UPDATE projects SET progress=$1, "updatedAt"=NOW() WHERE id=$2`, [progressPct, task.projectId]);

      const [project] = await rawQuery<any>(`SELECT * FROM projects WHERE id=$1`, [task.projectId]);

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
    const [projects] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='completed') as completed FROM projects WHERE "companyId"=$1`, [cid]);
    const [budget] = await rawQuery<any>(`SELECT COALESCE(SUM(budget),0) as "totalBudget", COALESCE(SUM("spentAmount"),0) as "totalSpent" FROM projects WHERE "companyId"=$1`, [cid]);
    const [slipping] = await rawQuery<any>(`SELECT COUNT(*) as count FROM projects WHERE "companyId"=$1 AND status='active' AND "endDate" < CURRENT_DATE`, [cid]);
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
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
    const rows = await rawQuery<any>(
      `SELECT * FROM project_milestones WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY "targetDate"`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Milestones error:"); }
});

router.post("/:id/milestones", requirePermission("projects:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
    if (!b.title || !b.targetDate) { res.status(400).json({ error: "العنوان والتاريخ المستهدف مطلوبان" }); return; }
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

router.patch("/milestones/:milestoneId", requirePermission("projects:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.milestoneId);
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.targetDate !== undefined) { params.push(b.targetDate); sets.push(`"targetDate"=$${params.length}`); }
    if (b.completedDate !== undefined) { params.push(b.completedDate); sets.push(`"completedDate"=$${params.length}`); }
    if (b.status === 'completed' && !b.completedDate) sets.push(`"completedDate"=NOW()`);
    if (sets.length === 0) { res.json({ ok: true }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(
      `UPDATE project_milestones SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) { res.status(404).json({ error: "المعلم غير موجود" }); return; }

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
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
    const rows = await rawQuery<any>(
      `SELECT * FROM project_risks WHERE "projectId"=$1 AND "companyId"=$2 ORDER BY (probability * impact) DESC`,
      [projectId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Project risks error:"); }
});

router.post("/:id/risks", requirePermission("projects:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
    if (!b.title) { res.status(400).json({ error: "عنوان المخاطرة مطلوب" }); return; }
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

router.patch("/risks/:riskId", requirePermission("projects:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.riskId);
    const b = req.body;
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
    if (!rows[0]) { res.status(404).json({ error: "المخاطرة غير موجودة" }); return; }
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
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
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
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
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
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
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
    const scope = req.scope!;
    const b = req.body;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;
    if (!b.amount || !b.description) { res.status(400).json({ error: "المبلغ والوصف مطلوبان" }); return; }
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
      `UPDATE projects SET "spentAmount"=COALESCE("spentAmount",0)+$1 WHERE id=$2 AND "companyId"=$3`,
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
    const scope = req.scope!;
    const projectId = Number(req.params.id);
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;

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
    const project = await assertProjectAccess(projectId, scope, res);
    if (!project) return;

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
