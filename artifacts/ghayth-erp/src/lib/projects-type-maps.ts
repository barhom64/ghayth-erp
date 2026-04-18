/**
 * Centralized Arabic label maps for the Projects module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── أولوية المشروع ────────────────────────────────────────────────
export const PROJECT_PRIORITY: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

// ── حالات المهام ──────────────────────────────────────────────────
export const TASK_STATUS: Record<string, string> = {
  todo: "للتنفيذ",
  in_progress: "قيد التنفيذ",
  review: "مراجعة",
  done: "مكتمل",
  blocked: "متوقف",
};

// ── مستويات المخاطر ───────────────────────────────────────────────
export const RISK_LEVEL: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "عالي",
  critical: "حرج",
};

// ── حالات المراحل الرئيسية ────────────────────────────────────────
export const MILESTONE_STATUS: Record<string, { label: string; color: string }> = {
  pending:     { label: "معلق",        color: "bg-amber-100 text-amber-700 border-amber-300" },
  in_progress: { label: "قيد التنفيذ", color: "bg-blue-100 text-blue-700 border-blue-300" },
  completed:   { label: "مكتمل",       color: "bg-green-100 text-green-700 border-green-300" },
  delayed:     { label: "متأخر",       color: "bg-red-100 text-red-700 border-red-300" },
};
