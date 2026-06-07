// finance-account-usage.ts (frontend)
//
// Mirror of the backend financeAccountClassifier payment-method → allowed
// account-usage map (#1715). The create forms filter the money-source
// account picker by the chosen payment method so the operator can only
// pick a legal account. The backend (financePostingPolicy) enforces the
// same rule, so this is UX, not the security boundary.

export type AccountUsage =
  | "cash_box" | "bank" | "custody" | "card" | "cheque"
  | "receivable" | "payable" | "inventory" | "fixed_asset"
  | "accumulated_depreciation" | "vat_input" | "vat_output"
  | "wht_payable" | "loan" | "operating_expense" | "cogs"
  | "payroll_expense" | "revenue" | "equity" | "other";

export const ACCOUNT_USAGE_LABELS_AR: Record<string, string> = {
  cash_box: "صندوق نقدي",
  bank: "حساب بنكي",
  custody: "عهدة",
  card: "بطاقة",
  cheque: "شيكات",
  receivable: "ذمم مدينة",
  payable: "ذمم دائنة",
  inventory: "مخزون",
  fixed_asset: "أصل ثابت",
  accumulated_depreciation: "مجمع الإهلاك",
  vat_input: "ضريبة مدخلات",
  vat_output: "ضريبة مخرجات",
  wht_payable: "استقطاع",
  loan: "قروض",
  operating_expense: "مصروف تشغيلي",
  cogs: "تكلفة مبيعات",
  payroll_expense: "رواتب",
  revenue: "إيراد",
  equity: "حقوق ملكية",
  other: "غير مصنّف",
};

export const PAYMENT_METHOD_ALLOWED_USAGES: Record<string, AccountUsage[]> = {
  cash: ["cash_box"],
  bank_transfer: ["bank"],
  bank: ["bank"],
  custody: ["custody"],
  credit_card: ["card"],
  card: ["card"],
  check: ["bank", "cheque"],
  cheque: ["bank", "cheque"],
};

export function allowedUsagesForPaymentMethod(method: string | null | undefined): AccountUsage[] | null {
  if (!method) return null;
  return PAYMENT_METHOD_ALLOWED_USAGES[method] ?? null;
}

// Legacy fallback: when an account has no accountUsage yet (pre-migration
// classification), allow the historical code-prefix money accounts so the
// picker never goes empty for an unclassified tenant.
function legacyIsMoneyAccount(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith("11") || code.startsWith("12");
}

export interface UsageAccountLike {
  code?: string | null;
  accountUsage?: string | null;
}

/**
 * Filter money-source/destination accounts to those legal for the chosen
 * payment method. Classified accounts are matched by accountUsage;
 * unclassified accounts (accountUsage null) fall back to the legacy
 * code-prefix money-account heuristic so the picker is never empty during
 * the migration window. When the method is unknown, returns the input
 * unchanged.
 */
export function filterAccountsForPaymentMethod<T extends UsageAccountLike>(
  accounts: T[],
  method: string | null | undefined,
): T[] {
  const allowed = allowedUsagesForPaymentMethod(method);
  if (!allowed) return accounts;
  return accounts.filter((a) => {
    if (a.accountUsage) return allowed.includes(a.accountUsage as AccountUsage);
    return legacyIsMoneyAccount(a.code); // unclassified → legacy allow
  });
}
