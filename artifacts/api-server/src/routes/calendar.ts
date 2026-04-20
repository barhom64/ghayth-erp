import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { rawQuery } from "../lib/rawdb.js";

export const calendarRouter = Router();
calendarRouter.use(authMiddleware);

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

calendarRouter.get("/upcoming", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const daysAhead = Math.min(Number(req.query.days) || 30, 90);
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString();

    const [milestones, obligations, contractExpirations, tasks] = await Promise.all([
      safe(() => rawQuery<any>(
        `SELECT pm.id, pm.title, pm."dueDate" as "date", pm.status, p.name as "projectName", p.id as "projectId"
         FROM project_milestones pm
         JOIN projects p ON p.id = pm."projectId"
         WHERE p."companyId" = $1 AND pm.status NOT IN ('completed','cancelled')
           AND pm."dueDate" BETWEEN $2 AND $3
         ORDER BY pm."dueDate" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<any>(
        `SELECT id, title, "dueAt" as "date", status, "entityType", "entityId", "obligationType"
         FROM obligations
         WHERE "companyId" = $1 AND status IN ('pending','breached','escalated_l1','escalated_l2')
           AND "dueAt" BETWEEN $2 AND $3
         ORDER BY "dueAt" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<any>(
        `SELECT rc.id, rc."endDate" as "date", 'contract_expiry' as type,
                t.name as "tenantName", rc."unitId"
         FROM rental_contracts rc
         LEFT JOIN tenants t ON t.id = rc."tenantId"
         WHERE rc."companyId" = $1 AND rc.status = 'active'
           AND rc."endDate" BETWEEN $2 AND $3
         ORDER BY rc."endDate" LIMIT 30`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<any>(
        `SELECT t.id, t.title, t."dueDate" as "date", t.status, t.priority, p.name as "projectName"
         FROM project_tasks t
         LEFT JOIN projects p ON p.id = t."projectId"
         WHERE t."companyId" = $1 AND t.status NOT IN ('completed','cancelled')
           AND t."dueDate" BETWEEN $2 AND $3
         ORDER BY t."dueDate" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
    ]);

    const events: any[] = [];

    milestones.forEach((m: any) => events.push({
      id: `milestone-${m.id}`, date: m.date, title: m.title,
      category: "milestone", status: m.status,
      context: m.projectName, link: `/projects/${m.projectId}`,
    }));

    obligations.forEach((o: any) => events.push({
      id: `obligation-${o.id}`, date: o.date, title: o.title,
      category: "obligation", status: o.status,
      context: `${o.entityType} #${o.entityId}`, link: "/obligations",
    }));

    contractExpirations.forEach((c: any) => events.push({
      id: `contract-${c.id}`, date: c.date, title: `انتهاء عقد ${c.tenantName || ""}`.trim(),
      category: "contract_expiry", status: "expiring",
      context: `وحدة #${c.unitId}`, link: `/properties/contracts/${c.id}`,
    }));

    tasks.forEach((t: any) => events.push({
      id: `task-${t.id}`, date: t.date, title: t.title,
      category: "task", status: t.status, priority: t.priority,
      context: t.projectName || "", link: "/tasks",
    }));

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const summary = {
      total: events.length,
      milestones: milestones.length,
      obligations: obligations.length,
      contractExpirations: contractExpirations.length,
      tasks: tasks.length,
    };

    res.json({ events, summary });
  } catch (err) {
    handleRouteError(err, res, "Calendar upcoming error:");
  }
});
