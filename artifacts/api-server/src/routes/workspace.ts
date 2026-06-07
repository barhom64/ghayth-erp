/**
 * Workspace — operational daily view.
 *
 * Different from /my-space (which is HR-personal: payslips, balances,
 * loans). /workspace is the *day-of-work* command center: today's
 * tasks, unread communications, recent calls, next meetings. Manager
 * variant adds team activity + approvals summary + week KPIs.
 *
 * Endpoints:
 *   GET /workspace/feed   — for every authenticated user
 *   GET /workspace/team   — manager+ only (roleLevel >= 40)
 *
 * Both endpoints are tenant-scoped and use safe() wrappers so a single
 * failing sub-query never blanks the entire page.
 */
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";

const router = Router();

const safe = <T>(p: Promise<T[]>, label: string, fallback: T[] = []): Promise<T[]> =>
  p.catch((e) => { logger.error(e, `workspace ${label} error`); return fallback; });

const safeOne = <T>(p: Promise<T[]>, label: string): Promise<T | null> =>
  p.then((rows) => rows[0] ?? null).catch((e) => { logger.error(e, `workspace ${label} error`); return null; });

// ─────────────────────── GET /workspace/feed ─────────────────────────────
router.get("/feed", authorize({ feature: "workspace", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const today = todayISO();
    const aid = scope.activeAssignmentId;

    const [
      todayTasks,
      overdueTasks,
      recentMessages,
      recentCalls,
      upcomingEvents,
      counts,
    ] = await Promise.all([
      safe(rawQuery<Record<string, unknown>>(
        `SELECT t.id, t.title, t.status, t.priority,
                t."scheduledDate", t."scheduledStart", t."scheduledEnd",
                t."linkedEntityType", t."linkedEntityId",
                c.name AS "clientName"
           FROM tasks t
           LEFT JOIN clients c ON c.id = t."clientId" AND c."companyId" = t."companyId" AND c."deletedAt" IS NULL
          WHERE t."companyId" = $1
            AND t."deletedAt" IS NULL
            AND t.status IN ('pending','in_progress')
            AND (t."assignedTo" = $2 OR $2 IS NULL)
            AND (t."scheduledDate" = $3 OR t."scheduledDate" IS NULL)
          ORDER BY t.priority DESC NULLS LAST, t."scheduledStart" ASC NULLS LAST
          LIMIT 20`,
        [cid, aid, today]
      ), "todayTasks"),

      safe(rawQuery<Record<string, unknown>>(
        `SELECT t.id, t.title, t.priority, t."scheduledDate",
                c.name AS "clientName"
           FROM tasks t
           LEFT JOIN clients c ON c.id = t."clientId" AND c."companyId" = t."companyId" AND c."deletedAt" IS NULL
          WHERE t."companyId" = $1
            AND t."deletedAt" IS NULL
            AND t.status IN ('pending','in_progress')
            AND (t."assignedTo" = $2 OR $2 IS NULL)
            AND t."scheduledDate" < $3
          ORDER BY t."scheduledDate" ASC
          LIMIT 10`,
        [cid, aid, today]
      ), "overdueTasks"),

      // Last 10 inbound communications (preview) — operational triage.
      // Phase 4 contract step 2 — read from v_message_log_all; column
      // aliases preserve the response shape the frontend expects.
      safe(rawQuery<Record<string, unknown>>(
        `SELECT id, channel,
                "fromAddress" AS "fromNumber", "toAddress" AS "toNumber",
                subject, LEFT(body, 200) AS body_preview,
                "relatedType", "relatedId", status, "createdAt"
           FROM v_message_log_all
          WHERE "companyId" = $1
            AND direction = 'inbound'
            AND "deletedAt" IS NULL
          ORDER BY "createdAt" DESC
          LIMIT 10`,
        [cid]
      ), "recentMessages"),

      safe(rawQuery<Record<string, unknown>>(
        `SELECT id, "callId", "callerNumber", "calledNumber",
                direction, duration, status, "createdAt"
           FROM pbx_calls
          WHERE "companyId" = $1
          ORDER BY "createdAt" DESC
          LIMIT 8`,
        [cid]
      ), "recentCalls"),

      // Upcoming calendar items from tasks + obligations within 7 days.
      // We deliberately compose a small UNION instead of calling the
      // /calendar/upcoming endpoint to keep this self-contained.
      safe(rawQuery<Record<string, unknown>>(
        `(SELECT 'task' AS kind, t.id::text AS id, t.title, t."scheduledDate" AS date,
                 t.priority, t.status
            FROM tasks t
           WHERE t."companyId" = $1
             AND t."deletedAt" IS NULL
             AND t."scheduledDate" BETWEEN $2 AND ($2::date + INTERVAL '7 days')
             AND (t."assignedTo" = $3 OR $3 IS NULL)
             AND t.status IN ('pending','in_progress')
           LIMIT 15)
         UNION ALL
         (SELECT 'obligation' AS kind, o.id::text AS id, o.title, o."dueAt"::date AS date,
                 NULL::text AS priority, o.status
            FROM obligations o
           WHERE o."companyId" = $1
             AND o."dueAt" BETWEEN $2::timestamptz AND ($2::date + INTERVAL '7 days')::timestamptz
             AND o.status IN ('pending','breached','escalated_l1','escalated_l2')
           LIMIT 15)
         ORDER BY date ASC
         LIMIT 20`,
        [cid, today, aid]
      ), "upcomingEvents"),

      safeOne(rawQuery<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*) FROM tasks t
             WHERE t."companyId" = $1 AND t."deletedAt" IS NULL
               AND t.status IN ('pending','in_progress')
               AND (t."assignedTo" = $2 OR $2 IS NULL)) AS "openTasks",
           (SELECT COUNT(*) FROM v_message_log_all
             WHERE "companyId" = $1 AND direction = 'inbound'
               AND "deletedAt" IS NULL
               AND "createdAt" >= NOW() - INTERVAL '24 hours') AS "messagesLast24h",
           (SELECT COUNT(*) FROM pbx_calls
             WHERE "companyId" = $1
               AND "createdAt" >= NOW() - INTERVAL '24 hours') AS "callsLast24h"`,
        [cid, aid]
      ), "counts"),
    ]);

    res.json(maskFields(req, {
      today,
      todayTasks,
      overdueTasks,
      recentMessages,
      recentCalls,
      upcomingEvents,
      counts: counts ?? { openTasks: 0, messagesLast24h: 0, callsLast24h: 0 },
    }));
  } catch (err) {
    handleRouteError(err, res, "workspace/feed");
  }
});

// ─────────────────────── GET /workspace/team (manager) ───────────────────
// Access gating is via the `workspace.manager` feature in the RBAC catalog —
// the authorize() middleware rejects users without view access, so no
// explicit role-level check is needed here.
router.get("/team", authorize({ feature: "workspace.manager", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const today = todayISO();

    const [
      attendanceToday,
      teamOpenTasks,
      teamMessagesToday,
      pendingApprovalsSummary,
      weekKpis,
    ] = await Promise.all([
      safeOne(rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE a.status = 'present') AS present,
           COUNT(*) FILTER (WHERE a.status = 'late') AS late,
           COUNT(*) FILTER (WHERE a.status = 'absent') AS absent,
           COUNT(*) FILTER (WHERE a.status = 'on_leave') AS on_leave
         FROM attendance a
         JOIN employee_assignments ea ON ea.id = a."assignmentId"
         WHERE ea."companyId" = $1 AND a.date = $2 AND a."deletedAt" IS NULL`,
        [cid, today]
      ), "attendanceToday"),

      safe(rawQuery<Record<string, unknown>>(
        `SELECT e.id AS "employeeId", e.name AS "employeeName",
                COUNT(t.id) FILTER (WHERE t.status IN ('pending','in_progress')) AS "openCount",
                COUNT(t.id) FILTER (WHERE t.status IN ('pending','in_progress') AND t."scheduledDate" < $2) AS "overdueCount"
           FROM employees e
           JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
           LEFT JOIN tasks t ON t."assignedTo" = ea.id AND t."deletedAt" IS NULL
          WHERE e."companyId" = $1 AND e."deletedAt" IS NULL
          GROUP BY e.id, e.name
          HAVING COUNT(t.id) FILTER (WHERE t.status IN ('pending','in_progress')) > 0
          ORDER BY "overdueCount" DESC, "openCount" DESC
          LIMIT 15`,
        [cid, today]
      ), "teamOpenTasks"),

      safeOne(rawQuery<Record<string, unknown>>(
        `SELECT
           COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound,
           COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
           COUNT(*) FILTER (WHERE direction = 'inbound' AND channel = 'email') AS "inboundEmail",
           COUNT(*) FILTER (WHERE direction = 'inbound' AND channel = 'whatsapp') AS "inboundWhatsapp",
           COUNT(*) FILTER (WHERE direction = 'inbound' AND channel = 'sms') AS "inboundSms"
         FROM v_message_log_all
         WHERE "companyId" = $1
           AND "deletedAt" IS NULL
           AND "createdAt" >= $2::date AND "createdAt" < ($2::date + INTERVAL '1 day')`,
        [cid, today]
      ), "teamMessagesToday"),

      safeOne(rawQuery<Record<string, unknown>>(
        // Salary advances live in journal_entries with ref LIKE 'SALARY-ADV%'
        // (no dedicated hr_loan_requests table — see action-center pattern).
        `SELECT
           (SELECT COUNT(*) FROM hr_leave_requests
             WHERE "companyId" = $1 AND status = 'pending' AND "deletedAt" IS NULL) AS "leaveRequests",
           (SELECT COUNT(*) FROM hr_overtime_requests
             WHERE "companyId" = $1 AND status = 'pending' AND "deletedAt" IS NULL) AS "overtimeRequests",
           (SELECT COUNT(*) FROM journal_entries
             WHERE "companyId" = $1 AND "deletedAt" IS NULL
               AND ref LIKE 'SALARY-ADV%'
               AND status IN ('pending_approval','pending')) AS "advanceRequests",
           (SELECT COUNT(*) FROM hr_exit_requests
             WHERE "companyId" = $1 AND status = 'pending' AND "deletedAt" IS NULL) AS "exitRequests"`,
        [cid]
      ), "pendingApprovalsSummary"),

      safeOne(rawQuery<Record<string, unknown>>(
        `SELECT
           (SELECT COUNT(*) FROM tasks
             WHERE "companyId" = $1 AND "deletedAt" IS NULL
               AND status = 'completed'
               AND "completedAt" >= NOW() - INTERVAL '7 days') AS "tasksClosedWeek",
           (SELECT COUNT(*) FROM v_message_log_all
             WHERE "companyId" = $1 AND "deletedAt" IS NULL
               AND "createdAt" >= NOW() - INTERVAL '7 days') AS "messagesWeek",
           (SELECT COUNT(*) FROM pbx_calls
             WHERE "companyId" = $1
               AND "createdAt" >= NOW() - INTERVAL '7 days') AS "callsWeek",
           (SELECT COUNT(*) FROM invoices
             WHERE "companyId" = $1 AND "deletedAt" IS NULL
               AND "createdAt" >= NOW() - INTERVAL '7 days') AS "invoicesWeek"`,
        [cid]
      ), "weekKpis"),
    ]);

    res.json(maskFields(req, {
      today,
      attendanceToday: attendanceToday ?? { present: 0, late: 0, absent: 0, on_leave: 0 },
      teamOpenTasks,
      teamMessagesToday: teamMessagesToday ?? {
        inbound: 0, outbound: 0,
        inboundEmail: 0, inboundWhatsapp: 0, inboundSms: 0,
      },
      pendingApprovalsSummary: pendingApprovalsSummary ?? {
        leaveRequests: 0, overtimeRequests: 0, advanceRequests: 0, exitRequests: 0,
      },
      weekKpis: weekKpis ?? {
        tasksClosedWeek: 0, messagesWeek: 0, callsWeek: 0, invoicesWeek: 0,
      },
    }));
  } catch (err) {
    handleRouteError(err, res, "workspace/team");
  }
});

export default router;
