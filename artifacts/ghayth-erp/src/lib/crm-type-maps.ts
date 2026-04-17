/**
 * Centralized Arabic label maps for the CRM module.
 * Single source of truth -- import from here instead of defining inline.
 */

// -- أنواع الأنشطة ----------------------------------------------------------
export const ACTIVITY_TYPES: Record<string, string> = {
  call: "مكالمة",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة",
};

// -- حالات الأنشطة ----------------------------------------------------------
export const ACTIVITY_STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: "مكتمل", color: "bg-green-100 text-green-700 border-green-300" },
  scheduled: { label: "مجدول", color: "bg-blue-100 text-blue-700 border-blue-300" },
};
