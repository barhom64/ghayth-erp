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
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { slaDeadlineForPriority, haversineKm, loadBalanceAssign } from "../lib/algorithms.js";
import { createNotification, createAuditLog, emitEvent, generateTimeRef } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { applyTransition, LifecycleError, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import type { ExtraValue } from "../lib/lifecycleEngine.js";
const router = Router();

const createTicketSchema = z.object({
  title: z.string().optional(),
  subject: z.string().min(1, "موضوع التذكرة مطلوب"),
  description: z.string().min(1, "وصف المشكلة مطلوب"),
  clientId: z.coerce.number().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  slaDeadline: z.string().optional(),
  assigneeId: z.coerce.number().optional(),
});

const createReplySchema = z.object({
  authorName: z.string().optional(),
  message: z.string().min(1, "نص الرد مطلوب"),
  isInternal: z.boolean().optional(),
});

const createCSATSchema = z.object({
  score: z.coerce.number().min(1).max(5, "التقييم يجب أن يكون بين 1 و 5"),
  comment: z.string().optional(),
});

const createKbSchema = z.object({
  title: z.string().min(1, "عنوان المقال مطلوب"),
  content: z.string().min(1, "محتوى المقال مطلوب"),
  category: z.string().optional(),
  tags: z.any().optional(),
});

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

router.get("/tickets", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, priority } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', disableBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND t.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (priority) { where += ` AND t.priority = $${paramIdx}`; params.push(priority); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName", e.name AS "assigneeName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" LEFT JOIN employees e ON e.id=t."assigneeId" WHERE ${where} AND t."deletedAt" IS NULL ORDER BY t.id DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Support tickets error:"); }
});

router.post("/tickets", requirePermission("support:create"), async (req, res) => {
  // Phase C — Support domain audit, mirror of the HR Step 1 treatment.
  // Adds input validation the old handler lacked, a pre-check on the
  // client FK so a stale clientId produces a clean field-tagged error
  // instead of a deep 23503, and the canonical `support.ticket.created`
  // event (the listener at eventListeners.ts:245 had existed since P1.6
  // but nobody was emitting the event from the create handler).
  try {
    const scope = req.scope!;
    const b = zodParse(createTicketSchema.safeParse(req.body)) as any;

    const title = (b.title ?? b.subject ?? "").toString().trim();
    if (!title) {
      throw new ValidationError("عنوان التذكرة مطلوب", {
        field: "title",
        fix: "أدخل عنواناً موجزاً يصف المشكلة.",
      });
    }
    if (!b.description || !String(b.description).trim()) {
      throw new ValidationError("وصف التذكرة مطلوب", {
        field: "description",
        fix: "اكتب وصفاً تفصيلياً للمشكلة حتى يقدر الفني على متابعتها.",
      });
    }

    // Pre-check: clientId must resolve to an active client in this
    // company. Without this guard a stale id used to fail with a deep
    // 23503 whose detail string the classifier generalized to
    // "مرجع غير صالح" — now we reject early with field="clientId".
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

    const ref = generateTimeRef("TKT");

    const aiDetectedPriority = detectPriority(`${title} ${b.description || ''}`);
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
      [scope.companyId, ref, title, b.description, b.category, priority, 'open', b.clientId ?? null, assigneeId, slaResolutionDeadline]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

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
          body: `تذكرة ${ref}: ${title} — الأولوية: ${priority} — SLA رد: ${slaResponseHours}h`,
          priority: priority === 'critical' ? 'high' : 'normal',
          refType: "support_tickets",
          refId: insertId,
        }).catch((e) => logger.error(e, "support background task failed"));
      }
    }

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "support_tickets",
      entityId: insertId,
      after: { ref, title, priority, aiDetectedPriority, category: b.category, clientId: b.clientId },
    }).catch((e) => logger.error(e, "support background task failed"));

    // Canonical creation event — mirrors employee.created in HR so the
    // support inbox audit trail finally sees every new ticket the same
    // way audit_logs sees it.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "support.ticket.created",
      entity: "support_tickets",
      entityId: insertId,
      details: JSON.stringify({
        ref,
        title,
        priority,
        aiDetectedPriority,
        assigneeId,
        clientId: b.clientId ?? null,
      }),
    }).catch((e) => logger.error(e, "support background task failed"));

    res.status(201).json({
      ...row,
      aiDetectedPriority,
      slaResponseHours,
      assignedAutomatically: !b.assigneeId && !!assigneeId,
    });
  } catch (err) { handleRouteError(err, res, "Create ticket error:"); }
});

router.post("/tickets/check-sla", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const breached = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" WHERE t."companyId"=$1 AND t.status IN ('open','in_progress','field_visit') AND t."slaDeadline" < NOW() AND t."deletedAt" IS NULL`,
      [scope.companyId]
    );
    for (const ticket of breached) {
      logger.info({ ticketRef: ticket.ref }, "SLA breach — escalating to critical priority");
      try {
        await rawExecute(
          `UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND priority != 'critical'`,
          [ticket.id, scope.companyId]
        );
        await createNotification({
          companyId: scope.companyId,
          assignmentId: scope.activeAssignmentId,
          type: "alert",
          title: `SLA خرق: ${ticket.ref}`,
          body: `التذكرة "${ticket.title}" تجاوزت SLA — تم تصعيد الأولوية إلى حرجة`,
          priority: "high",
          refType: "support_tickets",
          refId: ticket.id,
        });
      } catch (e) { logger.error(e, "SLA breach notification error:"); }
    }
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "support.sla.checked", entity: "support_tickets", entityId: 0,
      details: JSON.stringify({ breachedCount: breached.length }),
    }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "preview", entity: "support_tickets", entityId: 0,
      after: { breachedCount: breached.length },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.json({ breached: breached.length, tickets: breached });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/tickets/:id", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [ticket] = await rawQuery<any>(
      `SELECT t.*, cl.name AS "clientName" FROM support_tickets t LEFT JOIN clients cl ON cl.id=t."clientId" WHERE t.id=$1 AND t."companyId"=$2 AND t."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");
    const replies = await rawQuery<any>(`SELECT * FROM ticket_replies WHERE "ticketId"=$1 ORDER BY "createdAt" LIMIT 500`, [ticket.id]);

    const now = new Date();
    const slaDeadline = ticket.slaDeadline ? new Date(ticket.slaDeadline) : null;
    const isSlaBreached = slaDeadline && now > slaDeadline && !['resolved', 'closed'].includes(ticket.status);
    const slaRemainingHours = slaDeadline && !isSlaBreached
      ? Math.max(0, (slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60))
      : 0;

    res.json({ ...ticket, replies, isSlaBreached, slaRemainingHours: Number(slaRemainingHours).toFixed(1) });
  } catch (err) { handleRouteError(err, res, "Get ticket error:"); }
});

router.post("/tickets/:id/replies", requirePermission("support:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createReplySchema.safeParse(req.body)) as any;
    const ticketId = parseId(req.params.id, "id");

    const [ticket] = await rawQuery<any>(`SELECT id, ref, title, "firstResponseAt", "slaDeadline", priority FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [ticketId, scope.companyId]);
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");

    const { insertId } = await rawExecute(
      `INSERT INTO ticket_replies ("ticketId","authorId","authorName",message,"isInternal") VALUES ($1,$2,$3,$4,$5)`,
      [ticketId, scope.userId, b.authorName, b.message, b.isInternal || false]
    );
    if (!b.isInternal && !ticket.firstResponseAt) {
      await rawExecute(`UPDATE support_tickets SET "firstResponseAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [ticketId, scope.companyId]);
    }

    if (ticket.slaDeadline && new Date() > new Date(ticket.slaDeadline)) {
      try {
        await rawExecute(
          `UPDATE support_tickets SET priority='critical', "slaBreached"=true, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND priority != 'critical'`,
          [ticketId, scope.companyId]
        );
        await createNotification({
          companyId: scope.companyId,
          assignmentId: scope.activeAssignmentId,
          type: "alert",
          title: `SLA خرق: تذكرة ${ticket.ref}`,
          body: `التذكرة "${ticket.title}" تجاوزت وقت SLA المحدد وتحتاج تصعيداً فورياً`,
          priority: "high",
          refType: "support_tickets",
          refId: Number(ticketId),
        });
        logger.info({ ticketRef: ticket.ref }, "SLA escalation — priority escalated to critical, notification created");
      } catch (slaErr) {
        logger.error(slaErr, "Failed to handle SLA breach:");
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM ticket_replies WHERE id=$1`, [insertId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "support.reply.created", entity: "ticket_replies", entityId: insertId, details: JSON.stringify({ ticketId, isInternal: b.isInternal || false }) }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "ticket_replies", entityId: insertId,
      after: { ticketId, message: b.message, isInternal: b.isInternal || false },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create reply error:"); }
});

router.post("/tickets/:id/field-visit", requirePermission("support:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = parseId(req.params.id, "id");
    const b = req.body;

    let distanceKm: number | null = null;
    if (b.clientLat && b.clientLon && b.officeLat && b.officeLon) {
      distanceKm = haversineKm(Number(b.officeLat), Number(b.officeLon), Number(b.clientLat), Number(b.clientLon));
    }

    const row = await applyTransition<any>({
      entity: "support_tickets",
      id: ticketId,
      scope,
      action: "support.ticket.field_visit",
      toState: "field_visit",
      extraWhere: '"deletedAt" IS NULL',
      after: { distanceKm, visitDate: b.visitDate },
    });

    if (row.assigneeId) {
      try {
        const [asgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND status='active' LIMIT 1`,
          [row.assigneeId]
        );
        if (asgn) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: asgn.id,
            type: "field_visit",
            title: `زيارة ميدانية — تذكرة ${row.ref}`,
            body: `زيارة ميدانية مطلوبة${distanceKm ? ` (${distanceKm.toFixed(1)} كم)` : ''} — ${b.visitDate || 'بأسرع وقت'}`,
            priority: "high",
            refType: "support_tickets",
            refId: ticketId,
          }).catch((e) => logger.error(e, "support background task failed"));
        }
      } catch (e) { logger.error(e, "Field visit notification error:"); }
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "field_visits", entityId: ticketId,
      after: { ticketId, distanceKm, visitDate: b.visitDate, assigneeId: row.assigneeId },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.json({
      ticketId, status: 'field_visit', distanceKm,
      visitDate: b.visitDate, assigneeId: row.assigneeId,
    });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Field visit error:");
  }
});

// State machine for support tickets — the allowed transitions from each
// state. A status change outside this map is rejected as a ConflictError
// so the UI can never land the ticket in an illegal mid-state (e.g.
// "closed → open" or "resolved → pending_customer"). This is the
// "لا يوجد UPDATE status مباشر" requirement from the architect,
// implemented as an allowlist guard inline so we don't need to thread
// applyTransition through a table with custom columns.
const TICKET_TRANSITIONS: Record<string, readonly string[]> = {
  open:              ["in_progress", "pending_customer", "field_visit", "resolved", "closed"],
  in_progress:       ["pending_customer", "field_visit", "resolved", "closed", "open"],
  pending_customer:  ["in_progress", "field_visit", "resolved", "closed"],
  field_visit:       ["in_progress", "resolved", "closed"],
  resolved:          ["closed", "in_progress"],   // reopen via in_progress
  closed:            [],                           // terminal
};

router.patch("/tickets/:id", requirePermission("support:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = parseId(req.params.id, "id");
    const b = req.body;

    // Pre-read for transition validation and pre-update state snapshot.
    const [ticket] = await rawQuery<any>(
      `SELECT * FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [ticketId, scope.companyId]
    );
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");

    const statusChanging = b.status !== undefined && b.status !== ticket.status;

    if (statusChanging) {
      const allowed = TICKET_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(b.status)) {
        throw new ConflictError(
          `لا يمكن نقل التذكرة من "${ticket.status}" إلى "${b.status}"`,
          {
            field: "status",
            fix: allowed.length > 0
              ? `الحالات المسموحة من الحالة الحالية: ${allowed.join("، ")}`
              : "هذه التذكرة وصلت لحالة نهائية ولا تقبل تغييراً إضافياً.",
            meta: {
              currentStatus: ticket.status,
              requestedStatus: b.status,
              allowedNext: allowed,
            },
          }
        );
      }
    }

    const action = statusChanging
      ? (b.status === "closed"
          ? "support.ticket.closed"
          : b.status === "resolved"
            ? "support.ticket.resolved"
            : "support.ticket.status_changed")
      : "support.ticket.updated";

    const setExtras: Record<string, ExtraValue> = {};
    if (b.assigneeId !== undefined) setExtras.assigneeId = b.assigneeId;
    if (b.priority !== undefined) setExtras.priority = b.priority;
    if (statusChanging && b.status === "resolved") setExtras.resolvedAt = { raw: "NOW()" };

    const row = await applyTransition<any>({
      entity: "support_tickets",
      id: ticketId,
      scope,
      action,
      ...(statusChanging ? { toState: b.status } : {}),
      setExtras: Object.keys(setExtras).length > 0 ? setExtras : undefined,
      extraWhere: '"deletedAt" IS NULL',
      after: { status: b.status, assigneeId: b.assigneeId, priority: b.priority },
    });

    // Post-commit: assignee change event (separate from status lifecycle).
    if (b.assigneeId !== undefined && b.assigneeId !== ticket.assigneeId) {
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "support.ticket.assigned",
        entity: "support_tickets",
        entityId: ticketId,
        before: { assigneeId: ticket.assigneeId },
        after: { assigneeId: b.assigneeId },
      }).catch((e) => logger.error(e, "support background task failed"));
    }

    // Post-commit: resolution side-effects (billing + survey).
    let surveyQueued = false;
    if (statusChanging && b.status === "resolved") {
      const createdAt = new Date(ticket.createdAt);
      const resolutionTimeHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (ticket.assigneeId) {
        logger.info({ assigneeId: ticket.assigneeId, resolutionTimeHours: resolutionTimeHours.toFixed(1) }, "Support agent resolved ticket");
      }

      const billableAmount = Number(b.billableAmount || 0);
      if (billableAmount > 0 && ticket.clientId) {
        try {
          const { supportEngine } = await import("../lib/engines/index.js");
          await supportEngine.postBillingGL(
            { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
            { id: ticketId, ref: ticket.ref, clientId: ticket.clientId, billableAmount }
          );
        } catch (glErr) {
          logger.error(glErr, "Support billing GL failed:");
        }
      }

      if (ticket.clientId) {
        try {
          const [client] = await rawQuery<any>(
            `SELECT id, name, email FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
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
          logger.error(e, "[SURVEY] Failed to queue satisfaction survey:");
        }
      }
    }

    res.json({ ...row, surveyQueued });
  } catch (err) {
    if (err instanceof LifecycleError) {
      const typed = err.status === 404
        ? new NotFoundError(err.message)
        : new ConflictError(err.message, { field: err.field });
      return handleRouteError(typed, res, "Update ticket error:");
    }
    handleRouteError(err, res, "Update ticket error:");
  }
});

router.delete("/tickets/:id", requirePermission("support:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id, ref, status FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التذكرة غير موجودة");
    await rawExecute(`UPDATE support_tickets SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "support.ticket.deleted",
      entity: "support_tickets",
      entityId: id,
      before: { status: existing.status, ref: existing.ref },
      after: { status: "deleted" },
    }).catch((e) => logger.error(e, "support background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "support_tickets", entityId: id,
      after: { ref: existing.ref, status: existing.status },
    }).catch((e) => logger.error(e, "support background task failed"));

    res.json({ message: "تم حذف التذكرة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete ticket error:"); }
});

router.get("/replies", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', disableBranchScope: true });
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

router.get("/stats", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [tickets] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COUNT(*) FILTER (WHERE status='resolved') as resolved, COUNT(*) FILTER (WHERE status IN ('open','in_progress','field_visit') AND "slaDeadline" < NOW()) as "slaBreach" FROM support_tickets WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [avgRes] = await rawQuery<any>(`SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND status='resolved' AND "resolvedAt" IS NOT NULL AND "deletedAt" IS NULL`, [cid]);
    const [firstResponse] = await rawQuery<any>(`SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt"::timestamp - "createdAt"::timestamp))/3600) AS "avgHours" FROM support_tickets WHERE "companyId"=$1 AND "firstResponseAt" IS NOT NULL AND "deletedAt" IS NULL`, [cid]);
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

router.post("/tickets/:id/csat", requirePermission("support:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const ticketId = parseId(req.params.id, "id");
    const b = zodParse(createCSATSchema.safeParse(req.body)) as any;
    const { score, comment } = b;
    const [ticket] = await rawQuery<any>(`SELECT id, "assigneeId", status FROM support_tickets WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [ticketId, scope.companyId]);
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
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "support.ticket.csat_rated", entity: "ticket_csat_ratings", entityId: ticketId, details: JSON.stringify({ score }) }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "ticket_csat", entityId: ticketId,
      after: { ticketId, score, comment: comment || null },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.status(201).json({ ticketId, score, comment });
  } catch (err) { handleRouteError(err, res, "CSAT error:"); }
});

router.get("/csat", requirePermission("support:read"), async (req, res) => {
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

router.get("/kb", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { q, category } = req.query as any;
    const conditions = [`("companyId"=$1 OR "companyId" IS NULL)`, `status='published'`, `"deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (category) { params.push(category); conditions.push(`category=$${params.length}`); }
    if (q) { params.push(`%${q}%`); conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    const rows = await rawQuery<any>(`SELECT id, title, category, tags, views, helpful, "notHelpful", "createdAt", "updatedAt" FROM kb_articles WHERE ${conditions.join(' AND ')} ORDER BY views DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "KB list error:"); }
});

router.get("/kb/:id", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM kb_articles WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المقالة غير موجودة");
    await rawExecute(`UPDATE kb_articles SET views=COALESCE(views,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [id, scope.companyId]).catch((e) => logger.error(e, "support background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "KB article error:"); }
});

router.post("/kb", requirePermission("support:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createKbSchema.safeParse(req.body)) as any;
    const { title, content, category, tags } = b;
    const { insertId } = await rawExecute(
      `INSERT INTO kb_articles (title, content, category, tags, status, views, helpful, "notHelpful", "companyId", "createdBy") VALUES ($1,$2,$3,$4,'published',0,0,0,$5,$6)`,
      [title, content || '', category || 'general', tags || null, scope.companyId, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM kb_articles WHERE id=$1`, [insertId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "support.kb.created", entity: "kb_articles", entityId: insertId, details: JSON.stringify({ title, category: category || 'general' }) }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "knowledge_base", entityId: insertId,
      after: { title, category: category || 'general', tags },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "KB create error:"); }
});

router.patch("/kb/:id", requirePermission("support:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "support.kb.updated", entity: "kb_articles", entityId: id, details: JSON.stringify({ title: b.title }) }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "knowledge_base", entityId: id,
      after: { title: b.title, content: b.content, category: b.category, tags: b.tags, status: b.status },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "KB update error:"); }
});

router.delete("/kb/:id", requirePermission("support:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(`UPDATE kb_articles SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "support.kb.deleted", entity: "kb_articles", entityId: id, details: "{}" }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "knowledge_base", entityId: id,
      after: { id },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.json({ message: "تم حذف المقالة بنجاح" });
  } catch (err) { handleRouteError(err, res, "KB delete error:"); }
});

// P02-S4-CRIT — `/kb/:id/feedback` used to UPDATE kb_articles by raw `id`
// with no scope filter and no pre-check, so any authenticated user from
// any tenant could enumerate IDs and pump `helpful` / `notHelpful` for
// every other company's KB articles — poisoning the analytics that drive
// the support dashboard and the KB ranking. Aligning with the GET /kb/:id
// scope pattern at line 612: validate the article is visible to the
// caller (own company OR global) before incrementing, and scope the
// UPDATE the same way.
router.post("/kb/:id/feedback", requirePermission("support:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { helpful } = req.body;
    const [row] = await rawQuery<any>(
      `SELECT id FROM kb_articles WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المقالة غير موجودة");
    if (helpful === true || helpful === 'true') {
      await rawExecute(
        `UPDATE kb_articles SET helpful=COALESCE(helpful,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
        [id, scope.companyId]
      );
    } else {
      await rawExecute(
        `UPDATE kb_articles SET "notHelpful"=COALESCE("notHelpful",0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
        [id, scope.companyId]
      );
    }
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "support.kb.feedback", entity: "kb_articles", entityId: id,
      details: JSON.stringify({ helpful: helpful === true || helpful === 'true' }),
    }).catch((e) => logger.error(e, "support background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "kb_feedback", entityId: id,
      after: { articleId: id, helpful: helpful === true || helpful === 'true' },
    }).catch((e) => logger.error(e, "support background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "KB feedback error:"); }
});

export default router;
