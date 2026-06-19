// navigation.canonical-map.ts
//
// DERIVED navigation-governance metadata — NOT a menu.
//
// The sidebar, the /services hub and the command palette still derive
// EXCLUSIVELY from `allNavSections` in navigation.registry.ts (the single
// source of truth — governance rule #1). This file is intentionally NOT
// imported by any rendering component, so it changes ZERO user-visible
// behaviour: it is a flat lookup table, never a parallel navigation tree
// (governance rule #2 — "no alternative menu").
//
// What it IS: the machine-readable encoding of docs/ux/ARABIC_NAVIGATION_GLOSSARY.md.
// For each governed function it records the ONE official Arabic label and the
// ONE official path (rule #5), plus search-only aliases (rule #6) and the
// redirect/legacy paths that resolve to it (rule #3 — those paths are kept,
// never deleted). It is consumed by:
//   1. the navigation guards (scripts/src/check-tabs-coverage.mjs,
//      scripts/src/check-quick-actions-coverage.mjs — proposed), and
//   2. the later "safe rename" slices, as the single reviewable source that
//      maps a path to the label the registry should display.
//
// Scope of THIS slice: a seed covering the cases flagged in
// docs/ux/NAVIGATION_DUPLICATE_INVENTORY.md. It is expanded incrementally;
// it does not need to cover every route to be useful.

export interface CanonicalNavEntry {
  /** The ONE official route for this function (rule #5). */
  path: string;
  /** The ONE official Arabic label shown in the menu/tabs (rule #5). */
  canonicalLabel: string;
  /**
   * Alternative names — SEARCH ONLY. Surfaced by the command palette so a
   * user can find the page by any name they remember, but NEVER rendered as
   * a standalone menu entry or tab (rule #6).
   */
  aliases?: string[];
  /**
   * Redirect / legacy paths that resolve to `path`. Documented here so the
   * guards know these are intentional aliases, not dead links. The routes
   * stay mounted as redirects — they are never deleted (rule #3).
   */
  redirectFrom?: string[];
  /**
   * True when this is an accordion group-leader whose path equals its own
   * "overview" child — a documented exception to the de-duplication rule,
   * not a real duplicate.
   */
  groupLeader?: boolean;
  /**
   * True when adopting `canonicalLabel` needs an explicit system-owner
   * decision (e.g. picking one name among equally-valid competitors, or
   * Arabising an established acronym). Absent/false = a safe text-only change
   * that simply matches the page's existing Arabic title.
   */
  ownerDecision?: boolean;
  /** Cross-reference to the inventory report section that justifies the entry. */
  note?: string;
}

/**
 * Seed canonical map for the flagged inventory cases. The label values are
 * taken from each page's existing `PageShell title` wherever one exists, so
 * they unify on what the page already shows rather than inventing new names.
 */
export const NAVIGATION_CANONICAL_MAP: CanonicalNavEntry[] = [
  // ── §8.أ — English-only menu labels whose page already has a clean Arabic title (safe) ──
  {
    path: "/finance/gl-health",
    canonicalLabel: "مؤشر صحة النظام المالي",
    aliases: ["GL Health Score"],
    note: "INVENTORY §5/§8.أ — menu shows English; page title is Arabic.",
  },
  {
    path: "/finance/approvals-inbox",
    canonicalLabel: "صندوق الموافقات الموحّد",
    aliases: ["Approvals Inbox"],
    note: "INVENTORY §5/§8.أ — English label; page title is Arabic.",
  },
  {
    path: "/finance/reports/gl-integrity-gaps",
    canonicalLabel: "فجوات سلامة دفتر الأستاذ",
    aliases: ["GL Integrity Gaps"],
    note: "INVENTORY §5/§8.أ — English label; page title is Arabic.",
  },
  {
    path: "/finance/reports/unmapped-lines",
    canonicalLabel: "البنود غير المُوجَّهة",
    aliases: ["Unmapped Lines"],
    note: "INVENTORY §5/§8.أ — English label; page title is Arabic.",
  },
  {
    path: "/finance/journal/activity",
    canonicalLabel: "نشاط الترحيل المحاسبي",
    aliases: ["Posting Activity"],
    note: "INVENTORY §5/§8.أ — English label; page title is Arabic.",
  },
  {
    path: "/intelligence/ai-workbench",
    canonicalLabel: "منصة الذكاء الاصطناعي",
    aliases: ["منصة AI"],
    note: "INVENTORY §5/§8.أ — menu mixes 'AI'; page title is Arabic.",
  },
  {
    path: "/finance/reports/zatca",
    canonicalLabel: "مركز تقارير الزكاة والضريبة",
    aliases: ["مركز تقارير الفوترة الإلكترونية", "مركز تقارير ZATCA", "ZATCA Reports Hub", "تقارير الضرائب والمخزون", "تقارير زاتكا والمخزون"],
    note: "INVENTORY §8.أ — Arabised Latin-free; §12 finalised to «الزكاة والضريبة» to match the «هيئة الزكاة والضريبة» settings tab and the tax+inventory scope (broader than e-invoicing). 'ZATCA' / 'الفوترة الإلكترونية' kept as search aliases.",
  },

  // ── §1.أ — same path carrying more than one menu label ──
  {
    path: "/work-inbox",
    canonicalLabel: "صندوق الأعمال",
    aliases: ["ما ينتظر إجراءاتي"],
    note: "INVENTORY §1.أ — applied slice 9 (owner-decided). Both nav entries now «صندوق الأعمال»; «ما ينتظر إجراءاتي» kept as a search alias.",
  },
  {
    path: "/my-space",
    canonicalLabel: "مساحتي",
    aliases: ["مساحاتي"],
    note: "INVENTORY §1.أ — parent 'مساحاتي' vs child/page 'مساحتي'.",
  },
  {
    path: "/hr/services",
    canonicalLabel: "خدمات الموارد البشرية",
    aliases: ["كتالوج خدمات HR", "كتالوج الخدمات", "الطلبات", "كتالوج خدمات الموارد البشرية"],
    note: "INVENTORY §1.أ — applied slice 9 (owner «خدمات الموارد البشرية»); smoke tests updated. «الطلبات» stays the group/tab name.",
  },
  {
    path: "/admin",
    canonicalLabel: "مدير النظام",
    aliases: ["الأدوار والصلاحيات", "الأدوار والصلاحيات (v2)", "لوحة الإدارة"],
    note: "INVENTORY §1.أ — group-leader pattern (group «مدير النظام» / overview «الأدوار والصلاحيات» / page «لوحة الإدارة»). The «(v2)» suffix was dropped in the Arabic-label cleanup; kept as an alias for back-compat search.",
  },

  // ── §3/§4 — one function reached by several names, some via redirect ──
  {
    path: "/bi",
    canonicalLabel: "ذكاء الأعمال",
    aliases: ["لوحة التحليلات", "نظرة عامة", "لوحات BI", "مؤشرات الأداء", "التقارير التحليلية"],
    redirectFrom: ["/bi/dashboards", "/bi/kpis", "/bi/reports"],
    note: "INVENTORY §3/§4 — applied slice 6: unified to one «ذكاء الأعمال» entry; the 3 redirect names are search aliases.",
  },
  {
    path: "/properties/guide",
    canonicalLabel: "دليل العقارات",
    aliases: ["دليل إرشادي مصور"],
    redirectFrom: ["/guide/properties"],
    note: "INVENTORY §1.أ/§4 — applied slice 12: removed the «دليل إرشادي مصور» duplicate nav entry; «دليل العقارات» is the single entry, alias kept for search.",
  },

  // ── §2 — same label reused for genuinely different functions ──
  {
    path: "/finance/inventory-costing",
    canonicalLabel: "تقييم المخزون (المتوسط المرجح)",
    note: "INVENTORY §2 — disambiguates from /finance/reports/inventory-valuation.",
  },
  {
    path: "/finance/reports/inventory-valuation",
    canonicalLabel: "تقرير تقييم المخزون",
    note: "INVENTORY §2 — disambiguates from /finance/inventory-costing.",
  },
  {
    path: "/admin/logs",
    canonicalLabel: "سجل تدقيق النظام",
    aliases: ["سجل المراجعة", "سجل التدقيق"],
    note: "INVENTORY §2 — applied slice 8 (owner-decided). Distinct from /settings/audit-log.",
  },
  {
    path: "/settings/audit-log",
    canonicalLabel: "سجل مراجعة الإعدادات",
    aliases: ["سجل المراجعة"],
    note: "INVENTORY §2 — applied slice 8 (owner-decided). Distinct from /admin/logs.",
  },
  {
    path: "/umrah/import",
    canonicalLabel: "استيراد بيانات العمرة",
    aliases: ["استيراد البيانات", "الاستيراد", "معالج استيراد العمرة"],
    note: "INVENTORY §2 — disambiguates from /admin/data-import.",
  },
  {
    path: "/admin/data-import",
    canonicalLabel: "استيراد البيانات (إداري)",
    aliases: ["استيراد البيانات"],
    note: "INVENTORY §2 — disambiguates from /umrah/import.",
  },
  {
    path: "/finance/vendors",
    canonicalLabel: "الموردون",
    note: "INVENTORY §2 — finance Vendors, distinct from warehouse suppliers.",
  },
  {
    path: "/warehouse/suppliers",
    canonicalLabel: "الموردون",
    aliases: ["موردو المستودع", "الموردين"],
    note: "INVENTORY §2 — owner kept «الموردون» for both lists; section context (المالية vs المستودع) disambiguates. No rename.",
  },
  {
    path: "/warehouse/advanced",
    canonicalLabel: "عمليات متقدّمة (دفعات/تسلسلات/جرد/تصنيف أ ب ج)",
    aliases: ["الدفعات", "الأرقام التسلسلية", "الجرد الدوري", "تصنيف ABC", "تصنيف أ ب ج"],
    note: "CROSS_MODULE_DUPLICATION_AUDIT — tab-shell that supersets /warehouse/{lots,serials,cycle-counts,abc}; their standalone nav entries were removed (owner «keep shell, remove siblings»), kept here as command-palette search aliases.",
  },

  // ── §7 — redirect destinations referenced by stale quick actions ──
  {
    path: "/hr/violations",
    canonicalLabel: "المخالفات والجزاءات",
    aliases: ["نظرة عامة على المخالفات", "الامتثال والجزاءات", "إدارة المخالفات"],
    redirectFrom: ["/hr/violations/management"],
    groupLeader: true,
    note: "INVENTORY §7 — quick action 'إدارة المخالفات' targets the redirect.",
  },
  {
    path: "/hr/shifts",
    canonicalLabel: "جدول الورديات",
    aliases: ["إدارة الورديات"],
    redirectFrom: ["/hr/shifts/management"],
    note: "INVENTORY §7 — quick action 'إدارة الورديات' targets the redirect.",
  },
  {
    path: "/hr/performance",
    canonicalLabel: "الأداء والتطوير",
    aliases: ["تقييم الأداء", "تقييمات الأداء", "تقييم متقدم"],
    redirectFrom: ["/hr/performance/advanced"],
    groupLeader: true,
    note: "INVENTORY §7 — quick action 'تقييم متقدم' targets the redirect.",
  },
  {
    path: "/hr/leaves",
    canonicalLabel: "طلبات الإجازة",
    aliases: ["إدارة الإجازات"],
    redirectFrom: ["/hr/leaves/management"],
    note: "INVENTORY §7 — quick action 'إدارة الإجازات' targets the redirect.",
  },

  // ── §5 — menu label vs page title drift on canonicalised HR pages ──
  {
    path: "/hr/org-tree",
    canonicalLabel: "الهيكل التنظيمي",
    aliases: ["الشجرة التنظيمية"],
    redirectFrom: ["/hr/organization", "/hr/organization/structure"],
    note: "INVENTORY §5 — menu 'الهيكل التنظيمي' vs page 'الشجرة التنظيمية'.",
  },
  {
    path: "/hr/recruitment",
    canonicalLabel: "التوظيف والاستقطاب",
    aliases: ["وظائف التوظيف"],
    redirectFrom: ["/hr/recruitment/advanced"],
    note: "INVENTORY §5 — menu 'وظائف التوظيف' vs page 'التوظيف والاستقطاب'.",
  },
  {
    path: "/hr/training",
    canonicalLabel: "البرامج التدريبية",
    aliases: ["برامج التدريب"],
    redirectFrom: ["/hr/training/advanced"],
    note: "INVENTORY §5 — menu 'البرامج التدريبية' vs page 'برامج التدريب'.",
  },
];

/** Strip a trailing query string / hash so inputs compare to canonical paths. */
function basePath(p: string): string {
  return p.replace(/[?#].*$/, "");
}

/**
 * Resolve a path (canonical, redirect, or with a query string) to its
 * canonical entry. Pure and side-effect-free — safe to import from guards
 * and tests. Returns `undefined` when the path is not (yet) governed.
 */
export function resolveCanonical(path: string): CanonicalNavEntry | undefined {
  const b = basePath(path);
  for (const entry of NAVIGATION_CANONICAL_MAP) {
    if (entry.path === b) return entry;
  }
  for (const entry of NAVIGATION_CANONICAL_MAP) {
    if (entry.redirectFrom && entry.redirectFrom.includes(b)) return entry;
  }
  return undefined;
}

/** Convenience: the official Arabic label for a path, or `undefined`. */
export function getCanonicalLabel(path: string): string | undefined {
  return resolveCanonical(path)?.canonicalLabel;
}
