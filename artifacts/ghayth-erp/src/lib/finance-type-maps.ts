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

// #1715 review — shared tax/invoice constants + the TaxCodeOption shape, which
// were copy-pasted across expenses-create / vouchers-create / invoices-create.
export const INVOICE_TYPE_CODES: { value: string; label: string }[] = [
  { value: "388", label: "فاتورة ضريبية (388)" },
  { value: "381", label: "إشعار دائن (381)" },
  { value: "383", label: "إشعار مدين (383)" },
];

export const TAX_CATEGORY_CODES: { value: string; label: string }[] = [
  { value: "S", label: "خاضع للضريبة (S)" },
  { value: "Z", label: "نسبة صفرية (Z)" },
  { value: "E", label: "معفى (E)" },
  { value: "O", label: "خارج نطاق الضريبة (O)" },
];

export interface TaxCodeOption {
  id: number;
  code: string;
  name: string;
  rate: number | string;
  taxType: "standard" | "zero" | "exempt" | "out_of_scope" | "reverse_charge";
  // expense form carries the ZATCA category; voucher doesn't — optional here.
  zatcaCategoryCode?: string | null;
  isInclusiveDefault: boolean;
  isActive: boolean;
}
