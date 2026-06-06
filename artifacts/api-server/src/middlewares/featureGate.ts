// P4 — per-feature entitlement gate (finding #5 of the senior review).
//
// Pairs with `subscriptionGate.ts` (whole-company on/off) and turns the
// "we sold the customer X but not Y" decision into a route-level
// concern. A domain router declares the feature it needs:
//
//   router.use("/fleet", featureGate("fleet.access"), requireGuards("fleet"), fleetRouter);
//
// At request time the gate looks up the company's row in
// `company_subscription_features` and either passes, falls back to
// trial-on-product behaviour, or returns 402 FEATURE_NOT_SUBSCRIBED.
//
// Caching: same 60s in-memory map as subscriptionGate. Per (companyId,
// featureKey) entry; cleared via `invalidateFeatureGateCache(companyId)`
// when the admin endpoint flips a feature for a tenant.
import type { Request, Response, NextFunction } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

interface FeatureRow {
  status: string;
  expiresAt: string | null;
}

const cache = new Map<string, { row: FeatureRow | null; expiresAt: number }>();
const TTL_MS = 60_000;

function cacheKey(companyId: number, featureKey: string): string {
  return `${companyId}::${featureKey}`;
}

async function loadFeature(companyId: number, featureKey: string): Promise<FeatureRow | null> {
  const key = cacheKey(companyId, featureKey);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  const [row] = await rawQuery<{ status: string; expiresAt: string | null }>(
    `SELECT status, "expiresAt"
       FROM company_subscription_features
      WHERE "companyId" = $1 AND "featureKey" = $2
      LIMIT 1`,
    [companyId, featureKey],
  ).catch(() => []);

  const entry = row ?? null;
  cache.set(key, { row: entry, expiresAt: Date.now() + TTL_MS });
  return entry;
}

// Public helper so the admin endpoint can drop a stale cache entry
// immediately after a manual flip.
export function invalidateFeatureGateCache(companyId?: number, featureKey?: string): void {
  if (companyId == null) {
    cache.clear();
    return;
  }
  if (featureKey == null) {
    for (const k of cache.keys()) {
      if (k.startsWith(`${companyId}::`)) cache.delete(k);
    }
    return;
  }
  cache.delete(cacheKey(companyId, featureKey));
}

// Factory. Returns the per-route middleware bound to a single feature
// key. Routes declare the feature they sell in one place
// (_domain-mounts.ts), the gate enforces it.
export function featureGate(featureKey: string) {
  if (!featureKey || typeof featureKey !== "string") {
    throw new Error(`featureGate: invalid featureKey "${featureKey}"`);
  }

  return async function featureGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const scope = req.scope;
    if (!scope?.companyId) {
      // No companyId means the request didn't get past authMiddleware.
      // Defensive pass — auth already returned 401 in that case.
      next();
      return;
    }

    // Cross-tenant admin scope (companyId === 0) bypasses every
    // feature gate — same convention as subscriptionGate.
    if (scope.companyId === 0) {
      next();
      return;
    }

    const row = await loadFeature(scope.companyId, featureKey);

    // No row at all → feature not provisioned for this tenant. Migration
    // 253 grandfathers existing companies and seedCompanyFeatureEntitlements
    // covers newly-created ones, so this only fires for a feature added
    // after a company was created and not yet backfilled. Fail closed for
    // regular users — but give the OWNER a soft pass so a provisioning gap
    // can never hard-lock the account holder out of their own workspace
    // (they can still reach /admin/subscription-features to provision).
    if (!row) {
      if (scope.isOwner || scope.role === "owner") {
        logger.warn(
          { companyId: scope.companyId, featureKey },
          "featureGate: owner bypass on un-provisioned feature (no entitlement row)",
        );
        next();
        return;
      }
      res.status(402).json({
        error: "هذه الميزة غير مفعّلة في اشتراك شركتك. تواصل مع المالك لتفعيلها.",
        code: "FEATURE_NOT_SUBSCRIBED",
        meta: { featureKey },
      });
      return;
    }

    // expires_at check on the fly. We do NOT auto-UPDATE the row here
    // (unlike subscriptionGate's trial flip) — the admin endpoint owns
    // status transitions. The gate just reads "is it good right now".
    const isExpired = row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
    const effectiveStatus = isExpired ? "expired" : row.status;

    if (effectiveStatus !== "active" && effectiveStatus !== "trial") {
      // Owners get a soft pass so they can reach the admin endpoint
      // and re-activate; non-owners get a hard 402.
      if (scope.isOwner || scope.role === "owner") {
        logger.warn(
          { companyId: scope.companyId, featureKey, status: effectiveStatus },
          "featureGate: owner bypass on inactive feature",
        );
        next();
        return;
      }
      res.status(402).json({
        error: "اشتراك هذه الميزة منتهي أو متوقّف. تواصل مع المالك لتجديده.",
        code: "FEATURE_NOT_SUBSCRIBED",
        meta: { featureKey, status: effectiveStatus },
      });
      return;
    }

    next();
  };
}
