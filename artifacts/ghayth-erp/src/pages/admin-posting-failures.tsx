import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle, XCircle, PlayCircle, Trash2,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { PrintButton } from "@/components/shared/print-button";

type SummaryRow = { sourceType: string; cnt: number; sampleError: string | null; firstAt: string; lastAt: string };
type RetryAllResult = {
  processed: number; resolved: number; stillFailing: number; notSupported: number; remaining: number;
  lastId: number; hasMore: boolean;
  byType: Record<string, { resolved: number; stillFailing: number; notSupported: number; sampleError?: string }>;
};

export default function AdminPostingFailures() {
  const { toast } = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ resolved: number; remaining: number } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<{ sourceType?: string } | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["posting-failures", String(showResolved)],
    `/finance/posting-failures?resolved=${showResolved}`,
  );
  const { data: summaryData, refetch: refetchSummary } = useApiQuery<{ data: SummaryRow[]; total: number }>(
    ["posting-failures-summary"],
    `/finance/posting-failures/summary`,
  );

  const rows = data?.data ?? [];
  const summary: SummaryRow[] = summaryData?.data ?? [];
  const openTotal = summaryData?.total ?? 0;

  function refreshAll() {
    refetch();
    refetchSummary();
  }

  async function resolveOne(id: number) {
    setBusy(true);
    try {
      await apiFetch(`/finance/posting-failures/${id}/resolve`, { method: "PATCH" });
      toast({ title: "تم إغلاق المشكلة" });
      refreshAll();
    } catch (e: any) {
      toast({ title: "تعذّر الإغلاق", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function retryOne(id: number) {
    setBusy(true);
    try {
      const r = await apiFetch<{ resolved: boolean; message: string }>(
        `/finance/posting-failures/${id}/retry`, { method: "POST" },
      );
      toast({
        title: r.resolved ? "تمت إعادة الترحيل وإغلاق السجل" : "تعذّرت إعادة المحاولة التلقائية",
        description: r.message,
        variant: r.resolved ? undefined : "destructive",
      });
      refreshAll();
    } catch (e: any) {
      toast({ title: "فشل إعادة المحاولة", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function retryAll() {
    setBusy(true);
    setProgress({ resolved: 0, remaining: openTotal });
    let totalResolved = 0;
    let afterId = 0;
    let lastRemaining = openTotal;
    let guardLoops = 0;
    try {
      // Walk the whole retryable backlog via a strictly-advancing id cursor, so a
      // window of still-failing rows can't stall progress before reaching later
      // resolvable rows. Termination is guaranteed: hasMore is false once a
      // partial batch returns, and afterId only ever increases.
      while (guardLoops < 1000) {
        guardLoops++;
        const r = await apiFetch<RetryAllResult>(
          `/finance/posting-failures/retry-all`,
          { method: "POST", body: JSON.stringify({ afterId }) },
        );
        totalResolved += r.resolved;
        lastRemaining = r.remaining;
        setProgress({ resolved: totalResolved, remaining: r.remaining });
        if (!r.hasMore) break;
        // Cursor must advance; guard against a non-advancing server response.
        if (r.lastId <= afterId) break;
        afterId = r.lastId;
      }
      toast({
        title: `تمت إعادة ترحيل ${totalResolved} قيد`,
        description: lastRemaining > 0
          ? `يتبقّى ${lastRemaining} سجلًا لا تقبل إعادة المحاولة التلقائية (أو ما زالت تفشل) وتحتاج معالجة يدوية أو تجاهلًا.`
          : `تم تصريف كل القيود الفاشلة.`,
      });
      refreshAll();
    } catch (e: any) {
      toast({ title: "تعذّر إكمال إعادة المحاولة", description: e?.message, variant: "destructive" });
      refreshAll();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function bulkResolve(sourceType?: string) {
    setBusy(true);
    try {
      const r = await apiFetch<{ resolved: number; message: string }>(
        `/finance/posting-failures/bulk-resolve`,
        { method: "POST", body: JSON.stringify(sourceType ? { sourceType } : {}) },
      );
      toast({ title: r.message ?? `تم إغلاق ${r.resolved} سجل` });
      refreshAll();
    } catch (e: any) {
      toast({ title: "تعذّر الإغلاق الجماعي", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmBulk(null);
    }
  }

  const failureColumns: DataTableColumn<any>[] = useMemo(() => [
    { key: "id", header: "#", render: (r: any) => <span className="text-xs">{r.id}</span> },
    { key: "sourceType", header: "النوع", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.sourceType || r.operation || "—"}</span> },
    { key: "sourceId", header: "المصدر", render: (r: any) => <span className="text-xs">{r.sourceId ? `#${r.sourceId}` : "—"}</span> },
    { key: "error", header: "الخطأ", render: (r: any) => <span className="text-xs text-status-error-foreground max-w-[300px] truncate block" title={r.error || r.errorMessage || ""}>{r.error || r.errorMessage || "—"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r: any) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
    { key: "resolved", header: "الحالة", render: (r: any) => r.resolved ? (
      <Badge className="bg-status-success-surface text-status-success-foreground">محلول</Badge>
    ) : (
      <Badge className="bg-status-error-surface text-status-error-foreground">مفتوح</Badge>
    )},
    { key: "actions", header: "إجراء", hidden: showResolved, render: (r: any) => (
      <div className="flex gap-1">
        <GuardedButton perm="finance.hardening:approve" variant="outline" size="sm" disabled={busy} onClick={() => retryOne(r.id)}>
          إعادة محاولة
        </GuardedButton>
        <GuardedButton perm="finance.hardening:approve" variant="ghost" size="sm" disabled={busy} onClick={() => resolveOne(r.id)}>
          تجاهل
        </GuardedButton>
      </div>
    )},
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [showResolved, busy]);

  return (
    <PageShell
      title="فشل القيود المالية"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "فشل القيود المالية" },
      ]}
      subtitle="عمليات القيد في دفتر الأستاذ التي فشلت وتحتاج معالجة"
      loading={isLoading}
      actions={
        <div className="flex gap-2">
          <PrintButton
            entityType="report_posting_failures"
            entityId="list"
            size="icon"
            label="طباعة سجل فشل القيود"
            payload={() => ({
              entity: {
                title: showResolved ? "سجل فشل القيود — المحلولة" : "سجل فشل القيود — المفتوحة",
                total: rows.length,
                showResolved,
              },
              items: rows.map((r: any) => ({
                "#": r.id,
                "النوع": r.sourceType || r.operation || "—",
                "المصدر": r.sourceId ? `#${r.sourceId}` : "—",
                "الخطأ": r.error || r.errorMessage || "—",
                "التاريخ": r.createdAt ? formatDateAr(r.createdAt) : "—",
                "الحالة": r.resolved ? "محلول" : "مفتوح",
              })),
            })}
          />
          <Button variant={showResolved ? "default" : "outline"} size="sm" onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? "المحلولة" : "المفتوحة"}
          </Button>
          <RefreshAction onRefresh={refreshAll} />
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refreshAll}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className={openTotal > 0 ? "bg-status-error-surface" : "bg-status-success-surface"}>
              <CardContent className="p-4 flex items-center gap-3">
                {openTotal > 0 ? (
                  <XCircle className="w-8 h-8 text-status-error-foreground" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-status-success-foreground" />
                )}
                <div>
                  <p className="text-2xl font-bold">{openTotal}</p>
                  <p className="text-xs text-muted-foreground">إجمالي الفشل المفتوح</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  عندما تفشل عملية ترحيل مالي (خطأ في القيد، حساب مغلق، فترة مغلقة)، يتم تسجيلها هنا.
                  إذا تجاوز العدد ٢٥ سجلاً، يمنع حاكم النظام تنفيذ أي عملية مالية جديدة حتى تُعالَج.
                </p>
              </CardContent>
            </Card>
          </div>

          {openTotal > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  معالجة جماعية
                </CardTitle>
                <div className="flex gap-2">
                  <GuardedButton perm="finance.hardening:approve" size="sm" disabled={busy} onClick={retryAll}>
                    <PlayCircle className="h-4 w-4 me-1" />
                    {busy && progress ? `جاري المعالجة… (${progress.resolved} / تبقّى ${progress.remaining})` : "إعادة محاولة الكل"}
                  </GuardedButton>
                  <GuardedButton perm="finance.hardening:approve" variant="outline" size="sm" disabled={busy} onClick={() => setConfirmBulk({})}>
                    <Trash2 className="h-4 w-4 me-1" />تجاهل الكل
                  </GuardedButton>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  «إعادة محاولة الكل» تعيد ترحيل القيود المالية فعليًا (آمنة — لا تُكرّر القيد). السجلات التي
                  لا تقبل إعادة المحاولة التلقائية تبقى مفتوحة وتحتاج معالجة يدوية أو «تجاهل» (إغلاق دون ترحيل).
                </p>
                <div className="space-y-2">
                  {summary.map((s) => (
                    <div key={s.sourceType} className="flex items-center justify-between gap-3 rounded-md border p-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{s.sourceType}</span>
                          <Badge variant="outline">{s.cnt}</Badge>
                        </div>
                        {s.sampleError && (
                          <p className="text-[11px] text-status-error-foreground truncate max-w-[480px]" title={s.sampleError}>
                            {s.sampleError}
                          </p>
                        )}
                      </div>
                      <GuardedButton
                        perm="finance.hardening:approve"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmBulk({ sourceType: s.sourceType })}
                      >
                        تجاهل النوع
                      </GuardedButton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                السجلات ({rows.length}{!showResolved && rows.length < openTotal ? ` من ${openTotal}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={failureColumns}
                data={rows}
                noToolbar
                pageSize={0}
                emptyMessage={showResolved ? "لا توجد سجلات محلولة" : "لا توجد أعطال — النظام يعمل بشكل طبيعي"}
              />
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>

      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmBulk !== null}
        onOpenChange={(o) => { if (!o) setConfirmBulk(null); }}
        variant="caution"
        title="تأكيد التجاهل (إغلاق دون ترحيل)"
        description={
          (confirmBulk?.sourceType
            ? `سيتم إغلاق كل سجلات النوع "${confirmBulk.sourceType}" المفتوحة دون ترحيل أي قيد محاسبي.`
            : `سيتم إغلاق كل السجلات المفتوحة دون ترحيل أي قيد محاسبي.`) +
          " القيود غير المرحّلة لهذه السجلات لن تُسجَّل في دفتر الأستاذ. استخدم «إعادة محاولة الكل» أولًا لترحيل ما يمكن ترحيله. متابعة؟"
        }
        confirmLabel="تأكيد التجاهل"
        onConfirm={() => bulkResolve(confirmBulk?.sourceType)}
      />
    </PageShell>
  );
}
