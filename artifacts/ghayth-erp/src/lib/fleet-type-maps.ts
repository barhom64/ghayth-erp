/**
 * Centralized Arabic label maps for the Fleet module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── أنواع الصيانة ──────────────────────────────────────────────────
export const MAINTENANCE_TYPES: Record<string, string> = {
  preventive: "وقائية",
  corrective: "تصحيحية",
  emergency: "طارئة",
  scheduled: "مجدولة",
  inspection: "فحص دوري",
};

// ── أنواع الوقود ────────────────────────────────────────────────────
export const FUEL_TYPES: Record<string, string> = {
  gasoline_91: "بنزين 91",
  gasoline_95: "بنزين 95",
  diesel: "ديزل",
  electric: "كهربائي",
  hybrid: "هجين",
};

// ── أنواع الرحلات ──────────────────────────────────────────────────
export const TRIP_TYPES: Record<string, string> = {
  delivery: "توصيل",
  pickup: "استلام",
  transfer: "نقل",
  inspection: "تفتيش",
  client_visit: "زيارة عميل",
  other: "أخرى",
};

// ── أنواع التأمين ──────────────────────────────────────────────────
export const INSURANCE_TYPES: Record<string, string> = {
  comprehensive: "شامل",
  third_party: "ضد الغير",
  extended: "موسع",
};

// ── أنواع المخالفات المرورية ────────────────────────────────────────
export const TRAFFIC_VIOLATION_TYPES: Record<string, string> = {
  speeding: "تجاوز السرعة",
  parking: "مخالفة وقوف",
  signal: "قطع إشارة",
  lane: "مخالفة مسار",
  license: "رخصة منتهية",
  phone: "استخدام الهاتف",
  seatbelt: "عدم ربط الحزام",
  other: "أخرى",
};

// ── حالات خطط الصيانة الوقائية ──────────────────────────────────────
export const PREVENTIVE_PLAN_STATUS: Record<string, { label: string; color: string }> = {
  active:    { label: "نشطة",       color: "bg-green-100 text-green-700 border-green-300" },
  paused:    { label: "متوقفة",     color: "bg-amber-100 text-amber-700 border-amber-300" },
  completed: { label: "مكتملة",     color: "bg-blue-100 text-blue-700 border-blue-300" },
};
