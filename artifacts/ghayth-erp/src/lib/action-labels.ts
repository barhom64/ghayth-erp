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

