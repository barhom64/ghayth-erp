import { rawQuery } from "./rawdb.js";

// ─── System Governor — حاكم النظام ──────────────────────────────────────
// Central control layer that can HALT operations based on business conditions.
// Each guard returns { allowed, reason }. Routes call `checkSystemGuards`
// before executing sensitive operations.

export interface GuardResult {
  allowed: boolean;
  guardName: string;
  reason?: string;
}

export type GuardFn = (companyId: number, context?: Record<string, any>) => Promise<GuardResult>;

// ─── Guard: Financial Period Open ─────────────────────────────────────────

const financialPeriodGuard: GuardFn = async (companyId, context) => {
  if (!context?.date) return { allowed: true, guardName: "financial_period" };
  const [period] = await rawQuery<{ status: string }>(
    `SELECT status FROM financial_periods
     WHERE "companyId" = $1 AND "startDate" <= $2::date AND "endDate" >= $2::date
     AND "deletedAt" IS NULL
     ORDER BY "startDate" DESC LIMIT 1`,
    [companyId, context.date]
  );
  if (period && period.status === "closed") {
    return { allowed: false, guardName: "financial_period", reason: `الفترة المالية مغلقة — لا يمكن ترحيل قيود في تاريخ ${context.date}` };
  }
  return { allowed: true, guardName: "financial_period" };
};

// ─── Guard: Company Active ────────────────────────────────────────────────

const companyActiveGuard: GuardFn = async (companyId) => {
  const [company] = await rawQuery<{ status: string }>(
    `SELECT status FROM companies WHERE id = $1`,
    [companyId]
  );
  if (!company || company.status === "suspended" || company.status === "inactive") {
    return { allowed: false, guardName: "company_active", reason: "الشركة موقوفة أو غير نشطة — لا يمكن تنفيذ العمليات" };
  }
  return { allowed: true, guardName: "company_active" };
};

// ─── Guard: Trial Limits ──────────────────────────────────────────────────

const trialLimitsGuard: GuardFn = async (companyId, context) => {
  const [company] = await rawQuery<{ status: string }>(
    `SELECT status FROM companies WHERE id = $1`,
    [companyId]
  );
  if (!company || company.status !== "trial") return { allowed: true, guardName: "trial_limits" };

  if (context?.entity === "employees") {
    const [count] = await rawQuery<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM employees
       WHERE id IN (SELECT "employeeId" FROM employee_assignments WHERE "companyId" = $1 AND status = 'active')`,
      [companyId]
    );
    if (count && count.cnt >= 25) {
      return { allowed: false, guardName: "trial_limits", reason: "الباقة التجريبية تسمح بـ 25 موظف كحد أقصى" };
    }
  }
  return { allowed: true, guardName: "trial_limits" };
};

// ─── Guard: Posting Failures Threshold ────────────────────────────────────

const postingFailuresGuard: GuardFn = async (companyId) => {
  const [result] = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM financial_posting_failures
     WHERE "companyId" = $1 AND resolved = false`,
    [companyId]
  );
  if (result && result.cnt >= 10) {
    return {
      allowed: false,
      guardName: "posting_failures_threshold",
      reason: `يوجد ${result.cnt} فشل قيد مالي غير محلول — يجب معالجتها قبل المتابعة`,
    };
  }
  return { allowed: true, guardName: "posting_failures_threshold" };
};

// ─── Guard: Unresolved Audit Violations ───────────────────────────────────

const auditViolationsGuard: GuardFn = async (companyId) => {
  const [result] = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM audit_violations
     WHERE "companyId" = $1 AND status = 'open' AND priority IN ('critical', 'high')`,
    [companyId]
  );
  if (result && result.cnt >= 5) {
    return {
      allowed: false,
      guardName: "audit_violations",
      reason: `يوجد ${result.cnt} مخالفة تدقيق عاجلة غير محلولة — يجب معالجتها`,
    };
  }
  return { allowed: true, guardName: "audit_violations" };
};

// ─── Guard Registry ───────────────────────────────────────────────────────

export type GuardScope = "financial" | "hr" | "operational" | "all";

const GUARD_REGISTRY: Array<{ guard: GuardFn; scope: GuardScope }> = [
  { guard: companyActiveGuard, scope: "all" },
  { guard: financialPeriodGuard, scope: "financial" },
  { guard: trialLimitsGuard, scope: "all" },
  { guard: postingFailuresGuard, scope: "financial" },
  { guard: auditViolationsGuard, scope: "financial" },
];

export async function checkSystemGuards(
  companyId: number,
  scope: GuardScope = "all",
  context?: Record<string, any>
): Promise<{ allowed: boolean; violations: GuardResult[] }> {
  const applicableGuards = GUARD_REGISTRY.filter(
    (g) => g.scope === scope || g.scope === "all" || scope === "all"
  );

  const results = await Promise.all(
    applicableGuards.map((g) =>
      g.guard(companyId, context).catch((): GuardResult => ({ allowed: true, guardName: "error" }))
    )
  );

  const violations = results.filter((r) => !r.allowed);
  return {
    allowed: violations.length === 0,
    violations,
  };
}

export function registerGuard(guard: GuardFn, scope: GuardScope): void {
  GUARD_REGISTRY.push({ guard, scope });
}

import type { Request, Response, NextFunction } from "express";

export function requireGuards(scope: GuardScope = "financial") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const companyId = (req as any).scope?.companyId;
    if (!companyId) return next();
    const result = await checkSystemGuards(companyId, scope, {
      date: new Date().toISOString().split("T")[0],
      entity: req.path.split("/")[1],
    });
    if (!result.allowed) {
      const reasons = result.violations.map(v => v.reason).join(" | ");
      return _res.status(403).json({
        error: reasons,
        code: "SYSTEM_GUARD_BLOCK",
        violations: result.violations,
      });
    }
    next();
  };
}
