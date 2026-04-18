/**
 * Centralized Arabic label maps for the Warehouse module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── أنواع الحركات ──────────────────────────────────────────────────
export const MOVEMENT_TYPES: Record<string, string> = {
  inbound: "وارد",
  outbound: "صادر",
  transfer: "تحويل",
  adjustment: "تسوية",
  return: "مرتجع",
};

// ── وحدات القياس ──────────────────────────────────────────────────
export const UNIT_TYPES: Record<string, string> = {
  piece: "قطعة",
  kg: "كيلوغرام",
  liter: "لتر",
  meter: "متر",
  box: "صندوق",
  pallet: "طبلية",
};

// ── حالات التحويل بين المخازن ──────────────────────────────────────
export const STOCK_TRANSFER_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: "معلق",       color: "bg-amber-100 text-amber-700 border-amber-300" },
  in_transit: { label: "قيد النقل",  color: "bg-blue-100 text-blue-700 border-blue-300" },
  received:   { label: "مستلم",      color: "bg-green-100 text-green-700 border-green-300" },
  cancelled:  { label: "ملغى",       color: "bg-red-100 text-red-700 border-red-300" },
};
