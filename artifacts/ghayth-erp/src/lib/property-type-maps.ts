/**
 * Centralized Arabic label maps for the Property module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── أنواع العقارات ─────────────────────────────────────────────────
export const PROPERTY_TYPES: Record<string, string> = {
  residential: "سكني",
  commercial: "تجاري",
  industrial: "صناعي",
  mixed: "متعدد الاستخدام",
  land: "أرض",
};

// ── أنواع العقود ──────────────────────────────────────────────────
export const CONTRACT_TYPES: Record<string, string> = {
  lease: "إيجار",
  sale: "بيع",
  management: "إدارة",
};

// ── حالات الوحدات ─────────────────────────────────────────────────
export const UNIT_STATUS: Record<string, string> = {
  available: "متاح",
  occupied: "مشغول",
  maintenance: "صيانة",
  reserved: "محجوز",
};

// ── حالات الدفع ───────────────────────────────────────────────────
export const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "معلق",       color: "bg-amber-100 text-amber-700 border-amber-300" },
  partial:   { label: "جزئي",       color: "bg-blue-100 text-blue-700 border-blue-300" },
  paid:      { label: "مدفوع",      color: "bg-green-100 text-green-700 border-green-300" },
  overdue:   { label: "متأخر",      color: "bg-red-100 text-red-700 border-red-300" },
  cancelled: { label: "ملغى",       color: "bg-gray-100 text-gray-600 border-gray-300" },
};
