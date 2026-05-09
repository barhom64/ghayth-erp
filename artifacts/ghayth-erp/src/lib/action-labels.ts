/**
 * Canonical Arabic labels for lifecycle and audit actions.
 *
 * Until this file existed, three places had their own action-label
 * dictionaries with subtly different translations:
 *
 *   hooks/use-lifecycle-action       11 verbs (approve / reject / cancel /
 *                                     return / send / close / complete /
 *                                     terminate / renew / reopen / submit /
 *                                     archive)
 *   components/approval-actions      5 verbs (approve "قبول" instead of
 *                                     "اعتماد") + colour map
 *   pages/my-space/recent-actions    5 audit verbs (create / update /
 *                                     delete / approve / reject)
 *
 * Two of those three used a different word for `approve` — "قبول" vs
 * "اعتماد" — so the same audit row read differently on different pages.
 * Centralise the verbs here so the wording is identical everywhere and
 * adding a new transition only needs one edit.
 */

/** Verb forms used in action buttons and badges ("اعتماد", "رفض"). */
const ACTION_VERB: Record<string, string> = {
  // Lifecycle transitions
  approve: "اعتماد",
  reject: "رفض",
  cancel: "إلغاء",
  return: "إرجاع",
  send: "إرسال",
  close: "إقفال",
  complete: "إكمال",
  terminate: "إنهاء",
  renew: "تجديد",
  reopen: "إعادة فتح",
  submit: "تقديم",
  archive: "أرشفة",
  refer: "إحالة",
  escalate: "تصعيد",
  // Audit-log verbs
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  view: "عرض",
  export: "تصدير",
};

/**
 * Verb form ("اعتماد"). Falls back to the raw key so a typo surfaces
 * as the slug instead of disappearing silently.
 */
export function actionLabel(action: string | null | undefined): string {
  if (!action) return "";
  return ACTION_VERB[action] ?? action;
}

/**
 * Past-tense phrase ("تم اعتماد") for success toasts.
 */
export function actionLabelPast(action: string | null | undefined): string {
  const verb = actionLabel(action);
  return verb ? `تم ${verb}` : "";
}

/**
 * Tailwind-friendly tone for each verb — used by audit-log lists and
 * approval timelines that colour each entry. Fall back to gray when
 * the verb isn't catalogued.
 */
const ACTION_TONE: Record<string, string> = {
  approve: "text-green-600",
  reject: "text-red-600",
  return: "text-orange-600",
  refer: "text-indigo-600",
  escalate: "text-purple-600",
  cancel: "text-gray-500",
  terminate: "text-rose-600",
  create: "text-blue-600",
  update: "text-amber-600",
  delete: "text-red-600",
  archive: "text-slate-500",
};

export function actionTone(action: string | null | undefined): string {
  if (!action) return "text-gray-600";
  return ACTION_TONE[action] ?? "text-gray-600";
}
