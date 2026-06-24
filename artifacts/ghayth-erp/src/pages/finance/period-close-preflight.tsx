import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, AlertCircle, ExternalLink, Lock,
  Calendar, ShieldCheck, ChevronRight,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { RefreshAction } from "@/components/page-actions";

/**
 * الفحص ما قبل إقفال الفترة — يستهلك endpoint الكنسي
 * GET /finance/fiscal-periods-v2/:id/close-preview.
 *
 * المنطق: الـ backend (collectPeriodCloseBlockers في periodCloseCoordinator)
 * هو نفسه المنسّق الذي يفحص ويرفض الإقفال فعلياً. هذه الصفحة لم تعد تنفّذ
 * fan-out يدوياً لاستعلامات متفرقة (كان مصدر انحراف بين ما يعرضه الـUI وما
 * يرفضه الـbackend). بدل ذلك تعرض قائمة الموانع الكنسية (blockers) تماماً كما
 * يُرجعها الـ endpoint، فيطابق ما يراه المحاسب 1:1 ما يرفضه النظام — شمولاً
 * لمانع القيود اليتيمة بالمصدر (orphan_source) المضاف في #2902.
 *
 * canClose يأتي من الـ backend (blockers.length === 0)، وزر الإقفال لا يتفعّل
 * إلا عليه. الإقفال نفسه يستدعي POST /finance/fiscal-periods-v2/:id/close.
 */

interface FiscalPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "locked";
  closedAt: string | null;
  closedBy: number | null;
}

// نفس عقد المانع في periodCloseCoordinator.ts (PeriodCloseBlocker).
type BlockerType =
  | "pending_manual_je"
  | "amortization"
  | "deferred_revenue"
  | "dimension"
  | "mapping_fallback"
  | "manual_no_reason"
  | "posting_failure"
  | "orphan_source";

interface PeriodCloseBlocker {
  type: BlockerType;
  source: string;
  recordRef?: string;
  reason: string;
  requiredAction: string;
}

interface PeriodCloseReport {
  periodId: number | null;
  periodName: string | null;
  startDate: string;
  endDate: string;
  totals: {
    totalJournalEntries: number;
    journalEntriesMissingDimensions: number;
    pendingManualJournalEntries: number;
    amortizationsExecuted: number;
    amortizationsRemaining: number;
    deferredRevenueRecognized: number;
    deferredRevenueRemaining: number;
    mappingFallbacks: number;
    manualWithoutReason: number;
    postingFailures: number;
  };
  blockerCount: number;
  closedBy: number | null;
  closedAt: string | null;
}

interface ClosePreviewResp {
  periodId: number;
  periodName: string;
  status: string;
  canClose: boolean;
  blockers: PeriodCloseBlocker[];
  report: PeriodCloseReport;
}

// تسمية عربية + رابط إصلاح لكل نوع مانع كنسي. التسمية فقط للعرض —
// المنطق الفعلي محسوم في الـ backend.
const BLOCKER_LABEL: Record<BlockerType, { label: string; fixHref: string; fixLabel: string }> = {
  pending_manual_je: {
    label: "قيود يدوية معلّقة",
    fixHref: "/finance/journal-manual",
    fixLabel: "إدارة القيود اليدوية",
  },
  amortization: {
    label: "إطفاء مصروفات مدفوعة مقدماً مستحق",
    fixHref: "/finance/amortization",
    fixLabel: "تشغيل الإطفاء",
  },
  deferred_revenue: {
    label: "تحقّق إيراد مؤجل مستحق",
    fixHref: "/finance/deferred-revenue",
    fixLabel: "تشغيل التحقّق",
  },
  dimension: {
    label: "بنود قيد بلا الأبعاد المطلوبة",
    fixHref: "/finance/reports/unmapped-lines",
    fixLabel: "إكمال الأبعاد",
  },
  mapping_fallback: {
    label: "ترحيل على حساب افتراضي",
    fixHref: "/finance/reports/ledger-truth",
    fixLabel: "فحص حقيقة الدفتر",
  },
  manual_no_reason: {
    label: "قيد يدوي تشغيلي بلا سبب",
    fixHref: "/finance/journal-manual",
    fixLabel: "إضافة السبب",
  },
  posting_failure: {
    label: "فشل ترحيل مالي غير معالَج",
    fixHref: "/admin/posting-failures",
    fixLabel: "معالجة الفشل",
  },
  orphan_source: {
    label: "قيود مُرحَّلة يتيمة بالمصدر",
    fixHref: "/finance/reports/ledger-truth",
    fixLabel: "فحص حقيقة الدفتر",
  },
};

export default function PeriodClosePreflightPage() {
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const { data: periods, isLoading: periodsLoading, isError: periodsError } =
    useApiQuery<{ data: FiscalPeriod[] }>(["fiscal-periods-v2"], `/finance/fiscal-periods-v2`);

  const openPeriods = useMemo(() => (periods?.data ?? []).filter((p) => p.status === "open"), [periods]);
  const defaultPeriodId = openPeriods[0]?.id ?? null;
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const period = useMemo(() => {
    const id = selectedPeriodId ?? defaultPeriodId;
    return id ? (periods?.data ?? []).find((p) => p.id === id) : null;
  }, [selectedPeriodId, defaultPeriodId, periods]);

  const startDate = period?.startDate?.slice(0, 10);
  const endDate = period?.endDate?.slice(0, 10);

  // المصدر الوحيد للحقيقة: نفس المنسّق الذي يرفض الإقفال فعلياً.
  const preview = useApiQuery<ClosePreviewResp>(
    ["period-close-preview", String(period?.id ?? "")],
    period ? `/finance/fiscal-periods-v2/${period.id}/close-preview` : null,
    !!period,
  );

  const closeMut = useApiMutation<unknown, { reason: string }>(
    () => `/finance/fiscal-periods-v2/${period?.id}/close`,
    "POST",
    [["fiscal-periods-v2"], ["period-close-preview"]],
  );

  if (periodsLoading) return <LoadingSpinner />;
  if (periodsError) return <ErrorState />;

  const noOpenPeriod = openPeriods.length === 0;

  const blockers = preview.data?.blockers ?? [];
  const report = preview.data?.report;
  const totals = report?.totals;
  // canClose يأتي من الـ backend كما هو — لا نعيد اشتقاقه في الواجهة.
  const canClose =
    period?.status === "open" && !preview.isLoading && !preview.isError && preview.data?.canClose === true;

  const handleClose = async () => {
    if (!period) return;
    try {
      await closeMut.mutateAsync({ reason });
      toast({ title: `تم إقفال "${period.name}" بنجاح`, description: "لا يمكن الترحيل على هذه الفترة بعد الآن" });
      setReason("");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر الإقفال",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  return (
    <PageShell
      title="الفحص ما قبل إقفال الفترة"
      subtitle="قائمة الموانع الكنسية من المنسّق نفسه الذي يرفض الإقفال — ما تراه هنا هو بالضبط ما يفحصه النظام عند الإقفال"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/fiscal-periods-v2", label: "الفترات المالية" },
        { label: "فحص ما قبل الإقفال" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {openPeriods.length > 0 && (
            <>
              <Label className="text-xs whitespace-nowrap">الفترة:</Label>
              <Select
                value={String(selectedPeriodId ?? defaultPeriodId ?? "")}
                onValueChange={(v) => setSelectedPeriodId(Number(v))}
              >
                <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {openPeriods.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <RefreshAction onRefresh={() => preview.refetch()} />
          <PrintButton
            entityType="report_finance_period_close_preflight"
            entityId={selectedPeriodId ? String(selectedPeriodId) : "list"}
            size="icon"
            payload={{
              entity: { title: "الفحص ما قبل إقفال الفترة", total: blockers.length },
              items: blockers.map((b) => ({
                "المانع": BLOCKER_LABEL[b.type]?.label ?? b.type,
                "السبب": b.reason,
                "الإجراء المطلوب": b.requiredAction,
                "المرجع": b.recordRef ?? "—",
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {noOpenPeriod ? (
        <Card className="my-8">
          <CardContent className="p-8 text-center">
            <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-base font-semibold mb-1">لا توجد فترة مالية مفتوحة</p>
            <p className="text-xs text-muted-foreground mb-4">
              لإقفال فترة جديدة يجب أن تكون مفتوحة. افتح صفحة الفترات وأنشئ/افتح فترة.
            </p>
            <Button asChild variant="outline" size="sm"><Link href="/finance/fiscal-periods-v2">
                <Calendar className="h-4 w-4 me-1" /> فتح صفحة الفترات
              </Link></Button>
          </CardContent>
        </Card>
      ) : !period ? null : (
        <>
          <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold mb-1 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> لماذا هذه الصفحة؟
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                هذه القائمة تأتي من المنسّق الكنسي نفسه (close-preview) الذي يفحص ويرفض
                الإقفال فعلياً. فما يظهر هنا من موانع هو بالضبط ما سيمنع الإقفال — بلا أي
                انحراف بين الواجهة والـ backend. لكل مانع: السبب، والإجراء المطلوب، ورابط
                مباشر لإصلاحه. زر الإقفال لا يتفعّل إلا عندما تكون قائمة الموانع فارغة.
              </p>
            </CardContent>
          </Card>

          {preview.isLoading ? (
            <LoadingSpinner />
          ) : preview.isError ? (
            <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">الفترة</p>
                    <p className="text-sm font-bold mt-1">{period.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{startDate} → {endDate}</p>
                  </CardContent>
                </Card>
                <Card className={blockers.length > 0 ? "border-red-300" : "border-emerald-300"}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <AlertCircle className="h-3 w-3" /> الموانع
                    </p>
                    <p className={`text-lg font-bold font-mono ${blockers.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {blockers.length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">إجمالي القيود في الفترة</p>
                    <p className="text-lg font-bold font-mono">{totals?.totalJournalEntries ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className={canClose ? "border-emerald-300" : "border-amber-300"}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      {canClose ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />} الحالة
                    </p>
                    <p className={`text-sm font-bold mt-1 ${canClose ? "text-emerald-700" : "text-amber-700"}`}>
                      {canClose ? "جاهزة للإقفال" : "غير جاهزة"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {blockers.length > 0 ? `الموانع الحاجبة (${blockers.length})` : "الموانع الحاجبة"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3">
                  {blockers.length === 0 ? (
                    <div className="flex items-center gap-3 p-3 rounded border border-emerald-300 bg-emerald-50/30">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <p className="text-sm">لا توجد موانع — الفترة اجتازت كل فحوصات الإقفال الكنسية.</p>
                    </div>
                  ) : (
                    blockers.map((b, i) => {
                      const meta = BLOCKER_LABEL[b.type] ?? {
                        label: b.type,
                        fixHref: "/finance/reports/ledger-truth",
                        fixLabel: "فحص حقيقة الدفتر",
                      };
                      return (
                        <div key={`${b.type}-${i}`}
                          className="flex items-center gap-3 p-2.5 rounded border border-red-300 bg-red-50/30">
                          <div className="shrink-0">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{meta.label}</span>
                              <Badge className="text-[10px] bg-red-100 text-red-800">يمنع الإقفال</Badge>
                              {b.recordRef && (
                                <Badge variant="outline" className="font-mono text-[10px]">{b.recordRef}</Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{b.reason}</p>
                            <p className="text-[11px] text-red-700/80 mt-0.5">الإجراء المطلوب: {b.requiredAction}</p>
                          </div>
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={meta.fixHref}>
                              {meta.fixLabel}
                              <ChevronRight className="h-3 w-3 ms-1" />
                            </Link></Button>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {totals && (
                <Card className="mb-4 bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">ملخّص الفترة (من تقرير الإقفال الكنسي)</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 text-xs">
                    <SummaryStat label="قيود بلا أبعاد مطلوبة" value={totals.journalEntriesMissingDimensions} />
                    <SummaryStat label="قيود يدوية معلّقة" value={totals.pendingManualJournalEntries} />
                    <SummaryStat label="إطفاءات مُرحَّلة" value={totals.amortizationsExecuted} />
                    <SummaryStat label="إطفاءات متبقية" value={totals.amortizationsRemaining} />
                    <SummaryStat label="إيرادات مؤجلة مُحقّقة" value={totals.deferredRevenueRecognized} />
                    <SummaryStat label="إيرادات مؤجلة متبقية" value={totals.deferredRevenueRemaining} />
                    <SummaryStat label="ترحيلات على حساب افتراضي" value={totals.mappingFallbacks} />
                    <SummaryStat label="قيود يدوية بلا سبب" value={totals.manualWithoutReason} />
                    <SummaryStat label="فشل ترحيل مالي" value={totals.postingFailures} />
                  </CardContent>
                </Card>
              )}

              <Card className={canClose ? "border-emerald-400 bg-emerald-50/30" : "border-amber-300 bg-amber-50/20"}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    {canClose
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                      : <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-semibold text-sm mb-1">
                        {canClose
                          ? "الفترة جاهزة للإقفال"
                          : `الفترة غير جاهزة — ${blockers.length} مانع حاجب`}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {canClose
                          ? "لا توجد موانع. اضغط الإقفال أدناه."
                          : "أصلح الموانع الحاجبة أعلاه أولاً. الـ backend سيرفض الإقفال طالما بقي مانع واحد."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">ملاحظات الإقفال (تظهر في سجل التدقيق)</Label>
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                        placeholder="مثال: إقفال شهر أبريل بعد معالجة كل الموانع الحاجبة" />
                    </div>
                    <GuardedButton perm="finance:approve" disabled={!canClose}
                      className={canClose ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                      onClick={() => setConfirmCloseOpen(true)}>
                      <Lock className="h-4 w-4 me-1" /> إقفال الفترة
                    </GuardedButton>
                    <ConfirmActionDialog
                      open={confirmCloseOpen}
                      onOpenChange={setConfirmCloseOpen}
                      variant="destructive"
                      title={`تأكيد إقفال "${period.name}"؟`}
                      description="بعد الإقفال لن يُسمح بالترحيل على هذه الفترة. الإعادة تتطلب صلاحية CFO + سبب موثّق."
                      confirmLabel={closeMut?.isPending ? "جاري الإقفال…" : "نعم، أقفل"}
                      pending={closeMut?.isPending}
                      onConfirm={() => { setConfirmCloseOpen(false); handleClose(); }}
                      confirmPerm="finance:approve"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-4 bg-muted/30">
                <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  بعد الإقفال، لإعادة الفتح: استخدم
                  <code className="bg-white border px-1 rounded mx-1">/finance/fiscal-periods-v2</code> —
                  فيها زر إعادة الفتح للمستوى CFO فقط.
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-white/60 p-2 text-center">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className={`text-base font-bold font-mono mt-0.5 ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
