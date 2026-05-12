import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface RequestPreviewRow { id: number; status: string; data: unknown }
interface LeavePreviewRow { id: number; status: string; days: number; leaveTypeName: string | null; employeeName: string | null }
interface InvoicePreviewRow { id: number; total: number | string | null; clientName: string | null }
interface PurchasePreviewRow { id: number; totalAmount?: number | string | null; total?: number | string | null; estimatedCost?: number | string | null }
interface ExpensePreviewRow { id: number; amount: number | string | null; ref: string }
interface EmployeeNameRow { name: string }
interface ProjectNameRow { name: string }
interface CountAliasRow { c: number | string }

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const impactPreviewSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب"),
  entityId: z.union([z.coerce.number(), z.string().min(1)]),
  action: z.string().optional(),
});

interface ImpactItem {
  type: "financial" | "administrative" | "reporting";
  icon: string;
  label: string;
  detail: string;
}

router.post("/", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(impactPreviewSchema.safeParse(req.body));
    const { entityType, entityId, action } = parsed;

    const impacts: ImpactItem[] = [];

    if (entityType === "request" || entityType === "requests") {
      const [request] = await rawQuery<RequestPreviewRow>(
        `SELECT * FROM requests WHERE id = $1 AND ("companyId" = $2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
        [entityId, scope.companyId]
      );
      if (request) {
        const requestData = typeof request.data === "string" ? JSON.parse(request.data) : (request.data || {});
        const amount = requestData.amount;
        if (amount) {
          impacts.push({
            type: "financial",
            icon: "💰",
            label: "أثر مالي",
            detail: `خصم/إضافة مبلغ ${Number(amount).toLocaleString("ar-SA")} ر.س`,
          });
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
      const [leave] = await rawQuery<LeavePreviewRow>(
        `SELECT lr.*, lt.name AS "leaveTypeName", e.name AS "employeeName"
         FROM hr_leave_requests lr
         LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         LEFT JOIN employees e ON e.id = lr."employeeId"
         WHERE lr.id = $1 AND lr."companyId" = $2 AND lr."deletedAt" IS NULL`,
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
      const [invoice] = await rawQuery<InvoicePreviewRow>(
        `SELECT i.*, c.name AS "clientName"
         FROM invoices i
         LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
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
      const [item] = entityType === "purchase_request"
        ? await rawQuery<PurchasePreviewRow>(
            `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
            [entityId, scope.companyId]
          )
        : await rawQuery<PurchasePreviewRow>(
            `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
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
      const [expense] = await rawQuery<ExpensePreviewRow>(
        `SELECT je.*, COALESCE(SUM(jl.debit), 0) AS amount FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalId" = je.id WHERE je.id = $1 AND je."companyId" = $2 AND je.ref LIKE 'EXP%' AND je."deletedAt" IS NULL GROUP BY je.id`,
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
      const [emp] = await rawQuery<EmployeeNameRow>(
        `SELECT e.name FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
         WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL`,
        [entityId, scope.companyId]
      );
      if (emp) {
        impacts.push({ type: "administrative", icon: "⚠️", label: "إنهاء خدمة", detail: "سيتم تغيير حالة الموظف والتعيين إلى «منتهي الخدمة»" });

        const [[taskCount], [leaveCount]] = await Promise.all([
          rawQuery<CountAliasRow>(
            `SELECT COUNT(*) AS c FROM project_tasks pt
             JOIN projects p ON p.id = pt."projectId"
             WHERE pt."assigneeId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL AND pt.status NOT IN ('completed','cancelled')`,
            [entityId, scope.companyId]
          ),
          rawQuery<CountAliasRow>(
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
      const [proj] = await rawQuery<ProjectNameRow>(
        `SELECT p.name FROM projects p WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`,
        [entityId, scope.companyId]
      );
      if (proj) {
        const [[taskCount], [phaseCount]] = await Promise.all([
          rawQuery<CountAliasRow>(`SELECT COUNT(*) AS c FROM project_tasks WHERE "projectId" = $1 AND "deletedAt" IS NULL`, [entityId]),
          rawQuery<CountAliasRow>(`SELECT COUNT(*) AS c FROM project_phases WHERE "projectId" = $1`, [entityId]),
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

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "preview", entity: "impact_preview", entityId: Number(entityId) || 0,
    }).catch((e) => logger.error(e, "impactPreview background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "impact.previewed", entity: entityType, entityId: Number(entityId) || 0, details: JSON.stringify({ entityType, entityId, action }) }).catch((e) => logger.error(e, "impactPreview background task failed"));
    res.json({ impacts });
  } catch (err) {
    handleRouteError(err, res, "Impact preview error:");
  }
});

export default router;
