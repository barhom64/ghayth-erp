export interface PredefinedRole {
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

export interface UserRoleRow {
  id: number;
  userId: number;
  roleKey: string;
  label: string;
  modules: string[];
  level: number;
}

export const MODULE_LABELS: Record<string, string> = {
  home: "الرئيسية", hr: "الموارد البشرية", finance: "المالية", fleet: "الأسطول",
  property: "الأملاك", operations: "العمليات", warehouse: "المستودعات", governance: "الحوكمة",
  bi: "ذكاء الأعمال", requests: "الطلبات", documents: "المستندات", reports: "التقارير",
  admin: "مدير النظام", comms: "التواصل", legal: "القانونية", crm: "المبيعات",
  marketing: "التسويق", store: "المتجر", support: "الدعم", settings: "الإعدادات",
};

export const ROLE_OPTIONS = [
  { value: "owner", label: "مالك النظام" },
  { value: "general_manager", label: "مدير عام" },
  { value: "hr_manager", label: "مدير الموارد البشرية" },
  { value: "finance_manager", label: "مدير المالية" },
  { value: "fleet_manager", label: "مدير الأسطول" },
  { value: "property_manager", label: "مدير الأملاك" },
  { value: "projects_manager", label: "مدير المشاريع" },
  { value: "warehouse_manager", label: "مدير المستودعات" },
  { value: "legal_manager", label: "مدير الشؤون القانونية" },
  { value: "support_manager", label: "مدير الدعم الفني" },
  { value: "crm_manager", label: "مدير المبيعات" },
  { value: "bi_manager", label: "مدير ذكاء الأعمال" },
  { value: "branch_manager", label: "مدير فرع" },
  { value: "employee", label: "موظف" },
];

export const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  "status.change": "تغيير حالة",
  approve: "موافقة",
  reject: "رفض",
};
