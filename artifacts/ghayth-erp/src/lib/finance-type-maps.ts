/**
 * Centralized Arabic label maps for the Finance module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── طرق الدفع ──────────────────────────────────────────────────────
export const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  bank: "تحويل بنكي",
  check: "شيك",
  credit_card: "بطاقة ائتمان",
  custody: "من العهدة",
};

// #1715 (module review) — ordered option lists so the create forms stop
// re-declaring (and drifting) their own PAYMENT_METHODS arrays. The base set is
// shared by vouchers + customer-advances; expenses adds «من العهدة».
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: PAYMENT_METHODS.cash },
  { value: "bank_transfer", label: PAYMENT_METHODS.bank_transfer },
  { value: "check", label: PAYMENT_METHODS.check },
  { value: "credit_card", label: PAYMENT_METHODS.credit_card },
];
export const PAYMENT_METHOD_OPTIONS_WITH_CUSTODY: { value: string; label: string }[] = [
  ...PAYMENT_METHOD_OPTIONS,
  { value: "custody", label: PAYMENT_METHODS.custody },
];

// ── أنواع عمليات السندات ────────────────────────────────────────────
export const VOUCHER_OPERATIONS: Record<string, string> = {
  receipt: "قبض إيراد",
  rent: "تحصيل إيجار",
  invoice_payment: "سداد فاتورة عميل",
  deposit: "إيداع ضمان",
  refund: "استرداد",
  payment: "صرف مبلغ",
  vendor_invoice: "سداد فاتورة مورد",
  salary: "صرف راتب",
  advance: "سلفة موظف",
  legal_fee: "أتعاب قانونية",
  purchase: "مشتريات",
  custody: "صرف عهدة",
  insurance: "سداد تأمين",
  maintenance: "دفع صيانة",
};

// ── أنواع الفواتير ──────────────────────────────────────────────────
export const INVOICE_TYPES: Record<string, string> = {
  standard: "فاتورة عادية",
  simplified: "فاتورة مبسطة",
  credit_memo: "إشعار دائن",
  debit_memo: "إشعار مدين",
};

// ── طرق الإهلاك ─────────────────────────────────────────────────────
export const DEPRECIATION_METHODS: Record<string, string> = {
  straight_line: "القسط الثابت",
  declining_balance: "القسط المتناقص",
};

// ── أنواع الحسابات ──────────────────────────────────────────────────
// #1715 (module review) — single source of truth for account-type labels.
// Standardised on «خصوم» (the term used by every screen) so the 7 inline
// copies that re-declared this map can all import it instead of drifting.
export const ACCOUNT_TYPES: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
  contra: "حساب مقابل",
};

// ── فئات المصروفات ──────────────────────────────────────────────────
export const EXPENSE_CATEGORIES: Record<string, string> = {
  operational: "تشغيلية",
  administrative: "إدارية",
  marketing: "تسويقية",
  maintenance: "صيانة",
  travel: "سفر",
  utilities: "مرافق",
  rent: "إيجار",
  salaries: "رواتب",
  other: "أخرى",
};

// ── أنواع الضمانات البنكية ──────────────────────────────────────────
export const GUARANTEE_TYPES: Record<string, string> = {
  payment: "ضمان دفع",
  performance: "ضمان أداء",
  tender: "ضمان عطاء",
  advance: "ضمان دفعة مقدمة",
  retention: "ضمان محتجزات",
};

// ── حالات الفترة المالية ─────────────────────────────────────────────
export const FISCAL_PERIOD_STATUS: Record<string, { label: string; color: string }> = {
  open:   { label: "مفتوحة",    color: "bg-green-100 text-status-success-foreground border-status-success-surface" },
  closed: { label: "مُغلقة",    color: "bg-gray-100 text-muted-foreground border-border" },
  future: { label: "مستقبلية",  color: "bg-blue-100 text-status-info-foreground border-status-info-surface" },
};
