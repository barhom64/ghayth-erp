/**
 * Typed wrapper for the per-tenant chart-of-accounts mapping.
 *
 * The DB layer (`accounting_mappings`) already lets each company map
 * an `operationType` string to a debit + credit account pair. The
 * existing helper at `businessHelpers.ts:944` (`getAccountCodeFromMapping`)
 * is unchanged — what's missing is a typed enum of purposes my own
 * downstream modules need (FX revaluation, inventory adjustments,
 * cycle-count variance, COGS by valuation method, …).
 *
 * This module:
 *   - Names the purposes as a TypeScript union so a typo in
 *     `runPeriodEndRevaluation` surfaces at compile time, not at
 *     "invoice posted with the wrong account" runtime.
 *   - Wraps the DB lookup so callers don't carry the raw string
 *     `operationType` argument by accident.
 *   - Returns a structured `AccountResolution` (`{ accountId,
 *     accountCode, source }`) so the audit log can record WHERE
 *     the account came from (configured mapping, intent search,
 *     or hardcoded fallback).
 *
 * No DB writes here — read-only resolver. Setting the mappings up
 * is the existing settings UI's job (`/api/accounting/mappings`).
 */
import { rawQuery } from "../rawdb.js";

/**
 * Closed enum of accounting purposes the typed callers need. Adding
 * a purpose is a deliberate code change — surface here, then update
 * `EXPECTED_INTENT` if a new intent-search fallback should fire when
 * the operator hasn't yet configured the mapping.
 */
export type AccountPurpose =
  // FX (IAS 21)
  | "fx_revaluation_ar"
  | "fx_revaluation_ap"
  | "fx_revaluation_gain"
  | "fx_revaluation_loss"
  | "realized_fx_gain"
  | "realized_fx_loss"
  // Inventory adjustments
  | "inventory_asset"
  | "inventory_writeoff_loss"
  | "inventory_writeup_gain"
  | "cycle_count_variance_gain"
  | "cycle_count_variance_loss"
  | "cogs_default";

export type AccountSide = "debit" | "credit";

/**
 * Result of resolving an `AccountPurpose` for a company. `source`
 * makes the audit trail honest: a fallback'd account is materially
 * different from a configured one, even if the journal entry posts
 * fine either way.
 */
export interface AccountResolution {
  accountId: number;
  accountCode: string;
  /**
   *   "configured" — the operator set this mapping in the
   *                  accounting_mappings table.
   *   "fallback"   — the configured mapping was missing or pointed
   *                  at a deleted account; we returned the legacy
   *                  hardcoded code for the purpose.
   */
  source: "configured" | "fallback";
}

/**
 * Default account codes per purpose, used when the company hasn't
 * customised its accounting_mappings. These codes match the
 * standard Saudi VAT-aware chart shipped with the seed.
 *
 * Operators can always override via the settings UI; the helper
 * below picks the configured row first and only consults this
 * table on miss.
 */
const FALLBACK_CODE: Record<AccountPurpose, string> = {
  fx_revaluation_ar:        "1130",
  fx_revaluation_ap:        "2100",
  fx_revaluation_gain:      "4900",
  fx_revaluation_loss:      "5900",
  realized_fx_gain:         "4910",
  realized_fx_loss:         "5910",
  inventory_asset:          "1400",
  inventory_writeoff_loss:  "5610",
  inventory_writeup_gain:   "4610",
  cycle_count_variance_gain:"4620",
  cycle_count_variance_loss:"5620",
  cogs_default:             "5100",
};

/**
 * Look up the configured account ID + code for a purpose. Picks the
 * `accounting_mappings` row matching `operationType = purpose` and
 * the requested side; if no configured row exists or its account
 * was soft-deleted, falls back to the default code (still resolved
 * through chart_of_accounts so the caller gets the FK-valid id).
 *
 * Returns `null` when even the fallback code doesn't exist in the
 * company's chart — the caller MUST handle this rather than
 * blindly posting against a missing account.
 */
export async function getAccountForPurpose(
  companyId: number,
  purpose: AccountPurpose,
  side: AccountSide,
): Promise<AccountResolution | null> {
  // 1. Configured mapping?
  const sideColId = side === "debit" ? '"debitAccountId"' : '"creditAccountId"';
  const sideColCode = side === "debit" ? '"debitAccountCode"' : '"creditAccountCode"';

  const mapping = await rawQuery<{
    accountId: number | null;
    accountCode: string | null;
    chartCode: string | null;
  }>(
    `SELECT
       am.${sideColId}::int AS "accountId",
       am.${sideColCode}    AS "accountCode",
       coa.code             AS "chartCode"
     FROM accounting_mappings am
     LEFT JOIN chart_of_accounts coa
       ON coa.id = am.${sideColId}
       AND coa."deletedAt" IS NULL
       AND coa."allowPosting" = true
     WHERE am."companyId" = $1
       AND am."operationType" = $2
       AND am."isActive" = true
     LIMIT 1`,
    [companyId, purpose],
  );

  if (mapping.length > 0 && mapping[0].accountId != null && mapping[0].chartCode) {
    return {
      accountId: mapping[0].accountId,
      accountCode: mapping[0].chartCode,
      source: "configured",
    };
  }

  // 2. Fallback by code → resolve to the company's account id.
  const fallback = await rawQuery<{ id: number; code: string }>(
    `SELECT id, code FROM chart_of_accounts
     WHERE "companyId" = $1
       AND code = $2
       AND "deletedAt" IS NULL
       AND "allowPosting" = true
     LIMIT 1`,
    [companyId, FALLBACK_CODE[purpose]],
  );
  if (fallback.length > 0) {
    return {
      accountId: fallback[0].id,
      accountCode: fallback[0].code,
      source: "fallback",
    };
  }

  return null;
}

/**
 * Convenience: resolve BOTH sides at once. Useful for revaluation /
 * realized-FX posters that always need a balanced pair.
 *
 * Returns null when EITHER side fails to resolve, so the caller
 * doesn't post a half-built entry.
 */
export async function getAccountPair(
  companyId: number,
  debitPurpose: AccountPurpose,
  creditPurpose: AccountPurpose,
): Promise<{ debit: AccountResolution; credit: AccountResolution } | null> {
  const [debit, credit] = await Promise.all([
    getAccountForPurpose(companyId, debitPurpose, "debit"),
    getAccountForPurpose(companyId, creditPurpose, "credit"),
  ]);
  if (!debit || !credit) return null;
  return { debit, credit };
}
