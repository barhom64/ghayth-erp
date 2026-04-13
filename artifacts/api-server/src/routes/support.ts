import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { slaDeadlineForPriority, haversineKm } from "../lib/algorithms.js";
import { createNotification, createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

import { loadBalanceAssign } from "../lib/algorithms.js";
const router = Router();
router.use(authMiddleware);

const PRIORITY_KEYWORDS: Record<string, string[]> = {
  critical: ['عاجل', 'طارئ', 'كارثة', 'توقف', 'انهيار', 'حريق', 'خطير', 'فوري', 'down', 'outage', 'emergency', 'critical'],
  high: ['مهم', 'سريع', 'تعطل', 'خلل', 'broken', 'error', 'fail', 'urgent'],
  medium: ['مشكلة', 'بطيء', 'issue', 'problem', 'bug', 'slow'],
  low: ['استفسار', 'سؤال', 'اقتراح', 'question', 'inquiry', 'suggestion'],
};

function detectPriority(text: string): string {
  const lower = (text || '').toLowerCase();
  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return priority;
  }
  return 'medium';
}

router.get("/tickets", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, priority } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', branchColumn: 't."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND t.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (priority) { where += ` AND t.priority = $${paramIdx}`; params.push(priority); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName", e.name AS "assigneeName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" LEFT JOIN employees e ON e.id=t."assigneeId" WHERE ${where} AND t."deletedAt" IS NULL ORDER BY t.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Support tickets error:"); }
});

router.post("/tickets", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const ref = `TKT-${Date.now().toString(36).toUpperCase()}`;

    const aiDetectedPriority = detectPriority(`${b.title || ''} ${b.description || ''}`);
    const priority = b.priority || aiDetectedPriority;
    const slaResponseHours = priority === 'critical' ? 1 : priority === 'high' ? 2 : priority === 'medium' ? 4 : 8;
    const slaResolutionDeadline = b.slaDeadline || slaDeadlineForPriority(priority).toISOString();

    let assigneeId = b.assigneeId || null;
    if (!assigneeId) {
      const agents = await rawQuery<any>(
        `SELECT e.id, e.name,
                COUNT(st.id) AS "openTickets",
                COALESCE(
                  (SELECT AVG(EXTRACT(EPOCH FROM (st2."resolvedAt" - st2."createdAt"))/3600)
                   FROM support_tickets st2 WHERE st2."assigneeId"=e.id AND st2.status='resolved' AND st2."resolvedAt" IS NOT NULL),
                  999
                ) AS "avgResolution"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
         LEFT JOIN support_tickets st ON st."assigneeId"=e.id AND st.status NOT IN ('resolved','closed')
         WHERE e.status='active'
         GROUP BY e.id, e.name
         ORDER BY "openTickets" ASC, "avgResolution" ASC
         LIMIT 5`,
        [scope.companyId]
      );
      if (agents.length > 0) {
        let best = agents[0];
        let bestScore = Infinity;
        const maxTickets = Math.max(...agents.map((a: any) => Number(a.openTickets) || 0), 1);
        for (const agent of agents) {
          const loadScore = (Number(agent.openTickets) || 0) / maxTickets;
          const perfScore = Math.min(Number(agent.avgResolution) || 999, 100) / 100;
          const combined = loadScore * 0.6 + perfScore * 0.4;
          if (combined < bestScore) { bestScore = combined; best = agent; }
        }
        assigneeId = best.id;
      } else {
          const smartResult = await loadBalanceAssign(scope.companyId, "support", undefined, undefined, b.category);
          if (smartResult) assigneeId = smartResult.employeeId;
        }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO support_tickets ("companyId",ref,title,description,category,priority,status,"clientId","assigneeId","slaDeadline") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, ref, b.title || b.subject, b.description, b.category, priority, 'open', b.clientId, assigneeId, slaResolutionDeadline]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM support_tickets WHERE id=$1`, [insertId]);

    if (assigneeId) {
      const [assigneeAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND status = 'active' LIMIT 1`,
        [assigneeId]
      );
      if (assigneeAssignment) {
        createNotification({
          companyId: scope.companyId,
          assignmentId: assigneeAssignment.id,
          type: "support_ticket",
          title: "تذكرة دعم جديدة مسندة إليك",
          body: `تذكرة ${ref}: ${b.title || 'بدون عنوان'} — الأولوية: ${priority} — SLA رد: ${slaResponseHours}h`,
          priority: priority === 'critical' ? 'high' : 'normal',
          refType: "support_tickets",
          refId: insertId,
        }).catch(console.error);
      }
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "support_tickets",
      entityId: insertId,
      after: { ref, title: b.title, priority, aiDetectedPriority, category: b.category, clientId: b.clientId },
    }).catch(console.error);

    res.status(201).json({
      ...row,
      aiDetectedPriority,
      slaResponseHours,
      assignedAutomatically: !b.assigneeId && !!assigneeId,
    });
  } catch (err) { handleRouteError(err, res, "Create ticket error:"); }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [ticket] = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" WHERE t.id=$1 AND t."companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");
    const replies = await rawQuery<any>(`SELECT * FROM ticket_replies WHERE "ticketId"=$1 ORDER BY "createdAt"`, [ticket.id]);

    const now = new Date();
    const slaDeadline = ticket.slaDeadline ? new Date(ticket.slaDeadline) : null;
    const isSlaBreached = slaDeadline && now > slaDeadline && !['resolved', 'closed'].includes(ticket.status);
    const slaRemainingHours = slaDeadline && !isSlaBreached
      ? Math.max(0, (slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      : 0;

    res.json({ ...ticket, replies, isSlaBreached, slaRemainingHours: Number(slaRemainingHours).toFixed(1) });
  } catch (err) { handleRouteError(err, res, "Get ticket error:"); }
});

router.post("/tickets/:id/replies", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const ticketId = Number(req.params.id);

    const [ticket] = await rawQuery<any>(`SELECT id, ref, title, "firstResponseAt", "slaDeadline", priority FROM support_tickets WHERE id=$1 AND "companyId"=$2`, [ticketId, scope.companyId]);
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");

    const { insertId } = await rawExecute(
      `INSERT INTO ticket_replies ("ticketId","authorId","authorName",message,"isInternal") VALUES ($1,$2,$3,$4,$5)`,
      [ticketId, scope.userId, b.authorName, b.message, b.isInternal || false]
    );
    if (!b.isInternal && !ticket.firstResponseAt) {
      await rawExecute(`UPDATE support_tickets SET "firstResponseAt"=NOW(), "updatedAt"=NOW() WHERE id=$1`, [ticketId]);
    }

    if (ticket.slaDeadline && new Date() > new Date(ticket.slaDeadline)) {
      try {
        await rawExecute(
          `UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND priority != 'critical'`,
          [ticketId]
        );
        await rawExecute(
          `INSERT INTO notifications ("companyId",type,title,body,priority,"refType","refId") VALUES ($1,'alert',$2,$3,'high','support_tickets',$4)`,
          [scope.companyId, `SLA خرق: تذكرة ${ticket.ref}`, `التذكرة "${ticket.title}" تجاوزت وقت SLA المحدد وتحتاج تصعيداً فورياً`, String(ticketId)]
        );
        console.log(`[SLA ESCALATION] Ticket ${ticket.ref} breached SLA — priority escalated to critical, notification created`);
      } catch (slaErr) {
        console.error("Failed to handle SLA breach:", slaErr);
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM ticket_replies WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create reply error:"); }
});

router.post("/tickets/:id/field-visit", async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = Number(req.params.id);
    const b = req.body;

    const [ticket] = await rawQuery<any>(`SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2`, [ticketId, scope.companyId]);
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");

    let distanceKm: number | null = null;
    if (b.clientLat && b.clientLon && b.officeLat && b.officeLon) {
      distanceKm = haversineKm(Number(b.officeLat), Number(b.officeLon), Number(b.clientLat), Number(b.clientLon));
    }

    await rawExecute(
      `UPDATE support_tickets SET status='field_visit', "updatedAt"=NOW() WHERE id=$1`,
      [ticketId]
    );

    if (ticket.assigneeId) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
          [ticket.assigneeId]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "field_visit",
            title: `زيارة ميدانية — تذكرة ${ticket.ref}`,
            body: `زيارة ميدانية مطلوبة${distanceKm ? ` (${distanceKm.toFixed(1)} كم)` : ''} — ${b.visitDate || 'بأسرع وقت'}`,
            priority: "high",
            refType: "support_tickets",
            refId: ticketId,
          }).catch(console.error);
        }
      } catch (e) { console.error("Field visit notification error:", e); }
    }

    res.json({
      ticketId, status: 'field_visit', distanceKm,
      visitDate: b.visitDate, assigneeId: ticket.assigneeId,
    });
  } catch (err) { handleRouteError(err, res, "Field visit error:"); }
});

router.patch("/tickets/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = Number(req.params.id);

    const [ticket] = await rawQuery<any>(`SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2`, [ticketId, scope.companyId]);
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");

    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); if (b.status === 'resolved') sets.push(`"resolvedAt"=NOW()`); }
    if (b.assigneeId !== undefined) { params.push(b.assigneeId); sets.push(`"assigneeId"=$${params.length}`); }
    if (b.priority !== undefined) { params.push(b.priority); sets.push(`priority=$${params.length}`); }
    params.push(ticketId);
    await rawExecute(`UPDATE support_tickets SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    let surveyQueued = false;
    if (b.status === 'resolved') {
      const createdAt = new Date(ticket.createdAt);
      const resolutionTimeHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

      if (ticket.assigneeId) {
        console.log(`[SUPPORT] Agent ${ticket.assigneeId} resolved ticket in ${resolutionTimeHours.toFixed(1)}h`);
      }

      // Actually queue the satisfaction survey (used to just be a console.log).
      // A scheduledAt in the future lets the email_queue_worker deliver it
      // when it becomes due; until then it sits in 'pending'.
      if (ticket.clientId) {
        try {
          const [client] = await rawQuery<any>(
            `SELECT id, name, email FROM clients WHERE id = $1 AND "companyId" = $2`,
            [ticket.clientId, scope.companyId]
          );
          if (client?.email) {
            const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await rawExecute(
              `INSERT INTO email_queue ("companyId","toEmail","recipientName",subject,body,status,"scheduledAt","createdAt","refType","refId")
               VALUES ($1,$2,$3,$4,$5,'pending',$6,NOW(),'support_ticket',$7)`,
              [
                scope.companyId,
                client.email,
                client.name ?? "",
                `استبيان رضا العميل - التذكرة ${ticket.ref}`,
                `مرحباً ${client.name ?? ""},\n\nتم حل تذكرتكم رقم ${ticket.ref}.\nنرجو تقييم تجربتكم معنا من خلال الرابط المرفق.\n\nشكراً لثقتكم.`,
                scheduledAt.toISOString(),
                ticketId,
              ]
            );
            surveyQueued = true;
          }
        } catch (e) {
          console.error("[SURVEY] Failed to queue satisfaction survey:", e);
        }
      }

      // Emit the lifecycle event so the audit trail + subscribers fire.
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "support.ticket.resolved",
        entity: "support_tickets",
        entityId: ticketId,
        before: { status: ticket.status, resolvedAt: ticket.resolvedAt ?? null },
        after: {
          status: "resolved",
          resolvedAt: new Date().toISOString(),
          resolutionTimeHours: Number(resolutionTimeHours.toFixed(2)),
        },
      }).catch(console.error);
    }

    const [row] = await rawQuery<any>(`SELECT * FROM support_tickets WHERE id=$1`, [ticketId]);
    res.json({ ...row, surveyQueued });
  } catch (err) { handleRouteError(err, res, "Update ticket error:"); }
});

router.delete("/tickets/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التذكرة غير موجودة");
    await rawExecute(`UPDATE support_tickets SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف التذكرة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete ticket error:"); }
});

router.post("/tickets/check-sla", async (req, res) => {
  try {
    const scope = req.scope!;
    const breached = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" WHERE t."companyId"=$1 AND t.status IN ('open','in_progress','field_visit') AND t."slaDeadline" < NOW()`,
      [scope.companyId]
    );
    for (const ticket of breached) {
      console.log(`[SLA BREACH] Ticket ${ticket.ref} — escalating to critical priority`);
      try {
        await rawExecute(
          `UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND priority != 'critical'`,
          [ticket.id]
        );
        await rawExecute(
          `INSERT INTO notifications ("companyId",type,title,body,priority,"refType","refId")
           SELECT $1,'alert',$2,$3,'high','support_tickets',$4
           WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE "refType"='support_tickets' AND "refId"=$4 AND type='alert' AND "createdAt" > NOW() - INTERVAL '4 hours')`,
          [scope.companyId, `SLA خرق: ${ticket.ref}`, `التذكرة "${ticket.title}" تجاوزت SLA — تم تصعيد الأولوية إلى حرجة`, String(ticket.id)]
        );
      } catch (e) { console.error("SLA breach notification error:", e); }
    }
    res.json({ breached: breached.length, tickets: breached });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/replies", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', branchColumn: 't."branchId"', enforceBranchScope: true });
    const rows = await rawQuery<any>(
      `SELECT tr.id, t.ref AS "ticketId", t.title AS "ticketTitle", tr.message AS reply, tr."authorName" AS agent, tr."createdAt" AS date, t.status
       FROM ticket_replies tr
       JOIN support_tickets t ON t.id = tr."ticketId"
       WHERE ${baseWhere}
       ORDER BY tr."createdAt" DESC`,
      params
    );
    const total = rows.length;
    const resolved = rows.filter((r: any) => r.status === 'resolved' || r.status === 'closed').length;
    const pending = total - resolved;
    const activeAgents = new Set(rows.map((r: any) => r.agent).filter(Boolean)).size;
    res.json({ data: rows, total, resolved, pending, activeAgents });
  } catch (err) { handleRouteError(err, res, "Support replies error:"); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [tickets] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COUNT(*) FILTER (WHERE status='resolved') as resolved, COUNT(*) FILTER (WHERE status IN ('open','in_progress','field_visit') AND "slaDeadline" < NOW()) as "slaBreach" FROM support_tickets WHERE "companyId"=$1`, [cid]);
    const [avgRes] = await rawQuery<any>(`SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND status='resolved' AND "resolvedAt" IS NOT NULL`, [cid]);
    const [firstResponse] = await rawQuery<any>(`SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND "firstResponseAt" IS NOT NULL`, [cid]);
    const [csat] = await rawQuery<any>(`SELECT AVG(score) AS avg, COUNT(*) AS total FROM ticket_csat_ratings WHERE "companyId"=$1`, [cid]).catch(() => [{ avg: null, total: 0 }]);
    res.json({
      totalTickets: Number(tickets.total), openTickets: Number(tickets.open),
      resolvedTickets: Number(tickets.resolved), slaBreach: Number(tickets.slaBreach),
      avgResolutionHours: Number(avgRes?.avgHours || 0).toFixed(1),
      avgFirstResponseHours: Number(firstResponse?.avgHours || 0).toFixed(1),
      csatAvg: csat?.avg ? Number(csat.avg).toFixed(2) : null,
      csatTotal: Number(csat?.total || 0),
    });
  } catch (err) { handleRouteError(err, res, "Support stats error:"); }
});

router.post("/tickets/:id/csat", async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = Number(req.params.id);
    const { score, comment } = req.body;
    if (!score || score < 1 || score > 5) {
      throw new ValidationError("التقييم يجب أن يكون بين 1 و 5", {
        field: "score",
        fix: "اختر تقييماً من نجمة واحدة حتى خمس نجوم.",
      });
    }
    const [ticket] = await rawQuery<any>(`SELECT id, "assigneeId", status FROM support_tickets WHERE id=$1 AND "companyId"=$2`, [ticketId, scope.companyId]);
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");
    if (!['resolved', 'closed'].includes(ticket.status)) {
      throw new ConflictError("لا يمكن تقييم تذكرة غير محلولة", {
        field: "status",
        fix: "انتظر حتى يتم حل التذكرة قبل التقييم.",
        meta: { currentStatus: ticket.status },
      });
    }
    await rawExecute(
      `INSERT INTO ticket_csat_ratings ("ticketId","companyId","assigneeId",score,comment) VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("ticketId") DO UPDATE SET score=$4, comment=$5, "updatedAt"=NOW()`,
      [ticketId, scope.companyId, ticket.assigneeId, score, comment || null]
    );
    res.status(201).json({ ticketId, score, comment });
  } catch (err) { handleRouteError(err, res, "CSAT error:"); }
});

router.get("/csat", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT cr.*, t.ref AS "ticketRef", t.title AS "ticketTitle", e.name AS "assigneeName"
       FROM ticket_csat_ratings cr
       LEFT JOIN support_tickets t ON t.id=cr."ticketId"
       LEFT JOIN employees e ON e.id=cr."assigneeId"
       WHERE cr."companyId"=$1 ORDER BY cr."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    const [avg] = await rawQuery<any>(`SELECT AVG(score) AS avg, COUNT(*) AS total FROM ticket_csat_ratings WHERE "companyId"=$1`, [scope.companyId]);
    const agentStats = await rawQuery<any>(
      `SELECT cr."assigneeId", e.name AS "assigneeName", AVG(cr.score) AS avg, COUNT(*) AS total
       FROM ticket_csat_ratings cr LEFT JOIN employees e ON e.id=cr."assigneeId"
       WHERE cr."companyId"=$1 AND cr."assigneeId" IS NOT NULL
       GROUP BY cr."assigneeId", e.name ORDER BY avg DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, avg: avg?.avg ? Number(avg.avg).toFixed(2) : null, total: Number(avg?.total || 0), agentStats });
  } catch (err) { handleRouteError(err, res, "CSAT list error:"); }
});

router.get("/kb", async (req, res) => {
  try {
    const scope = req.scope!;
    const { q, category } = req.query as any;
    const conditions = [`("companyId"=$1 OR "companyId" IS NULL)`, `status='published'`];
    const params: any[] = [scope.companyId];
    if (category) { params.push(category); conditions.push(`category=$${params.length}`); }
    if (q) { params.push(`%${q}%`); conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    const rows = await rawQuery<any>(`SELECT id, title, category, tags, views, helpful, "notHelpful", "createdAt", "updatedAt" FROM kb_articles WHERE ${conditions.join(' AND ')} ORDER BY views DESC`, params);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "KB list error:"); }
});

router.get("/kb/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(`SELECT * FROM kb_articles WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المقالة غير موجودة");
    await rawExecute(`UPDATE kb_articles SET views=COALESCE(views,0)+1 WHERE id=$1`, [id]).catch(() => {});
    res.json(row);
  } catch (err) { handleRouteError(err, res, "KB article error:"); }
});

router.post("/kb", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, content, category, tags } = req.body;
    if (!title) {
      throw new ValidationError("عنوان المقالة مطلوب", {
        field: "title",
        fix: "أدخل عنواناً للمقالة قبل الحفظ.",
      });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO kb_articles (title, content, category, tags, status, views, helpful, "notHelpful", "companyId", "createdBy") VALUES ($1,$2,$3,$4,'published',0,0,0,$5,$6)`,
      [title, content || '', category || 'general', tags || null, scope.companyId, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM kb_articles WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "KB create error:"); }
});

router.patch("/kb/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.content !== undefined) { params.push(b.content); sets.push(`content=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.tags !== undefined) { params.push(b.tags); sets.push(`tags=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE kb_articles SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM kb_articles WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "KB update error:"); }
});

router.delete("/kb/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await rawExecute(`DELETE FROM kb_articles WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المقالة بنجاح" });
  } catch (err) { handleRouteError(err, res, "KB delete error:"); }
});

router.post("/kb/:id/feedback", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { helpful } = req.body;
    if (helpful === true || helpful === 'true') {
      await rawExecute(`UPDATE kb_articles SET helpful=COALESCE(helpful,0)+1 WHERE id=$1`, [id]);
    } else {
      await rawExecute(`UPDATE kb_articles SET "notHelpful"=COALESCE("notHelpful",0)+1 WHERE id=$1`, [id]);
    }
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "KB feedback error:"); }
});

export default router;
