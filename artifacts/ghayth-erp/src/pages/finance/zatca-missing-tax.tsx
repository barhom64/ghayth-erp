import { useState } from "react";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { formatDateAr, formatNumber } from "@/lib/formatters";
import { AlertTriangle, Save, ExternalLink, ShieldCheck, History, Lock, KeyRound } from "lucide-react";
import { Link } from "wouter";

interface MissingTaxRow {
  clientId: number;
  clientName: string | null;
  email: string | null;
  phone: string | null;
  todayCount: number;
  pendingCount: number;
  lastInvoiceAt: string | null;
}

interface MissingTaxResponse {
  data: MissingTaxRow[];
  total: number;
}

interface PauseHistoryRow {
  id: number;
  pauseDate: string;
  createdAt: string;
  todayCount: number;
  baseline: string | number;
  multiplier: number;
  minAbs: number;
  topClientId: number | null;
  topClientName: string | null;
  topClientCount: number | null;
  reason: string;
}

interface PauseHistoryResponse {
  data: PauseHistoryRow[];
  total: number;
  kpi: {
    pauses7d: number;
    pauses30d: number;
    invoicesPrevented7d: number;
    invoicesPrevented30d: number;
  };
}

const VAT_REGEX = /^3\d{13}3$/;

export default function ZatcaMissingTaxPage() {
  const { toast } = useToast();
  const queryKey = ["zatca-missing-tax-numbers"];
  const { data, isLoading, error, refetch } = useApiQuery<MissingTaxResponse>(
    queryKey,
    "/finance/zatca/missing-tax-numbers",
  );
  const pauseQuery = useApiQuery<PauseHistoryResponse>(
    ["zatca-pause-history"],
    "/finance/zatca/pause-history",
  );
  const pauseRows = pauseQuery.data?.data ?? [];
  const kpi = pauseQuery.data?.kpi;
  // Task #395: the pause-history KPIs + table are gated server-side on
  // `finance.zatca:update`. Read-only auditors who only hold
  // `finance.zatca:list` will get a 403 here — hide both panels
  // entirely (don't show a scary "تعذّر تحميل" error) so the page
  // stays useful for the missing-tax-numbers list, which is what they
  // can actually act on.
  const pauseForbidden =
    (pauseQuery.error as { status?: number } | null)?.status === 403;
  const showPausePanels = !pauseForbidden;

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [accessRequested, setAccessRequested] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);

  // Task #398: when the pause-history panel is hidden because the
  // viewer is a read-only auditor (finance.zatca:list only), give them
  // a one-click way to ask for finance.zatca:update via the existing
  // JIT (Just-in-Time) elevation flow instead of leaving a silent gap.
  const requestPauseAccess = async () => {
    setRequestingAccess(true);
    try {
      await apiFetch("/rbac/v2/jit/request", {
        method: "POST",
        body: JSON.stringify({
          featureKey: "finance.zatca",
          action: "update",
          scope: "company",
          justification:
            "طلب اطلاع على لوحة أثر بوّابة إيقاف ZATCA من صفحة العملاء بلا رقم ضريبي (مراجعة مالية).",
          requestedMinutes: 60,
        }),
      });
      setAccessRequested(true);
      toast({
        title: "تم إرسال طلب الصلاحية",
        description:
          "سيراجعه المسؤول عن الصلاحيات. ستظهر لك اللوحة تلقائياً عند الاعتماد.",
      });
    } catch (err: unknown) {
      // Backend signals "too many pending JIT requests" via 422
      // ValidationError with an Arabic message — surface it verbatim
      // so the user knows whether to wait or contact the admin.
      const message = (err as { message?: string } | null)?.message;
      toast({
        title: "تعذّر إرسال الطلب",
        description: message || "حاول مرة أخرى لاحقاً.",
        variant: "destructive",
      });
    } finally {
      setRequestingAccess(false);
    }
  };

  const saveMut = useApiMutation<
    { ok: true; clientId: number; taxNumber: string },
    { clientId: number; taxNumber: string }
  >(
    (body) => `/finance/zatca/missing-tax-numbers/${body.clientId}`,
    "PATCH",
    [queryKey],
    {
      successMessage: "تم حفظ رقم السجل الضريبي — سيُستأنف إرسال ZATCA تلقائياً في الدورة التالية",
      onSuccess: () => {
        setSavingId(null);
        refetch();
      },
      onError: () => setSavingId(null),
    },
  );

  const rows = data?.data ?? [];

  const handleSave = (row: MissingTaxRow) => {
    const value = (drafts[row.clientId] ?? "").trim().replace(/\s+/g, "");
    if (!VAT_REGEX.test(value)) {
      toast({
        title: "رقم السجل الضريبي غير صحيح",
        description: "يجب أن يبدأ بالرقم 3 وينتهي به ويتكوّن من 15 خانة (3xxxxxxxxxxxxx3).",
        variant: "destructive",
      });
      return;
    }
    setSavingId(row.clientId);
    saveMut.mutate({ clientId: row.clientId, taxNumber: value });
  };

  return (
    <PageShell
      title="عملاء بدون رقم ضريبي — يوقفون إرسال فواتير ZATCA"
      subtitle="هؤلاء هم العملاء الذين تحمل فواتيرهم الضريبية المعلّقة سبب إيقاف مهمّة إرسال ZATCA التلقائية. أدخل رقم السجل الضريبي لكل عميل واحفظ — وسيُستأنف الإرسال تلقائياً في الدورة التالية."
    >
      <FinanceTabsNav />
      {pauseForbidden && (
        <Card className="border-gray-200 bg-gray-50 mb-4">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm text-gray-700 leading-7">
                <div className="font-medium text-gray-800 mb-1">
                  لوحة أثر بوّابة الإيقاف وسجلّ الإيقافات مخفية عنك
                </div>
                <div className="text-gray-600">
                  هذه اللوحة للمسؤولين الماليين فقط — اطلب صلاحية{" "}
                  <code className="font-mono text-[12px] bg-white px-1 py-0.5 rounded border">
                    finance.zatca:update
                  </code>{" "}
                  من المسؤول لمشاهدة المؤشّرات وسجلّ الإيقافات السابقة.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={requestPauseAccess}
                disabled={requestingAccess || accessRequested}
                className="shrink-0"
              >
                <KeyRound className="w-4 h-4 ml-1" />
                {accessRequested
                  ? "تم إرسال الطلب"
                  : requestingAccess
                    ? "جاري الإرسال…"
                    : "طلب الصلاحية"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {showPausePanels && (
      <Card className="border-emerald-200 bg-emerald-50/40 mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700">
            <ShieldCheck className="w-5 h-5" />
            أثر بوّابة الإيقاف — كم فاتورة خاطئة المسار منعتها؟
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pauseQuery.isLoading ? (
            <LoadingSpinner />
          ) : pauseQuery.error ? (
            <div className="text-sm text-red-600">تعذّر تحميل سجل الإيقاف.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">عدد مرّات الإيقاف — آخر ٧ أيام</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {formatNumber(kpi?.pauses7d ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">عدد مرّات الإيقاف — آخر ٣٠ يوم</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {formatNumber(kpi?.pauses30d ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">فواتير تم منع إرسالها — ٧ أيام</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {formatNumber(kpi?.invoicesPrevented7d ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">فواتير تم منع إرسالها — ٣٠ يوم</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {formatNumber(kpi?.invoicesPrevented30d ?? 0)}
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3 leading-6">
            كل مرّة تُحسب على مستوى اليوم لكل شركة — أي يوم واحد متوقّف =
            دفعة فواتير محفوظة من الإرسال إلى المسار الخاطئ. استخدم هذه
            الأرقام لضبط عتبتي{" "}
            <code className="font-mono text-[11px]">ZATCA_B2C_SPIKE_MULTIPLIER</code> و
            <code className="font-mono text-[11px]">ZATCA_B2C_SPIKE_MIN_ABS</code>.
          </p>
        </CardContent>
      </Card>
      )}

      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertTriangle className="w-5 h-5" />
            لماذا تظهر هذه القائمة؟
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 leading-7">
          مهمّة إرسال فواتير ZATCA الدورية تتوقّف تلقائياً عندما يقفز عدد
          الفواتير الضريبية المرتبطة بعملاء بلا رقم ضريبي قفزة غير معتادة، حتى
          لا تُرسَل تلك الفواتير إلى المسار الخاطئ (B2C بدلاً من B2B). يمكنك
          إدخال رقم السجل الضريبي مباشرةً من هنا (لا يحتاج صلاحية وحدة
          العملاء) وسيختفي العميل من القائمة فور حفظه.
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>القائمة ({data?.total ?? 0})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            تحديث
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            noToolbar
            data={rows}
            isLoading={isLoading}
            isError={!!error}
            error={error as Error | null}
            onRetry={() => refetch()}
            rowKey={(row) => row.clientId}
            emptyMessage="لا يوجد عملاء بلا رقم ضريبي يوقفون إرسال ZATCA حالياً."
            columns={[
              {
                key: "clientName", header: "العميل", className: "font-medium",
                render: (row) => (
                  <>
                    {row.clientName || `#${row.clientId}`}
                    <Link
                      to={`/clients/${row.clientId}`}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary mr-2"
                      title="فتح صفحة العميل (يحتاج صلاحية وحدة العملاء)"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </>
                ),
              },
              {
                key: "email", header: "البريد / الهاتف", className: "text-xs text-gray-600",
                render: (row) => (
                  <>
                    <div>{row.email ?? "—"}</div>
                    <div>{row.phone ?? "—"}</div>
                  </>
                ),
              },
              {
                key: "todayCount", header: "فواتير اليوم", className: "font-semibold",
                render: (row) => row.todayCount,
              },
              {
                key: "pendingCount", header: "إجمالي المعلّق",
                render: (row) => row.pendingCount,
              },
              {
                key: "lastInvoiceAt", header: "آخر فاتورة", className: "text-xs text-gray-600",
                render: (row) => (row.lastInvoiceAt ? formatDateAr(row.lastInvoiceAt) : "—"),
              },
              {
                key: "taxNumber", header: "رقم السجل الضريبي", sortable: false, width: "18rem",
                render: (row) => {
                  const draft = drafts[row.clientId] ?? "";
                  const isSaving = savingId === row.clientId && saveMut.isPending;
                  return (
                    <div className="flex items-center gap-2">
                      <Input
                        value={draft}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.clientId]: e.target.value }))
                        }
                        placeholder="3xxxxxxxxxxxxx3"
                        dir="ltr"
                        className="font-mono text-sm"
                        disabled={isSaving}
                        maxLength={20}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSave(row)}
                        disabled={isSaving || draft.trim().length === 0}
                      >
                        <Save className="w-4 h-4 ml-1" />
                        {isSaving ? "جاري الحفظ…" : "حفظ"}
                      </Button>
                    </div>
                  );
                },
              },
            ] satisfies DataTableColumn<MissingTaxRow>[]}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600" />
            سجلّ الإيقافات السابقة
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => pauseQuery.refetch()}>
            تحديث
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            noToolbar
            data={pauseRows}
            isLoading={pauseQuery.isLoading}
            isError={!!pauseQuery.error}
            error={pauseQuery.error as Error | null}
            onRetry={() => pauseQuery.refetch()}
            emptyMessage="لم تُفعَّل بوّابة الإيقاف بعد — لا توجد إيقافات مسجَّلة."
            columns={[
              {
                key: "pauseDate", header: "التاريخ", className: "text-xs text-gray-700",
                render: (row) => formatDateAr(row.pauseDate),
              },
              {
                key: "todayCount", header: "عدد فواتير اليوم", className: "font-semibold",
                render: (row) => formatNumber(row.todayCount),
              },
              {
                key: "baseline", header: "المتوسّط (٧ أيام)", className: "text-gray-700",
                render: (row) => `${formatNumber(Number((Number(row.baseline) || 0).toFixed(1)))} / يوم`,
                exportValue: (row) => Number(row.baseline) || 0,
              },
              {
                key: "topClientName", header: "العميل الأكثر تأثيراً وقت الإيقاف", className: "text-xs",
                render: (row) =>
                  row.topClientId ? (
                    <Link
                      to={`/clients/${row.topClientId}`}
                      className="inline-flex items-center gap-1 hover:text-primary"
                      title="فتح صفحة العميل (يحتاج صلاحية وحدة العملاء)"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>
                        {row.topClientName ?? `#${row.topClientId}`}
                        {row.topClientCount != null
                          ? ` — ${formatNumber(row.topClientCount)}`
                          : ""}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  ),
              },
              {
                key: "prevented", header: "فواتير تم منع إرسالها", sortable: false,
                className: "font-semibold text-emerald-700",
                render: (row) => formatNumber(row.todayCount),
              },
            ] satisfies DataTableColumn<PauseHistoryRow>[]}
          />
          {pauseRows.length > 0 && (
            <p className="text-xs text-gray-500 mt-3 leading-6">
              صف واحد لكل يوم متوقّف لكل شركة. تُحدَّث القيم تلقائياً مع
              وصول فواتير جديدة خلال نفس اليوم. حدّ التشغيل الحالي:{" "}
              ×{pauseRows[0]?.multiplier ?? "—"} على المتوسّط، بحدّ أدنى{" "}
              {formatNumber(pauseRows[0]?.minAbs ?? 0)} فاتورة.
            </p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
