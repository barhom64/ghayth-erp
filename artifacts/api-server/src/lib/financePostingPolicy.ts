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
import { classifyEnforcement, DIMENSION_COLUMN } from "./gl/ledgerTruth.js";

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

/**
 * عقد البُعد (FIN-INTEGRITY-CONTRACT #2233) — يُفرَض عند بابَي الترحيل
 * (businessHelpers.createJournalEntry + gl/posting.postJournalEntry).
 *
 * لكل سطر على حساب من فئة مُبعّدة (وفق DIMENSION_ENFORCEMENT_RULES): إن غاب
 * البُعد المطلوب → **يُرفَض** (mode=enforce) أو **يُسجَّل تحذير** (mode=warn).
 * تدريجي وآمن (ratchet): أول enforce هو وقود المركبة (5510) فقط؛ البقية warn.
 * forward-only — يقع عند الترحيل لا على القيود التاريخية. **دالة نقية** (بلا I/O):
 * يُحلَّل البُعد من كود الحساب، فلا حاجة لقاعدة بيانات — قابلة للاختبار وحدةً.
 */
export interface DimensionContractLine {
  accountCode?: string | null;
  vehicleId?: number | string | null;
  propertyId?: number | string | null;
  projectId?: number | string | null;
  vendorId?: number | string | null;
  clientId?: number | string | null;
}

export function assertDimensionContract(args: { lines: DimensionContractLine[] }): { warnings: string[] } {
  const warnings: string[] = [];
  for (const line of args.lines) {
    const code = line.accountCode ? String(line.accountCode).trim() : "";
    if (!code) continue;
    const rule = classifyEnforcement(code);
    if (!rule) continue;
    const col = DIMENSION_COLUMN[rule.dimension] as keyof DimensionContractLine;
    const val = line[col];
    const present = val !== null && val !== undefined && val !== "";
    if (present) continue;
    if (rule.mode === "enforce") {
      throw new ValidationError(
        `إعداد التوجيه المحاسبي غير مكتمل: الحساب «${code}» يتطلب ربطه بـ«${rule.label}» قبل الترحيل`,
        {
          field: String(col),
          fix: `اربط السطر بـ«${rule.label}» الصحيح (عبر المسار التشغيلي/السيناريو)، أو استخدم تجاوزًا يدويًا مُصرّحًا`,
          meta: { accountCode: code, requiredDimension: rule.dimension },
        },
      );
    }
    warnings.push(`الحساب «${code}» بلا بُعد «${rule.label}» (تحذير — غير مُنفَّذ بعد لهذا الصنف)`);
  }
  return { warnings };
}
