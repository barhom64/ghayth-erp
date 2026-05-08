import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", requirePermission("admin:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { module, limit: lim, offset: off } = req.query;
    const pageLimit = Math.min(Number(lim) || 50, 100);
    const pageOffset = Number(off) || 0;

    let moduleFilter = "";
    let moduleParamIndex = 0;
    const params: any[] = [cid];

    if (module && typeof module === "string") {
      params.push(module);
      moduleParamIndex = params.length;
      moduleFilter = ` AND module = $${moduleParamIndex}`;
    }

    const rows = await rawQuery<any>(
      `SELECT * FROM (
        -- Audit logs
        SELECT
          al."createdAt" AS "timestamp",
          'audit' AS source,
          al.action,
          al.entity AS module,
          al.entity || ' #' || al."entityId" AS target,
          COALESCE(e.name, 'النظام') AS "userName",
          al."entityId" AS "entityId",
          al.entity AS "entityType"
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al."userId"
        LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE al."companyId" = $1${moduleFilter}

        UNION ALL

        -- Journal entries (finance movements)
        SELECT
          je."createdAt" AS "timestamp",
          'journal' AS source,
          'قيد محاسبي' AS action,
          'finance' AS module,
          COALESCE(je.description, 'قيد #' || je.id) AS target,
          COALESCE(e.name, 'النظام') AS "userName",
          je.id::text AS "entityId",
          'journal_entry' AS "entityType"
        FROM journal_entries je
        LEFT JOIN users u ON u.id = je."createdBy"
        LEFT JOIN employees e ON e.id = u."employeeId"
        WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
        ${module ? `AND 'finance' = $${moduleParamIndex}` : ""}

        UNION ALL

        -- Requests
        SELECT
          r."createdAt" AS "timestamp",
          'request' AS source,
          CASE r.status
            WHEN 'pending' THEN 'طلب جديد'
            WHEN 'approved' THEN 'طلب معتمد'
            WHEN 'rejected' THEN 'طلب مرفوض'
            ELSE 'تحديث طلب'
          END AS action,
          'requests' AS module,
          COALESCE(r.title, 'طلب #' || r.id) AS target,
          COALESCE(r."requesterName", 'مجهول') AS "userName",
          r.id::text AS "entityId",
          'request' AS "entityType"
        FROM requests r
        WHERE r."companyId" = $1 AND r."deletedAt" IS NULL
        ${module ? `AND 'requests' = $${moduleParamIndex}` : ""}

        UNION ALL

        -- Communications
        SELECT
          cl."createdAt" AS "timestamp",
          'communication' AS source,
          CASE cl.direction
            WHEN 'inbound' THEN 'رسالة واردة'
            WHEN 'outbound' THEN 'رسالة صادرة'
            ELSE 'اتصال'
          END AS action,
          'communications' AS module,
          COALESCE(cl.subject, cl.channel || ' - ' || cl."fromNumber") AS target,
          COALESCE(cl."fromNumber", 'النظام') AS "userName",
          cl.id::text AS "entityId",
          'communication' AS "entityType"
        FROM communications_log cl
        WHERE cl."companyId" = $1 AND cl."deletedAt" IS NULL
        ${module ? `AND 'communications' = $${moduleParamIndex}` : ""}

        UNION ALL

        -- Leave requests
        SELECT
          lr."createdAt" AS "timestamp",
          'hr' AS source,
          CASE lr.status
            WHEN 'pending' THEN 'طلب إجازة جديد'
            WHEN 'approved' THEN 'إجازة معتمدة'
            WHEN 'rejected' THEN 'إجازة مرفوضة'
            ELSE 'تحديث إجازة'
          END AS action,
          'hr' AS module,
          e.name || ' - ' || COALESCE(lt.name, 'إجازة') AS target,
          e.name AS "userName",
          lr.id::text AS "entityId",
          'leave_request' AS "entityType"
        FROM hr_leave_requests lr
        JOIN employees e ON e.id = lr."employeeId"
        LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
        WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL
        ${module ? `AND 'hr' = $${moduleParamIndex}` : ""}

        UNION ALL

        -- Invoices
        SELECT
          i."createdAt" AS "timestamp",
          'finance' AS source,
          CASE i.status
            WHEN 'draft' THEN 'فاتورة مسودة'
            WHEN 'sent' THEN 'فاتورة مرسلة'
            WHEN 'paid' THEN 'فاتورة مدفوعة'
            WHEN 'overdue' THEN 'فاتورة متأخرة'
            ELSE 'فاتورة'
          END AS action,
          'finance' AS module,
          'فاتورة #' || i.id || ' - ' || COALESCE(c.name, 'عميل') || ' - ' || i.total || ' ر.س' AS target,
          COALESCE(c.name, 'غير محدد') AS "userName",
          i.id::text AS "entityId",
          'invoice' AS "entityType"
        FROM invoices i
        LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
        WHERE i."companyId" = $1 AND i."deletedAt" IS NULL
        ${module ? `AND 'finance' = $${moduleParamIndex}` : ""}

      ) AS combined
      ORDER BY "timestamp" DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageLimit, pageOffset]
    );

    const [countResult] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM (
        SELECT al.id FROM audit_logs al WHERE al."companyId" = $1${moduleFilter}
        UNION ALL
        SELECT je.id FROM journal_entries je WHERE je."companyId" = $1 AND je."deletedAt" IS NULL ${module ? `AND 'finance' = $${moduleParamIndex}` : ""}
        UNION ALL
        SELECT r.id FROM requests r WHERE r."companyId" = $1 AND r."deletedAt" IS NULL ${module ? `AND 'requests' = $${moduleParamIndex}` : ""}
        UNION ALL
        SELECT cl.id FROM communications_log cl WHERE cl."companyId" = $1 AND cl."deletedAt" IS NULL ${module ? `AND 'communications' = $${moduleParamIndex}` : ""}
        UNION ALL
        SELECT lr.id FROM hr_leave_requests lr WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL ${module ? `AND 'hr' = $${moduleParamIndex}` : ""}
        UNION ALL
        SELECT i.id FROM invoices i WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${module ? `AND 'finance' = $${moduleParamIndex}` : ""}
      ) AS combined`,
      params
    );

    res.json({
      data: rows,
      total: Number(countResult?.total ?? 0),
      limit: pageLimit,
      offset: pageOffset,
    });
  } catch (err) {
    handleRouteError(err, res, "activityLog");
  }
});

router.get("/summary", requirePermission("admin:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [pendingRequests] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM requests WHERE status='pending' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [pendingLeaves] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM hr_leave_requests WHERE status='pending' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [overdueInvoices] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM invoices WHERE status='overdue' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [openTickets] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM support_tickets WHERE status='open' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [todayAttendance] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM attendance WHERE date=CURRENT_DATE AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [expiringContracts] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM legal_contracts WHERE status='active' AND "endDate"::date - CURRENT_DATE <= 30 AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [lowStock] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM warehouse_products WHERE "currentStock" <= "minStock" AND status='active' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [unreadNotifications] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM notifications WHERE "isRead"=false AND "assignmentId"=$2 AND "companyId"=$1`,
      [cid, scope.activeAssignmentId]);

    res.json({
      pendingRequests: Number(pendingRequests?.count ?? 0),
      pendingLeaves: Number(pendingLeaves?.count ?? 0),
      overdueInvoices: Number(overdueInvoices?.count ?? 0),
      openTickets: Number(openTickets?.count ?? 0),
      todayAttendance: Number(todayAttendance?.count ?? 0),
      expiringContracts: Number(expiringContracts?.count ?? 0),
      lowStock: Number(lowStock?.count ?? 0),
      unreadNotifications: Number(unreadNotifications?.count ?? 0),
    });
  } catch (err) {
    handleRouteError(err, res, "activityLog");
  }
});

export default router;
