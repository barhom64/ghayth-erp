// B2 subscription gate. Closes the structural half of the B2 BLOCKER
// from CRITICAL_DEFECTS_REPORT.md without building the full billing
// integration (that ships when a real payment provider is wired).
//
// Semantics:
//   - status 'active'    → pass.
//   - status 'trial'     → pass unless trialExpiresAt is in the past,
//                          in which case the company is silently moved
//                          to 'expired' and the request is blocked.
//   - status 'expired'   → block with 402 Payment Required.
//   - status 'cancelled' → block with 402 Payment Required.
//
// The gate is mounted AFTER authMiddleware so scope.companyId is set.
// Unauthenticated routes (/auth/login, /auth/setup-state, /auth/
// bootstrap-tenant) live above the mount and are never blocked.
//
// Owners always see a soft warning, never a hard block, so they can
// still reach /admin/subscription to pay. Non-owners get the hard block.
import type { Request, Response, NextFunction } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

interface SubscriptionRow {
  subscriptionStatus: string;
  trialExpiresAt: string | null;
}

// Cache: subscription state changes are rare, but every request hits
// this middleware. A 60-second TTL keeps cost negligible while still
// flipping a trial-expired company into 'expired' within a minute.
const cache = new Map<number, { row: SubscriptionRow; expiresAt: number }>();
const TTL_MS = 60_000;

async function loadStatus(companyId: number): Promise<SubscriptionRow | null> {
  const cached = cache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  const [row] = await rawQuery<SubscriptionRow>(
    `SELECT "subscriptionStatus", "trialExpiresAt" FROM companies WHERE id = $1`,
    [companyId]
  ).catch(() => []);
  if (!row) return null;
  cache.set(companyId, { row, expiresAt: Date.now() + TTL_MS });
  return row;
}

// Public helper so an admin "force refresh" endpoint can drop a cache
// entry after a manual subscription change.
export function invalidateSubscriptionCache(companyId?: number): void {
  if (companyId == null) cache.clear();
  else cache.delete(companyId);
}

export async function subscriptionGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const scope = req.scope;
  if (!scope?.companyId) {
    // Nothing to gate yet — authMiddleware already returned 401 in this
    // shape, so we're past it for a real request. For routes mounted
    // before auth, just pass.
    next();
    return;
  }
  // System-only / cross-tenant admin endpoints don't have a single
  // companyId scope. Let them through.
  if (scope.companyId === 0) {
    next();
    return;
  }

  const row = await loadStatus(scope.companyId);
  if (!row) {
    // Defensive: if the company row vanished mid-flight, fail closed.
    res.status(403).json({ error: "الشركة غير موجودة", code: "COMPANY_NOT_FOUND" });
    return;
  }

  let effectiveStatus = row.subscriptionStatus;

  // Auto-transition: trial whose expiry passed flips to 'expired'.
  // Best-effort UPDATE — the next request will see it persisted; if
  // the UPDATE fails, the request still proceeds because we evaluate
  // the in-memory expiry check below.
  if (
    row.subscriptionStatus === "trial" &&
    row.trialExpiresAt &&
    new Date(row.trialExpiresAt).getTime() < Date.now()
  ) {
    effectiveStatus = "expired";
    rawExecute(
      `UPDATE companies SET "subscriptionStatus" = 'expired'
        WHERE id = $1 AND "subscriptionStatus" = 'trial'`,
      [scope.companyId]
    ).catch((e) => logger.warn(e, "subscriptionGate: auto-expire failed"));
    invalidateSubscriptionCache(scope.companyId);
  }

  if (effectiveStatus === "expired" || effectiveStatus === "cancelled") {
    // Owners can still pass to reach /admin/subscription and pay; the
    // UI shows a banner. Non-owners get a hard 402.
    if (scope.isOwner || scope.role === "owner") {
      next();
      return;
    }
    res.status(402).json({
      error: "اشتراك الشركة منتهي. يرجى التواصل مع مالك الحساب لتجديد الاشتراك.",
      code: "SUBSCRIPTION_EXPIRED",
      meta: { subscriptionStatus: effectiveStatus },
    });
    return;
  }

  next();
}
