import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { criticalPathLength } from "../lib/algorithms.js";
import { createNotification, createAuditLog } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermission("projects:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', branchColumn: 'p."branchId"' });
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

      for (const dep of candidateTasks) {
        await rawExecute(`UPDATE project_tasks SET status='todo' WHERE id=$1 AND status='blocked'`, [dep.taskId]);
        const [unlockedTask] = await rawQuery<any>(`SELECT * FROM project_tasks WHERE id=$1`, [dep.taskId]);
        if (unlockedTask && unlockedTask.status === 'todo') {
          unlockedTasks.push(unlockedTask);
          if (unlockedTask.assigneeId) {
            try {
              const [asgn] = await rawQuery<any>(
                `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
                [unlockedTask.assigneeId]
              );
              if (asgn) {
                createNotification({
                  companyId: scope.companyId,
                  assignmentId: asgn.id,
                  type: "task_unblocked",
                  title: "مهمة أصبحت متاحة للعمل",
                  body: `المهمة "${unlockedTask.title}" أصبحت جاهزة — جميع المهام المعتمد عليها مكتملة`,
                  priority: "normal",
                  refType: "project_tasks",
                  refId: unlockedTask.id,
                }).catch(console.error);
              }
            } catch (e) { console.error("Unlock notification error:", e); }
          }
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

export default router;
