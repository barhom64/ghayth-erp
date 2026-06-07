// financePostingPolicy.ts
//
// Backend enforcement of finance posting invariants (task #1715). The
// frontend filters the account picker by usage, but the source of truth
// is HERE — the backend rejects any conflict even if the operator bypassed
// the UI. No code.startsWith heuristics: decisions read the persisted
// `accountUsage` column.

import { rawQuery } from "./rawdb.js";
import { ValidationError } from "./errorHandler.js";
import {
  allowedUsagesForPaymentMethod,
  ACCOUNT_USAGE_LABELS_AR,
  type AccountUsage,
} from "./financeAccountClassifier.js";

interface AccountUsageRow {
  code: string;
  accountUsage: string | null;
  name: string;
}

/**
 * Assert that the money source/destination account is legal for the
 * chosen payment method. Throws ValidationError (422) on conflict.
 *
 * - paymentMethod cash → account.accountUsage must be cash_box
 * - bank_transfer → bank
 * - custody → custody
 * - card → card
 * - cheque → bank | cheque
 *
 * Unclassified accounts (accountUsage NULL) are allowed through with no
 * hard block (the gap report nudges the operator to classify them), so
 * this migration-era policy never bricks a tenant whose COA isn't
 * classified yet. Once classified, conflicts are rejected.
 */
export async function assertPaymentSourceAllowed(args: {
  companyId: number;
  accountCode: string;
  paymentMethod: string | null | undefined;
}): Promise<void> {
  const allowed = allowedUsagesForPaymentMethod(args.paymentMethod);
  if (!allowed) return; // unknown/absent method → no constraint
  if (!args.accountCode) return;

  const [row] = await rawQuery<AccountUsageRow>(
    `SELECT code, "accountUsage", name FROM chart_of_accounts
      WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL
      LIMIT 1`,
    [args.companyId, args.accountCode],
  );
  if (!row) return;                 // account resolution handled elsewhere
  if (!row.accountUsage) return;    // unclassified → soft-allow (gap report)

  if (!allowed.includes(row.accountUsage as AccountUsage)) {
    const wantLabels = allowed.map((u) => ACCOUNT_USAGE_LABELS_AR[u]).join(" أو ");
    const gotLabel = ACCOUNT_USAGE_LABELS_AR[row.accountUsage as AccountUsage] ?? row.accountUsage;
    throw new ValidationError(
      `الحساب «${row.name}» مُصنّف كـ«${gotLabel}» ولا يصلح لطريقة الدفع المختارة (المطلوب: ${wantLabels})`,
      {
        field: "sourceAccountCode",
        fix: `اختر حساباً مصنّفاً كـ«${wantLabels}» يطابق طريقة الدفع، أو غيّر طريقة الدفع`,
        meta: { accountUsage: row.accountUsage, allowedUsages: allowed },
      },
    );
  }
}
