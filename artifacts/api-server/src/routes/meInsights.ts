/**
 * IGOC-006 — Role-Adaptive UX surface (Proactive Insights).
 *
 * `GET /me/proactive-insights` returns a categorised list of "things the
 * system noticed about your active context" — iqamas expiring, documents
 * expiring, pending approvals waiting on you, unposted journals,
 * overdue invoices, overdue tasks, due obligations, critical
 * notifications.
 *
 * IGOC governing principle: the surface is shaped by ACTIVE context
 *   (scope.role + scope.companyId + scope.branchId + scope.activeAssignmentId)
 * — NOT by the user identity. Switching the header role-picker
 * (`x-selected-role`) re-narrows scope.role inside authMiddleware, and
 * this endpoint's category gates flip accordingly: an owner previewing
 * as `employee` sees the employee surface, not the manager surface.
 *
 * Why a new endpoint instead of extending /my-space:
 *   - /my-space is the user's HR home (attendance, leave balance, payslip).
 *   - /action-center is the approval queue (manager-only, level ≥ 20).
 *   - /dashboard is the dashboard widget set.
 *
 * None of those answer the user's question: «ماذا يجب أن أعرفه الآن؟».
 * This endpoint does — across all of the user's role's domains, scoped
 * to the active company + branch, capped at 5 items per category.
 */
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  FINANCE_ROLES,
  HR_ROLES,
  MGR_ROLES,
  LEAVE_APPROVAL_ROLES,
} from "../lib/rbacCatalog.js";
import { logger } from "../lib/logger.js";

const router = Router();

type Severity = "info" | "warning" | "critical";

interface Insight {
  category: string;
  severity: Severity;
  title: string;
  body: string;
  count: number;
  deepLink: string;
  items: Array<{ id: number | string; label: string; meta?: Record<string, unknown> }>;
}

const safe = <T>(p: Promise<T[]>, label: string, fallback: T[] = []): Promise<T[]> =>
  p.catch((e) => {
    logger.error(e, `[me/insights] ${label} failed`);
    return fallback;
  });

const ifRole = <T>(
  roles: readonly string[],
  role: string,
  fn: () => Promise<T[]>,
  label: string,
): Promise<T[]> =>
  roles.includes(role) ? safe(fn(), label) : Promise.resolve([] as T[]);

function severityFromDays(daysLeft: number): Severity {
  if (daysLeft <= 7) return "critical";
  if (daysLeft <= 30) return "warning";
  return "info";
}

router.get(
  "/proactive-insights",
  authorize({ feature: "my_space", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const role = scope.role;
      const companyId = scope.companyId;
      const employeeId = scope.employeeId;
      const assignmentId = scope.activeAssignmentId;
      const cc = scope.allowedCompanies;

      const [
        myDocsExpiring,
        myIqama,
        myPendingRequests,
        teamPendingLeaves,
        companyIqamaExpiring,
        companyUnpostedJournals,
        companyOverdueInvoices,
        companyDueObligations,
        criticalNotifications,
      ] = await Promise.all([
        // ── Category 1: my employee docs expiring in 60 days ────────────
        employeeId
          ? safe(
              rawQuery<Record<string, unknown>>(
                `SELECT id, type, name AS label, "expiryDate",
                        ("expiryDate"::date - CURRENT_DATE) AS "daysLeft"
                 FROM employee_documents
                 WHERE "employeeId" = $1 AND "companyId" = $2
                   AND "expiryDate" IS NOT NULL
                   AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
                 ORDER BY "expiryDate" ASC LIMIT 5`,
                [employeeId, companyId],
              ),
              "myDocsExpiring",
            )
          : Promise.resolve([]),

        // ── Category 2: my iqama / passport / work permit expiring ────────
        employeeId
          ? safe(
              rawQuery<Record<string, unknown>>(
                `SELECT id,
                        "iqamaExpiry",
                        "passportExpiry",
                        "workPermitExpiry",
                        ("iqamaExpiry"::date - CURRENT_DATE)      AS "iqamaDaysLeft",
                        ("passportExpiry"::date - CURRENT_DATE)   AS "passportDaysLeft",
                        ("workPermitExpiry"::date - CURRENT_DATE) AS "workPermitDaysLeft"
                 FROM employees
                 WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
                   AND (
                     "iqamaExpiry"      BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
                  OR "passportExpiry"   BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
                  OR "workPermitExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
                   )`,
                [employeeId, companyId],
              ),
              "myIqama",
            )
          : Promise.resolve([]),

        // ── Category 3: my own pending requests (leave/loan/overtime/exit) ──
        assignmentId
          ? safe(
              rawQuery<Record<string, unknown>>(
                `SELECT id::text, 'leave' AS kind, 'طلب إجازة' AS label, status, "createdAt"
                   FROM hr_leave_requests
                  WHERE "assignmentId" = $1 AND status = 'pending' AND hr_leave_requests."deletedAt" IS NULL
                 UNION ALL
                 SELECT id::text, 'loan', CONCAT('سلفة ', "loanNumber"), status, "createdAt"
                   FROM hr_employee_loans
                  WHERE "assignmentId" = $1 AND status = 'pending' AND hr_employee_loans."deletedAt" IS NULL
                 UNION ALL
                 SELECT id::text, 'overtime', CONCAT('وقت إضافي ', "requestNumber"), status, "createdAt"
                   FROM hr_overtime_requests
                  WHERE "assignmentId" = $1 AND status = 'pending' AND hr_overtime_requests."deletedAt" IS NULL
                 ORDER BY "createdAt" DESC LIMIT 5`,
                [assignmentId],
              ),
              "myPendingRequests",
            )
          : Promise.resolve([]),

        // ── Category 4: pending leave approvals waiting on me (manager-only) ─
        ifRole(
          LEAVE_APPROVAL_ROLES,
          role,
          () =>
            rawQuery<Record<string, unknown>>(
              `SELECT lr.id, e.name AS "employeeName", lt.name AS "leaveType",
                      lr."startDate", lr."endDate", lr.days, lr."createdAt"
                 FROM hr_leave_requests lr
                 JOIN employees e       ON e.id  = lr."employeeId" AND e."deletedAt" IS NULL
                 JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
            LEFT JOIN leave_approval_stages las
                   ON las."leaveRequestId" = lr.id AND las.status = 'pending'
                WHERE lr."companyId" = ANY($1::int[])
                  AND lr.status = 'pending'
                  AND lr."deletedAt" IS NULL
                  AND ($2 = 'owner'
                       OR las."assignedTo" = $3
                       OR (las."assignedTo" IS NULL AND las."requiredRole" = $2))
                ORDER BY lr."createdAt" ASC LIMIT 5`,
              [cc, role, assignmentId],
            ),
          "teamPendingLeaves",
        ),

        // ── Category 5: company iqama expiring 30 days (HR-only) ──────────
        ifRole(
          HR_ROLES,
          role,
          () =>
            rawQuery<Record<string, unknown>>(
              `SELECT id, name AS "employeeName", "iqamaExpiry",
                      ("iqamaExpiry"::date - CURRENT_DATE) AS "daysLeft"
                 FROM employees
                WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL
                  AND "iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                ORDER BY "iqamaExpiry" ASC LIMIT 5`,
              [companyId],
            ),
          "companyIqamaExpiring",
        ),

        // ── Category 6: company unposted journal entries > 3 days (Finance) ─
        ifRole(
          FINANCE_ROLES,
          role,
          () =>
            rawQuery<Record<string, unknown>>(
              `SELECT id, ref, description, status, "createdAt",
                      (CURRENT_DATE - "createdAt"::date) AS "daysOld"
                 FROM journal_entries
                WHERE "companyId" = $1 AND "deletedAt" IS NULL
                  AND status IN ('draft','pending_approval')
                  AND "createdAt"::date <= CURRENT_DATE - INTERVAL '3 days'
                ORDER BY "createdAt" ASC LIMIT 5`,
              [companyId],
            ),
          "companyUnpostedJournals",
        ),

        // ── Category 7: company overdue invoices (Finance) ────────────────
        ifRole(
          FINANCE_ROLES,
          role,
          () =>
            rawQuery<Record<string, unknown>>(
              `SELECT i.id, i.ref, i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
                      i."dueDate", c.name AS "clientName",
                      (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue"
                 FROM invoices i
            LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
                WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled')
                  AND i."dueDate" < CURRENT_DATE
                  AND i."deletedAt" IS NULL
                ORDER BY i."dueDate" ASC LIMIT 5`,
              [companyId],
            ),
          "companyOverdueInvoices",
        ),

        // ── Category 8: due obligations next 7 days (managers + above) ─────
        ifRole(
          MGR_ROLES,
          role,
          () =>
            rawQuery<Record<string, unknown>>(
              `SELECT id, "entityType", "entityId", "obligationType", title,
                      "dueAt", "assignedTo",
                      (("dueAt"::date) - CURRENT_DATE) AS "daysLeft"
                 FROM obligations
                WHERE "companyId" = $1 AND status = 'pending'
                  AND "dueAt" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
                ORDER BY "dueAt" ASC LIMIT 5`,
              [companyId],
            ),
          "companyDueObligations",
        ),

        // ── Category 9: critical unread notifications (everyone) ──────────
        assignmentId
          ? safe(
              rawQuery<Record<string, unknown>>(
                `SELECT id, type, title, body, priority, "createdAt"
                   FROM notifications
                  WHERE "assignmentId" = $1 AND "companyId" = $2
                    AND "isRead" = false AND priority IN ('urgent','high')
                  ORDER BY "createdAt" DESC LIMIT 5`,
                [assignmentId, companyId],
              ),
              "criticalNotifications",
            )
          : Promise.resolve([]),
      ]);

      const insights: Insight[] = [];

      if (myDocsExpiring.length > 0) {
        const worst = Math.min(...myDocsExpiring.map((d) => Number(d.daysLeft ?? 60)));
        insights.push({
          category: "my_documents_expiring",
          severity: severityFromDays(worst),
          title: "وثائقك تنتهي قريبًا",
          body: `لديك ${myDocsExpiring.length} وثيقة شخصية تنتهي خلال ٦٠ يومًا`,
          count: myDocsExpiring.length,
          deepLink: "/my-space/documents",
          items: myDocsExpiring.map((d) => ({
            id: Number(d.id),
            label: String(d.label ?? d.type ?? "وثيقة"),
            meta: { type: d.type, expiryDate: d.expiryDate, daysLeft: Number(d.daysLeft) },
          })),
        });
      }

      for (const row of myIqama) {
        const daysLeft = [row.iqamaDaysLeft, row.passportDaysLeft, row.workPermitDaysLeft]
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v));
        if (daysLeft.length === 0) continue;
        const worst = Math.min(...daysLeft);
        const items: Insight["items"] = [];
        if (row.iqamaExpiry) items.push({ id: "iqama", label: "إقامة", meta: { expiry: row.iqamaExpiry, daysLeft: Number(row.iqamaDaysLeft) } });
        if (row.passportExpiry) items.push({ id: "passport", label: "جواز", meta: { expiry: row.passportExpiry, daysLeft: Number(row.passportDaysLeft) } });
        if (row.workPermitExpiry) items.push({ id: "work_permit", label: "رخصة عمل", meta: { expiry: row.workPermitExpiry, daysLeft: Number(row.workPermitDaysLeft) } });
        insights.push({
          category: "my_official_docs_expiring",
          severity: severityFromDays(worst),
          title: "وثائقك الرسمية تنتهي قريبًا",
          body: `الإقامة/الجواز/رخصة العمل تحتاج تجديدًا خلال ${worst} يوم`,
          count: items.length,
          deepLink: "/profile/personal",
          items,
        });
      }

      if (myPendingRequests.length > 0) {
        insights.push({
          category: "my_pending_requests",
          severity: "info",
          title: "طلباتك المعلّقة",
          body: `لديك ${myPendingRequests.length} طلب بانتظار موافقة`,
          count: myPendingRequests.length,
          deepLink: "/my-space/requests",
          items: myPendingRequests.map((r) => ({
            id: String(r.id),
            label: String(r.label ?? `${r.kind} #${r.id}`),
            meta: { kind: r.kind, status: r.status, createdAt: r.createdAt },
          })),
        });
      }

      if (teamPendingLeaves.length > 0) {
        insights.push({
          category: "team_pending_leaves",
          severity: "warning",
          title: "طلبات إجازة بانتظار اعتمادك",
          body: `${teamPendingLeaves.length} طلب إجازة معلّق`,
          count: teamPendingLeaves.length,
          deepLink: "/action-center",
          items: teamPendingLeaves.map((l) => ({
            id: Number(l.id),
            label: String(l.employeeName ?? "موظف"),
            meta: { leaveType: l.leaveType, startDate: l.startDate, endDate: l.endDate, days: l.days },
          })),
        });
      }

      if (companyIqamaExpiring.length > 0) {
        const worst = Math.min(...companyIqamaExpiring.map((r) => Number(r.daysLeft ?? 30)));
        insights.push({
          category: "company_iqama_expiring",
          severity: severityFromDays(worst),
          title: "إقامات موظفين تنتهي قريبًا",
          body: `${companyIqamaExpiring.length} موظف بحاجة لتجديد إقامة خلال ٣٠ يومًا`,
          count: companyIqamaExpiring.length,
          deepLink: "/hr/employees?filter=iqama_expiring",
          items: companyIqamaExpiring.map((r) => ({
            id: Number(r.id),
            label: String(r.employeeName ?? "موظف"),
            meta: { iqamaExpiry: r.iqamaExpiry, daysLeft: Number(r.daysLeft) },
          })),
        });
      }

      if (companyUnpostedJournals.length > 0) {
        insights.push({
          category: "company_unposted_journals",
          severity: "warning",
          title: "قيود محاسبية غير مرحّلة",
          body: `${companyUnpostedJournals.length} قيد بحاجة إلى مراجعة أو ترحيل`,
          count: companyUnpostedJournals.length,
          deepLink: "/finance/journal?status=draft",
          items: companyUnpostedJournals.map((j) => ({
            id: Number(j.id),
            label: String(j.ref ?? `قيد #${j.id}`),
            meta: { status: j.status, daysOld: Number(j.daysOld), description: j.description },
          })),
        });
      }

      if (companyOverdueInvoices.length > 0) {
        const worst = Math.max(...companyOverdueInvoices.map((i) => Number(i.daysOverdue ?? 0)));
        insights.push({
          category: "company_overdue_invoices",
          severity: worst >= 60 ? "critical" : "warning",
          title: "فواتير متأخرة بحاجة لتحصيل",
          body: `${companyOverdueInvoices.length} فاتورة متأخرة (أسوأها ${worst} يوم)`,
          count: companyOverdueInvoices.length,
          deepLink: "/finance/invoices?filter=overdue",
          items: companyOverdueInvoices.map((i) => ({
            id: Number(i.id),
            label: String(i.ref ?? `فاتورة #${i.id}`),
            meta: {
              clientName: i.clientName,
              total: Number(i.total),
              paidAmount: Number(i.paidAmount),
              dueDate: i.dueDate,
              daysOverdue: Number(i.daysOverdue),
            },
          })),
        });
      }

      if (companyDueObligations.length > 0) {
        const worst = Math.min(...companyDueObligations.map((o) => Number(o.daysLeft ?? 7)));
        insights.push({
          category: "company_due_obligations",
          severity: severityFromDays(worst),
          title: "التزامات مستحقة قريبًا",
          body: `${companyDueObligations.length} التزام مستحق خلال ٧ أيام`,
          count: companyDueObligations.length,
          deepLink: "/obligations?status=pending",
          items: companyDueObligations.map((o) => ({
            id: Number(o.id),
            label: String(o.title ?? `${o.obligationType} #${o.id}`),
            meta: {
              entityType: o.entityType,
              entityId: o.entityId,
              obligationType: o.obligationType,
              dueAt: o.dueAt,
              daysLeft: Number(o.daysLeft),
            },
          })),
        });
      }

      if (criticalNotifications.length > 0) {
        insights.push({
          category: "critical_notifications",
          severity: "critical",
          title: "تنبيهات عاجلة",
          body: `${criticalNotifications.length} تنبيه عاجل لم يُقرأ بعد`,
          count: criticalNotifications.length,
          deepLink: "/notifications?priority=urgent",
          items: criticalNotifications.map((n) => ({
            id: Number(n.id),
            label: String(n.title ?? n.type ?? "تنبيه"),
            meta: { type: n.type, priority: n.priority, body: n.body, createdAt: n.createdAt },
          })),
        });
      }

      const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
      insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

      res.json(
        maskFields(req, {
          insights,
          totalCount: insights.reduce((acc, i) => acc + i.count, 0),
          generatedAt: new Date().toISOString(),
          context: {
            role,
            companyId,
            branchId: scope.branchId,
            activeAssignmentId: assignmentId,
            selectedRoleKey: scope.selectedRoleKey,
            resolvedScope: scope.resolvedScope ?? null,
          },
        }),
      );
    } catch (err) {
      handleRouteError(err, res, "Proactive insights error:");
    }
  },
);

export default router;
