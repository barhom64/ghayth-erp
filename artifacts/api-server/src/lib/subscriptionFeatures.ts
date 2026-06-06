// P4 — per-company feature entitlement provisioning.
//
// Migration 253 grandfathers every company that EXISTED at migration time
// with all features 'active'. Companies created AFTERWARDS (tenant
// bootstrap, admin "create company") need the same treatment or every
// featureGate-protected module returns 402 for them. This helper inserts
// one 'active' entitlement row per catalogued feature for a single
// company; the company-creation paths call it so a fresh tenant starts
// with the same permissive default the migration applied to existing ones.
//
// Idempotent: ON CONFLICT DO NOTHING, so re-running (or a later migration
// adding a feature + backfill) never duplicates or downgrades a row.
//
// Transaction-aware: rawExecute routes through the ambient txStore client
// when called inside a withTransaction block (e.g. the bootstrap-tenant
// flow), so the entitlements commit atomically with the company row.
import { rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";

/**
 * Seed all catalogued features as 'active' for `companyId`. Returns the
 * number of entitlement rows inserted (0 if they already existed).
 */
export async function seedCompanyFeatureEntitlements(companyId: number): Promise<number> {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`seedCompanyFeatureEntitlements: invalid companyId ${companyId}`);
  }
  const result = await rawExecute(
    `INSERT INTO company_subscription_features ("companyId", "featureKey", status)
     SELECT $1, "featureKey", 'active'
       FROM subscription_features
     ON CONFLICT ("companyId", "featureKey") DO NOTHING`,
    [companyId],
  );
  if (result.affectedRows > 0) {
    logger.info(
      { companyId, seeded: result.affectedRows },
      "[subscription] seeded feature entitlements for new company",
    );
  }
  return result.affectedRows;
}
