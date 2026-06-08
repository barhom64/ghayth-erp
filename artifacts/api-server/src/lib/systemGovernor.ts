import { rawQuery } from "./rawdb.js";
import { todayISO } from "./businessHelpers.js";

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
  // A `locked` period is stricter than `closed` — both bar GL posting.
  if (period && (period.status === "closed" || period.status === "locked")) {
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
       WHERE id IN (SELECT "employeeId" FROM employee_assignments WHERE "companyId" = $1 AND status = 'active')
         AND "deletedAt" IS NULL`,
      [companyId]
    );
    if (count && count.cnt >= 25) {
      return { allowed: false, guardName: "trial_limits", reason: "الباقة التجريبية تسمح بـ 25 موظف كحد أقصى" };
    }
  }
  return { allowed: true, guardName: "trial_limits" };
};

// ─── Guard: Posting Failures Threshold ────────────────────────────────────

const postingFailuresGuard: GuardFn = async (companyId, context) => {
  // Escape hatch: the posting-failure resolution endpoints (retry / resolve /
  // bulk-resolve / retry-all) are the ONLY way to drain the backlog once this
  // breaker trips. Blocking them with this same guard makes the lockout
  // unrecoverable, so they bypass this one guard (all other guards still apply).
  if (context?.bypassPostingFailures) {
    return { allowed: true, guardName: "posting_failures_threshold" };
  }
  const [result] = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM financial_posting_failures
     WHERE "companyId" = $1 AND resolved = false`,
    [companyId]
  );
  if (result && result.cnt >= 25) {
    return {
      allowed: false,
      guardName: "posting_failures_threshold",
      reason: `يوجد ${result.cnt} فشل قيد مالي غير محلول — راجعها في لوحة الحوكمة`,
    };
  }
  return { allowed: true, guardName: "posting_failures_threshold" };
};

// ─── Guard: Unresolved Audit Violations ───────────────────────────────────
// NOTE: audit_violations are GOVERNANCE FINDINGS (e.g. "employee without
// contract", "vehicle without insurance") surfaced in the governance
// dashboard — they are advisory, NOT an operational halt condition. Letting
// them hard-block every financial mutation once a backlog accumulates (the
// "1307 critical violations" lockout) punishes every user for unrelated
// findings. Real halts are handled by systemStopGuard (explicit red button),
// postingFailuresGuard (GL integrity), financialPeriodGuard, and
// companyActiveGuard. This guard is therefore advisory-only (always allows);
// the count is still visible in the governance dashboard.
// Exported (not registered) so it stays available for explicit/opt-in use and
// for the governance dashboard's reference, without blanket-blocking.
export const auditViolationsGuard: GuardFn = async () => {
  return { allowed: true, guardName: "audit_violations" };
};

// ─── Guard: System Stop (Red Button) ─────────────────────────────────────
// The "red button" mechanism: administrators can insert rows into the
// `system_stops` table to halt specific operation scopes during audits,
// investigations, or emergencies.  Every guarded mutation checks this table.

const systemStopGuard: GuardFn = async (companyId, context) => {
  const scope: string = context?.guardScope ?? "all";
  const rows = await rawQuery<{ scope: string; reason: string }>(
    `SELECT scope, reason FROM system_stops
     WHERE "companyId" = $1
       AND active = true
       AND (scope = $2 OR scope = 'all')
     LIMIT 1`,
    [companyId, scope]
  // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
  ).catch(() => [{ scope: "all", reason: "فشل التحقق من إيقاف النظام" }] as any[]);

  if (rows.length > 0) {
    return {
      allowed: false,
      guardName: "system_stop",
      reason: `⛔ إيقاف نظام (${rows[0].scope}): ${rows[0].reason}`,
    };
  }
  return { allowed: true, guardName: "system_stop" };
};

// ─── Guard Registry ───────────────────────────────────────────────────────

export type GuardScope = "financial" | "hr" | "operational" | "all";

/** Scopes that are considered financial — errors in these guards must fail closed. */
const FINANCIAL_SCOPES: ReadonlySet<GuardScope> = new Set(["financial"]);

const GUARD_REGISTRY: Array<{ guard: GuardFn; scope: GuardScope }> = [
  { guard: systemStopGuard, scope: "all" },
  { guard: companyActiveGuard, scope: "all" },
  { guard: financialPeriodGuard, scope: "financial" },
  { guard: trialLimitsGuard, scope: "all" },
  { guard: postingFailuresGuard, scope: "financial" },
  // auditViolationsGuard intentionally NOT registered — governance findings are
  // advisory (dashboard), not a blanket operational halt. See its definition.
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
      g.guard(companyId, context).catch((err): GuardResult => {
        // All guards fail closed — an error must NOT allow the operation.
        return {
          allowed: false,
          guardName: "error",
          reason: `فشل التحقق من حارس (${g.scope}) — تم رفض العملية احتياطياً: ${String(err)}`,
        };
      })
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

// ─── Role-aware denial message ─────────────────────────────────────────────
// When a guard blocks an operation, the reply must understand the user's
// صفة (role) and answer with a message + a SHORT fix suited to what THAT role
// can actually do about it. A line clerk shouldn't get a technical governance
// dump; a manager should get the actionable detail.
function isManagerRole(role?: string): boolean {
  if (!role) return false;
  return role === "owner" || role === "general_manager" || role === "branch_manager"
    || /_manager$/.test(role) || role === "accountant" || role === "finance_manager";
}

export function buildGuardDenial(violations: GuardResult[], role?: string): { error: string; fix: string; code: string } {
  const stop = violations.find((v) => v.guardName === "system_stop");
  // Explicit red-button stop — everyone sees the reason (it's an announced halt).
  if (stop) {
    return { error: stop.reason || "النظام موقوف مؤقتًا", fix: "العملية متوقفة بقرار إداري. راجع مدير النظام لرفع الإيقاف.", code: "SYSTEM_GUARD_BLOCK" };
  }
  const reasons = violations.map((v) => v.reason).filter(Boolean) as string[];
  if (isManagerRole(role)) {
    // Managers get the actionable detail + where to resolve it.
    return {
      error: reasons.join(" | ") || "العملية محجوبة بضوابط الحوكمة",
      fix: "راجع لوحة الحوكمة (الإدارة ← المراقبة) وعالِج العناصر الحرجة، ثم أعد المحاولة.",
      code: "SYSTEM_GUARD_BLOCK",
    };
  }
  // Regular staff get a concise message + who to contact — no technical dump.
  return {
    error: "تعذّرت العملية مؤقتًا بسبب ضوابط الحوكمة في النظام.",
    fix: "الحل المختصر: تواصل مع مدير قسمك أو المالية لرفع الحجب — لا يلزمك إجراء تقني.",
    code: "SYSTEM_GUARD_BLOCK",
  };
}

import type { Request, Response, NextFunction } from "express";

export function requireGuards(scope: GuardScope = "financial") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
    const s = (req as any).scope;
    const companyId = s?.companyId;
    if (!companyId) return next();

    // Prefer an explicit posting/document date from the request body;
    // fall back to today only when the body carries no date field.
    const body: Record<string, unknown> | undefined = req.body;
    const postingDate =
      (body?.postingDate as string | undefined) ??
      (body?.invoiceDate as string | undefined) ??
      (body?.date as string | undefined) ??
      todayISO();

    // The posting-failure resolution endpoints are the escape hatch for the
    // posting-failures breaker — they must not be blocked by that same guard.
    // SECURITY: match on req.path (NEVER req.originalUrl — that carries the
    // query string), anchored to the exact remediation routes and their
    // mutation verbs. Otherwise a crafted URL such as
    // `POST /api/finance/invoices?x=/posting-failures` would slip past the
    // lockout on unrelated financial mutations. The only escape-hatch routes
    // are PATCH /posting-failures/:id/resolve, POST /posting-failures/:id/retry,
    // POST /posting-failures/bulk-resolve, and POST /posting-failures/retry-all.
    const isFailureResolution =
      (req.method === "POST" || req.method === "PATCH") &&
      /\/posting-failures\/(?:[^/]+\/(?:resolve|retry)|bulk-resolve|retry-all)$/.test(req.path);

    const result = await checkSystemGuards(companyId, scope, {
      date: postingDate,
      entity: req.path.split("/")[1],
      role: s?.role,
      bypassPostingFailures: isFailureResolution,
    });
    if (!result.allowed) {
      // Role-aware reply: understand the صفة and answer with a message + short
      // fix suited to what that role can do (#governance UX).
      const denial = buildGuardDenial(result.violations, s?.role);
      return _res.status(403).json({
        error: denial.error,
        fix: denial.fix,
        code: denial.code,
        role: s?.role ?? null,
        violations: result.violations,
      });
    }
    next();
  };
}
