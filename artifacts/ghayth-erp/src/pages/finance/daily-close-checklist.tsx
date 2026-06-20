import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronRight,
  Calendar, ListChecks, Download,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";
import { RefreshAction } from "@/components/page-actions";

/**
 * Daily Finance Close Checklist
 *
 * Practical daily routine for the accountant / AR clerk / AP clerk to
 * verify the day's books are clean before signing off. Runs ~8 small
 * parallel checks against existing endpoints and shows green/red
 * per check with a deep-link to fix anything that's flagged.
 *
 * Endpoints (all read-only):
 *   GET /finance/journal-manual?status=draft|pending
 *   GET /finance/invoices?status=draft
 *   GET /finance/expenses?status=pending|draft
 *   GET /finance/reports/gl-integrity-gaps
 *   GET /finance/reports/unmapped-lines
 *   GET /finance/journal/posting-failures (optional)
 *   GET /finance/ar-aging
 *   GET /finance/payment-run/pending
 */

interface ListResp<T = unknown> {
  data?: T[];
  total?: number;
  summary?: Record<string, unknown>;
}

interface AgingResp {
  summary?: { grandTotal?: number; over90?: number };
}

interface ApResp {
  totalDue?: number;
  data?: Array<{ expectedDelivery?: string | null }>;
}

type Severity = "ok" | "warning" | "blocker";

interface CheckResult {
  key: string;
  title: string;
  description: string;
  severity: Severity;
  count: number;
  amount?: number;
  fixLabel: string;
  fixHref: string;
  loading: boolean;
}

export default function DailyCloseChecklistPage() {
  const [date, setDate] = useState(() => todayLocal());

  const draftJe = useApiQuery<ListResp>(
    ["dcc-draft-je", date],
    `/finance/journal-manual?status=draft`,
  );
  const pendingJe = useApiQuery<ListResp>(
    ["dcc-pending-je", date],
    `/finance/journal-manual?status=pending`,
  );
  const draftInvoices = useApiQuery<ListResp>(
    ["dcc-draft-inv", date],
    `/finance/invoices?status=draft`,
  );
  const pendingExpenses = useApiQuery<ListResp>(
    ["dcc-pending-exp", date],
    `/finance/expenses?status=pending`,
  );
  const integrityGaps = useApiQuery<ListResp>(
    ["dcc-integrity", date],
    `/finance/reports/gl-integrity-gaps`,
  );
  const unmappedLines = useApiQuery<ListResp>(
    ["dcc-unmapped", date],
    `/finance/reports/unmapped-lines`,
  );
  const arAging = useApiQuery<AgingResp>(
    ["dcc-ar", date],
    `/finance/ar-aging?asOfDate=${date}`,
  );
  const apPending = useApiQuery<ApResp>(
    ["dcc-ap", date],
    `/finance/payment-run/pending`,
  );

  const allLoading = [draftJe, pendingJe, draftInvoices, pendingExpenses, integrityGaps, unmappedLines, arAging, apPending]
    .some(q => q.isLoading);

  const checks = useMemo<CheckResult[]>(() => {
    const draftJeCount = draftJe.data?.data?.length ?? draftJe.data?.total ?? 0;
    const pendingJeCount = pendingJe.data?.data?.length ?? pendingJe.data?.total ?? 0;
    const draftInvCount = draftInvoices.data?.data?.length ?? draftInvoices.data?.total ?? 0;
    const pendingExpCount = pendingExpenses.data?.data?.length ?? pendingExpenses.data?.total ?? 0;
    const integrityCount = integrityGaps.data?.data?.length ?? integrityGaps.data?.total ?? 0;
    const unmappedCount = unmappedLines.data?.data?.length ?? unmappedLines.data?.total ?? 0;
    const arOver90 = Number(arAging.data?.summary?.over90 ?? 0);
    const arOverdueTotal = Number(arAging.data?.summary?.grandTotal ?? 0);
    const overdueAp = (apPending.data?.data ?? []).filter(po => {
      if (!po.expectedDelivery) return false;
      return new Date(po.expectedDelivery).getTime() < new Date(date + "T00:00:00Z").getTime();
    });
    const overdueApCount = overdueAp.length;

    return [
      {
        key: "draft-je",
        title: "قيود مسودة",
        description: "قيود يدوية لم تُعتمَد بعد — اعتمدها أو احذفها قبل قفل اليوم",
        severity: draftJeCount === 0 ? "ok" : draftJeCount <= 3 ? "warning" : "blocker",
        count: draftJeCount,
        fixLabel: "افتح القيود اليدوية",
        fixHref: "/finance/journal-manual?status=draft",
        loading: draftJe.isLoading,
      },
      {
        key: "pending-je",
        title: "قيود بانتظار اعتماد",
        description: "قيود رُفعت للاعتماد ولم تُرحَّل بعد — متابعة المدير المالي",
        severity: pendingJeCount === 0 ? "ok" : "warning",
        count: pendingJeCount,
        fixLabel: "افتح القيود المعلقة",
        fixHref: "/finance/journal-manual?status=pending",
        loading: pendingJe.isLoading,
      },
      {
        key: "draft-invoices",
        title: "فواتير مسودة",
        description: "فواتير لم تُعتمد ولم تُرسل للعملاء — أكمل تجهيزها",
        severity: draftInvCount === 0 ? "ok" : "warning",
        count: draftInvCount,
        fixLabel: "افتح صف الفواتير",
        fixHref: "/finance/invoice-send-queue",
        loading: draftInvoices.isLoading,
      },
      {
        key: "pending-expenses",
        title: "مصاريف بانتظار اعتماد",
        description: "مصاريف رُفعت ولم تُعتمد بعد",
        severity: pendingExpCount === 0 ? "ok" : "warning",
        count: pendingExpCount,
        fixLabel: "افتح صندوق الاعتمادات",
        fixHref: "/finance/approvals-inbox",
        loading: pendingExpenses.isLoading,
      },
      {
        key: "integrity-gaps",
        title: "ثغرات نزاهة GL",
        description: "قيود غير متوازنة أو حسابات بدون مقابل — لا يجب أن توجد",
        severity: integrityCount === 0 ? "ok" : "blocker",
        count: integrityCount,
        fixLabel: "افتح ثغرات النزاهة",
        fixHref: "/finance/reports/gl-integrity-gaps",
        loading: integrityGaps.isLoading,
      },
      {
        key: "unmapped-lines",
        title: "بنود بدون ربط",
        description: "بنود JE بدون رمز حساب صحيح — تحتاج تصحيح",
        severity: unmappedCount === 0 ? "ok" : "blocker",
        count: unmappedCount,
        fixLabel: "افتح البنود غير المربوطة",
        fixHref: "/finance/reports/unmapped-lines",
        loading: unmappedLines.isLoading,
      },
      {
        key: "ar-over90",
        title: "ذمم مدينة متأخرة +90 يوم",
        description: "عملاء متأخرون أكثر من 90 يوم — راجع منضدة التحصيل",
        severity: arOver90 === 0 ? "ok" : arOver90 < arOverdueTotal * 0.2 ? "warning" : "blocker",
        count: arOver90 > 0 ? 1 : 0,
        amount: arOver90,
        fixLabel: "افتح منضدة التحصيل",
        fixHref: "/finance/ar-collection-workbench",
        loading: arAging.isLoading,
      },
      {
        key: "ap-overdue",
        title: "دفعات للموردين متأخرة",
        description: "أوامر شراء متأخرة الدفع — راجع الموردين وخطط الدفع",
        severity: overdueApCount === 0 ? "ok" : overdueApCount <= 5 ? "warning" : "blocker",
        count: overdueApCount,
        fixLabel: "افتح منضدة التسوية",
        fixHref: "/finance/vendor-settlement-workbench",
        loading: apPending.isLoading,
      },
    ];
  }, [
    draftJe.data, pendingJe.data, draftInvoices.data, pendingExpenses.data,
    integrityGaps.data, unmappedLines.data, arAging.data, apPending.data,
    draftJe.isLoading, pendingJe.isLoading, draftInvoices.isLoading, pendingExpenses.isLoading,
    integrityGaps.isLoading, unmappedLines.isLoading, arAging.isLoading, apPending.isLoading,
    date,
  ]);

  const okCount = checks.filter(c => c.severity === "ok").length;
  const warnCount = checks.filter(c => c.severity === "warning").length;
  const blockerCount = checks.filter(c => c.severity === "blocker").length;
  const score = Math.round((okCount / checks.length) * 100);
  const canClose = blockerCount === 0;

  const refetchAll = () => {
    [draftJe, pendingJe, draftInvoices, pendingExpenses, integrityGaps, unmappedLines, arAging, apPending]
      .forEach(q => q.refetch?.());
  };

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`قائمة الفحص اليومي — ${date}`);
    lines.push(`نسبة الجاهزية: ${score}%`);
    lines.push("");
    lines.push("الفحص,الحالة,العدد,المبلغ,التفاصيل");
    for (const c of checks) {
      lines.push([
        c.title.replace(/,/g, "،"),
        c.severity === "ok" ? "ناجح" : c.severity === "warning" ? "تحذير" : "حرج",
        c.count.toString(),
        c.amount ? c.amount.toFixed(2) : "",
        c.description.replace(/,/g, "،"),
      ].join(","));
    }
    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_daily_close_checklist",
        title: String(`daily-close-${date}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="فحص الإغلاق اليومي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "فحص الإغلاق اليومي" },
      ]}
      subtitle="روتين يومي للمحاسب — تحقق من نظافة دفاتر اليوم قبل إغلاقه"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              التاريخ
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="flex-1" />
          <RefreshAction onRefresh={refetchAll} />
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={allLoading}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_daily_close"
            entityId={date}
            payload={{
              entity: {
                title: "فحص الإغلاق اليومي",
                date,
                readinessScore: `${score}%`,
                checkCount: checks.length,
              },
              items: checks.map((c) => ({
                "الفحص": c.title,
                "الحالة": c.severity === "ok" ? "ناجح" : c.severity === "warning" ? "تحذير" : "حرج",
                "العدد": c.count,
                "المبلغ": c.amount ? Number(c.amount) : "",
                "التفاصيل": c.description,
              })),
            }}
          />
        </CardContent>
      </Card>

      {/* Top score card */}
      <Card className={`mb-4 ${canClose ? "border-status-success-foreground border-2" : "border-status-warning-foreground border-2"}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {canClose ? (
                <CheckCircle2 className="w-12 h-12 text-status-success-foreground" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-status-warning-foreground" />
              )}
              <div>
                <div className="text-xs text-muted-foreground">جاهزية إغلاق {formatDateAr(date)}</div>
                <div className={`text-3xl font-bold tabular-nums ${canClose ? "text-status-success-foreground" : "text-status-warning-foreground"}`}>
                  {score}%
                </div>
                <div className="text-sm mt-1">
                  {canClose
                    ? "اليوم جاهز للإغلاق — لا توجد ثغرات حرجة"
                    : `${blockerCount} ثغرة حرجة تحتاج معالجة قبل الإغلاق`}
                </div>
              </div>
            </div>
            <div className="text-end space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-3 h-3 text-status-success-foreground" />
                <span>{okCount} ناجح</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-3 h-3 text-status-warning-foreground" />
                <span>{warnCount} تحذير</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="w-3 h-3 text-status-danger-foreground" />
                <span>{blockerCount} حرج</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checks list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            قائمة الفحوصات ({checks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-2">
              {checks.map(c => {
                const iconColor = c.severity === "ok" ? "text-status-success-foreground" :
                                  c.severity === "warning" ? "text-status-warning-foreground" :
                                  "text-status-danger-foreground";
                const surfaceColor = c.severity === "ok" ? "bg-status-success-surface" :
                                     c.severity === "warning" ? "bg-status-warning-surface" :
                                     "bg-status-danger-surface";
                const Icon = c.severity === "ok" ? CheckCircle2 :
                             c.severity === "warning" ? AlertTriangle :
                             XCircle;
                const showBadge = c.count > 0 || (c.amount ?? 0) > 0;
                return (
                  <div
                    key={c.key}
                    className={`border rounded p-3 ${c.severity === "ok" ? "" : surfaceColor}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                            {c.title}
                            {showBadge && (
                              <Badge variant="outline" className={`text-[10px] ${iconColor}`}>
                                {c.amount && c.amount > 0
                                  ? formatCurrency(c.amount)
                                  : `${c.count}`}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {c.description}
                          </div>
                        </div>
                      </div>
                      {c.severity !== "ok" && (
                        <Button asChild variant="outline" size="sm"><Link href={c.fixHref}>
                            {c.fixLabel}
                            <ChevronRight className="w-3 h-3 mr-1" />
                          </Link></Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <Card className="mt-4">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">
            💡 شغّل هذا الفحص في نهاية كل يوم قبل المغادرة. النسبة المثالية 100% (الكل أخضر).
            إذا ظهر "حرج" تعامل معه فوراً — ثغرات GL أو بنود غير مربوطة قد تفسد التقارير المالية.
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
