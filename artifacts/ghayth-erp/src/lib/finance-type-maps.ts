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
export const ACCOUNT_TYPES: Record<string, string> = {
  asset: "أصول",
  liability: "التزامات",
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
