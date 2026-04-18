/**
 * Centralized Arabic label maps for the Governance module.
 * Single source of truth — import from here instead of defining inline.
 */

// ── حالات التدقيق ─────────────────────────────────────────────────
export const AUDIT_STATUS: Record<string, string> = {
  planned: "مخطط",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
};

// ── تأثير المخاطر ─────────────────────────────────────────────────
export const RISK_IMPACT: Record<string, string> = {
  negligible: "ضئيل",
  minor: "بسيط",
  moderate: "متوسط",
  major: "كبير",
  critical: "حرج",
};

// ── حالات الامتثال ────────────────────────────────────────────────
export const COMPLIANCE_STATUS: Record<string, string> = {
  compliant: "ملتزم",
  non_compliant: "غير ملتزم",
  partial: "جزئي",
  under_review: "قيد المراجعة",
};

// ── حالات السياسات ────────────────────────────────────────────────
export const POLICY_STATUS: Record<string, { label: string; color: string }> = {
  draft:        { label: "مسودة",        color: "bg-gray-100 text-gray-700 border-gray-300" },
  active:       { label: "نشطة",         color: "bg-green-100 text-green-700 border-green-300" },
  archived:     { label: "مؤرشفة",       color: "bg-blue-100 text-blue-700 border-blue-300" },
  under_review: { label: "قيد المراجعة", color: "bg-amber-100 text-amber-700 border-amber-300" },
};
