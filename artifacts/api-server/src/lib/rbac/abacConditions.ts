/**
 * abacConditions — Attribute-Based Access Control rule evaluator.
 *
 * Each grant in `rbac_role_grants.conditions` may carry a JSON object
 * that further narrows when the grant applies. This module evaluates
 * those conditions against the runtime context (the request scope, the
 * resource record, the current time, etc.) and returns true/false.
 *
 * Supported conditions:
 *
 *   {
 *     statusIn:        ["draft", "pending"],     // record.status must match
 *     statusNotIn:     ["closed", "cancelled"],
 *     amountMax:       10000,                    // record.amount ≤ 10000
 *     amountMin:       100,                      // record.amount ≥ 100
 *     ownRecord:       true,                     // record.createdBy === scope.userId
 *     ownDepartment:   true,                     // record.departmentId === scope.departmentId
 *     ownBranch:       true,                     // record.branchId === scope.branchId
 *     businessHours:   { from: 8, to: 18 },      // current hour in [from, to)
 *     daysOfWeek:      [0,1,2,3,4],              // Sunday..Thursday (Saudi work week)
 *     ipPrefixIn:      ["10.0.0.","192.168."],   // request.ip startsWith one of
 *     emergencyDisabled: true                    // hard block during sealed periods
 *   }
 *
 * If the conditions object is null/empty, the grant matches as before.
 * If any single condition fails, the entire grant is rejected — they
 * are AND-combined.
 */

export interface AbacConditions {
  statusIn?: string[];
  statusNotIn?: string[];
  amountMax?: number;
  amountMin?: number;
  ownRecord?: boolean;
  ownDepartment?: boolean;
  ownBranch?: boolean;
  businessHours?: { from: number; to: number };
  daysOfWeek?: number[];
  ipPrefixIn?: string[];
  emergencyDisabled?: boolean;
}

export interface AbacEvalContext {
  scope: { userId: number; companyId: number; branchId: number; employeeId: number | null };
  record?: {
    status?: string | null;
    amount?: number | string | null;
    createdBy?: number | null;
    branchId?: number | null;
    departmentId?: number | null;
    [k: string]: any;
  } | null;
  userDepartmentId?: number | null;
  ipAddress?: string | null;
  now?: Date;
  emergency?: boolean;
}

export interface AbacEvalResult {
  passed: boolean;
  failedReason?: string;
  failedReasonAr?: string;
}

const DAY_LABELS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function evaluateConditions(conditions: AbacConditions | null | undefined, ctx: AbacEvalContext): AbacEvalResult {
  if (!conditions || typeof conditions !== "object" || Object.keys(conditions).length === 0) {
    return { passed: true };
  }

  const now = ctx.now ?? new Date();

  if (conditions.emergencyDisabled && ctx.emergency) {
    return { passed: false, failedReason: "EMERGENCY_LOCK", failedReasonAr: "النظام في حالة طوارئ — هذه العملية مُجمَّدة" };
  }

  if (conditions.businessHours) {
    const h = now.getHours();
    const { from, to } = conditions.businessHours;
    if (h < from || h >= to) {
      return {
        passed: false,
        failedReason: "OUTSIDE_BUSINESS_HOURS",
        failedReasonAr: `هذه العملية مسموحة فقط من ${from}:00 حتى ${to}:00`,
      };
    }
  }

  if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
    const dow = now.getDay();
    if (!conditions.daysOfWeek.includes(dow)) {
      const allowed = conditions.daysOfWeek.map((d) => DAY_LABELS_AR[d]).join("، ");
      return {
        passed: false,
        failedReason: "WRONG_DAY_OF_WEEK",
        failedReasonAr: `هذه العملية مسموحة فقط أيام: ${allowed}`,
      };
    }
  }

  if (conditions.ipPrefixIn && conditions.ipPrefixIn.length > 0 && ctx.ipAddress) {
    const ok = conditions.ipPrefixIn.some((p) => ctx.ipAddress!.startsWith(p));
    if (!ok) {
      return {
        passed: false,
        failedReason: "IP_NOT_ALLOWED",
        failedReasonAr: "هذه العملية مسموحة فقط من شبكات محددة",
      };
    }
  }

  if (ctx.record) {
    if (conditions.statusIn && conditions.statusIn.length > 0) {
      const s = ctx.record.status;
      if (!s || !conditions.statusIn.includes(String(s))) {
        return {
          passed: false,
          failedReason: "STATUS_NOT_ALLOWED",
          failedReasonAr: `حالة السجل (${s ?? "غير محددة"}) خارج الحالات المسموحة (${conditions.statusIn.join("، ")})`,
        };
      }
    }
    if (conditions.statusNotIn && conditions.statusNotIn.length > 0) {
      const s = ctx.record.status;
      if (s && conditions.statusNotIn.includes(String(s))) {
        return {
          passed: false,
          failedReason: "STATUS_BLOCKED",
          failedReasonAr: `لا يمكن إجراء هذه العملية على سجل بحالة "${s}"`,
        };
      }
    }
    if (conditions.amountMax != null) {
      const amt = Number(ctx.record.amount ?? 0);
      if (amt > conditions.amountMax) {
        return {
          passed: false,
          failedReason: "AMOUNT_EXCEEDS_CONDITION",
          failedReasonAr: `المبلغ (${amt}) يتجاوز الحد المسموح في هذه الصلاحية (${conditions.amountMax})`,
        };
      }
    }
    if (conditions.amountMin != null) {
      const amt = Number(ctx.record.amount ?? 0);
      if (amt < conditions.amountMin) {
        return {
          passed: false,
          failedReason: "AMOUNT_BELOW_CONDITION",
          failedReasonAr: `المبلغ (${amt}) أقل من الحد الأدنى في هذه الصلاحية (${conditions.amountMin})`,
        };
      }
    }
    if (conditions.ownRecord && ctx.record.createdBy !== ctx.scope.userId) {
      return {
        passed: false,
        failedReason: "NOT_OWN_RECORD",
        failedReasonAr: "هذه الصلاحية محصورة بسجلاتك أنت فقط",
      };
    }
    if (conditions.ownBranch && ctx.record.branchId != null && ctx.record.branchId !== ctx.scope.branchId) {
      return {
        passed: false,
        failedReason: "NOT_OWN_BRANCH",
        failedReasonAr: "هذه الصلاحية محصورة بفرعك فقط",
      };
    }
    if (conditions.ownDepartment && ctx.record.departmentId != null && ctx.record.departmentId !== ctx.userDepartmentId) {
      return {
        passed: false,
        failedReason: "NOT_OWN_DEPARTMENT",
        failedReasonAr: "هذه الصلاحية محصورة بقسمك فقط",
      };
    }
  }

  return { passed: true };
}
