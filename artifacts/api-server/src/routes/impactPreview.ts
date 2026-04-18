import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

interface ImpactItem {
  type: "financial" | "administrative" | "reporting";
  icon: string;
  label: string;
  detail: string;
}

router.post("/", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, action } = req.body;
    if (!entityType || !entityId) {
      res.status(400).json({ error: "entityType and entityId are required" });
      return;
    }

    const impacts: ImpactItem[] = [];

    if (entityType === "request" || entityType === "requests") {
      const [request] = await rawQuery<any>(
        `SELECT * FROM requests WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL)`,
        [entityId, scope.companyId]
      );
      if (request) {
        if (request.requestType === "salary_advance" || request.requestType === "financial") {
          const amount = request.amount || request.metadata?.amount;
          if (amount) {
            impacts.push({
              type: "financial",
              icon: "💰",
              label: "أثر مالي",
              detail: `خصم/إضافة مبلغ ${Number(amount).toLocaleString("ar-SA")} ر.س`,
            });
          }
        }
        impacts.push({
          type: "administrative",
          icon: "📋",
          label: "تغيير حالة",
          detail: `تحويل الحالة من "${request.status}" إلى "${action === "approve" ? "approved" : action === "reject" ? "rejected" : "returned"}"`,
        });
        impacts.push({
          type: "administrative",
          icon: "🔔",
          label: "إشعارات",
          detail: "سيتم إرسال إشعار لمقدم الطلب بنتيجة القرار",
        });
      }
    }

    if (entityType === "leave_request" || entityType === "hr_leave_request") {
      const [leave] = await rawQuery<any>(
        `SELECT lr.*, lt.name AS "leaveTypeName", e.name AS "employeeName"
         FROM hr_leave_requests lr
         LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         LEFT JOIN employees e ON e.id = lr."employeeId"
         WHERE lr.id = $1 AND lr."companyId" = $2`,
        [entityId, scope.companyId]
      );
      if (leave) {
        const days = leave.days || 1;
        impacts.push({
          type: "reporting",
          icon: "📅",
          label: "رصيد الإجازات",
          detail: `خصم ${days} يوم من رصيد ${leave.leaveTypeName || "الإجازات"} للموظف ${leave.employeeName || ""}`,
        });
        impacts.push({
          type: "administrative",
          icon: "📋",
          label: "تغيير حالة",
          detail: `تحويل الحالة من "${leave.status}" إلى "${action === "approve" ? "approved" : "rejected"}"`,
        });
        impacts.push({
          type: "administrative",
          icon: "🔔",
          label: "إشعارات",
          detail: "سيتم إرسال إشعار للموظف بنتيجة القرار",
        });
        impacts.push({
          type: "reporting",
          icon: "📊",
          label: "تقارير الحضور",
          detail: `سيتم تحديث سجل حضور الموظف بأيام الإجازة`,
        });
      }
    }

    if (entityType === "invoice") {
      const [invoice] = await rawQuery<any>(
        `SELECT i.*, c.name AS "clientName"
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId"
         WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
        [entityId, scope.companyId]
      );
      if (invoice) {
        impacts.push({
          type: "financial",
          icon: "💰",
          label: "أثر مالي",
          detail: `فاتورة بقيمة ${Number(invoice.total || 0).toLocaleString("ar-SA")} ر.س للعميل ${invoice.clientName || ""}`,
        });
        impacts.push({
          type: "financial",
          icon: "📒",
          label: "قيد محاسبي",
          detail: "سيتم إنشاء قيد محاسبي تلقائي",
        });
        impacts.push({
          type: "reporting",
          icon: "📊",
          label: "الميزانية",
          detail: "سيتم تحديث تقارير الإيرادات والمصروفات",
        });
      }
    }

    if (entityType === "purchase_request" || entityType === "purchase_order") {
      const tableName = entityType === "purchase_request" ? "purchase_requests" : "purchase_orders";
      const [item] = await rawQuery<any>(
        `SELECT * FROM ${tableName} WHERE id = $1 AND "companyId" = $2`,
        [entityId, scope.companyId]
      );
      if (item) {
        const amount = item.totalAmount || item.total || item.estimatedCost;
        if (amount) {
          impacts.push({
            type: "financial",
            icon: "💰",
            label: "أثر مالي",
            detail: `التزام مالي بقيمة ${Number(amount).toLocaleString("ar-SA")} ر.س`,
          });
        }
        impacts.push({
          type: "administrative",
          icon: "📋",
          label: "تغيير حالة",
          detail: `تحويل الحالة إلى "${action === "approve" ? "approved" : "rejected"}"`,
        });
        if (action === "approve" && entityType === "purchase_request") {
          impacts.push({
            type: "administrative",
            icon: "📦",
            label: "أمر شراء",
            detail: "سيتم إنشاء أمر شراء تلقائياً بعد الاعتماد",
          });
        }
      }
    }

    if (entityType === "expense") {
      const [expense] = await rawQuery<any>(
        `SELECT je.*, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalId" = je.id WHERE je.id = $1 AND je."companyId" = $2 AND je.ref LIKE 'EXP%' GROUP BY je.id`,
        [entityId, scope.companyId]
      );
      if (expense) {
        impacts.push({
          type: "financial",
          icon: "💰",
          label: "أثر مالي",
          detail: `مصروف بقيمة ${Number(expense.amount || 0).toLocaleString("ar-SA")} ر.س`,
        });
        impacts.push({
          type: "financial",
          icon: "📒",
          label: "قيد محاسبي",
          detail: "سيتم إنشاء قيد مصروف في الحسابات",
        });
      }
    }

    if (action === "delete" && entityType === "employee") {
      const [emp] = await rawQuery<any>(
        `SELECT e.name FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
         WHERE e.id = $1 AND ea."companyId" = $2`,
        [entityId, scope.companyId]
      );
      if (emp) {
        impacts.push({ type: "administrative", icon: "⚠️", label: "إنهاء خدمة", detail: "سيتم تغيير حالة الموظف والتعيين إلى «منتهي الخدمة»" });

        const [[taskCount], [leaveCount]] = await Promise.all([
          rawQuery<any>(
            `SELECT COUNT(*) AS c FROM project_tasks pt
             JOIN projects p ON p.id = pt."projectId"
             WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL AND pt.status NOT IN ('completed','cancelled')`,
            [entityId, scope.companyId]
          ),
          rawQuery<any>(
            `SELECT COUNT(*) AS c FROM hr_leave_requests
             WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'pending'`,
            [entityId, scope.companyId]
          ),
        ]);
        const tasks = Number(taskCount?.c || 0);
        const leaves = Number(leaveCount?.c || 0);

        if (tasks > 0) impacts.push({ type: "administrative", icon: "📋", label: "مهام نشطة", detail: `يوجد ${tasks} مهمة نشطة مسندة للموظف ستبقى بدون مسؤول` });
        if (leaves > 0) impacts.push({ type: "administrative", icon: "🏖️", label: "طلبات معلقة", detail: `يوجد ${leaves} طلب إجازة معلق سيحتاج مراجعة` });
      }
    }

    if (action === "delete" && entityType === "project") {
      const [proj] = await rawQuery<any>(
        `SELECT p.name FROM projects p WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`,
        [entityId, scope.companyId]
      );
      if (proj) {
        const [[taskCount], [phaseCount]] = await Promise.all([
          rawQuery<any>(`SELECT COUNT(*) AS c FROM project_tasks WHERE "projectId" = $1 AND "companyId" = $2`, [entityId, scope.companyId]),
          rawQuery<any>(`SELECT COUNT(*) AS c FROM project_phases WHERE "projectId" = $1 AND "companyId" = $2`, [entityId, scope.companyId]),
        ]);
        const tasks = Number(taskCount?.c || 0);
        const phases = Number(phaseCount?.c || 0);

        if (tasks > 0) impacts.push({ type: "administrative", icon: "📋", label: "مهام المشروع", detail: `سيتم حذف ${tasks} مهمة مرتبطة بالمشروع` });
        if (phases > 0) impacts.push({ type: "administrative", icon: "🏁", label: "مراحل", detail: `سيتم حذف ${phases} مرحلة` });
      }
    }

    if (action === "delete" && entityType === "task") {
      impacts.push({
        type: "administrative",
        icon: "📋",
        label: "حذف المهمة",
        detail: "سيتم حذف المهمة وجميع بياناتها نهائياً",
      });
    }

    if (impacts.length === 0) {
      if (action === "delete") {
        impacts.push({
          type: "administrative",
          icon: "⚠️",
          label: "حذف نهائي",
          detail: "سيتم حذف هذا العنصر وجميع البيانات المرتبطة به نهائياً",
        });
        impacts.push({
          type: "reporting",
          icon: "📝",
          label: "سجل التدقيق",
          detail: "سيتم تسجيل عملية الحذف في سجل التدقيق",
        });
      } else {
        impacts.push({
          type: "administrative",
          icon: "📋",
          label: "تغيير حالة",
          detail: `تحويل الحالة إلى "${action === "approve" ? "معتمد" : action === "reject" ? "مرفوض" : "مُرجع"}"`,
        });
        impacts.push({
          type: "administrative",
          icon: "🔔",
          label: "إشعارات",
          detail: "سيتم إرسال إشعارات للأطراف المعنية",
        });
        impacts.push({
          type: "reporting",
          icon: "📝",
          label: "سجل التدقيق",
          detail: "سيتم تسجيل القرار في سجل التدقيق",
        });
      }
    }

    res.json({ impacts });
  } catch (err) {
    handleRouteError(err, res, "Impact preview error:");
  }
});

export default router;
