// financeAccountClassifier.ts
//
// Central account-usage taxonomy + classification for the unified finance
// engine (task #1715). The accounting `type` (asset/liability/equity/
// revenue/expense) is too coarse for operational decisions — when paying
// cash we must know which accounts are actually CASH BOXES, which are
// BANKS, which are CUSTODY, etc. This module owns the `accountUsage`
// vocabulary, the children-inheritance policy, the payment-method →
// allowed-usage map, and the heuristic auto-classifier used by the
// migration and the gap report.
//
// IMPORTANT: this is the single source of truth. Routes MUST NOT
// re-implement code.startsWith heuristics inline — they import from here.

export type AccountUsage =
  | "cash_box"
  | "bank"
  | "custody"
  | "card"
  | "cheque"
  | "receivable"
  | "payable"
  | "inventory"
  | "fixed_asset"
  | "accumulated_depreciation"
  | "vat_input"
  | "vat_output"
  | "wht_payable"
  | "loan"
  | "operating_expense"
  | "cogs"
  | "payroll_expense"
  | "revenue"
  | "equity"
  | "other";

export const ACCOUNT_USAGES: AccountUsage[] = [
  "cash_box", "bank", "custody", "card", "cheque", "receivable", "payable",
  "inventory", "fixed_asset", "accumulated_depreciation", "vat_input",
  "vat_output", "wht_payable", "loan", "operating_expense", "cogs",
  "payroll_expense", "revenue", "equity", "other",
];

export const ACCOUNT_USAGE_LABELS_AR: Record<AccountUsage, string> = {
  cash_box: "صندوق نقدي",
  bank: "حساب بنكي",
  custody: "عهدة",
  card: "بطاقة",
  cheque: "شيكات تحت التحصيل",
  receivable: "ذمم مدينة",
  payable: "ذمم دائنة",
  inventory: "مخزون",
  fixed_asset: "أصل ثابت",
  accumulated_depreciation: "مجمع الإهلاك",
  vat_input: "ضريبة مدخلات",
  vat_output: "ضريبة مخرجات",
  wht_payable: "استقطاع ضريبي مستحق",
  loan: "قروض/تمويل",
  operating_expense: "مصروف تشغيلي",
  cogs: "تكلفة المبيعات",
  payroll_expense: "مصروف رواتب",
  revenue: "إيراد",
  equity: "حقوق ملكية",
  other: "غير مصنّف",
};

export type ChildrenUsagePolicy =
  | "inherit_locked"
  | "inherit_default"
  | "mixed_allowed"
  | "manual_required";

export const CHILDREN_USAGE_POLICIES: ChildrenUsagePolicy[] = [
  "inherit_locked", "inherit_default", "mixed_allowed", "manual_required",
];

export const DEFAULT_CHILDREN_USAGE_POLICY: ChildrenUsagePolicy = "inherit_default";

// Payment method → the set of account usages allowed for the money
// source (payment) or destination (receipt). Enforced in
// financePostingPolicy.assertPaymentSourceAllowed.
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

// Heuristic auto-classifier for existing accounts. Uses the accounting
// `type` + the Saudi-standard code prefix. Returns null when it cannot
// confidently classify (→ surfaces in the usage-gaps report for manual
// classification). NOT used as a runtime posting decision — only to seed
// `accountUsage` once; the column is the source of truth thereafter.
export function classifyAccountUsage(input: {
  code?: string | null;
  type?: string | null;
  name?: string | null;
}): AccountUsage | null {
  const code = (input.code ?? "").trim();
  const type = (input.type ?? "").trim();
  const name = (input.name ?? "");

  const nameHas = (...kw: string[]) => kw.some((k) => name.includes(k));

  // Name-based strong signals first (Arabic), then code-prefix fallback.
  if (nameHas("صندوق", "نقدية", "نقد بالصندوق")) return "cash_box";
  if (nameHas("بنك", "مصرف", "حساب جاري")) return "bank";
  if (nameHas("عهدة", "عهد")) return "custody";
  if (nameHas("بطاقة", "مدى", "ائتمان")) return "card";
  if (nameHas("شيكات", "شيك تحت التحصيل")) return "cheque";
  if (nameHas("مخزون", "بضاعة")) return "inventory";
  if (nameHas("مجمع الإهلاك", "مجمع إهلاك")) return "accumulated_depreciation";
  if (nameHas("ضريبة المدخلات", "ضريبة مدخلات", "VAT مدخلات")) return "vat_input";
  if (nameHas("ضريبة المخرجات", "ضريبة مخرجات", "VAT مخرجات")) return "vat_output";
  if (nameHas("استقطاع", "WHT")) return "wht_payable";
  if (nameHas("قرض", "تمويل", "سلفة بنكية")) return "loan";
  if (nameHas("ذمم مدينة", "عملاء", "مدينون")) return "receivable";
  if (nameHas("ذمم دائنة", "موردون", "دائنون")) return "payable";
  if (nameHas("رواتب", "أجور")) return "payroll_expense";
  if (nameHas("تكلفة المبيعات", "تكلفة المباع")) return "cogs";

  // Code-prefix fallback (Saudi standard COA).
  if (code) {
    if (/^111/.test(code)) return "cash_box";
    if (/^112/.test(code)) return "bank";
    if (/^113/.test(code)) return "custody";
    if (/^12/.test(code)) return "receivable";
    if (/^13/.test(code)) return "inventory";
    if (/^1400|^14/.test(code)) return "vat_input";
    if (/^15|^16/.test(code)) return "fixed_asset";
    if (/^17/.test(code)) return "accumulated_depreciation";
    if (/^21/.test(code)) return "payable";
    if (/^23/.test(code)) return "vat_output";
    if (/^233/.test(code)) return "wht_payable";
    if (/^25|^26/.test(code)) return "loan";
    if (/^3/.test(code)) return "equity";
    if (/^4/.test(code)) return "revenue";
    if (/^51|^52/.test(code)) return "cogs";
    if (/^53/.test(code)) return "payroll_expense";
    if (/^5/.test(code)) return "operating_expense";
  }

  // Type-only last resort (low confidence → leave for manual when ambiguous).
  switch (type) {
    case "revenue": return "revenue";
    case "expense": return "operating_expense";
    case "equity": return "equity";
    default: return null; // asset/liability without a code signal → gap
  }
}

export function isValidUsage(u: string | null | undefined): u is AccountUsage {
  return !!u && (ACCOUNT_USAGES as string[]).includes(u);
}

export function isValidChildrenPolicy(p: string | null | undefined): p is ChildrenUsagePolicy {
  return !!p && (CHILDREN_USAGE_POLICIES as string[]).includes(p);
}
