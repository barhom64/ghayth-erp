// ─────────────────────────────────────────────────────────────────────────────
// تسميات الصلاحيات بالعربية — مصدر واحد لعرض الأفعال والنطاقات في واجهة RBAC.
// يطابق ACTION_LABELS_AR / SCOPE_LABELS_AR في الخادم (lib/rbac/permissionLevels)
// حتى لا تتسرّب مفاتيح إنجليزية (view/approve/department…) إلى المستخدم. (#1413)
// ─────────────────────────────────────────────────────────────────────────────

export const ACTION_LABELS_AR: Record<string, string> = {
  view: "عرض",
  list: "عرض القائمة",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  reject: "رفض",
  cancel: "إلغاء",
  export: "تصدير",
  print: "طباعة",
  share: "مشاركة",
  submit: "رفع/تقديم",
  reopen: "إرجاع/إعادة فتح",
  close: "إغلاق",
};

export const SCOPE_LABELS_AR: Record<string, string> = {
  self: "الخاص بي فقط",
  team: "فريقي (مرؤوسيّ)",
  department: "قسمي",
  department_tree: "قسمي والأقسام التابعة",
  branch: "فرعي",
  branches: "فروع محددة",
  company: "الشركة كاملة",
  multi_company: "شركات محددة",
  all: "كل الشركات",
};

/** Arabic label for an action key, falling back to the key itself. */
export const actionLabelAr = (a: string): string => ACTION_LABELS_AR[a] ?? a;
/** Arabic label for a scope key, falling back to the key itself. */
export const scopeLabelAr = (s: string): string => SCOPE_LABELS_AR[s] ?? s;
