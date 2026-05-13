import { rawQuery } from "../rawdb.js";

/**
 * Branch-first / company-fallback resolver for `zatca_settings`.
 *
 * Multi-VAT Saudi tenants (Al-Diyaa with 3 separately-registered
 * branches in Makkah, Hafar Al-Batin and Al-Door) onboard each branch
 * with its own CSID / PIH key / OAuth secret. Routes that need to
 * sign or submit on behalf of a specific branch should call this
 * helper instead of `WHERE companyId = $1`, which would unconditionally
 * pick the company-wide row and stamp every branch's invoices with
 * the same VAT number.
 *
 * Lookup order:
 *   1. (companyId, branchId) — per-branch credentials
 *   2. (companyId, NULL)      — company-wide default (legacy)
 *   3. null                   — caller decides (UI prompt to onboard)
 *
 * Migration 172 added `branchId` + the partial unique indexes that
 * make both rows coexist; tenants that haven't onboarded a branch yet
 * still get served by their company default row.
 */
export interface ZatcaSettingsRow {
  id: number;
  companyId: number;
  branchId: number | null;
  enabled: boolean;
  environment: string;
  vatRegistrationNumber: string | null;
  crNumber: string | null;
  organizationName: string | null;
  organizationNameEn: string | null;
  streetName: string | null;
  buildingNumber: string | null;
  cityName: string | null;
  postalCode: string | null;
  countryCode: string | null;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  csid: string | null;
  pihKey: string | null;
  [key: string]: unknown;
}

export async function resolveZatcaSettings(
  companyId: number,
  branchId: number | null,
): Promise<ZatcaSettingsRow | null> {
  if (branchId !== null && branchId !== undefined) {
    const [branchRow] = await rawQuery<ZatcaSettingsRow>(
      `SELECT * FROM zatca_settings
        WHERE "companyId" = $1 AND "branchId" = $2
        LIMIT 1`,
      [companyId, branchId],
    );
    if (branchRow) return branchRow;
  }
  const [companyRow] = await rawQuery<ZatcaSettingsRow>(
    `SELECT * FROM zatca_settings
      WHERE "companyId" = $1 AND "branchId" IS NULL
      LIMIT 1`,
    [companyId],
  );
  return companyRow ?? null;
}

/**
 * Convenience: returns the resolved id only, suitable for FK references
 * (e.g. `zatca_submission_log.settingsId`). Saves a downstream lookup
 * when the caller already has the full row from `resolveZatcaSettings`.
 */
export async function resolveZatcaSettingsId(
  companyId: number,
  branchId: number | null,
): Promise<number | null> {
  const row = await resolveZatcaSettings(companyId, branchId);
  return row?.id ?? null;
}
