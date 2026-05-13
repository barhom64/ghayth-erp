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
    under_review:         { label: "قيد المراجعة",    tone: "info"     },
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
    // Communications (letters/messages) statuses.
    // Shared domain statuses for any messaging surface.
    sent:                 { label: "مرسل",            tone: "success"  },
    delivered:            { label: "تم التسليم",      tone: "success"  },
    queued:               { label: "في الانتظار",    tone: "warning"  },
    received:             { label: "مستلم",          tone: "info"     },
    failed:               { label: "فشل",             tone: "danger"   },
    // Training programs (hr/training.tsx): planned → upcoming → active
    // → completed (with cancelled as a terminal branch).
    planned:              { label: "مخطط",            tone: "info"     },
    upcoming:             { label: "قادم",            tone: "info"     },
    enrolled:             { label: "مسجل",            tone: "info"     },
    // HR onboarding (hr/onboarding-review.tsx): adds "probation" and a
    // more specific "in_review" label so the computed onboarding status
    // doesn't need a per-page map anymore.
    probation:            { label: "فترة التجربة",   tone: "info"     },
    // Performance reviews
    reviewed:             { label: "مُراجَع",         tone: "info"     },
    finalized:            { label: "مُعتمد",          tone: "success"  },
  },

  // ── HR ─────────────────────────────────────────────────────────────
  leave: {
    stage1_approved:      { label: "اعتماد المرحلة الأولى", tone: "info" },
    auto_approved:        { label: "اعتماد تلقائي",  tone: "success" },
  },
  attendance: {
    present:              { label: "حاضر",            tone: "success"  },
    present_off_day:      { label: "حاضر (يوم إجازة)", tone: "info"    },
    present_out_of_range: { label: "خارج النطاق",     tone: "warning"  },
    checked_in:           { label: "مسجَّل حضور",     tone: "success"  },
    checked_out:          { label: "مسجَّل انصراف",   tone: "info"     },
    absent:               { label: "غائب",            tone: "danger"   },
    on_leave:             { label: "في إجازة",        tone: "info"     },
    leave:                { label: "إجازة",           tone: "info"     },
    remote:               { label: "عن بُعد",         tone: "info"     },
    late:                 { label: "متأخر",           tone: "warning"  },
    half_day:             { label: "نصف يوم",         tone: "warning"  },
    early_leave:          { label: "انصراف مبكر",     tone: "warning"  },
    excused:              { label: "مستأذن",          tone: "info"     },
    weekend:              { label: "عطلة أسبوعية",    tone: "muted"    },
    holiday:              { label: "عطلة رسمية",      tone: "muted"    },
    present_holiday:      { label: "حضور عطلة رسمية", tone: "info"     },
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
    pending_approval:     { label: "بانتظار الاعتماد", tone: "warning"  },
    approved:             { label: "معتمدة",          tone: "success"  },
    sent:                 { label: "مُرسَلة",          tone: "info"     },
    partially_paid:       { label: "مدفوعة جزئياً",   tone: "progress" },
    partial:              { label: "مدفوعة جزئياً",   tone: "progress" },
    paid:                 { label: "مدفوعة",          tone: "success"  },
    overdue:              { label: "متأخرة",          tone: "danger"   },
    void:                 { label: "ملغاة",           tone: "neutral"  },
    cancelled:            { label: "ملغية",           tone: "neutral"  },
    rejected:             { label: "مرفوضة",          tone: "danger"   },
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
  //
  // L2 follow-up: as of today only `accepted` and `submitted` are
  // written by the server — `finance-zatca.ts:539,623` runs in
  // simulation mode and emits one of those two depending on the
  // configured environment. `pending` is the UI default before the
  // invoice is enqueued (`zatcaStatus ?? "pending"` in the badge
  // call sites). `rejected` and `error` are forward-compat entries
  // for the real ZATCA webhook handler — keep them so the UI is
  // ready when the live integration lands. Remove them only if the
  // integration is descoped.
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
    won:                  { label: "ربح",             tone: "success"  },
    lost:                 { label: "خسارة",           tone: "danger"   },
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

  // ── Finance: Fixed Assets ──────────────────────────────────────────
  asset: {
    active:               { label: "نشط",             tone: "success"  },
    retired:              { label: "متقاعد",           tone: "muted"    },
    disposed:             { label: "مُستبعَد",         tone: "neutral"  },
    under_maintenance:    { label: "تحت الصيانة",      tone: "warning"  },
  },

  // ── Finance: Tax ──────────────────────────────────────────────────
  tax: {
    submitted:            { label: "مُقدَّم",           tone: "success"  },
    pending:              { label: "معلّق",            tone: "warning"  },
    payable:              { label: "مستحقة الدفع",     tone: "danger"   },
    refundable:           { label: "قابلة للاسترداد",   tone: "success"  },
  },

  // ── Finance: Expenses ─────────────────────────────────────────────
  expense: {
    draft:                { label: "مسودة",           tone: "muted"    },
    pending_approval:     { label: "بانتظار الاعتماد", tone: "warning"  },
    approved:             { label: "معتمد",           tone: "success"  },
    rejected:             { label: "مرفوض",           tone: "danger"   },
    returned:             { label: "مُرجَع",           tone: "warning"  },
    paid:                 { label: "مدفوع",           tone: "success"  },
  },

  // ── Finance: Salary Advances ──────────────────────────────────────
  salary_advance: {
    pending:              { label: "قيد الانتظار",    tone: "warning"  },
    approved:             { label: "معتمدة",          tone: "success"  },
    rejected:             { label: "مرفوضة",          tone: "danger"   },
    paid:                 { label: "مصروفة",          tone: "success"  },
    deducted:             { label: "مخصومة",          tone: "info"     },
  },

  // ── Finance: Bank Guarantees ──────────────────────────────────────
  guarantee: {
    active:               { label: "نشط",             tone: "success"  },
    expired:              { label: "منتهي",           tone: "danger"   },
    released:             { label: "مُحرَّر",          tone: "info"     },
    claimed:              { label: "مُطالَب به",       tone: "danger"   },
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
  maintenance: {
    scheduled:            { label: "مجدولة",          tone: "info"     },
    in_progress:          { label: "جارية",           tone: "progress" },
    completed:            { label: "مُنجَزة",         tone: "success"  },
    cancelled:            { label: "ملغاة",           tone: "neutral"  },
    overdue:              { label: "متأخرة",          tone: "danger"   },
  },
  insurance: {
    active:               { label: "ساري",            tone: "success"  },
    expired:              { label: "منتهي",           tone: "danger"   },
    pending_renewal:      { label: "بانتظار التجديد", tone: "warning"  },
  },
  traffic_violation: {
    paid:                 { label: "مدفوعة",          tone: "success"  },
    unpaid:               { label: "غير مدفوعة",      tone: "danger"   },
    contested:            { label: "مُعترَض عليها",   tone: "warning"  },
  },
  driver: {
    active:               { label: "نشط",             tone: "success"  },
    inactive:             { label: "غير نشط",         tone: "muted"    },
    suspended:            { label: "مُوقَف",           tone: "danger"   },
    available:            { label: "متاح",            tone: "success"  },
    on_trip:              { label: "في رحلة",         tone: "info"     },
    off_duty:             { label: "خارج الخدمة",     tone: "neutral"  },
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
    todo:                 { label: "للتنفيذ",         tone: "muted"    },
    done:                 { label: "مكتمل",           tone: "success"  },
    pending:              { label: "معلق",            tone: "warning"  },
  },

  // ── Property units ─────────────────────────────────────────────────
  property: {
    available:            { label: "شاغر",             tone: "info"     },
    rented:               { label: "مؤجرة",            tone: "success"  },
    maintenance:          { label: "تحت الصيانة",      tone: "warning"  },
    under_maintenance:    { label: "تحت الصيانة",      tone: "warning"  },
    out_of_service:       { label: "خارج الخدمة",      tone: "danger"   },
    reserved:             { label: "محجوز",            tone: "info"     },
  },

  // ── Obligations ───────────────────────────────────────────────────
  obligation: {
    due:                  { label: "مستحق",            tone: "warning"  },
    paid:                 { label: "مدفوع",            tone: "success"  },
    overdue:              { label: "متأخر",            tone: "danger"   },
    partial:              { label: "مدفوع جزئياً",     tone: "progress" },
    pending:              { label: "معلق",             tone: "warning"  },
    met:                  { label: "ملبى",             tone: "success"  },
    breached:             { label: "متجاوز",           tone: "danger"   },
    escalated_l1:         { label: "تصعيد 1",          tone: "warning"  },
    escalated_l2:         { label: "تصعيد 2",          tone: "danger"   },
    closed:               { label: "مغلق",             tone: "neutral"  },
    cancelled:            { label: "ملغى",              tone: "muted"    },
  },

  // ── Recurring journals ────────────────────────────────────────────
  recurring: {
    success:              { label: "نجاح",             tone: "success"  },
    failed:               { label: "فشل",              tone: "danger"   },
    skipped:              { label: "تم تخطيه",         tone: "muted"    },
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
  neutral:  "bg-gray-100 text-gray-700 border-border",
  info:     "bg-status-info-surface text-status-info-foreground border-status-info-surface",
  success:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning:  "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
  danger:   "bg-status-error-surface text-status-error-foreground border-status-error-surface",
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
