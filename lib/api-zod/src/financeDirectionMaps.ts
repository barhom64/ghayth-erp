// financeDirectionMaps.ts — FIN-SUB-05 (#2101)
//
// THE single canonical source for the finance "direction" maps that the
// backend enforces and the frontend mirrors for its form UX. Previously
// these were two hand-kept-identical copies (D-02/D-07):
//   • backend  artifacts/api-server/src/lib/financeOperationContext.ts
//              (VOUCHER_OPERATION_COUNTER_TYPES, ACCOUNT_TYPE_LABELS)
//   • frontend artifacts/ghayth-erp/src/lib/finance/scenario-model.ts
//              (VOUCHER_COUNTER_ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS_AR)
// Drift between them = the form allowing what the server rejects. They now
// both import from here. This is a pure move — zero semantic change.
//
// Context (#1945 item 5) — direction-aware voucher (صرف=مصروف / قبض=إيراد):
// the voucher's COUNTER account (the revenue/expense/AR/AP leg opposite the
// cash leg) is operator-pinned. A سند قبض crediting an EXPENSE account (or a
// سند صرف debiting a REVENUE account) flips the P&L. The map pins, per voucher
// operationType, which chart-of-accounts TYPES the counter account may be;
// unknown/legacy operationTypes fall back to the direction invariant. The
// backend stays the enforcement point (rejects with 422); the frontend uses
// the same map to hint the operator so they pick right the first time.

/** A chart-of-accounts top-level type key. */
export type AccountTypeKey = "asset" | "liability" | "equity" | "revenue" | "expense";

/** Arabic labels for each chart-of-accounts type. */
export const ACCOUNT_TYPE_LABELS: Record<AccountTypeKey, string> = {
  asset: "أصول/ذمم",
  liability: "التزامات",
  equity: "حقوق ملكية",
  revenue: "إيراد",
  expense: "مصروف",
};

/**
 * Which chart-of-accounts TYPES the voucher's counter account may be, keyed by
 * the voucher operationType. The cash leg sits opposite; this constrains the
 * other leg so قبض never lands on a مصروف and صرف never lands on an إيراد.
 */
export const VOUCHER_COUNTER_ACCOUNT_TYPES: Record<string, AccountTypeKey[]> = {
  // receipt direction (قبض)
  receipt: ["revenue"],
  rent: ["revenue"],
  invoice_payment: ["asset"],          // تسوية ذمم العميل
  deposit: ["liability"],              // ضمان مقبوض = التزام
  refund: ["expense", "revenue"],      // استرداد مصروف سابق أو ردّ إيراد
  // payment direction (صرف)
  payment: ["expense"],
  vendor_invoice: ["liability", "expense"], // سداد ذمم مورد أو مصروف مباشر
  salary: ["expense"],
  advance: ["asset"],                  // سلفة موظف = ذمة مدينة
  legal_fee: ["expense"],
  purchase: ["expense", "asset"],      // مشتريات مصروفة أو مخزون/أصل
  custody: ["asset"],                  // عهدة = أصل بيد الموظف
  insurance: ["expense", "asset"],     // مصروف أو مدفوع مقدماً
  maintenance: ["expense"],
};
