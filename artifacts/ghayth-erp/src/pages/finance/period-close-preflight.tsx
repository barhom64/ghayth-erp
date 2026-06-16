import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  CheckCircle2, AlertCircle, AlertTriangle, ExternalLink, Lock,
  Loader2, Calendar, ShieldCheck, RefreshCw, ChevronRight,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Period close pre-flight. Fans out 10 readiness queries against
 * existing finance endpoints, paints each with green / amber / red,
 * and gates the close button on zero red blockers.
 *
 * The backend close endpoint (POST /finance/fiscal-periods-v2/:id/close)
 * only checks ONE pre-condition (unposted manual journals). The other
 * 9 are advisory checks the user runs manually today. This page makes
 * the full pre-flight one screen with deep-links to fix each blocker.
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

type CheckSeverity = "blocker" | "warn" | "info";

interface CheckDef {
  key: string;
  label: string;
  description: string;
  severity: CheckSeverity;
  fixHref: string;
  fixLabel: string;
}

const CHECK_DEFS: CheckDef[] = [
  {
    key: "draftManualJournals",
    label: "قيود يدوية معلّقة",
    description: "قيود draft/pending — يجب اعتمادها أو حذفها قبل الإقفال (يمنع الـ backend)",
    severity: "blocker",
    fixHref: "/finance/journal-manual",
    fixLabel: "إدارة القيود اليدوية",
  },
  {
    key: "draftInvoices",
    label: "فواتير مبيعات draft",
    description: "فواتير ما زالت في حالة مسودة — يجب اعتمادها أو حذفها",
    severity: "warn",
    fixHref: "/finance/invoices",
    fixLabel: "فتح الفواتير",
  },
  {
    key: "pendingExpenses",
    label: "مصاريف بانتظار الاعتماد",
    description: "مصاريف pending — يجب اعتمادها قبل إقفال الفترة",
    severity: "warn",
    fixHref: "/finance/expenses",
    fixLabel: "اعتماد المصاريف",
  },
  {
    key: "glIntegrityGaps",
    label: "فجوات في تسلسل القيود (GL Integrity)",
    description: "فجوات في تسلسل الـ ref — مؤشر على قيود محذوفة قسرياً",
    severity: "blocker",
    fixHref: "/finance/gl-integrity-gaps",
    fixLabel: "فحص الفجوات",
  },
  {
    key: "unmappedLines",
    label: "بنود JE غير موجَّهة",
    description: "بنود بدون allocation rule — يجب إصلاح التوجيه قبل الإقفال",
    severity: "blocker",
    fixHref: "/finance/unmapped-lines",
    fixLabel: "إصلاح البنود",
  },
  {
    key: "postingFailures",
    label: "فشل ترحيل (Posting Failures)",
    description: "قيود فشلت في الترحيل ولم تُعالج — تحتاج fix يدوي",
    severity: "blocker",
    fixHref: "/admin/posting-failures",
    fixLabel: "فحص الفشل",
  },
  {
    key: "openCustomerAdvances",
    label: "دفعات مقدمة مفتوحة",
    description: "دفعات مقدمة من العملاء غير مطبقة — يفضّل تطبيقها على فواتير",
    severity: "info",
    fixHref: "/finance/customer-advances",
    fixLabel: "تطبيق الدفعات",
  },
  {
    key: "fxRevaluation",
    label: "إعادة تقييم العملات (FX Revaluation)",
    description: "لم يُنشأ قيد إعادة تقييم لهذه الفترة — مطلوب لو في فواتير FX مفتوحة",
    severity: "warn",
    fixHref: "/finance/fx-revaluation",
    fixLabel: "تشغيل التقييم",
  },
  {
    key: "vatReconciliation",
    label: "تطابق ضريبة VAT",
    description: "صافي VAT في الـ GL يجب أن يطابق مجموع الفواتير — يُفحص قبل تقديم الإقرار",
    severity: "warn",
    fixHref: "/finance/reports/vat-reconciliation",
    fixLabel: "فحص VAT",
  },
  {
    key: "bankReconciliation",
    label: "تسوية البنك",
    description: "كشوف البنك يجب أن تكون متطابقة مع GL — يكشف فروقات مبكراً",
    severity: "warn",
    fixHref: "/finance/bank-reconciliation",
    fixLabel: "تسوية البنك",
  },
];

const SEVERITY_STYLE: Record<CheckSeverity, { row: string; chip: string; label: string }> = {
  blocker: { row: "border-red-300 bg-red-50/30",       chip: "bg-red-100 text-red-800",       label: "يمنع الإقفال" },
  warn:    { row: "border-amber-300 bg-amber-50/30",    chip: "bg-amber-100 text-amber-800",   label: "تحذير قوي" },
  info:    { row: "border-status-info-surface",         chip: "bg-blue-100 text-blue-800",     label: "تنبيه" },
};

interface ListResp { data?: any[]; total?: number }
interface FxRevalResp { data?: any[] }

function countOf(d: ListResp | undefined): number {
  if (!d) return 0;
  if (typeof d.total === "number") return d.total;
  if (Array.isArray(d.data)) return d.data.length;
  return 0;
}

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
  const periodYM = startDate?.slice(0, 7) ?? `${currentYearRiyadh()}-${currentMonthPaddedRiyadh()}`;

  const dateParams = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : "";
  const enabled = !!period;

  const qDraftJrnl = useApiQuery<ListResp>(
    ["preflight-draft-journals", String(period?.id ?? "")],
    `/finance/journal-manual?status=draft&limit=1${enabled ? "" : ""}`,
    enabled,
  );
  const qPendingJrnl = useApiQuery<ListResp>(
    ["preflight-pending-journals", String(period?.id ?? "")],
    `/finance/journal-manual?status=pending_review&limit=1`,
    enabled,
  );

  const qDraftInv = useApiQuery<ListResp>(
    ["preflight-draft-invoices", String(period?.id ?? "")],
    `/finance/invoices?status=draft&limit=1`,
    enabled,
  );

  const qPendingExp = useApiQuery<ListResp>(
    ["preflight-pending-expenses", String(period?.id ?? "")],
    `/finance/expenses?status=pending&limit=1`,
    enabled,
  );

  const qIntegrity = useApiQuery<{ data?: any[]; totalGaps?: number }>(
    ["preflight-integrity", String(period?.id ?? "")],
    `/finance/reports/gl-integrity-gaps${dateParams}`,
    enabled,
  );

  const qUnmapped = useApiQuery<ListResp>(
    ["preflight-unmapped", String(period?.id ?? "")],
    `/finance/reports/unmapped-lines${dateParams}`,
    enabled,
  );

  const qFailures = useApiQuery<ListResp>(
    ["preflight-failures", String(period?.id ?? "")],
    `/finance/posting-failures?status=unresolved&limit=1`,
    enabled,
  );

  const qAdvances = useApiQuery<ListResp>(
    ["preflight-advances", String(period?.id ?? "")],
    `/finance/customer-advances?status=open&limit=1`,
    enabled,
  );

  const qFxReval = useApiQuery<FxRevalResp>(
    ["preflight-fx-reval", String(period?.id ?? "")],
    `/finance/fx/revaluation`,
    enabled,
  );

  const qVat = useApiQuery<any>(
    ["preflight-vat", String(period?.id ?? "")],
    `/finance/reports/vat-reconciliation${dateParams}`,
    enabled,
  );

  const qBank = useApiQuery<any>(
    ["preflight-bank", String(period?.id ?? "")],
    `/finance/bank-reconciliation/summary${dateParams}`,
    enabled,
  );

  const closeMut = useApiMutation<unknown, { reason: string }>(
    () => `/finance/fiscal-periods-v2/${period?.id}/close`,
    "POST",
    [["fiscal-periods-v2"], ["preflight-draft-journals"], ["preflight-pending-journals"]],
  );

  if (periodsLoading) return <LoadingSpinner />;
  if (periodsError) return <ErrorState />;

  const noOpenPeriod = openPeriods.length === 0;

  // Pre-flight evaluation
  const checks: Array<{ def: CheckDef; count: number; status: "pass" | "fail" | "loading" }> = [];
  if (period) {
    const draftCount = countOf(qDraftJrnl.data) + countOf(qPendingJrnl.data);
    const pushCheck = (key: string, count: number, loading: boolean) => {
      const def = CHECK_DEFS.find((d) => d.key === key)!;
      const status: "pass" | "fail" | "loading" =
        loading ? "loading" : count > 0 ? "fail" : "pass";
      checks.push({ def, count, status });
    };
    pushCheck("draftManualJournals", draftCount,
      qDraftJrnl.isLoading || qPendingJrnl.isLoading);
    pushCheck("draftInvoices", countOf(qDraftInv.data), qDraftInv.isLoading);
    pushCheck("pendingExpenses", countOf(qPendingExp.data), qPendingExp.isLoading);
    pushCheck("glIntegrityGaps",
      Number(qIntegrity.data?.totalGaps ?? qIntegrity.data?.data?.length ?? 0),
      qIntegrity.isLoading);
    pushCheck("unmappedLines", countOf(qUnmapped.data), qUnmapped.isLoading);
    pushCheck("postingFailures", countOf(qFailures.data), qFailures.isLoading);
    pushCheck("openCustomerAdvances", countOf(qAdvances.data), qAdvances.isLoading);

    const fxRows = qFxReval.data?.data ?? [];
    const fxForPeriod = fxRows.filter((r: any) => {
      const d = String(r.revaluationDate ?? "").slice(0, 7);
      return d === periodYM;
    }).length;
    pushCheck("fxRevaluation", fxForPeriod === 0 ? 1 : 0, qFxReval.isLoading);

    const vatDiff = Math.abs(Number(qVat.data?.difference ?? 0));
    pushCheck("vatReconciliation", vatDiff > 0.01 ? 1 : 0, qVat.isLoading);

    const bankDiff = Math.abs(Number(qBank.data?.unmatchedCount ?? 0));
    pushCheck("bankReconciliation", bankDiff > 0 ? 1 : 0, qBank.isLoading);
  }

  const blockers = checks.filter((c) => c.status === "fail" && c.def.severity === "blocker").length;
  const warnings = checks.filter((c) => c.status === "fail" && c.def.severity === "warn").length;
  const passes  = checks.filter((c) => c.status === "pass").length;
  const loading = checks.filter((c) => c.status === "loading").length;
  const canClose = period?.status === "open" && blockers === 0 && loading === 0;

  const refreshAll = () => {
    qDraftJrnl.refetch();
    qPendingJrnl.refetch();
    qDraftInv.refetch();
    qPendingExp.refetch();
    qIntegrity.refetch();
    qUnmapped.refetch();
    qFailures.refetch();
    qAdvances.refetch();
    qFxReval.refetch();
    qVat.refetch();
    qBank.refetch();
  };

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
      subtitle="10 فحوصات على الفترة المختارة قبل الإقفال — زر الإقفال الآمن لا يتفعّل إلا بعد اجتياز كل الفحوصات الحاجبة"
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
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 me-1" /> تحديث
          </Button>
          <PrintButton
            entityType="report_finance_period_close_preflight"
            entityId={selectedPeriodId ? String(selectedPeriodId) : "list"}
            size="icon"
            payload={{
              entity: { title: "الفحص ما قبل إقفال الفترة", total: checks.length },
              items: checks.map((c) => ({
                "الفحص": c.def.label,
                "الشدة": c.def.severity,
                "العدد": c.count,
                "الحالة": c.status === "pass" ? "ناجح" : c.status === "fail" ? "فاشل" : "جاري التحميل",
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
            <p className="text-base font-semibold mb-1">ما في فترة مالية مفتوحة</p>
            <p className="text-xs text-muted-foreground mb-4">
              لإقفال فترة جديدة لازم تكون مفتوحة. افتح صفحة الفترات وأنشئ/افتح فترة.
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
                <ShieldCheck className="h-4 w-4" /> ليش هذي الصفحة؟
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                الـ backend يفحص بند واحد فقط عند الإقفال (القيود اليدوية المعلّقة).
                البقية 9 فحوصات يتقدّمها المحاسب يدوياً بفتح صفحات متفرقة. هذي
                الصفحة تجمع كل الفحوصات في مكان واحد + تعطّل زر الإقفال لو في
                blockers + توفّر deep-link لإصلاح كل bunch مباشرة.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">الفترة</p>
                <p className="text-sm font-bold mt-1">{period.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{startDate} → {endDate}</p>
              </CardContent>
            </Card>
            <Card className="border-red-300">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Blockers
                </p>
                <p className="text-lg font-bold font-mono text-red-700">{blockers}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-300">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> تحذيرات
                </p>
                <p className="text-lg font-bold font-mono text-amber-700">{warnings}</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-300">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> ناجحة
                </p>
                <p className="text-lg font-bold font-mono text-emerald-700">{passes}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">قائمة الفحوصات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {checks.map(({ def, count, status }) => {
                const sty = SEVERITY_STYLE[def.severity];
                return (
                  <div key={def.key}
                    className={`flex items-center gap-3 p-2.5 rounded border ${
                      status === "pass" ? "border-emerald-300 bg-emerald-50/30" : sty.row
                    }`}>
                    <div className="shrink-0">
                      {status === "loading"
                        ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        : status === "pass"
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        : <AlertCircle className={`h-5 w-5 ${def.severity === "blocker" ? "text-red-600" : def.severity === "warn" ? "text-amber-600" : "text-blue-600"}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{def.label}</span>
                        <Badge className={`text-[10px] ${sty.chip}`}>{sty.label}</Badge>
                        {status === "fail" && count > 0 && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {def.key === "vatReconciliation" || def.key === "fxRevaluation" || def.key === "bankReconciliation"
                              ? "غير متطابق"
                              : `${count} عنصر`}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{def.description}</p>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={def.fixHref}>
                        {def.fixLabel}
                        <ChevronRight className="h-3 w-3 ms-1" />
                      </Link></Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className={canClose ? "border-emerald-400 bg-emerald-50/30" : "border-amber-300 bg-amber-50/20"}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3 mb-3">
                {canClose
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />}
                <div className="flex-1">
                  <p className="font-semibold text-sm mb-1">
                    {canClose
                      ? "الفترة جاهزة للإقفال 🎉"
                      : `الفترة غير جاهزة — ${blockers} blockers + ${warnings} تحذيرات`}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {canClose
                      ? "كل الـ blockers خضراء. الـ warnings ليست ضرورية لكنها مستحسنة. اضغط الإقفال أدناه."
                      : "أصلح الـ blockers الحمراء أولاً. الـ backend سيرفض الإقفال طالما عندك blockers."}
                  </p>
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs">ملاحظات الإقفال (تظهر في سجل التدقيق)</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder="مثال: إقفال شهر أبريل بعد تطابق VAT وقفل الرواتب" />
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
                  description="بعد الإقفال لن يُسمح بالترحيل على هذه الفترة. الإعادة تتطلب صلاحية CFO + سبب موثّق. تأكد من تطابق VAT والبنك قبل المتابعة."
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
              بعد الإقفال، لو احتجت إعادة فتح: استخدم
              <code className="bg-white border px-1 rounded mx-1">/finance/fiscal-periods-v2</code> —
              فيها زر إعادة الفتح للمستوى CFO فقط.
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
