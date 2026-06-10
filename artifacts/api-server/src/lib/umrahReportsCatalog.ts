// ─────────────────────────────────────────────────────────────────────────────
// Umrah Reports Catalog — §11 of #1870
//
// The Charter lists 17 mandatory operational reports. Today many of
// them exist as separate routes scattered across umrah-entities.ts,
// some are partials of bigger pages, and a handful are missing.
//
// This catalog is the single source of truth: which reports exist,
// where they live, what category they belong to, and what's their
// readiness ("available" / "partial" / "stub"). The /umrah/reports
// hub renders the list with status badges + a filter, so an
// operator browsing reports sees what's ready vs what's coming.
//
// When a stub gets implemented in a follow-up, the entry's status
// flips to "available" (or "partial") and the FE picks it up
// automatically — no FE change needed per report.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportCategory =
  | "operational"
  | "finance"
  | "agents"
  | "groups"
  | "compliance"
  | "import"
  | "transport"
  | "commission";

export type ReportStatus =
  | "available"   // fully implemented, drill-through works
  | "partial"     // page exists but lacks some columns/filters/exports
  | "stub";       // endpoint TODO — entry is here so operators know it's planned

export interface ReportDefinition {
  /** Stable id; used in URLs + as a dedupe key. */
  id: string;
  /** Operator-facing Arabic title. */
  title: string;
  /** Single-line Arabic description — what the report answers. */
  description: string;
  category: ReportCategory;
  status: ReportStatus;
  /**
   * Frontend route (`/umrah/reports/...`) for the operator. For
   * stubs, points at a placeholder describing the planned scope so
   * the FE can render the same hub card without 404'ing on click.
   */
  route: string;
  /** Optional API endpoint backing the report — useful for E2E checks. */
  apiPath?: string;
}

/**
 * The 17 reports from §11 of #1870, with current readiness.
 * Status MUST stay in sync with what's actually wired — the smoke
 * test asserts every available entry has its apiPath. Use the
 * grep-friendly id strings when adding new wiring.
 */
export const UMRAH_REPORTS_CATALOG: ReportDefinition[] = [
  // ── Operational ────────────────────────────────────────────────────────
  {
    id: "season",
    title: "تقرير الموسم",
    description: "إحصائيات الموسم: المعتمرون / المجموعات / الفواتير / الالتزامات.",
    category: "operational",
    status: "available",
    route: "/umrah/reports/season-portfolio",
    apiPath: "/umrah/reports/season-portfolio",
  },
  {
    id: "pilgrim_movements",
    title: "تقرير المعتمرين حسب الحالة",
    description: "تجميع المعتمرين حسب الحالة (وصل / غادر / متجاوز / مخالف).",
    category: "operational",
    status: "available",
    route: "/umrah/reports/pilgrim-movements",
    apiPath: "/umrah/reports/pilgrim-movements",
  },
  {
    id: "daily_runsheet",
    title: "تقرير الوصول والمغادرة (التقويم اليومي)",
    description: "كشف اليوم: من يصل، من يغادر، من متأخر.",
    category: "operational",
    status: "available",
    route: "/umrah/daily-runsheet",
    apiPath: "/umrah/reports/daily-runsheet",
  },
  // ── Agents / Groups ────────────────────────────────────────────────────
  {
    id: "agent_report",
    title: "تقرير الوكيل",
    description: "كل وكيل في صف: مفوتر، مسدد، رصيد، عدد معتمرين.",
    category: "agents",
    status: "available",
    route: "/umrah/reports/agent-balances",
    apiPath: "/umrah/reports/agent-balances",
  },
  {
    id: "subagent_report",
    title: "تقرير الوكيل الفرعي (المكتب)",
    description: "كل مكتب في صف: مفوتر، مسدد، رصيد، عدد معتمرين.",
    category: "agents",
    status: "available",
    route: "/umrah/reports/subagent-balances",
    apiPath: "/umrah/reports/subagent-balances",
  },
  {
    id: "group_report",
    title: "تقرير المجموعة",
    description: "كل مجموعة: تاريخ، عدد، حالة المجموعة، الفواتير، الالتزامات.",
    category: "groups",
    status: "available",
    route: "/umrah/reports/group-portfolio",
    apiPath: "/umrah/reports/group-portfolio",
  },
  {
    id: "group_profitability",
    title: "تقرير ربحية المجموعة",
    description: "الإيراد × التكلفة × صافي الربح، بإمكانية الترتيب حسب الهامش.",
    category: "groups",
    status: "available",
    route: "/umrah/reports/group-profitability",
    apiPath: "/umrah/reports/profitability",
  },
  {
    id: "agent_profitability",
    title: "تقرير ربحية الوكيل",
    description: "كل وكيل: الإيراد × التكلفة × صافي الربح × العمولة.",
    category: "agents",
    status: "available",
    route: "/umrah/reports/agent-profitability",
    apiPath: "/umrah/reports/profitability",
  },
  // ── Compliance ─────────────────────────────────────────────────────────
  {
    id: "compliance_overview",
    title: "تقرير رقابي: إجراءات تحتاج تدخل",
    description: "ملخص الامتثال: مستثنون، تأشيرات تنتهي، متأخرون، غرامات غير مسددة.",
    category: "compliance",
    status: "available",
    route: "/umrah/compliance",
    apiPath: "/umrah/reports/compliance",
  },
  {
    id: "exempt_pilgrims",
    title: "تقرير المستثنين من مسح التأخّر",
    description: "كل معتمر مستثنى مع المُصرِّح والسبب.",
    category: "compliance",
    status: "available",
    route: "/umrah/exempt-pilgrims",
    apiPath: "/umrah/reports/exempt-pilgrims",
  },
  {
    id: "violations_report",
    title: "تقرير التخلف والمخالفات",
    description: "المخالفات المسجَّلة مع الوكيل، المعتمر، الغرامة.",
    category: "compliance",
    status: "available",
    route: "/umrah/reports/violations-summary",
    apiPath: "/umrah/reports/violations-summary",
  },
  // ── Import / Data Quality ──────────────────────────────────────────────
  {
    id: "import_errors",
    title: "تقرير الاستيراد والأخطاء",
    description: "تاريخ دفعات الاستيراد + الصفوف المرفوضة + التحذيرات.",
    category: "import",
    status: "available",
    route: "/umrah/reports/import-errors-summary",
    apiPath: "/umrah/reports/import-errors-summary",
  },
  {
    id: "unlinked_rows",
    title: "تقرير الربط غير المكتمل",
    description: "كل معتمر يتيم (بلا وكيل/مجموعة/مكتب) — مُحدَّث لحظياً.",
    category: "import",
    status: "available",
    route: "/umrah/orphan-pilgrims",
    apiPath: "/umrah/orphan-pilgrims",
  },
  // ── Transport ──────────────────────────────────────────────────────────
  {
    id: "umrah_transport",
    title: "تقرير النقل المرتبط بالعمرة",
    description: "كل طلب نقل عبر العقد الخدمي + حالة التنفيذ من Fleet.",
    category: "transport",
    status: "available",
    route: "/umrah/reports/transport-requests",
    apiPath: "/umrah/reports/umrah-transport",
  },
  // ── Finance ────────────────────────────────────────────────────────────
  {
    id: "umrah_costs",
    title: "تقرير تكاليف العمرة",
    description: "توزيع التكاليف على الموسم/المجموعة/الوكيل/مركز التكلفة.",
    category: "finance",
    status: "available",
    route: "/umrah/reports/umrah-costs",
    apiPath: "/umrah/reports/umrah-costs",
  },
  {
    id: "nusk_invoices_report",
    title: "تقرير فواتير نسك",
    description: "فواتير نسك + حالة قيد AP + الاستردادات + الأرصدة.",
    category: "finance",
    status: "available",
    route: "/umrah/reports/nusk-invoices-summary",
    apiPath: "/umrah/reports/nusk-invoices-summary",
  },
  {
    id: "sales_invoices_report",
    title: "تقرير فواتير العملاء والوكلاء",
    description: "فواتير البيع + المدفوع + الرصيد + التقادم.",
    category: "finance",
    status: "available",
    route: "/umrah/reports/sales-invoices-summary",
    apiPath: "/umrah/reports/sales-invoices-summary",
  },
  // ── Commission ─────────────────────────────────────────────────────────
  {
    id: "commission_report",
    title: "تقرير العمولات",
    description: "العمولات المحتسبة لكل خطة × موظف × موسم مع حالة الترحيل.",
    category: "commission",
    status: "partial",
    route: "/umrah/commission-calculations",
  },
];

export const REPORT_CATEGORY_LABELS_AR: Record<ReportCategory, string> = {
  operational: "تشغيلي",
  finance:     "مالي",
  agents:      "الوكلاء",
  groups:      "المجموعات",
  compliance:  "الامتثال",
  import:      "الاستيراد",
  transport:   "النقل",
  commission:  "العمولات",
};

export const REPORT_STATUS_LABELS_AR: Record<ReportStatus, string> = {
  available: "متاح",
  partial:   "جزئي",
  stub:      "قادم",
};
