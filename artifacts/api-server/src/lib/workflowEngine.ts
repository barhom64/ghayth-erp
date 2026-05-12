import { rawQuery, rawExecute } from "./rawdb.js";
import { createNotification, getAssignmentIdByRole, createAuditLog, emitEvent, toDateISO, currentPeriod } from "./businessHelpers.js";
import { NotFoundError, ValidationError, ForbiddenError } from "./errorHandler.js";
import { logger } from "./logger.js";
import { OPS_CLOSE_ROLES } from "./rbacCatalog.js";

async function handleLeaveApproval(refId: number, companyId: number, approvedBy?: number | null): Promise<void> {
  const approveResult = await rawQuery<Record<string, unknown>>(
    `UPDATE hr_leave_requests SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending' RETURNING id`,
    [approvedBy ?? null, refId, companyId]
  );
  if (approveResult.length === 0) return;

  const [request] = await rawQuery<Record<string, unknown>>(
    `SELECT lr."employeeId", lr."leaveTypeId", lr.days, lr."startDate", lr."endDate",
            lt.name AS "leaveTypeName"
     FROM hr_leave_requests lr
     JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
     WHERE lr.id = $1 AND lr."deletedAt" IS NULL`,
    [refId]
  );
  if (!request) return;

  const year = new Date(request.startDate).getFullYear();

  const allAssignments = await rawQuery<Record<string, unknown>>(
    `SELECT ea.id, ea."companyId", ea."branchId"
     FROM employee_assignments ea
     WHERE ea."employeeId" = $1 AND ea.status = 'active'`,
    [request.employeeId]
  );

  const allCompanyIds = [...new Set(allAssignments.map((a: any) => a.companyId))];
  for (const cId of allCompanyIds) {
    await rawExecute(
      `UPDATE hr_leave_balances
       SET used = used + $1, reserved = GREATEST(reserved - $1, 0)
       WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
      [request.days, cId, request.employeeId, request.leaveTypeId, year]
    );
  }

  const leaveStart = new Date(request.startDate);
  const leaveEnd = new Date(request.endDate);
  for (const asn of allAssignments) {
    for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = toDateISO(d);
      await rawExecute(
        `INSERT INTO attendance ("assignmentId","companyId","branchId",date,status,notes)
         VALUES ($1,$2,$3,$4,'on_leave',$5)
         ON CONFLICT DO NOTHING`,
        [asn.id, asn.companyId, asn.branchId, dateStr, `إجازة معتمدة - طلب رقم ${refId}`]
      ).catch((e) => logger.error(e, "workflow engine background task failed"));
    }
  }

  await rawExecute(
    `UPDATE leave_approval_stages SET status = 'approved', decision = 'approved', "decidedAt" = NOW()
     WHERE "leaveRequestId" = $1 AND status = 'pending'`,
    [refId]
  ).catch((e) => logger.error(e, "workflow engine background task failed"));
}

async function handleLeaveRejection(refId: number, companyId: number): Promise<void> {
  const rejectResult = await rawQuery<Record<string, unknown>>(
    `UPDATE hr_leave_requests SET status = 'rejected', "approvedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending' RETURNING id`,
    [refId, companyId]
  );
  if (rejectResult.length === 0) return;

  const [request] = await rawQuery<Record<string, unknown>>(
    `SELECT "employeeId", "companyId", "leaveTypeId", days, "startDate" FROM hr_leave_requests WHERE id = $1 AND "deletedAt" IS NULL`,
    [refId]
  );
  if (!request) return;

  const year = new Date(request.startDate).getFullYear();
  await rawExecute(
    `UPDATE hr_leave_balances
     SET reserved = GREATEST(reserved - $1, 0)
     WHERE "companyId" = $2 AND "employeeId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
    [request.days, request.companyId, request.employeeId, request.leaveTypeId, year]
  );

  await rawExecute(
    `UPDATE leave_approval_stages SET status = 'rejected', "decidedAt" = NOW()
     WHERE "leaveRequestId" = $1 AND status = 'pending'`,
    [refId]
  ).catch((e) => logger.error(e, "workflow engine background task failed"));
}

const DOMAIN_RECORD_HANDLERS: Record<
  string,
  (refId: number, outcome: "approved" | "rejected" | "returned", companyId: number, approvedBy?: number | null) => Promise<void>
> = {
  hr_leave_requests: async (refId, outcome, companyId, approvedBy) => {
    if (outcome === "approved") {
      await handleLeaveApproval(refId, companyId, approvedBy);
    } else if (outcome === "rejected") {
      await handleLeaveRejection(refId, companyId);
    } else {
      await rawExecute(`UPDATE hr_leave_requests SET status = 'returned' WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`, [refId, companyId]);
      await rawExecute(
        `UPDATE leave_approval_stages SET status = 'returned', "decidedAt" = NOW()
         WHERE "leaveRequestId" = $1 AND status = 'pending'`,
        [refId]
      ).catch((e) => logger.error(e, "workflow engine background task failed"));
    }
  },
  official_letters: async (refId, outcome, companyId) => {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "pending";
    await rawExecute(`UPDATE official_letters SET status = $1 WHERE id = $2 AND "companyId" = $3 AND status NOT IN ('approved','rejected')`, [status, refId, companyId]);
  },
  journal_entries: async (refId, outcome, companyId) => {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "pending_approval";
    await rawExecute(`UPDATE journal_entries SET status = $1 WHERE id = $2 AND "companyId" = $3 AND status NOT IN ('approved','rejected')`, [status, refId, companyId]);
  },
  purchase_requests: async (refId, outcome, companyId) => {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "draft";
    await rawExecute(`UPDATE purchase_requests SET status = $1 WHERE id = $2 AND "companyId" = $3 AND status NOT IN ('approved','rejected')`, [status, refId, companyId]);
  },
  expenses: async (refId, outcome, companyId) => {
    const status = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "pending";
    await rawExecute(`UPDATE expenses SET status = $1 WHERE id = $2 AND "companyId" = $3 AND status NOT IN ('approved','rejected')`, [status, refId, companyId]);
  },
  hr_employee_loans: async (refId, outcome, companyId, approvedBy) => {
    if (outcome === "approved") {
      await rawExecute(
        `UPDATE hr_employee_loans SET status = 'active', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending'`,
        [approvedBy ?? null, refId, companyId]
      );
    } else if (outcome === "rejected") {
      await rawExecute(`UPDATE hr_employee_loans SET status = 'rejected', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`, [refId, companyId]);
    }
  },
  hr_overtime_requests: async (refId, outcome, companyId, approvedBy) => {
    if (outcome === "approved") {
      await rawExecute(
        `UPDATE hr_overtime_requests SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending'`,
        [approvedBy ?? null, refId, companyId]
      );
    } else if (outcome === "rejected") {
      await rawExecute(`UPDATE hr_overtime_requests SET status = 'rejected', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`, [refId, companyId]);
    }
  },
  hr_exit_requests: async (refId, outcome, companyId, approvedBy) => {
    if (outcome === "approved") {
      await rawExecute(
        `UPDATE hr_exit_requests SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status = 'pending'`,
        [approvedBy ?? null, refId, companyId]
      );
    } else if (outcome === "rejected") {
      await rawExecute(`UPDATE hr_exit_requests SET status = 'rejected', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`, [refId, companyId]);
    }
  },
  employee_commission_calculations: async (refId, outcome, companyId, approvedBy) => {
    if (outcome === "approved") {
      await rawExecute(
        `UPDATE employee_commission_calculations SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND status IN ('pending','calculated')`,
        [approvedBy ?? null, refId, companyId]
      );
    } else if (outcome === "rejected") {
      await rawExecute(
        `UPDATE employee_commission_calculations SET status = 'rejected', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status IN ('pending','calculated')`,
        [refId, companyId]
      );
    } else {
      await rawExecute(
        `UPDATE employee_commission_calculations SET status = 'calculated', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status = 'pending'`,
        [refId, companyId]
      );
    }
  },
};

async function propagateDomainStatus(
  refTable: string | null | undefined,
  refId: number | null | undefined,
  outcome: "approved" | "rejected" | "returned",
  companyId: number,
  approvedByAssignmentId?: number | null,
) {
  if (!refTable || !refId) return;
  const handler = DOMAIN_RECORD_HANDLERS[refTable];
  if (!handler) return;

  // IMPORTANT: we no longer swallow handler errors. Callers MUST run this
  // before committing the workflow status change so a handler failure keeps
  // the workflow in 'pending' instead of orphaning the domain record.
  await handler(refId, outcome, companyId, approvedByAssignmentId);
}

export type WorkflowAction = "submit" | "approve" | "reject" | "refer" | "escalate" | "return";

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending"],
  pending: ["in_review", "approved", "rejected", "returned", "escalated"],
  in_review: ["approved", "rejected", "returned", "escalated", "pending"],
  returned: ["pending"],
  rejected: [],
  approved: [],
  escalated: ["approved", "rejected", "pending"],
};

const ACTION_TO_STATUS: Record<string, string> = {
  submit: "pending",
  approve: "approved",
  reject: "rejected",
  return: "returned",
  escalate: "escalated",
  refer: "__same__",
};

function isTransitionAllowed(from: string, to: string): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

interface WorkflowValidationIssue {
  code: string;
  message: string;
}

async function validatePreApproval(
  instance: any,
  companyId: number,
  currentAttachments?: any[],
): Promise<WorkflowValidationIssue[]> {
  const errors: WorkflowValidationIssue[] = [];

  const data = typeof instance.data === "string" ? JSON.parse(instance.data || "{}") : (instance.data || {});

  const requiredFields = data._requiredFields as string[] | undefined;
  if (requiredFields && requiredFields.length > 0) {
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === "") {
        errors.push({ code: "MISSING_FIELD", message: `الحقل المطلوب "${field}" غير مكتمل` });
      }
    }
  }

  if (data._requiresAttachments) {
    const hasCurrentAttachments = currentAttachments && currentAttachments.length > 0;
    if (!hasCurrentAttachments) {
      const existingAttachments = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as count FROM workflow_step_actions WHERE "instanceId" = $1 AND attachments IS NOT NULL AND attachments != '[]'`,
        [instance.id]
      );
      const count = Number(existingAttachments[0]?.count || 0);
      if (count === 0) {
        errors.push({ code: "MISSING_ATTACHMENTS", message: "المرفقات الإلزامية غير مرفقة" });
      }
    }
  }

  if (data._budgetAccountCode && data._budgetAmount) {
    const period = currentPeriod();
    const [budget] = await rawQuery<Record<string, unknown>>(
      `SELECT amount, used FROM budgets WHERE "companyId" = $1 AND "accountCode" = $2 AND period = $3 AND "deletedAt" IS NULL`,
      [companyId, data._budgetAccountCode, period]
    );
    if (!budget) {
      errors.push({ code: "NO_BUDGET", message: `لا توجد ميزانية معرّفة للحساب "${data._budgetAccountCode}" — لا يمكن الاعتماد` });
    } else {
      const budgetAmount = Number(budget.amount);
      if (budgetAmount <= 0) {
        errors.push({ code: "BUDGET_ZERO", message: "الميزانية المحددة صفر أو سالبة — لا يمكن الاعتماد" });
      } else {
        const newUsed = Number(budget.used) + Number(data._budgetAmount);
        const utilization = (newUsed / budgetAmount) * 100;
        if (utilization > 110) {
          errors.push({ code: "BUDGET_EXCEEDED", message: `تجاوز الميزانية (${Math.round(utilization)}%) — لا يمكن الاعتماد` });
        }
      }
    }
  }

  return errors;
}

interface ActualImpact {
  statusChange?: { from: string; to: string };
  journalEntries?: { id: number; ref: string }[];
  budgetChanges?: { accountCode: string; amountUsed: number; newUtilization: number }[];
  notifications?: string[];
  overrideLogged?: boolean;
}

interface SubmitParams {
  companyId: number;
  branchId?: number;
  requestType: string;
  refTable?: string;
  refId?: number;
  title: string;
  submittedBy: number;
  submittedByName?: string;
  data?: Record<string, unknown>;
}

interface ActionParams {
  instanceId: number;
  companyId: number;
  branchId?: number;
  actionBy: number;
  actionByName?: string;
  notes?: string;
  attachments?: any[];
  referredTo?: number;
  referredToName?: string;
  overrideReason?: string;
}

export async function submitWorkflow(params: SubmitParams) {
  const {
    companyId, branchId, requestType, refTable, refId,
    title, submittedBy, submittedByName, data,
  } = params;

  const [def] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM workflow_definitions WHERE "companyId" = $1 AND "requestType" = $2 AND "isActive" = true`,
    [companyId, requestType]
  );

  const definitionId = def?.id ?? null;
  const label = def?.requestTypeLabel ?? requestType;

  const steps = def ? await rawQuery<Record<string, unknown>>(
    `SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder" ASC`,
    [def.id]
  ) : [];

  const firstStep = steps[0] ?? null;

  const [sla] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM sla_definitions WHERE "companyId" = $1 AND "requestType" = $2 AND "isActive" = true`,
    [companyId, requestType]
  );

  const slaHours = firstStep?.slaHours ?? sla?.deadlineHours ?? def?.defaultSlaHours ?? 48;
  const expectedCompletion = new Date(Date.now() + slaHours * 3600000);

  let currentAssignee: number | null = null;
  if (firstStep) {
    // First: try to resolve the submitter's direct manager via managerId on the assignment
    if (submittedBy) {
      try {
        const [directMgrRow] = await rawQuery<Record<string, unknown>>(
          `SELECT ea2.id AS "assignmentId"
           FROM employee_assignments ea
           JOIN employee_assignments ea2
             ON ea2."employeeId" = ea."managerId"
             AND ea2.status = 'active'
             AND ea2."companyId" = $2
           WHERE ea.id = $1 AND ea."managerId" IS NOT NULL
           LIMIT 1`,
          [submittedBy, companyId]
        );
        if (directMgrRow?.assignmentId) {
          currentAssignee = directMgrRow.assignmentId;
        }
      } catch (e) { logger.warn(e, "workflow: failed to resolve direct manager assignee"); }
    }
    // Fallback: resolve by required role at branch/company level
    if (!currentAssignee) {
      try {
        currentAssignee = await getAssignmentIdByRole(companyId, branchId ?? 0, firstStep.requiredRole);
      } catch (e) { logger.warn(e, "workflow: no assignee found for required role"); }
    }
    // Final fallback: any active HR/GM/owner in the company. Never leave a
    // submitted workflow with NULL currentAssignee — that makes it invisible
    // to every inbox and no escalation job will route it.
    if (!currentAssignee) {
      try {
        const [fallback] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM employee_assignments
           WHERE "companyId" = $1 AND status = 'active'
             AND role IN ('hr_manager','general_manager','owner')
           ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 WHEN 'owner' THEN 3 ELSE 4 END
           LIMIT 1`,
          [companyId]
        );
        if (fallback?.id) currentAssignee = fallback.id;
      } catch (e) { logger.warn(e, "workflow: failed to resolve fallback assignee"); }
    }
  }
  if (firstStep && !currentAssignee) {
    throw new ValidationError(
      "لا يوجد مسؤول معتمد لاستلام الطلب — الرجاء تعيين مدير فرع أو مدير موارد بشرية قبل تقديم الطلبات"
    );
  }

  const { insertId } = await rawExecute(
    `INSERT INTO workflow_instances
     ("companyId", "branchId", "definitionId", "requestType", "requestTypeLabel",
      "refTable", "refId", title, "submittedBy", "submittedByName",
      status, "currentStepOrder", "currentAssignee", "expectedCompletionAt",
      "slaStatus", data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,'normal',$14)`,
    [
      companyId, branchId ?? null, definitionId, requestType, label,
      refTable ?? null, refId ?? null, title, submittedBy, submittedByName ?? null,
      firstStep?.stepOrder ?? 1, currentAssignee,
      expectedCompletion.toISOString(),
      data ? JSON.stringify(data) : "{}",
    ]
  );

  await rawExecute(
    `INSERT INTO workflow_step_actions
     ("instanceId", "stepOrder", "stepName", action, "actionBy", "actionByName", "assignedRole", notes)
     VALUES ($1,$2,$3,'submit',$4,$5,$6,$7)`,
    [
      insertId, 0, "تقديم الطلب", submittedBy, submittedByName ?? null,
      null, title,
    ]
  );

  if (currentAssignee) {
    createNotification({
      companyId, assignmentId: currentAssignee,
      type: "workflow_pending",
      title: `طلب جديد ينتظر موافقتك`,
      body: `${label}: ${title}`,
      priority: "high",
      refType: refTable ?? requestType,
      refId: refId ?? insertId,
    }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
  }

  return { instanceId: insertId, definitionId, currentStep: firstStep?.stepOrder ?? 1, currentAssignee };
}

export async function approveWorkflow(params: ActionParams) {
  return processAction({ ...params, action: "approve" });
}

export async function rejectWorkflow(params: ActionParams) {
  return processAction({ ...params, action: "reject" });
}

export async function referWorkflow(params: ActionParams) {
  if (!params.referredTo) throw new ValidationError("يجب تحديد الشخص المحال إليه");
  const [targetAssignment] = await rawQuery<Record<string, unknown>>(
    `SELECT id FROM employee_assignments WHERE id = $1 AND "companyId" = $2 AND status = 'active'`,
    [params.referredTo, params.companyId]
  );
  if (!targetAssignment) throw new NotFoundError("الشخص المحال إليه غير موجود أو غير نشط في نفس الشركة");
  return processAction({ ...params, action: "refer" });
}

export async function escalateWorkflow(params: ActionParams) {
  return processAction({ ...params, action: "escalate" });
}

export async function returnWorkflow(params: ActionParams) {
  return processAction({ ...params, action: "return" });
}

async function processAction(params: ActionParams & { action: WorkflowAction }) {
  const {
    instanceId, companyId, branchId, actionBy, actionByName,
    notes, attachments, referredTo, referredToName, action,
    overrideReason,
  } = params;

  const [instance] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM workflow_instances WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
    [instanceId, companyId]
  );
  if (!instance) throw new NotFoundError("المعاملة غير موجودة");

  const targetStatus = ACTION_TO_STATUS[action];
  if (targetStatus && targetStatus !== "__same__") {
    if (!isTransitionAllowed(instance.status, targetStatus)) {
      const nextStepExists = action === "approve" &&
        instance.definitionId &&
        (instance.status === "pending" || instance.status === "in_review");
      if (!nextStepExists || (instance.status !== "pending" && instance.status !== "in_review")) {
        throw new ValidationError(`لا يمكن الانتقال من "${instance.status}" إلى "${targetStatus}" — انتقال غير مصرح`);
      }
    }
  }

  if (instance.status !== "pending" && instance.status !== "in_review" && instance.status !== "escalated") {
    throw new ValidationError("المعاملة ليست في حالة تسمح بهذا الإجراء");
  }

  const privilegedRoles = OPS_CLOSE_ROLES;
  let isOverride = false;

  const [actorAssignment] = await rawQuery<Record<string, unknown>>(
    `SELECT role FROM employee_assignments WHERE id = $1 AND status = 'active'`,
    [actionBy]
  );

  if (!instance.currentAssignee) {
    if (!actorAssignment || !privilegedRoles.includes(actorAssignment.role)) {
      throw new ForbiddenError("المعاملة غير مسندة لأحد — يلزم دور إداري للتدخل");
    }
    isOverride = true;
    if (!overrideReason && !notes) {
      throw new ValidationError("يجب تحديد سبب التدخل في معاملة غير مسندة");
    }
  } else if (instance.currentAssignee !== actionBy) {
    if (!actorAssignment || !privilegedRoles.includes(actorAssignment.role)) {
      throw new ForbiddenError("غير مصرح لك باتخاذ هذا الإجراء على هذه المعاملة");
    }
    isOverride = true;
    if (!overrideReason && !notes) {
      throw new ValidationError("يجب تحديد سبب التجاوز عند التدخل في معاملة ليست مسندة إليك");
    }
  }

  if (action === "approve") {
    const validationErrors = await validatePreApproval(instance, companyId, attachments);
    if (validationErrors.length > 0) {
      throw new ValidationError(
        `لا يمكن الاعتماد — شروط غير مستوفاة:\n${validationErrors.map(e => `• ${e.message}`).join("\n")}`
      );
    }
  }

  if (isOverride) {
    await createAuditLog({
      companyId,
      branchId: branchId ?? instance.branchId ?? undefined,
      userId: actionBy,
      action: "workflow_override",
      entity: "workflow_instance",
      entityId: instanceId,
      before: { currentAssignee: instance.currentAssignee, status: instance.status },
      after: { overriddenBy: actionBy, action },
      reason: overrideReason || notes || "تدخل دور أعلى",
    });
  }

  const steps = instance.definitionId
    ? await rawQuery<Record<string, unknown>>(
        `SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder" ASC`,
        [instance.definitionId]
      )
    : [];

  const currentStep = steps.find((s: any) => s.stepOrder === instance.currentStepOrder);

  const beforeData = { status: instance.status, currentStepOrder: instance.currentStepOrder };

  await rawExecute(
    `INSERT INTO workflow_step_actions
     ("instanceId", "stepOrder", "stepName", action, "actionBy", "actionByName",
      "assignedRole", notes, attachments, "beforeData", "afterData",
      "referredTo", "referredToName")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      instanceId, instance.currentStepOrder, currentStep?.stepName ?? `خطوة ${instance.currentStepOrder}`,
      isOverride ? `${action}_override` : action, actionBy, actionByName ?? null,
      currentStep?.requiredRole ?? null,
      isOverride ? `[تدخل] ${overrideReason || notes || ""}` : (notes ?? null),
      attachments ? JSON.stringify(attachments) : "[]",
      JSON.stringify(beforeData), null,
      referredTo ?? null, referredToName ?? null,
    ]
  );

  let newStatus = instance.status;
  let newStepOrder = instance.currentStepOrder;
  let newAssignee: number | null = instance.currentAssignee;
  let message = "";
  const actualImpact: ActualImpact = { notifications: [] };

  switch (action) {
    case "approve": {
      const nextStep = steps.find((s: any) => s.stepOrder > instance.currentStepOrder);
      if (nextStep) {
        newStepOrder = nextStep.stepOrder;
        newStatus = "pending";
        try {
          newAssignee = await getAssignmentIdByRole(companyId, branchId ?? instance.branchId ?? 0, nextStep.requiredRole);
        } catch (e) { logger.warn(e, "workflow: failed to resolve next step assignee"); newAssignee = null; }
        // Never advance to a step with NULL assignee — fall back to any active
        // HR/GM/owner so the request stays actionable somewhere.
        if (!newAssignee) {
          try {
            const [fallback] = await rawQuery<Record<string, unknown>>(
              `SELECT id FROM employee_assignments
               WHERE "companyId" = $1 AND status = 'active'
                 AND role IN ('hr_manager','general_manager','owner')
               ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 WHEN 'owner' THEN 3 ELSE 4 END
               LIMIT 1`,
              [companyId]
            );
            if (fallback?.id) newAssignee = fallback.id;
          } catch (e) { logger.warn(e, "workflow: failed to resolve fallback assignee for next step"); }
        }

        const [sla] = await rawQuery<Record<string, unknown>>(
          `SELECT * FROM sla_definitions WHERE "companyId" = $1 AND "requestType" = $2 AND "isActive" = true`,
          [companyId, instance.requestType]
        );
        const slaHours = nextStep.slaHours ?? sla?.deadlineHours ?? 48;
        const expectedCompletion = new Date(Date.now() + slaHours * 3600000);

        await rawExecute(
          `UPDATE workflow_instances SET "currentStepOrder" = $1, "currentAssignee" = $2,
           "expectedCompletionAt" = $3, "slaStatus" = 'normal', "updatedAt" = NOW() WHERE id = $4`,
          [newStepOrder, newAssignee, expectedCompletion.toISOString(), instanceId]
        );

        if (newAssignee) {
          createNotification({
            companyId, assignmentId: newAssignee,
            type: "workflow_pending",
            title: `طلب ينتظر موافقتك (${nextStep.stepName})`,
            body: `${instance.requestTypeLabel}: ${instance.title}`,
            priority: "high",
            refType: instance.refTable ?? instance.requestType,
            refId: instance.refId ?? instanceId,
          }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
          actualImpact.notifications!.push(`إشعار للمعتمد التالي (${nextStep.stepName})`);
        }
        message = `تمت الموافقة - انتقل للخطوة التالية: ${nextStep.stepName}`;
      } else {
        newStatus = "approved";
        // CRITICAL: propagate to the linked domain BEFORE flipping workflow
        // status to 'approved'. If the domain handler throws (GL imbalance,
        // constraint violation, etc.) the workflow stays pending and the
        // actor can retry — instead of being stuck with a green workflow on
        // top of a stale domain row.
        try {
          await propagateDomainStatus(instance.refTable, instance.refId, "approved", companyId, actionBy);
        } catch (err) {
          logger.error(
            err as Error,
            `[WorkflowEngine] Domain propagation failed for ${instance.refTable}/${instance.refId} on approve`
          );
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`تعذّر تحديث السجل الأساسي بعد الموافقة: ${msg}`);
        }
        await rawExecute(
          `UPDATE workflow_instances SET status = 'approved', "completedAt" = NOW(),
           "slaStatus" = 'normal', "updatedAt" = NOW() WHERE id = $1 AND status IN ('pending','in_review','escalated')`,
          [instanceId]
        );
        if (instance.submittedBy) {
          createNotification({
            companyId, assignmentId: instance.submittedBy,
            type: "workflow_approved",
            title: "تمت الموافقة على طلبك",
            body: `${instance.requestTypeLabel}: ${instance.title}`,
            priority: "normal",
            refType: instance.refTable ?? instance.requestType,
            refId: instance.refId ?? instanceId,
          }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
          actualImpact.notifications!.push("إشعار لمقدم الطلب بالموافقة النهائية");
        }
        message = "تمت الموافقة النهائية";
      }
      actualImpact.statusChange = { from: instance.status, to: newStatus };
      break;
    }

    case "reject": {
      newStatus = "rejected";
      // Propagate rejection to the linked domain first so a handler failure
      // keeps the workflow pending and the rejection can be retried.
      try {
        await propagateDomainStatus(instance.refTable, instance.refId, "rejected", companyId);
      } catch (err) {
        logger.error(
          err as Error,
          `[WorkflowEngine] Domain propagation failed for ${instance.refTable}/${instance.refId} on reject`
        );
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`تعذّر تحديث السجل الأساسي بعد الرفض: ${msg}`);
      }
      await rawExecute(
        `UPDATE workflow_instances SET status = 'rejected', "completedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1 AND status IN ('pending','in_review','escalated')`,
        [instanceId]
      );
      if (instance.submittedBy) {
        createNotification({
          companyId, assignmentId: instance.submittedBy,
          type: "workflow_rejected",
          title: "تم رفض طلبك",
          body: `${instance.requestTypeLabel}: ${instance.title}${notes ? ` - السبب: ${notes}` : ""}`,
          priority: "high",
          refType: instance.refTable ?? instance.requestType,
          refId: instance.refId ?? instanceId,
        }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
        actualImpact.notifications!.push("إشعار لمقدم الطلب بالرفض");
      }
      actualImpact.statusChange = { from: instance.status, to: "rejected" };
      message = "تم رفض الطلب";
      break;
    }

    case "return": {
      newStatus = "returned";
      try {
        await propagateDomainStatus(instance.refTable, instance.refId, "returned", companyId);
      } catch (err) {
        logger.error(
          err as Error,
          `[WorkflowEngine] Domain propagation failed for ${instance.refTable}/${instance.refId} on return`
        );
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`تعذّر تحديث السجل الأساسي بعد الإرجاع: ${msg}`);
      }
      await rawExecute(
        `UPDATE workflow_instances SET status = 'returned', "updatedAt" = NOW() WHERE id = $1 AND status IN ('pending','in_review','escalated')`,
        [instanceId]
      );
      if (instance.submittedBy) {
        createNotification({
          companyId, assignmentId: instance.submittedBy,
          type: "workflow_returned",
          title: "تم إرجاع طلبك للتعديل",
          body: `${instance.requestTypeLabel}: ${instance.title}${notes ? ` - السبب: ${notes}` : ""}`,
          priority: "normal",
          refType: instance.refTable ?? instance.requestType,
          refId: instance.refId ?? instanceId,
        }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
        actualImpact.notifications!.push("إشعار لمقدم الطلب بالإرجاع");
      }
      actualImpact.statusChange = { from: instance.status, to: "returned" };
      message = "تم إرجاع الطلب للمقدم";
      break;
    }

    case "refer": {
      newAssignee = referredTo!;
      await rawExecute(
        `UPDATE workflow_instances SET "currentAssignee" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [referredTo, instanceId]
      );
      createNotification({
        companyId, assignmentId: referredTo!,
        type: "workflow_referred",
        title: "تمت إحالة طلب إليك",
        body: `${instance.requestTypeLabel}: ${instance.title}`,
        priority: "high",
        refType: instance.refTable ?? instance.requestType,
        refId: instance.refId ?? instanceId,
      }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
      actualImpact.notifications!.push(`إشعار إحالة إلى ${referredToName || "المعني"}`);
      message = `تمت الإحالة إلى ${referredToName || "المعني"}`;
      break;
    }

    case "escalate": {
      const [sla] = await rawQuery<Record<string, unknown>>(
        `SELECT "escalateTo" FROM sla_definitions WHERE "companyId" = $1 AND "requestType" = $2 AND "isActive" = true`,
        [companyId, instance.requestType]
      );
      const escalateRole = sla?.escalateTo ?? "hr_manager";
      let escalateAssignee: number | null = null;
      try {
        escalateAssignee = await getAssignmentIdByRole(companyId, branchId ?? instance.branchId ?? 0, escalateRole);
      } catch (e) { logger.warn(e, "workflow: failed to resolve escalation assignee"); }

      await rawExecute(
        `UPDATE workflow_instances SET "currentAssignee" = $1, "slaStatus" = 'escalated', "updatedAt" = NOW() WHERE id = $2`,
        [escalateAssignee, instanceId]
      );

      if (escalateAssignee) {
        createNotification({
          companyId, assignmentId: escalateAssignee,
          type: "workflow_escalated",
          title: "تصعيد طلب متأخر",
          body: `${instance.requestTypeLabel}: ${instance.title} - تجاوز المهلة المحددة`,
          priority: "urgent",
          refType: instance.refTable ?? instance.requestType,
          refId: instance.refId ?? instanceId,
        }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
        actualImpact.notifications!.push(`تصعيد إلى ${escalateRole}`);
      }
      actualImpact.statusChange = { from: instance.status, to: "escalated" };
      message = `تم التصعيد إلى ${escalateRole}`;
      break;
    }
  }

  if (isOverride) {
    actualImpact.overrideLogged = true;
  }

  const afterData = { status: newStatus, currentStepOrder: newStepOrder };
  await rawExecute(
    `UPDATE workflow_step_actions SET "afterData" = $1
     WHERE id = (SELECT id FROM workflow_step_actions WHERE "instanceId" = $2 ORDER BY id DESC LIMIT 1)`,
    [JSON.stringify(afterData), instanceId]
  );

  // Compliance trail: every decision (not just overrides) must land in
  // audit_logs and event_logs so reporting + listeners can see it.
  createAuditLog({
    companyId,
    branchId: branchId ?? instance.branchId ?? undefined,
    userId: actionBy,
    action: `workflow_${action}`,
    entity: "workflow_instance",
    entityId: instanceId,
    before: beforeData,
    after: { ...afterData, refTable: instance.refTable, refId: instance.refId },
    reason: notes ?? undefined,
  }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));

  emitEvent({
    companyId,
    userId: actionBy,
    action: `workflow.${action}`,
    entity: "workflow_instance",
    entityId: instanceId,
    details: `${instance.requestTypeLabel || instance.requestType}: ${action} → ${newStatus}`,
    before: beforeData,
    after: afterData,
  }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));

  return { status: newStatus, stepOrder: newStepOrder, assignee: newAssignee, message, actualImpact, isOverride };
}

export async function getTimeline(instanceId: number, companyId: number) {
  const [instance] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM workflow_instances WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [instanceId, companyId]
  );
  if (!instance) throw new NotFoundError("المعاملة غير موجودة");

  const actions = await rawQuery<Record<string, unknown>>(
    `SELECT wsa.*, u.email AS "actionByEmail"
     FROM workflow_step_actions wsa
     LEFT JOIN employee_assignments ea2 ON ea2.id = wsa."actionBy"
     LEFT JOIN employees emp ON emp.id = ea2."employeeId"
     LEFT JOIN users u ON u."employeeId" = emp.id
     WHERE wsa."instanceId" = $1
     ORDER BY wsa."createdAt" ASC`,
    [instanceId]
  );

  const steps = instance.definitionId
    ? await rawQuery<Record<string, unknown>>(
        `SELECT * FROM workflow_steps WHERE "definitionId" = $1 ORDER BY "stepOrder" ASC`,
        [instance.definitionId]
      )
    : [];

  return {
    instance,
    actions,
    steps,
  };
}

export async function getTimelineByRef(refTable: string, refId: number, companyId: number) {
  const [instance] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM workflow_instances WHERE "refTable" = $1 AND "refId" = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
    [refTable, refId, companyId]
  );
  if (!instance) return { instance: null, actions: [], steps: [] };
  return getTimeline(instance.id, companyId);
}

export async function checkSlaStatus(companyId: number) {
  const now = new Date();
  let warnings = 0, escalations = 0, autoApprovals = 0;

  const pendingInstances = await rawQuery<Record<string, unknown>>(
    `SELECT wi.*, sd."warningHours", sd."deadlineHours", sd."escalationHours",
            sd."autoApproveOnTimeout", sd."escalateTo"
     FROM workflow_instances wi
     LEFT JOIN sla_definitions sd ON sd."companyId" = wi."companyId" AND sd."requestType" = wi."requestType" AND sd."isActive" = true
     WHERE wi."companyId" = $1 AND wi.status IN ('pending', 'in_review') AND wi."deletedAt" IS NULL
     ORDER BY wi."createdAt" ASC`,
    [companyId]
  );

  for (const inst of pendingInstances) {
    const stepBaseTime = inst.expectedCompletionAt
      ? new Date(inst.expectedCompletionAt)
      : new Date(inst.createdAt);
    const stepSlaHours = inst.deadlineHours ?? 48;
    const stepStartTime = inst.expectedCompletionAt
      ? new Date(stepBaseTime.getTime() - stepSlaHours * 3600000)
      : new Date(inst.createdAt);
    const hoursSince = (now.getTime() - stepStartTime.getTime()) / 3600000;
    const warningH = inst.warningHours ?? 24;
    const deadlineH = inst.deadlineHours ?? 48;
    const escalationH = inst.escalationHours ?? 72;

    if (hoursSince >= escalationH && inst.slaStatus !== "escalated") {
      if (inst.autoApproveOnTimeout) {
        await rawExecute(
          `UPDATE workflow_instances SET status = 'approved', "completedAt" = NOW(),
           "slaStatus" = 'auto_approved', "updatedAt" = NOW() WHERE id = $1 AND status IN ('pending','in_review','escalated')`,
          [inst.id]
        );
        await rawExecute(
          `INSERT INTO workflow_step_actions ("instanceId", "stepOrder", "stepName", action, "actionBy", notes)
           VALUES ($1, $2, 'موافقة تلقائية', 'approve', 0, 'تمت الموافقة تلقائياً بسبب تجاوز المهلة')`,
          [inst.id, inst.currentStepOrder]
        );
        if (inst.submittedBy) {
          createNotification({
            companyId, assignmentId: inst.submittedBy,
            type: "workflow_auto_approved",
            title: "موافقة تلقائية على طلبك",
            body: `${inst.requestTypeLabel}: ${inst.title} - تمت الموافقة تلقائياً بعد تجاوز المهلة`,
            priority: "normal",
            refType: inst.refTable ?? inst.requestType,
            refId: inst.refId ?? inst.id,
          }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
        }
        autoApprovals++;
      } else {
        const escalateRole = inst.escalateTo ?? "hr_manager";
        let escalateAssignee: number | null = null;
        try {
          escalateAssignee = await getAssignmentIdByRole(companyId, inst.branchId ?? 0, escalateRole);
        } catch (e) { logger.warn(e, "workflow SLA: failed to resolve escalation assignee"); }

        await rawExecute(
          `UPDATE workflow_instances SET "currentAssignee" = $1, "slaStatus" = 'escalated', "updatedAt" = NOW() WHERE id = $2 AND "slaStatus" != 'escalated'`,
          [escalateAssignee, inst.id]
        );
        await rawExecute(
          `INSERT INTO workflow_step_actions ("instanceId", "stepOrder", "stepName", action, "actionBy", notes)
           VALUES ($1, $2, 'تصعيد تلقائي', 'escalate', 0, 'تصعيد تلقائي بسبب تجاوز المهلة')`,
          [inst.id, inst.currentStepOrder]
        );
        if (escalateAssignee) {
          createNotification({
            companyId, assignmentId: escalateAssignee,
            type: "workflow_escalated",
            title: "تصعيد طلب متأخر",
            body: `${inst.requestTypeLabel}: ${inst.title} - تجاوز المهلة`,
            priority: "urgent",
            refType: inst.refTable ?? inst.requestType,
            refId: inst.refId ?? inst.id,
          }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
        }
        escalations++;
      }
    } else if (hoursSince >= deadlineH && inst.slaStatus !== "exceeded" && inst.slaStatus !== "escalated") {
      await rawExecute(
        `UPDATE workflow_instances SET "slaStatus" = 'exceeded', "updatedAt" = NOW() WHERE id = $1 AND "slaStatus" NOT IN ('exceeded','escalated')`,
        [inst.id]
      );
      if (inst.currentAssignee) {
        createNotification({
          companyId, assignmentId: inst.currentAssignee,
          type: "workflow_sla_exceeded",
          title: "تجاوز المهلة المحددة",
          body: `${inst.requestTypeLabel}: ${inst.title} - تجاوز المهلة، سيتم التصعيد قريباً`,
          priority: "urgent",
          refType: inst.refTable ?? inst.requestType,
          refId: inst.refId ?? inst.id,
        }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
      }
      warnings++;
    } else if (hoursSince >= warningH && inst.slaStatus === "normal") {
      await rawExecute(
        `UPDATE workflow_instances SET "slaStatus" = 'warning', "updatedAt" = NOW() WHERE id = $1 AND "slaStatus" = 'normal'`,
        [inst.id]
      );
      if (inst.currentAssignee) {
        createNotification({
          companyId, assignmentId: inst.currentAssignee,
          type: "workflow_sla_warning",
          title: "تنبيه - اقتراب المهلة",
          body: `${inst.requestTypeLabel}: ${inst.title} - المهلة تقترب`,
          priority: "high",
          refType: inst.refTable ?? inst.requestType,
          refId: inst.refId ?? inst.id,
        }).catch((e) => logger.error(e, "[workflowEngine] background task failed"));
      }
      warnings++;
    }
  }

  return { warnings, escalations, autoApprovals };
}

