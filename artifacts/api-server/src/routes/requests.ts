import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const VALID_REQUEST_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_review", "approved", "rejected", "returned"],
  in_review: ["approved", "rejected", "returned"],
  returned: ["pending"],
  draft: ["pending"],
  approved: ["closed"],
  rejected: [],
  closed: [],
};

const MANAGER_ROLES = ["owner", "general_manager", "hr_manager", "branch_manager"];

async function validateRequestTransition(
  id: number,
  companyId: number,
  targetStatus: string,
  scope: any,
): Promise<{ error?: string; code?: number; request?: any }> {
  const [request] = await rawQuery<any>(
    `SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`,
    [id, companyId]
  );
  if (!request) return { error: "الطلب غير موجود", code: 404 };

  const allowed = VALID_REQUEST_TRANSITIONS[request.status];
  if (allowed && !allowed.includes(targetStatus)) {
    return { error: `لا يمكن تغيير الحالة من "${request.status}" إلى "${targetStatus}" — انتقال غير مصرح`, code: 409 };
  }

  if (['approved', 'rejected', 'returned', 'in_review'].includes(targetStatus)) {
    const isCurrentApprover = String(request.currentApprover) === String(scope.activeAssignmentId);
    const isManager = MANAGER_ROLES.includes(scope.role);
    if (!isCurrentApprover && !isManager) {
      return { error: "غير مصرح لك بتغيير حالة هذا الطلب", code: 403 };
    }
    if (!isCurrentApprover && isManager) {
      request._isOverride = true;
    }
  }

  if (targetStatus === "approved") {
    const data = typeof request.data === "string" ? JSON.parse(request.data || "{}") : (request.data || {});
    const attachments = typeof request.attachments === "string" ? JSON.parse(request.attachments || "[]") : (request.attachments || []);
    const validationErrors: string[] = [];

    const requiredFields = data._requiredFields as string[] | undefined;
    if (requiredFields) {
      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === "") {
          validationErrors.push(`الحقل المطلوب "${field}" غير مكتمل`);
        }
      }
    }
    if (data._requiresAttachments && (!attachments || attachments.length === 0)) {
      validationErrors.push("المرفقات الإلزامية غير مرفقة");
    }

    if (data._budgetAccountCode && data._budgetAmount) {
      const period = new Date().toISOString().slice(0, 7);
      const [budget] = await rawQuery<any>(
        `SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3`,
        [companyId, data._budgetAccountCode, period]
      );
      if (!budget) {
        validationErrors.push(`لا توجد ميزانية معرّفة للحساب "${data._budgetAccountCode}" — لا يمكن الاعتماد`);
      } else {
        const budgetAmount = Number(budget.amount);
        if (budgetAmount <= 0) {
          validationErrors.push("الميزانية المحددة صفر أو سالبة — لا يمكن الاعتماد");
        } else {
          const newUsed = Number(budget.used) + Number(data._budgetAmount);
          const utilization = (newUsed / budgetAmount) * 100;
          if (utilization > 110) {
            validationErrors.push(`تجاوز الميزانية (${Math.round(utilization)}%) — لا يمكن الاعتماد`);
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return { error: `لا يمكن الاعتماد — شروط غير مستوفاة:\n${validationErrors.map(e => `• ${e}`).join("\n")}`, code: 422 };
    }
  }

  return { request };
}

const router = Router();
router.use(authMiddleware);

async function logCommunication(companyId: number, direction: string, subject: string, body: string, relatedType: string, relatedId: number) {
  try {
    await rawExecute(
      `INSERT INTO communications_log ("companyId", channel, direction, "fromNumber", "toNumber", subject, body, status, "relatedType", "relatedId")
       VALUES ($1, 'internal', $2, 'system', 'system', $3, $4, $5, $6, $7)`,
      [companyId, direction, subject, body, direction === 'inbound' ? 'received' : 'sent', relatedType, relatedId]
    );
  } catch (e) {
    console.error("Failed to log communication:", e);
  }
}

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const isManager = ["owner", "general_manager", "hr_manager", "branch_manager"].includes(scope.role);
    let rows;
    if (isManager) {
      rows = await rawQuery(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r."companyId"=$1 OR r."companyId" IS NULL ORDER BY r."createdAt" DESC`, [scope.companyId]);
    } else {
      rows = await rawQuery(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE (r."companyId"=$1 OR r."companyId" IS NULL) AND (r."requesterId"::text=$2 OR r."currentApprover"=$3) ORDER BY r."createdAt" DESC`, [scope.companyId, String(scope.activeAssignmentId), String(scope.activeAssignmentId)]);
    }
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const { typeId, requesterName, title, description, priority, data, attachments } = req.body;
    const enforcedRequesterId = scope.activeAssignmentId;
    let validatedAttachments: any[] = [];
    if (attachments && Array.isArray(attachments)) {
      validatedAttachments = attachments.slice(0, 10).filter((a: any) =>
        a && typeof a.name === "string" && typeof a.size === "number" && a.size <= 5 * 1024 * 1024
      ).map((a: any) => ({ name: a.name, size: a.size, type: a.type || "", dataUrl: a.dataUrl || "" }));
    }
    const r = await rawExecute(
      `INSERT INTO requests ("typeId", "requesterId", "requesterName", title, description, status, priority, data, "companyId", attachments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [typeId || null, enforcedRequesterId, requesterName, title, description, "pending", priority || "medium", data ? JSON.stringify(data) : '{}', scope.companyId, JSON.stringify(validatedAttachments)]
    );
    await logCommunication(
      scope.companyId, 'inbound',
      `طلب جديد: ${title}`,
      `تم إنشاء طلب جديد بواسطة ${requesterName || 'مستخدم'} - الأولوية: ${priority || 'متوسطة'} - ${description || ''}`,
      'request', r.insertId
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/catalog", async (req, res) => {
  try {
    const scope = req.scope!;
    const role = scope.role;
    const jobTitle = scope.jobTitle;

    const allTypes = await rawQuery<any>(
      `SELECT id, name, description, category, "requiredFields", "approvalFlow"
       FROM request_types
       WHERE "isActive" = true AND ("companyId" = $1 OR "companyId" IS NULL)
       ORDER BY category, name`,
      [scope.companyId]
    );

    const catalogItems = [
      { key: "leave", name: "طلب إجازة", icon: "Calendar", category: "hr", description: "تقديم طلب إجازة بأنواعها المختلفة", path: "/hr/leaves" },
      { key: "salary_advance", name: "طلب سلفة", icon: "DollarSign", category: "finance", description: "طلب سلفة على الراتب", path: "/finance/salary-advances" },
      { key: "letter", name: "طلب خطاب رسمي", icon: "FileSignature", category: "hr", description: "طلب خطاب تعريف أو شهادة خبرة", path: "/hr/official-letters" },
      { key: "custody", name: "طلب عهدة", icon: "KeyRound", category: "finance", description: "طلب عهدة مالية أو عينية", path: "/finance/custodies" },
      { key: "maintenance", name: "طلب صيانة", icon: "Wrench", category: "operations", description: "طلب صيانة لمعدات أو مرافق", path: "/support" },
      { key: "purchase", name: "طلب شراء", icon: "ShoppingCart", category: "finance", description: "طلب شراء مواد أو خدمات", path: "/finance/purchase-orders" },
      { key: "tech_support", name: "طلب دعم تقني", icon: "Headphones", category: "support", description: "طلب مساعدة تقنية أو IT", path: "/support" },
      { key: "legal_consultation", name: "استشارة قانونية", icon: "Scale", category: "legal", description: "طلب استشارة قانونية من الإدارة القانونية", path: "/legal/cases" },
    ];

    const roleBasedAccess: Record<string, string[]> = {
      owner: catalogItems.map(c => c.key),
      general_manager: catalogItems.map(c => c.key),
      hr_manager: ["leave", "salary_advance", "letter", "custody", "maintenance", "tech_support"],
      finance_manager: ["leave", "salary_advance", "custody", "purchase", "maintenance", "tech_support"],
      branch_manager: ["leave", "salary_advance", "letter", "custody", "maintenance", "purchase", "tech_support"],
      fleet_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      warehouse_manager: ["leave", "salary_advance", "letter", "maintenance", "purchase", "tech_support"],
      legal_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support", "legal_consultation"],
      projects_manager: ["leave", "salary_advance", "letter", "maintenance", "purchase", "tech_support"],
      support_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      crm_manager: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
      employee: ["leave", "salary_advance", "letter", "maintenance", "tech_support"],
    };

    let allowedKeys = new Set(roleBasedAccess[role] || roleBasedAccess["employee"]);

    const jobTitleLower = (jobTitle || "").toLowerCase();
    if (jobTitleLower.includes("محام") || jobTitleLower.includes("قانون") || jobTitleLower.includes("legal")) {
      allowedKeys.add("legal_consultation");
    }
    if (jobTitleLower.includes("محاسب") || jobTitleLower.includes("مالي") || jobTitleLower.includes("finance") || jobTitleLower.includes("accountant")) {
      allowedKeys.add("custody");
      allowedKeys.add("purchase");
      allowedKeys.add("salary_advance");
    }
    if (jobTitleLower.includes("مهندس") || jobTitleLower.includes("فني") || jobTitleLower.includes("engineer") || jobTitleLower.includes("technician")) {
      allowedKeys.add("maintenance");
      allowedKeys.add("purchase");
    }

    const filteredCatalog = catalogItems.filter(c => allowedKeys.has(c.key));

    const filteredCustomTypes = allTypes;

    res.json({
      catalog: filteredCatalog,
      customTypes: filteredCustomTypes,
      role,
      jobTitle,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/types", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL) ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/types", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, category, requiredFields, approvalFlow, isActive } = req.body;
    const r = await rawExecute(
      `INSERT INTO request_types (name, description, category, "requiredFields", "approvalFlow", "isActive", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, description, category, requiredFields ? JSON.stringify(requiredFields) : '[]', approvalFlow ? JSON.stringify(approvalFlow) : '[]', isActive !== false, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/workflows", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM workflows WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/workflows", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, steps } = req.body;
    const r = await rawExecute(
      `INSERT INTO workflows (name, description, steps, "companyId") VALUES ($1,$2,$3,$4)`,
      [name, description, steps ? JSON.stringify(steps) : '[]', scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [total] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [pending] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE status='pending' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [approved] = await rawQuery(`SELECT COUNT(*) as count FROM requests WHERE status='approved' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [types] = await rawQuery(`SELECT COUNT(*) as count FROM request_types WHERE "isActive"=true AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    res.json({
      totalRequests: Number(total.count),
      pendingRequests: Number(pending.count),
      approvedRequests: Number(approved.count),
      activeTypes: Number(types.count),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;

    let previousStatus: string | null = null;
    let patchIsOverride = false;
    if (b.status !== undefined) {
      const validation = await validateRequestTransition(id, scope.companyId, b.status, scope);
      if (validation.error) {
        res.status(validation.code || 400).json({ error: validation.error });
        return;
      }
      previousStatus = validation.request?.status ?? null;
      patchIsOverride = validation.request?._isOverride === true;
      if (patchIsOverride && !b.notes) {
        res.status(400).json({ error: "يجب تحديد سبب التجاوز عند التدخل في طلب ليس مسنداً إليك" });
        return;
      }
    }

    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.priority !== undefined) { params.push(b.priority); sets.push(`priority=$${params.length}`); }
    if (b.currentApprover !== undefined) { params.push(b.currentApprover); sets.push(`"currentApprover"=$${params.length}`); }
    if (b.attachments !== undefined) { params.push(JSON.stringify(b.attachments)); sets.push(`attachments=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.returnReason !== undefined) { params.push(b.returnReason); sets.push(`"returnReason"=$${params.length}`); }
    if (b.status && ['approved', 'rejected', 'returned'].includes(b.status)) {
      params.push(scope.userId); sets.push(`"reviewedBy"=$${params.length}`);
      params.push(new Date().toISOString()); sets.push(`"reviewedAt"=$${params.length}`);
    }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE requests SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    const [row] = await rawQuery<any>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`, [id, scope.companyId]);
    if (b.status && ['approved', 'rejected', 'in_review', 'returned'].includes(b.status)) {
      const statusLabels: Record<string, string> = { approved: 'معتمد', rejected: 'مرفوض', in_review: 'قيد المراجعة', returned: 'مُرجع' };
      await logCommunication(
        scope.companyId, 'outbound',
        `تحديث طلب: ${row?.title || '#' + id} — ${statusLabels[b.status] || b.status}`,
        `تم تحديث حالة الطلب رقم ${id} إلى "${statusLabels[b.status] || b.status}" - ${b.notes || row?.title || ''}`,
        'request', id
      );
      try {
        await rawExecute(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "actionByName", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          ['request', id, b.status, b.notes || b.returnReason || null, scope.userId, null, scope.companyId]
        );
      } catch (e) { console.error("Failed to log approval action:", e); }

      if (patchIsOverride) {
        await createAuditLog({
          companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
          action: "workflow_override", entity: "request", entityId: id,
          before: { status: previousStatus },
          after: { status: b.status, overriddenBy: scope.userId },
          reason: b.notes || b.returnReason || "تدخل دور أعلى",
        });
      }
      await createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: `request_status_${b.status}`,
        entity: "request",
        entityId: id,
        before: { status: previousStatus },
        after: { status: b.status },
        reason: b.notes || b.returnReason || undefined,
      });
    }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { notes } = req.body;

    const validation = await validateRequestTransition(id, scope.companyId, "approved", scope);
    if (validation.error) { res.status(validation.code || 400).json({ error: validation.error }); return; }
    const isOverride = validation.request?._isOverride === true;
    if (isOverride && !notes) { res.status(400).json({ error: "يجب تحديد سبب التجاوز عند التدخل في طلب ليس مسنداً إليك" }); return; }

    const result = await rawExecute(
      `UPDATE requests SET status='approved', notes=$1, "reviewedBy"=$2, "reviewedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [notes || null, scope.userId, id, scope.companyId]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    await rawExecute(
      `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
      [id, isOverride ? 'approved_override' : 'approved', isOverride ? `[تدخل] ${notes}` : (notes || null), scope.userId, scope.companyId]
    );
    if (isOverride) {
      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "workflow_override", entity: "request", entityId: id,
        before: { status: validation.request!.status, currentApprover: validation.request!.currentApprover },
        after: { status: "approved", overriddenBy: scope.userId },
        reason: notes || "تدخل دور أعلى",
      });
    }
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "request_status_approved", entity: "request", entityId: id,
      before: { status: validation.request!.status }, after: { status: "approved" },
      reason: notes || undefined,
    });
    const [row] = await rawQuery<any>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1`, [id]);
    await logCommunication(scope.companyId, 'outbound', `طلب معتمد: ${row?.title || '#'+id}`, `تمت الموافقة على الطلب رقم ${id}${notes ? ' - '+notes : ''}`, 'request', id);
    res.json({ ...row, actualImpact: { statusChange: { from: validation.request!.status, to: "approved" }, notifications: ["إشعار لمقدم الطلب بالاعتماد"], overrideLogged: isOverride } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { notes } = req.body;
    if (!notes) { res.status(400).json({ error: "يجب ذكر سبب الرفض" }); return; }

    const validation = await validateRequestTransition(id, scope.companyId, "rejected", scope);
    if (validation.error) { res.status(validation.code || 400).json({ error: validation.error }); return; }
    const isOverride = validation.request?._isOverride === true;

    const result = await rawExecute(
      `UPDATE requests SET status='rejected', notes=$1, "reviewedBy"=$2, "reviewedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [notes, scope.userId, id, scope.companyId]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    await rawExecute(
      `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
      [id, isOverride ? 'rejected_override' : 'rejected', isOverride ? `[تدخل] ${notes}` : notes, scope.userId, scope.companyId]
    );
    if (isOverride) {
      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "workflow_override", entity: "request", entityId: id,
        before: { status: validation.request!.status, currentApprover: validation.request!.currentApprover },
        after: { status: "rejected", overriddenBy: scope.userId },
        reason: notes,
      });
    }
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "request_status_rejected", entity: "request", entityId: id,
      before: { status: validation.request!.status }, after: { status: "rejected" },
      reason: notes,
    });
    const [row] = await rawQuery<any>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1`, [id]);
    await logCommunication(scope.companyId, 'outbound', `طلب مرفوض: ${row?.title || '#'+id}`, `تم رفض الطلب رقم ${id} - السبب: ${notes}`, 'request', id);
    res.json({ ...row, actualImpact: { statusChange: { from: validation.request!.status, to: "rejected" }, notifications: ["إشعار لمقدم الطلب بالرفض"], overrideLogged: isOverride } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/return", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { notes } = req.body;
    if (!notes) { res.status(400).json({ error: "يجب ذكر سبب الإرجاع" }); return; }

    const validation = await validateRequestTransition(id, scope.companyId, "returned", scope);
    if (validation.error) { res.status(validation.code || 400).json({ error: validation.error }); return; }
    const isOverride = validation.request?._isOverride === true;

    const result = await rawExecute(
      `UPDATE requests SET status='returned', "returnReason"=$1, notes=$2, "reviewedBy"=$3, "reviewedAt"=NOW() WHERE id=$4 AND "companyId"=$5`,
      [notes, notes, scope.userId, id, scope.companyId]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    await rawExecute(
      `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('request',$1,$2,$3,$4,$5)`,
      [id, isOverride ? 'returned_override' : 'returned', isOverride ? `[تدخل] ${notes}` : notes, scope.userId, scope.companyId]
    );
    if (isOverride) {
      await createAuditLog({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "workflow_override", entity: "request", entityId: id,
        before: { status: validation.request!.status, currentApprover: validation.request!.currentApprover },
        after: { status: "returned", overriddenBy: scope.userId },
        reason: notes,
      });
    }
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "request_status_returned", entity: "request", entityId: id,
      before: { status: validation.request!.status }, after: { status: "returned" },
      reason: notes,
    });
    const [row] = await rawQuery<any>(`SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1`, [id]);
    await logCommunication(scope.companyId, 'outbound', `طلب مُرجع: ${row?.title || '#'+id}`, `تم إرجاع الطلب رقم ${id} للتعديل - السبب: ${notes}`, 'request', id);
    res.json({ ...row, actualImpact: { statusChange: { from: validation.request!.status, to: "returned" }, notifications: ["إشعار لمقدم الطلب بالإرجاع"], overrideLogged: isOverride } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/:id/actions", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const rows = await rawQuery(
      `SELECT aa.*, u.email as "actionByEmail" FROM approval_actions aa LEFT JOIN users u ON aa."actionBy"=u.id WHERE aa."entityType"='request' AND aa."entityId"=$1 AND aa."companyId"=$2 ORDER BY aa."createdAt" DESC`,
      [id, scope.companyId]
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM requests WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    res.json({ message: "تم حذف الطلب بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/:id/convert", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { targetType } = req.body;

    if (!["maintenance", "purchase", "case"].includes(targetType)) {
      res.status(400).json({ error: "نوع التحويل غير صالح. المتاح: maintenance, purchase, case" });
      return;
    }

    const [request] = await rawQuery<any>(
      `SELECT r.*, rt.name as "typeName" FROM requests r LEFT JOIN request_types rt ON r."typeId"=rt.id WHERE r.id=$1 AND (r."companyId"=$2 OR r."companyId" IS NULL)`,
      [id, scope.companyId]
    );
    if (!request) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    if (request.status !== "approved") { res.status(400).json({ error: "يمكن تحويل الطلبات المعتمدة فقط" }); return; }
    if (request.convertedTo) { res.status(400).json({ error: "هذا الطلب تم تحويله مسبقاً" }); return; }

    let createdId: number | null = null;
    let targetEndpoint = "";

    if (targetType === "maintenance") {
      const { insertId } = await rawExecute(
        `INSERT INTO support_tickets ("companyId", title, description, status, priority, "createdAt")
         VALUES ($1, $2, $3, 'open', $4, NOW())`,
        [scope.companyId, `صيانة: ${request.title}`, request.description || request.title, request.priority || "medium"]
      );
      createdId = insertId;
      targetEndpoint = `/support/${insertId}`;
    } else if (targetType === "purchase") {
      const { insertId } = await rawExecute(
        `INSERT INTO purchase_orders ("companyId", ref, description, status, "requestedBy", "createdAt")
         VALUES ($1, $2, $3, 'draft', $4, NOW())`,
        [scope.companyId, `PO-REQ-${id}`, request.title + (request.description ? `: ${request.description}` : ""), scope.userId]
      );
      createdId = insertId;
      targetEndpoint = `/finance/purchase-orders/${insertId}`;
    } else if (targetType === "case") {
      const { insertId } = await rawExecute(
        `INSERT INTO legal_cases ("companyId", title, description, status, priority, "caseType", "createdAt")
         VALUES ($1, $2, $3, 'open', $4, 'civil', NOW())`,
        [scope.companyId, `قضية: ${request.title}`, request.description || request.title, request.priority || "medium"]
      );
      createdId = insertId;
      targetEndpoint = `/legal/cases/${insertId}`;
    }

    await rawExecute(
      `UPDATE requests SET status='closed', "convertedTo"=$1, "convertedType"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [createdId, targetType, id, scope.companyId]
    ).catch(async () => {
      await rawExecute(
        `UPDATE requests SET status='closed', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
        [id, scope.companyId]
      );
    });

    await rawExecute(
      `INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('request',$1,'converted',$2,$3,$4)`,
      [id, `تحويل إلى: ${targetType} (معرف: ${createdId})`, scope.userId, scope.companyId]
    ).catch(() => {});

    await logCommunication(
      scope.companyId, 'outbound',
      `طلب محوّل: ${request.title}`,
      `تم تحويل الطلب رقم ${id} إلى ${targetType} (معرف: ${createdId})`,
      'request', id
    );

    res.json({
      success: true,
      message: `تم تحويل الطلب بنجاح إلى ${targetType}`,
      createdId,
      targetType,
      targetEndpoint,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
