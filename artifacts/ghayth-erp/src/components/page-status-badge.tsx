import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * PageStatusBadge — P1.6 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * Before this file, status chips were duplicated across ~60 list pages,
 * each one mapping `status` → arabic label → color with its own object.
 * That's why the same status value could read as "معتمد" in one page,
 * "موافق عليه" in another, and have three different shades of green.
 *
 * This file is the single source of truth: `STATUS_MAP` holds the arabic
 * label + tone for every status value the system uses, grouped by entity
 * domain. Pages that want to show a status chip reach for the single
 * component:
 *
 *   <PageStatusBadge status={row.status} />
 *   <PageStatusBadge status="approved" domain="leave" />
 *
 * If the status isn't in the map, the badge falls back to a neutral gray
 * chip with the raw value rather than rendering nothing — this keeps the
 * layout stable while new statuses get added.
 *
 * Adding a new status:
 *   1. Add it to `STATUS_MAP` in the relevant domain block
 *   2. Consider adding a CHECK constraint in the matching migration
 *      (per P2.4 of the plan)
 *
 * Adopted gradually — pages that already have their own status maps keep
 * working. Pages refactored in Phases 3-4 replace their local map with a
 * `<PageStatusBadge>` import.
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "progress"
  | "muted";

export interface StatusDef {
  /** Arabic display label. */
  label: string;
  /** Visual tone — maps to a tailwind color class below. */
  tone: StatusTone;
  /** Optional short hint shown as a title attribute on hover. */
  hint?: string;
}

/**
 * Domain-grouped status definitions. Domains are loose — a status can
 * appear in multiple domains. The top-level key is just a hint for
 * readers of this file; the component resolves statuses by value first,
 * then by domain if provided.
 */
export const STATUS_MAP = {
  // ── Shared approval-flow statuses used across HR, finance, requests ──
  shared: {
    draft:                { label: "مسودة",           tone: "muted"    },
    pending:              { label: "قيد الانتظار",    tone: "warning"  },
    pending_approval:     { label: "بانتظار الاعتماد", tone: "warning"  },
    pending_review:       { label: "بانتظار المراجعة", tone: "warning"  },
    pending_employee:     { label: "بانتظار الموظف",  tone: "warning"  },
    pending_manager:      { label: "بانتظار المدير",  tone: "warning"  },
    pending_gm:           { label: "بانتظار المدير العام", tone: "warning" },
    submitted:            { label: "مُقدَّم",           tone: "info"     },
    in_progress:          { label: "قيد التنفيذ",     tone: "progress" },
    in_review:            { label: "قيد المراجعة",    tone: "info"     },
    approved:             { label: "معتمد",           tone: "success"  },
    rejected:             { label: "مرفوض",           tone: "danger"   },
    returned:             { label: "مُرجَع",           tone: "warning"  },
    cancelled:            { label: "ملغى",             tone: "neutral"  },
    completed:            { label: "مكتمل",           tone: "success"  },
    active:               { label: "نشط",             tone: "success"  },
    inactive:             { label: "غير نشط",         tone: "muted"    },
    // ── R.2 additions: fiscal / journal / bank-guarantee statuses that
    // were previously rendered with per-page maps. Adding them to the
    // shared domain is the right "unification" move: every page that
    // renders one of these now uses the canonical arabic label + tone
    // without a local constant map.
    open:                 { label: "مفتوحة",          tone: "info"     },
    closed:               { label: "مُغلقة",          tone: "neutral"  },
    future:               { label: "مستقبلية",        tone: "info"     },
    posted:               { label: "مُرحَّل",          tone: "success"  },
    reversed:             { label: "مُعكَس",           tone: "warning"  },
    released:             { label: "مُحرَّر",          tone: "success"  },
    // ── end R.2 additions ──
    expired:              { label: "منتهي الصلاحية",  tone: "danger"   },
    archived:             { label: "مؤرشف",           tone: "muted"    },
    escalated:            { label: "مُصعَّد",          tone: "warning"  },
    on_hold:              { label: "معلَّق",           tone: "warning"  },
    deleted:              { label: "محذوف",           tone: "muted"    },
    auto_declined:        { label: "رفض تلقائي",     tone: "danger"   },
  },

  // ── HR ─────────────────────────────────────────────────────────────
  leave: {
    stage1_approved:      { label: "اعتماد المرحلة الأولى", tone: "info" },
    auto_approved:        { label: "اعتماد تلقائي",  tone: "success" },
  },
  attendance: {
    checked_in:           { label: "مسجَّل حضور",     tone: "success"  },
    checked_out:          { label: "مسجَّل انصراف",   tone: "info"     },
    absent:               { label: "غائب",            tone: "danger"   },
    on_leave:             { label: "في إجازة",        tone: "info"     },
    remote:               { label: "عن بُعد",         tone: "info"     },
    late:                 { label: "متأخر",           tone: "warning"  },
    half_day:             { label: "نصف يوم",         tone: "warning"  },
  },
  memo: {
    pending_employee:     { label: "بانتظار الموظف",  tone: "warning"  },
    pending_manager:      { label: "بانتظار المدير",  tone: "warning"  },
    pending_gm:           { label: "بانتظار المدير العام", tone: "warning" },
    approved:             { label: "معتمد",           tone: "success"  },
    rejected:             { label: "مرفوض",           tone: "danger"   },
    cancelled:            { label: "ملغى",             tone: "neutral"  },
  },

  // ── Finance ────────────────────────────────────────────────────────
  invoice: {
    draft:                { label: "مسودة",           tone: "muted"    },
    sent:                 { label: "مُرسَلة",          tone: "info"     },
    partially_paid:       { label: "مدفوعة جزئياً",   tone: "progress" },
    paid:                 { label: "مدفوعة",          tone: "success"  },
    overdue:              { label: "متأخرة",          tone: "danger"   },
    void:                 { label: "ملغاة",           tone: "neutral"  },
    credit_memo:          { label: "إشعار دائن",      tone: "info"     },
    debit_memo:           { label: "إشعار مدين",      tone: "info"     },
  },
  purchase: {
    draft:                { label: "مسودة",           tone: "muted"    },
    pending_approval:     { label: "بانتظار الاعتماد", tone: "warning"  },
    approved:             { label: "معتمد",           tone: "success"  },
    rejected:             { label: "مرفوض",           tone: "danger"   },
    returned:             { label: "مُرجَع",           tone: "warning"  },
    converted:            { label: "مُحوَّل إلى أمر شراء", tone: "info" },
    received:             { label: "مُستلَم",          tone: "success"  },
    partially_received:   { label: "مُستلَم جزئياً",   tone: "progress" },
    vendor_confirmed:     { label: "مؤكَّد من المورد", tone: "info"     },
    payment_scheduled:    { label: "جدولة الدفع",     tone: "info"     },
  },
  journal: {
    draft:                { label: "مسودة",           tone: "muted"    },
    posted:               { label: "مُرحَّل",          tone: "success"  },
    reversed:             { label: "مُعكَس",           tone: "warning"  },
    opening:              { label: "أرصدة افتتاحية",  tone: "info"     },
    closing:              { label: "قيد إقفال",       tone: "info"     },
  },
  custody: {
    active:               { label: "نشطة",            tone: "info"     },
    partial:              { label: "مسوّاة جزئياً",   tone: "progress" },
    settled:              { label: "مسوّاة",          tone: "success"  },
    pending:              { label: "بانتظار الموافقة", tone: "warning"  },
    rejected:             { label: "مرفوضة",          tone: "danger"   },
    returned:             { label: "مُرجعة",          tone: "warning"  },
    overdue:              { label: "متأخرة",          tone: "danger"   },
  },
  // R.3 — ZATCA e-invoice integration statuses. Previously rendered
  // inline with hand-rolled tailwind classes on every invoice list
  // row. Moved here so the arabic label + tone come from the same
  // source as every other status chip in the app.
  zatca: {
    pending:              { label: "معلقة",          tone: "warning"  },
    submitted:            { label: "مُرسَلة",         tone: "info"     },
    accepted:             { label: "مقبولة",          tone: "success"  },
    rejected:             { label: "مرفوضة",          tone: "danger"   },
    error:                { label: "خطأ",             tone: "danger"   },
  },

  // ── Legal ──────────────────────────────────────────────────────────
  legal_case: {
    open:                 { label: "مفتوحة",          tone: "info"     },
    in_progress:          { label: "قيد النظر",       tone: "progress" },
    judgment:             { label: "حكم صادر",        tone: "info"     },
    execution:            { label: "قيد التنفيذ",     tone: "progress" },
    closed:               { label: "مُغلقة",          tone: "success"  },
  },

  // ── Property / Leasing ────────────────────────────────────────────
  lease: {
    draft:                { label: "مسودة",           tone: "muted"    },
    active:               { label: "نشط",             tone: "success"  },
    renewed:               { label: "مُجدَّد",          tone: "info"     },
    terminated:           { label: "مُنهى",           tone: "danger"   },
    expired:              { label: "منتهي",           tone: "danger"   },
  },
  rent_payment: {
    pending:              { label: "مستحقة",          tone: "warning"  },
    partial:              { label: "مدفوعة جزئياً",   tone: "progress" },
    paid:                 { label: "مدفوعة",          tone: "success"  },
    overdue:              { label: "متأخرة",          tone: "danger"   },
    cancelled:            { label: "ملغاة",           tone: "neutral"  },
  },

  // ── Fleet ──────────────────────────────────────────────────────────
  trip: {
    scheduled:            { label: "مجدولة",          tone: "info"     },
    planned:              { label: "مُخطَّطة",         tone: "info"     },
    in_progress:          { label: "جارية",           tone: "progress" },
    completed:            { label: "مُنجَزة",         tone: "success"  },
    cancelled:            { label: "ملغاة",           tone: "neutral"  },
  },
  vehicle: {
    available:            { label: "متاحة",           tone: "success"  },
    in_use:               { label: "قيد الاستخدام",   tone: "progress" },
    maintenance:          { label: "في الصيانة",      tone: "warning"  },
    out_of_service:       { label: "خارج الخدمة",     tone: "danger"   },
  },

  // ── Projects ───────────────────────────────────────────────────────
  project: {
    planning:             { label: "تخطيط",           tone: "info"     },
    active:               { label: "نشط",             tone: "success"  },
    in_progress:          { label: "قيد التنفيذ",     tone: "progress" },
    on_hold:              { label: "معلَّق",           tone: "warning"  },
    blocked:              { label: "متوقف",           tone: "danger"   },
    completed:            { label: "مُقفَل",          tone: "success"  },
    cancelled:            { label: "ملغى",             tone: "neutral"  },
  },

  // ── Support ────────────────────────────────────────────────────────
  ticket: {
    open:                 { label: "مفتوحة",          tone: "info"     },
    in_progress:          { label: "قيد المعالجة",    tone: "progress" },
    pending_customer:     { label: "بانتظار العميل",  tone: "warning"  },
    field_visit:          { label: "زيارة ميدانية",   tone: "info"     },
    resolved:             { label: "تمت المعالجة",    tone: "success"  },
    closed:               { label: "مُغلقة",          tone: "neutral"  },
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusDomain = keyof typeof STATUS_MAP;

const TONE_CLASS: Record<StatusTone, string> = {
  neutral:  "bg-gray-100 text-gray-700 border-gray-200",
  info:     "bg-blue-50 text-blue-700 border-blue-200",
  success:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning:  "bg-amber-50 text-amber-800 border-amber-200",
  danger:   "bg-red-50 text-red-700 border-red-200",
  progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  muted:    "bg-slate-50 text-slate-600 border-slate-200",
};

/**
 * Resolve a status string to its definition. Checks the requested domain
 * first, then `shared`, then all other domains as a last resort. Returns
 * `null` if nothing matches.
 */
export function resolveStatus(
  status: string,
  domain?: StatusDomain,
): StatusDef | null {
  if (domain && domain in STATUS_MAP) {
    const def = (STATUS_MAP[domain] as Record<string, StatusDef>)[status];
    if (def) return def;
  }
  const shared = STATUS_MAP.shared as Record<string, StatusDef>;
  if (status in shared) return shared[status] ?? null;
  // Last resort — scan every domain. O(n) in number of domains but the
  // number is fixed.
  for (const key of Object.keys(STATUS_MAP) as StatusDomain[]) {
    const def = (STATUS_MAP[key] as Record<string, StatusDef>)[status];
    if (def) return def;
  }
  return null;
}

export interface PageStatusBadgeProps {
  /** The status string the server sent. */
  status: string | null | undefined;
  /** Optional domain hint to resolve ambiguous statuses. */
  domain?: StatusDomain;
  /** Extra className. */
  className?: string;
  /** Render a dot + label instead of a pill. */
  minimal?: boolean;
  /** Override the resolved label — rare, but useful for custom copy. */
  children?: ReactNode;
}

export function PageStatusBadge({
  status,
  domain,
  className,
  minimal,
  children,
}: PageStatusBadgeProps) {
  if (!status) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>—</span>
    );
  }

  const def = resolveStatus(status, domain);
  const label = children ?? def?.label ?? status;
  const tone: StatusTone = def?.tone ?? "neutral";

  if (minimal) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs", className)}
        title={def?.hint}
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full", TONE_CLASS[tone].split(" ")[0])}
        />
        {label}
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASS[tone], "font-medium", className)}
      title={def?.hint}
    >
      {label}
    </Badge>
  );
}
