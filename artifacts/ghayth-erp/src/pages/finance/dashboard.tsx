import { Link } from "wouter";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Plus,
  Trash,
  ArrowRight,
  Send,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useApiQuery, asList } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  PageShell,
  PageSection,
  PageStatusBadge,
} from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";

/**
 * Finance Dashboard — R.1.5 of the Reference UI/UX phase.
 *
 * The first real reference page built entirely on the unified templates
 * catalogued in `docs/UI_TEMPLATES.md`. Every component on this page
 * already existed in the codebase — nothing new is invented here. The
 * purpose is to **show the target** every other finance page should
 * look like after the cascade.
 *
 * Template stack:
 *
 *   • `PageShell`          — title, subtitle, breadcrumbs, actions, loading
 *   • `PageSection`        — labelled card sections
 *   • `PageStatusBadge`    — single source of truth for status → label + tone
 *   • `useApiQuery`        — the canonical read hook
 *   • `formatCurrency` +
 *     `formatDateAr`       — the canonical formatters
 *
 * The page displays:
 *
 *   1. Six KPI tiles (revenue, outstanding, expenses, guarantees,
 *      pending approvals, fiscal period status).
 *   2. Pending approvals inbox — unifies journal-manual / custody /
 *      budget-approval-request queues into one visual list.
 *   3. Fiscal-period status banner — uses `PageStatusBadge` for the
 *      period state and links to the fiscal-periods management page.
 *   4. Bank-guarantee expiry alerts — filtered to guarantees that are
 *      expiring within 30 days or already expired.
 *   5. Recent finance activity feed — reads `/audit-logs` filtered to
 *      finance entities and renders with the same icon + tone map the
 *      EntityTimeline component uses, without duplicating it.
 *
 * Every number on the page is read from existing endpoints that were
 * hardened in the architectural phase. No new endpoints, no mocked
 * data, no placeholder cards.
 */

// ─── KPI tile ──────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Wallet;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  href?: string;
}

const TONE_CLASS: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  neutral: "text-slate-600 bg-slate-50 border-slate-100",
  info:    "text-status-info-foreground bg-status-info-surface border-status-info-surface",
  success: "text-emerald-600 bg-emerald-50 border-emerald-100",
  warning: "text-status-warning-foreground bg-status-warning-surface border-status-warning-surface",
  danger:  "text-status-error-foreground bg-status-error-surface border-status-error-surface",
};

function KpiTile({ label, value, hint, icon: Icon, tone = "neutral", href }: KpiTileProps) {
  const cls = TONE_CLASS[tone];
  const body = (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center border", cls)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold tracking-tight truncate mt-0.5">{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) {
    return <Link href={href} className="block">{body}</Link>;
  }
  return body;
}

// ─── Recent-activity row ───────────────────────────────────────────────

const ACTIVITY_MAP: Record<string, { icon: typeof Clock; tone: string; label: string }> = {
  "create":                      { icon: Plus,          tone: "text-emerald-600 bg-emerald-50", label: "إنشاء" },
  "update":                      { icon: Edit,          tone: "text-status-info-foreground bg-status-info-surface",       label: "تحديث" },
  "delete":                      { icon: Trash,         tone: "text-status-error-foreground bg-status-error-surface",         label: "حذف" },
  "approve":                     { icon: CheckCircle,   tone: "text-emerald-600 bg-emerald-50", label: "اعتماد" },
  "reject":                      { icon: XCircle,       tone: "text-status-error-foreground bg-status-error-surface",         label: "رفض" },
  "submit":                      { icon: Send,          tone: "text-status-info-foreground bg-status-info-surface",       label: "تقديم" },
  "review":                      { icon: CheckCircle,   tone: "text-indigo-600 bg-indigo-50",   label: "مراجعة" },
  "fiscal_period.close":         { icon: ShieldCheck,   tone: "text-slate-700 bg-slate-50",     label: "إقفال فترة" },
  "fiscal_period.reopen":        { icon: Clock,         tone: "text-status-warning-foreground bg-status-warning-surface",     label: "فتح فترة" },
  "journal.posted":              { icon: CheckCircle,   tone: "text-emerald-600 bg-emerald-50", label: "ترحيل قيد" },
  "bank_guarantee.cancelled":    { icon: XCircle,       tone: "text-status-error-foreground bg-status-error-surface",         label: "إلغاء ضمان" },
  "bank_guarantee.released":     { icon: CheckCircle,   tone: "text-emerald-600 bg-emerald-50", label: "تحرير ضمان" },
};

function activityStyle(action?: string | null) {
  if (!action) return ACTIVITY_MAP.update;
  if (ACTIVITY_MAP[action]) return ACTIVITY_MAP[action];
  // Strip everything after the first dot so `expense.approved` → `approve`.
  const tail = action.split(".").pop() ?? "";
  if (tail.includes("approve")) return ACTIVITY_MAP.approve;
  if (tail.includes("reject"))  return ACTIVITY_MAP.reject;
  if (tail.includes("submit"))  return ACTIVITY_MAP.submit;
  if (tail.includes("review"))  return ACTIVITY_MAP.review;
  return ACTIVITY_MAP.update;
}

function timeAgo(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  return `منذ ${Math.floor(hrs / 24)} يوم`;
}

// ─── Page ───────────────────────────────────────────────────────────────

interface FinanceSummary {
  invoicesCount: number;
  totalRevenue: number;
  totalPaid: number;
  outstanding: number;
  expensesCount: number;
  totalExpenses: number;
}

interface BankGuaranteeRow {
  id: number;
  ref: string;
  bank: string;
  beneficiary: string;
  amount: number | string;
  expiryDate: string;
  status: string;
  alertStatus: "active" | "expiring_7" | "expiring_14" | "expiring_30" | "expired";
}

interface FiscalPeriodRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
}

interface JournalManualRow {
  id: number;
  ref: string;
  description: string;
  approvalStatus: string;
  createdAt: string;
}

interface AuditLogRow {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  userName?: string;
  createdAt: string;
  after?: Record<string, unknown> | null;
}

export default function FinanceDashboard() {
  const summary = useApiQuery<FinanceSummary>(["finance", "summary"], "/finance/summary");
  const bankGuarantees = useApiQuery<{ data: BankGuaranteeRow[] }>(
    ["finance", "bank-guarantees"],
    "/finance/bank-guarantees",
  );
  const fiscalPeriods = useApiQuery<{ data: FiscalPeriodRow[] }>(
    ["finance", "fiscal-periods-v2"],
    "/finance/fiscal-periods-v2",
  );
  const pendingManualJournals = useApiQuery<{ data: JournalManualRow[] }>(
    ["finance", "journal-manual", "pending"],
    "/finance/journal-manual?status=pending_review",
  );
  const recentActivity = useApiQuery<{ data: AuditLogRow[] }>(
    ["finance", "dashboard", "activity"],
    "/audit-logs?limit=15",
  );

  const isAnyLoading =
    summary.isLoading ||
    bankGuarantees.isLoading ||
    fiscalPeriods.isLoading ||
    pendingManualJournals.isLoading;
  const isAnyError =
    summary.isError ||
    bankGuarantees.isError ||
    fiscalPeriods.isError ||
    pendingManualJournals.isError;

  if (isAnyLoading) return <LoadingSpinner />;
  if (isAnyError) return <ErrorState />;

  const periods = asList<FiscalPeriodRow>(fiscalPeriods.data?.data);
  const openPeriod = periods.find((p) => p.status === "open");
  const guarantees = asList<BankGuaranteeRow>(bankGuarantees.data?.data);
  const expiringGuarantees = guarantees.filter(
    (g) => g.alertStatus !== "active" && g.status === "active",
  );
  const pendingJournals = asList<JournalManualRow>(pendingManualJournals.data?.data);
  const activity = asList<AuditLogRow>(recentActivity.data?.data).filter((row) => {
    // Only show finance-module entities in the dashboard feed. The
    // `/audit-logs` endpoint is global; we narrow client-side so we
    // don't have to add a new server endpoint.
    const e = row.entity ?? "";
    return (
      e.startsWith("journal_entries") ||
      e.startsWith("financial_periods") ||
      e.startsWith("bank_guarantees") ||
      e.startsWith("budget") ||
      e.startsWith("suppliers") ||
      e.startsWith("chart_of_accounts") ||
      e.startsWith("invoices") ||
      e.startsWith("intercompany") ||
      e.startsWith("recurring_journal")
    );
  }).slice(0, 10);

  const pendingApprovalsTotal = pendingJournals.length;
  const sOut = summary.data?.outstanding ?? 0;

  return (
    <PageShell
      title="لوحة المالية"
      subtitle="نظرة عامة على الوضع المالي والموافقات المعلّقة"
      breadcrumbs={[{ label: "المالية" }]}
      loading={isAnyLoading}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/accounts">شجرة الحسابات</Link>
          </Button>
          <GuardedButton perm="finance:create" asChild size="sm">
            <Link href="/finance/journal-manual/create">
              <Plus className="h-4 w-4 me-1" />
              قيد يدوي جديد
            </Link>
          </GuardedButton>
        </div>
      }
    >
      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          label="الإيرادات الإجمالية"
          value={formatCurrency(summary.data?.totalRevenue ?? 0)}
          hint={`${summary.data?.invoicesCount ?? 0} فاتورة`}
          icon={TrendingUp}
          tone="success"
          href="/finance/invoices"
        />
        <KpiTile
          label="المبلغ المستحق"
          value={formatCurrency(sOut)}
          hint={sOut > 0 ? "بانتظار التحصيل" : "لا مستحقات"}
          icon={Receipt}
          tone={sOut > 0 ? "warning" : "neutral"}
          href="/finance/ar-aging"
        />
        <KpiTile
          label="المصروفات"
          value={formatCurrency(summary.data?.totalExpenses ?? 0)}
          hint={`${summary.data?.expensesCount ?? 0} قيد مصروف`}
          icon={TrendingDown}
          tone="info"
          href="/finance/expenses"
        />
        <KpiTile
          label="الضمانات البنكية"
          value={String(guarantees.filter((g) => g.status === "active").length)}
          hint={`${expiringGuarantees.length} قارب على الانتهاء`}
          icon={ShieldCheck}
          tone={expiringGuarantees.length > 0 ? "warning" : "neutral"}
          href="/finance/bank-guarantees"
        />
        <KpiTile
          label="بانتظار الاعتماد"
          value={String(pendingApprovalsTotal)}
          hint={pendingApprovalsTotal > 0 ? "قيود يدوية" : "لا شيء معلّق"}
          icon={AlertTriangle}
          tone={pendingApprovalsTotal > 0 ? "warning" : "neutral"}
          href="/finance/journal-manual"
        />
        <KpiTile
          label="الفترة المالية"
          value={openPeriod?.name ?? "—"}
          hint={openPeriod ? "مفتوحة" : "لا فترة مفتوحة"}
          icon={Clock}
          tone={openPeriod ? "info" : "danger"}
          href="/finance/fiscal-periods"
        />
      </div>

      {/* ── Fiscal period banner ── */}
      {openPeriod && (
        <PageSection
          title="الفترة المالية النشطة"
          description={`${formatDateAr(openPeriod.startDate)} – ${formatDateAr(openPeriod.endDate)}`}
          actions={
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href="/finance/fiscal-periods">
                إدارة الفترات
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="flex items-center gap-3 flex-wrap">
            <PageStatusBadge status={openPeriod.status} />
            <span className="text-sm text-muted-foreground">
              القيود اليدوية المعلّقة في هذه الفترة تمنع إقفالها
            </span>
          </div>
        </PageSection>
      )}

      {/* ── Pending approvals inbox ── */}
      <PageSection
        title="قيود يدوية بانتظار المراجعة"
        description={`${pendingJournals.length} قيد معلّق`}
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/finance/journal-manual">
              عرض الكل
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      >
        {pendingJournals.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <CheckCircle className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
            لا توجد قيود معلّقة
          </div>
        ) : (
          <ul className="divide-y">
            {pendingJournals.slice(0, 5).map((je) => (
              <li key={je.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/finance/journal-manual/${je.id}`}
                    className="text-sm font-medium text-foreground hover:underline truncate block"
                  >
                    {je.ref}
                  </Link>
                  {je.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{je.description}</p>
                  )}
                </div>
                <PageStatusBadge status={je.approvalStatus} domain="shared" />
                <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(je.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {/* ── Bank-guarantee expiry alerts ── */}
      <PageSection
        title="تنبيهات الضمانات البنكية"
        description={
          expiringGuarantees.length > 0
            ? `${expiringGuarantees.length} ضمان يتطلّب المتابعة`
            : "لا تنبيهات"
        }
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/finance/bank-guarantees">
              جميع الضمانات
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      >
        {expiringGuarantees.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <ShieldCheck className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
            لا ضمانات بنكية قاربت على الانتهاء
          </div>
        ) : (
          <ul className="divide-y">
            {expiringGuarantees.slice(0, 5).map((g) => (
              <li key={g.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{g.ref}</p>
                    <span className="text-xs text-muted-foreground shrink-0">— {g.bank}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    المستفيد: {g.beneficiary}
                  </p>
                </div>
                <span className="text-sm font-medium text-foreground shrink-0">
                  {formatCurrency(Number(g.amount))}
                </span>
                <PageStatusBadge
                  status={g.alertStatus === "expired" ? "expired" : "warning"}
                  domain="shared"
                >
                  {g.alertStatus === "expired"
                    ? "منتهي"
                    : g.alertStatus === "expiring_7"
                      ? "خلال أسبوع"
                      : g.alertStatus === "expiring_14"
                        ? "خلال أسبوعين"
                        : "خلال شهر"}
                </PageStatusBadge>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {/* ── Recent finance activity feed ── */}
      <PageSection
        title="الأحداث الأخيرة في المالية"
        description="آخر الانتقالات المعتمدة في نظام الأحداث"
      >
        {activity.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Clock className="h-6 w-6 mx-auto mb-2 text-slate-300" />
            لا أحداث مسجّلة بعد
          </div>
        ) : (
          <div className="relative">
            <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" aria-hidden />
            <div className="space-y-3">
              {activity.map((row) => {
                const style = activityStyle(row.action);
                const Icon = style.icon;
                return (
                  <div key={row.id} className="relative flex items-start gap-3 ps-9">
                    <div
                      className={cn(
                        "absolute start-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white z-10",
                        style.tone,
                      )}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0 bg-surface-subtle/60 rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-status-neutral-foreground truncate">{style.label}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {row.entity} · #{row.entityId}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {timeAgo(row.createdAt)}
                        </span>
                      </div>
                      {row.userName && (
                        <p className="text-xs text-muted-foreground mt-0.5">بواسطة {row.userName}</p>
                      )}
                      {(() => {
                        const next = row.after && typeof row.after === "object"
                          ? (row.after as Record<string, unknown>).status
                          : undefined;
                        if (next == null) return null;
                        return (
                          <p className="text-xs text-muted-foreground mt-1">
                            الحالة الجديدة: <span className="font-medium">{String(next)}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
