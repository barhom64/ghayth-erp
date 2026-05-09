/**
 * featureCatalog — every authorisable surface in the system.
 *
 * The catalog is the spine of layered RBAC v2. Every endpoint declares
 * the feature it serves and the action it performs; the authorize()
 * middleware then checks the caller's role-grants against this catalog.
 *
 * The shape mirrors `feature_catalog` rows in the database — at boot,
 * we sync this constant into the table so the admin UI can render the
 * full tree without a code change. Adding a new feature here + running
 * the server is all it takes to make it manageable from /admin/roles.
 *
 * Conventions:
 *   - Keys use dot notation: `module.feature[.subfeature]`.
 *   - Self-service features carry `selfService: true` — every employee
 *     gets them by default; admins cannot revoke them. This is the
 *     "employee-first" guarantee the user asked for.
 *   - `sensitiveFields` declares fields that role_field_policies can
 *     mask/hide; the field-policy editor in admin only shows these.
 *   - `approvableActions` declares which actions can have an
 *     approval_limit attached (e.g. invoices.approve has a limit;
 *     invoices.list does not).
 */

export type Action =
  | "view" | "list" | "create" | "update" | "delete"
  | "approve" | "reject" | "cancel" | "export" | "print"
  | "share" | "submit" | "reopen" | "close";

export type Scope =
  | "self"
  | "team"            // direct reports
  | "department"      // own department
  | "department_tree" // own department + children
  | "branch"          // own branch
  | "branches"        // explicit branch list
  | "company"         // own company
  | "multi_company"   // explicit company list
  | "all";            // platform-wide (owner only)

export interface FeatureDefinition {
  key: string;
  parentKey?: string;
  moduleKey: string;
  labelAr: string;
  labelEn?: string;
  descriptionAr?: string;
  icon?: string;
  availableActions: Action[];
  availableScopes: Scope[];
  sensitiveFields?: string[];
  approvableActions?: Action[];
  selfService?: boolean;
  systemCritical?: boolean;
  displayOrder?: number;
}

const ALL_ACTIONS: Action[] = ["view", "list", "create", "update", "delete", "approve", "reject", "cancel", "export"];
const READ_ACTIONS: Action[] = ["view", "list", "export"];
const ALL_SCOPES: Scope[] = ["self", "team", "department", "department_tree", "branch", "branches", "company", "multi_company", "all"];

export const FEATURE_CATALOG: FeatureDefinition[] = [
  // ═══════════════════════════════════════════════════════════════
  // HR
  // ═══════════════════════════════════════════════════════════════
  { key: "hr", moduleKey: "hr", labelAr: "الموارد البشرية", icon: "Users", availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 100 },

  { key: "hr.employees", parentKey: "hr", moduleKey: "hr", labelAr: "ملفات الموظفين", icon: "User",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["salary", "bankAccount", "iban", "nationalId", "iqamaNumber", "passportNumber", "dateOfBirth", "phone", "email"],
    displayOrder: 110 },

  { key: "hr.employees.self", parentKey: "hr.employees", moduleKey: "hr", labelAr: "ملفي الشخصي", icon: "UserCircle",
    availableActions: ["view", "update", "export"], availableScopes: ["self"],
    selfService: true, displayOrder: 111 },

  { key: "hr.attendance", parentKey: "hr", moduleKey: "hr", labelAr: "الحضور والانصراف",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 120 },

  { key: "hr.attendance.checkin", parentKey: "hr.attendance", moduleKey: "hr", labelAr: "تسجيل حضوري",
    availableActions: ["view", "create"], availableScopes: ["self"],
    selfService: true, displayOrder: 121 },

  { key: "hr.leaves", parentKey: "hr", moduleKey: "hr", labelAr: "الإجازات",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    approvableActions: ["approve"], displayOrder: 130 },

  { key: "hr.leaves.my", parentKey: "hr.leaves", moduleKey: "hr", labelAr: "إجازاتي",
    availableActions: ["view", "list", "create", "cancel"], availableScopes: ["self"],
    selfService: true, displayOrder: 131 },

  { key: "hr.payroll", parentKey: "hr", moduleKey: "hr", labelAr: "الرواتب",
    availableActions: ALL_ACTIONS, availableScopes: ["department", "branch", "company"],
    sensitiveFields: ["amount", "deductions", "bonuses", "netPay", "bankAccount"],
    approvableActions: ["approve"], displayOrder: 140 },

  { key: "hr.payroll.my_payslip", parentKey: "hr.payroll", moduleKey: "hr", labelAr: "كشف راتبي",
    availableActions: ["view", "list", "export"], availableScopes: ["self"],
    selfService: true, displayOrder: 141 },

  { key: "hr.payroll.runs", parentKey: "hr.payroll", moduleKey: "hr", labelAr: "تشغيلات الرواتب",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 142 },

  { key: "hr.discipline", parentKey: "hr", moduleKey: "hr", labelAr: "الانضباط الوظيفي",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    approvableActions: ["approve"], displayOrder: 150 },

  { key: "hr.recruitment", parentKey: "hr", moduleKey: "hr", labelAr: "التوظيف",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 160 },

  { key: "hr.training", parentKey: "hr", moduleKey: "hr", labelAr: "التدريب",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 170 },

  { key: "hr.performance", parentKey: "hr", moduleKey: "hr", labelAr: "الأداء والتقييمات",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["rating", "comments", "managerNotes"], displayOrder: 180 },

  { key: "hr.performance.self", parentKey: "hr.performance", moduleKey: "hr", labelAr: "تقييمي",
    availableActions: ["view", "list"], availableScopes: ["self"],
    selfService: true, displayOrder: 181 },

  { key: "hr.organization", parentKey: "hr", moduleKey: "hr", labelAr: "الهيكل التنظيمي",
    availableActions: ALL_ACTIONS, availableScopes: ["company"], displayOrder: 190 },

  { key: "hr.violations", parentKey: "hr", moduleKey: "hr", labelAr: "المخالفات",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 195 },

  // HR sub-features added in PR #200 — granular replacements for the
  // bulk-migrated `feature: "hr"` calls. The catalog drives the
  // admin UI, so each new entry shows up as its own row in the role
  // editor with its own actions/scopes/sensitive fields.
  { key: "hr.loans", parentKey: "hr", moduleKey: "hr", labelAr: "السلف والقروض",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["amount", "monthlyDeduction", "remainingAmount"],
    approvableActions: ["approve"], displayOrder: 196 },
  { key: "hr.loans.my", parentKey: "hr.loans", moduleKey: "hr", labelAr: "سلفي",
    availableActions: ["view", "list", "create", "cancel"], availableScopes: ["self"],
    selfService: true, displayOrder: 197 },

  { key: "hr.overtime", parentKey: "hr", moduleKey: "hr", labelAr: "العمل الإضافي",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["totalAmount"],
    approvableActions: ["approve"], displayOrder: 198 },
  { key: "hr.overtime.my", parentKey: "hr.overtime", moduleKey: "hr", labelAr: "ساعاتي الإضافية",
    availableActions: ["view", "list", "create"], availableScopes: ["self"],
    selfService: true, displayOrder: 199 },

  { key: "hr.contracts", parentKey: "hr", moduleKey: "hr", labelAr: "عقود الموظفين",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["salary", "allowances", "bonuses"], displayOrder: 200 },

  { key: "hr.exit", parentKey: "hr", moduleKey: "hr", labelAr: "إنهاء الخدمة ومكافأة نهاية الخدمة",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    sensitiveFields: ["finalSettlement", "endOfServiceBenefit"],
    approvableActions: ["approve"], systemCritical: true, displayOrder: 201 },

  // ═══════════════════════════════════════════════════════════════
  // Finance
  // ═══════════════════════════════════════════════════════════════
  { key: "finance", moduleKey: "finance", labelAr: "المالية", icon: "Banknote",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 200 },

  { key: "finance.invoices", parentKey: "finance", moduleKey: "finance", labelAr: "الفواتير",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "branches", "company"],
    approvableActions: ["approve"],
    sensitiveFields: ["amount", "vatAmount", "discount"], displayOrder: 210 },

  { key: "finance.purchase", parentKey: "finance", moduleKey: "finance", labelAr: "المشتريات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 220 },

  { key: "finance.vendors", parentKey: "finance", moduleKey: "finance", labelAr: "الموردون",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    sensitiveFields: ["bankAccount", "taxNumber"], displayOrder: 225 },

  { key: "finance.journal", parentKey: "finance", moduleKey: "finance", labelAr: "القيود المحاسبية",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], systemCritical: true, displayOrder: 230 },

  { key: "finance.accounts", parentKey: "finance", moduleKey: "finance", labelAr: "دليل الحسابات والأستاذ",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    systemCritical: true, displayOrder: 240 },

  { key: "finance.budget", parentKey: "finance", moduleKey: "finance", labelAr: "الميزانية",
    availableActions: ALL_ACTIONS, availableScopes: ["department", "branch", "company"],
    approvableActions: ["approve"], displayOrder: 250 },

  { key: "finance.collection", parentKey: "finance", moduleKey: "finance", labelAr: "التحصيل",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 260 },

  { key: "finance.custodies", parentKey: "finance", moduleKey: "finance", labelAr: "العهد",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "department", "branch", "company"],
    approvableActions: ["approve"], displayOrder: 270 },

  { key: "finance.custodies.my", parentKey: "finance.custodies", moduleKey: "finance", labelAr: "عهدي",
    availableActions: ["view", "list", "create"], availableScopes: ["self"],
    selfService: true, displayOrder: 271 },

  { key: "finance.zatca", parentKey: "finance", moduleKey: "finance", labelAr: "ZATCA / الفوترة الإلكترونية",
    availableActions: ALL_ACTIONS, availableScopes: ["company"], displayOrder: 280 },

  { key: "finance.reports", parentKey: "finance", moduleKey: "finance", labelAr: "التقارير المالية",
    availableActions: READ_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 290 },

  // Finance sub-features added in PR #202 — granular replacements for
  // the bulk-migrated `feature: "finance"` calls across the split
  // routers.
  { key: "finance.recurring", parentKey: "finance", moduleKey: "finance", labelAr: "القيود المتكررة",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    sensitiveFields: ["amount"], systemCritical: true, displayOrder: 282 },
  { key: "finance.cost_centers", parentKey: "finance", moduleKey: "finance", labelAr: "مراكز التكلفة",
    availableActions: ALL_ACTIONS, availableScopes: ["company"], displayOrder: 284 },
  { key: "finance.algorithms", parentKey: "finance", moduleKey: "finance", labelAr: "المحركات المالية (الإهلاك / الأعمار / المطابقة)",
    availableActions: [...READ_ACTIONS, "create"], availableScopes: ["company"],
    systemCritical: true, displayOrder: 286 },
  { key: "finance.hardening", parentKey: "finance", moduleKey: "finance", labelAr: "تشديد الإغلاق المالي",
    availableActions: [...READ_ACTIONS, "create", "approve"], availableScopes: ["company"],
    approvableActions: ["approve"], systemCritical: true, displayOrder: 288 },
  { key: "finance.accounting_engine", parentKey: "finance", moduleKey: "finance", labelAr: "محرك المحاسبة (الترحيل التلقائي)",
    availableActions: READ_ACTIONS, availableScopes: ["company"],
    systemCritical: true, displayOrder: 289 },

  // ═══════════════════════════════════════════════════════════════
  // Fleet / Warehouse / Properties / Projects / Store
  // ═══════════════════════════════════════════════════════════════
  { key: "fleet", moduleKey: "fleet", labelAr: "الأسطول", icon: "Truck",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 300 },
  { key: "fleet.vehicles", parentKey: "fleet", moduleKey: "fleet", labelAr: "المركبات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 310 },
  { key: "fleet.trips", parentKey: "fleet", moduleKey: "fleet", labelAr: "الرحلات",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "branch", "company"], displayOrder: 320 },
  { key: "fleet.trips.my", parentKey: "fleet.trips", moduleKey: "fleet", labelAr: "رحلاتي",
    availableActions: ["view", "list", "create"], availableScopes: ["self"],
    selfService: true, displayOrder: 321 },
  { key: "fleet.maintenance", parentKey: "fleet", moduleKey: "fleet", labelAr: "الصيانة",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 330 },

  { key: "warehouse", moduleKey: "warehouse", labelAr: "المستودع", icon: "Boxes",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 400 },
  { key: "warehouse.inventory", parentKey: "warehouse", moduleKey: "warehouse", labelAr: "المخزون",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 410 },
  { key: "warehouse.transfers", parentKey: "warehouse", moduleKey: "warehouse", labelAr: "التحويلات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "branches", "company"],
    approvableActions: ["approve"], displayOrder: 420 },

  { key: "properties", moduleKey: "property", labelAr: "العقارات", icon: "Building",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 500 },
  { key: "properties.units", parentKey: "properties", moduleKey: "property", labelAr: "الوحدات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 510 },
  { key: "properties.tenants", parentKey: "properties", moduleKey: "property", labelAr: "المستأجرون",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    sensitiveFields: ["nationalId", "phone"], displayOrder: 520 },
  { key: "properties.contracts", parentKey: "properties", moduleKey: "property", labelAr: "العقود",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 530 },
  { key: "properties.payments", parentKey: "properties", moduleKey: "property", labelAr: "المدفوعات والإيجارات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 540 },

  { key: "properties.buildings", parentKey: "properties", moduleKey: "property", labelAr: "المباني والعقارات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"], displayOrder: 545 },
  { key: "properties.maintenance", parentKey: "properties", moduleKey: "property", labelAr: "صيانة العقارات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 550 },
  { key: "properties.owners", parentKey: "properties", moduleKey: "property", labelAr: "ملاك العقارات",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    sensitiveFields: ["nationalId", "phone", "iban"], displayOrder: 555 },

  { key: "projects", moduleKey: "operations", labelAr: "المشاريع", icon: "FolderKanban",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 600 },
  { key: "projects.list", parentKey: "projects", moduleKey: "operations", labelAr: "قائمة المشاريع",
    availableActions: ALL_ACTIONS, availableScopes: ["team", "department", "branch", "company"], displayOrder: 610 },
  { key: "projects.tasks", parentKey: "projects", moduleKey: "operations", labelAr: "المهام",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "department", "branch", "company"], displayOrder: 620 },
  { key: "projects.tasks.my", parentKey: "projects.tasks", moduleKey: "operations", labelAr: "مهامي",
    availableActions: ["view", "list", "update"], availableScopes: ["self"],
    selfService: true, displayOrder: 621 },

  { key: "store", moduleKey: "store", labelAr: "نقطة البيع", icon: "Store",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 700 },

  // ═══════════════════════════════════════════════════════════════
  // CRM / Marketing / Support / Legal
  // ═══════════════════════════════════════════════════════════════
  { key: "crm", moduleKey: "crm", labelAr: "العملاء (CRM)", icon: "UserPlus",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 800 },
  { key: "crm.clients", parentKey: "crm", moduleKey: "crm", labelAr: "العملاء",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "branch", "company"],
    sensitiveFields: ["phone", "email", "creditLimit"], displayOrder: 810 },
  { key: "crm.opportunities", parentKey: "crm", moduleKey: "crm", labelAr: "الصفقات والفرص",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "branch", "company"],
    approvableActions: ["approve"], displayOrder: 820 },
  { key: "crm.leads", parentKey: "crm", moduleKey: "crm", labelAr: "العملاء المحتملون",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "branch", "company"], displayOrder: 830 },

  { key: "marketing", moduleKey: "marketing", labelAr: "التسويق", icon: "Megaphone",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 900 },

  { key: "support", moduleKey: "support", labelAr: "الدعم", icon: "Headphones",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 1000 },
  { key: "support.tickets", parentKey: "support", moduleKey: "support", labelAr: "التذاكر",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "branch", "company"], displayOrder: 1010 },

  { key: "legal", moduleKey: "legal", labelAr: "الشؤون القانونية", icon: "Scale",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 1100 },
  { key: "legal.cases", parentKey: "legal", moduleKey: "legal", labelAr: "القضايا",
    availableActions: ALL_ACTIONS, availableScopes: ["company"],
    sensitiveFields: ["confidentialNotes"], displayOrder: 1110 },
  { key: "legal.contracts", parentKey: "legal", moduleKey: "legal", labelAr: "العقود القانونية",
    availableActions: ALL_ACTIONS, availableScopes: ["branch", "company"],
    approvableActions: ["approve"], displayOrder: 1120 },

  // ═══════════════════════════════════════════════════════════════
  // Documents / Communications / Tasks / Requests
  // ═══════════════════════════════════════════════════════════════
  { key: "documents", moduleKey: "documents", labelAr: "المستندات", icon: "FileText",
    availableActions: [...ALL_ACTIONS, "share"], availableScopes: ALL_SCOPES,
    sensitiveFields: ["fileUrl"], displayOrder: 1200 },
  { key: "documents.my", parentKey: "documents", moduleKey: "documents", labelAr: "مستنداتي",
    availableActions: ["view", "list", "create", "update", "delete", "export"], availableScopes: ["self"],
    selfService: true, displayOrder: 1210 },

  { key: "communications", moduleKey: "comms", labelAr: "المراسلات", icon: "Mail",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 1300 },

  { key: "tasks", moduleKey: "operations", labelAr: "المهام (عام)", icon: "ListTodo",
    availableActions: ALL_ACTIONS, availableScopes: ["self", "team", "department", "branch"],
    selfService: false, displayOrder: 1400 },
  { key: "tasks.my", parentKey: "tasks", moduleKey: "operations", labelAr: "مهامي المسندة",
    availableActions: ["view", "list", "update"], availableScopes: ["self"],
    selfService: true, displayOrder: 1401 },

  { key: "requests", moduleKey: "requests", labelAr: "الطلبات", icon: "FileQuestion",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES,
    approvableActions: ["approve"], displayOrder: 1500 },
  { key: "requests.my", parentKey: "requests", moduleKey: "requests", labelAr: "طلباتي",
    availableActions: ["view", "list", "create", "cancel"], availableScopes: ["self"],
    selfService: true, displayOrder: 1501 },

  // ═══════════════════════════════════════════════════════════════
  // Governance / BI / Admin / Settings
  // ═══════════════════════════════════════════════════════════════
  { key: "governance", moduleKey: "governance", labelAr: "الحوكمة والسياسات", icon: "Shield",
    availableActions: ALL_ACTIONS, availableScopes: ["company"], displayOrder: 1600 },

  { key: "bi", moduleKey: "bi", labelAr: "تحليلات الأعمال (BI)", icon: "BarChart3",
    availableActions: [...READ_ACTIONS, "create", "update"], availableScopes: ["branch", "company"],
    displayOrder: 1700 },

  { key: "reports", moduleKey: "reports", labelAr: "التقارير", icon: "FileBarChart",
    availableActions: READ_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 1800 },

  { key: "admin", moduleKey: "admin", labelAr: "إدارة النظام", icon: "Settings2",
    availableActions: ALL_ACTIONS, availableScopes: ["company", "all"],
    systemCritical: true, displayOrder: 1900 },
  { key: "admin.users", parentKey: "admin", moduleKey: "admin", labelAr: "المستخدمون",
    availableActions: ALL_ACTIONS, availableScopes: ["company"],
    sensitiveFields: ["email", "phone"], systemCritical: true, displayOrder: 1910 },
  { key: "admin.roles", parentKey: "admin", moduleKey: "admin", labelAr: "الأدوار والصلاحيات",
    availableActions: ALL_ACTIONS, availableScopes: ["company"],
    systemCritical: true, displayOrder: 1920 },
  { key: "admin.audit", parentKey: "admin", moduleKey: "admin", labelAr: "سجلات التدقيق",
    availableActions: READ_ACTIONS, availableScopes: ["company"], displayOrder: 1930 },
  { key: "admin.pdpl", parentKey: "admin", moduleKey: "admin", labelAr: "حماية البيانات الشخصية",
    availableActions: ALL_ACTIONS, availableScopes: ["company"],
    systemCritical: true, displayOrder: 1940 },

  { key: "settings", moduleKey: "settings", labelAr: "الإعدادات", icon: "Cog",
    availableActions: [...READ_ACTIONS, "update"], availableScopes: ["branch", "company"],
    systemCritical: true, displayOrder: 2000 },

  // ═══════════════════════════════════════════════════════════════
  // Specialised: Umrah
  // ═══════════════════════════════════════════════════════════════
  { key: "umrah", moduleKey: "umrah", labelAr: "العمرة", icon: "Moon",
    availableActions: ALL_ACTIONS, availableScopes: ALL_SCOPES, displayOrder: 2100 },

  // ═══════════════════════════════════════════════════════════════
  // Self-service hub (employee-first guarantee)
  // ═══════════════════════════════════════════════════════════════
  { key: "my_space", moduleKey: "my-space", labelAr: "مساحتي", icon: "Home",
    availableActions: ["view"], availableScopes: ["self"],
    selfService: true, displayOrder: 50 },

  { key: "notifications", moduleKey: "notifications", labelAr: "الإشعارات", icon: "Bell",
    availableActions: ["view", "list", "update", "delete"], availableScopes: ["self"],
    selfService: true, displayOrder: 60 },

  { key: "calendar.my", moduleKey: "calendar", labelAr: "تقويمي", icon: "Calendar",
    availableActions: ["view", "list", "create", "update", "delete"], availableScopes: ["self"],
    selfService: true, displayOrder: 70 },
];

/**
 * Self-service feature keys — these are granted to every employee
 * automatically and CANNOT be revoked. They form the inviolable
 * "employee floor" — no admin can lock an employee out of their own
 * data, requests, or check-in.
 */
export const SELF_SERVICE_FEATURES: ReadonlyArray<string> = FEATURE_CATALOG
  .filter((f) => f.selfService)
  .map((f) => f.key);

/**
 * Lookup table by feature key for O(1) access in the engine hot path.
 */
export const FEATURE_INDEX: ReadonlyMap<string, FeatureDefinition> = new Map(
  FEATURE_CATALOG.map((f) => [f.key, f])
);

export function getFeature(key: string): FeatureDefinition | undefined {
  return FEATURE_INDEX.get(key);
}

export function isValidScopeFor(featureKey: string, scope: Scope): boolean {
  const f = FEATURE_INDEX.get(featureKey);
  return !!f && f.availableScopes.includes(scope);
}

export function isValidActionFor(featureKey: string, action: Action): boolean {
  const f = FEATURE_INDEX.get(featureKey);
  return !!f && f.availableActions.includes(action);
}
