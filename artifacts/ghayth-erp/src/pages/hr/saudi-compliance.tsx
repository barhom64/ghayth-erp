/**
 * Task #272 — Saudi compliance tracking screen.
 *
 * Single page exposing both the WPS bank-file lifecycle and the
 * Mudad settlement queue. Operators can:
 *   - create a draft WPS run for a period + bank
 *   - build the file from the locked payroll
 *   - download it (CSV/SIF) for upload to the bank
 *   - mark it submitted, then paste the bank ack to apply
 *   - view Mudad settlements (incl. contract registrations) and
 *     retry rejected/queued rows.
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPatch, useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr, formatNumber, formatTimeAr, todayLocal } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";
import { Banknote, Send, Download, RefreshCw, FileCheck, Eye, AlertTriangle, X, Pencil, Building2, Inbox } from "lucide-react";

type DeliveryChannel = "sftp" | "https" | "manual";
interface BankOption { format: string; code: string; name: string; channel?: DeliveryChannel; }
interface WpsRun {
  id: number; period: string; bankCode: string; fileName: string | null;
  status: string; totalAmount: string | null; recordCount: number | null;
  submittedAt: string | null; acknowledgedAt: string | null; createdAt: string;
  deliveryChannel?: DeliveryChannel | null;
  deliveryRef?: string | null;
  deliveredAt?: string | null;
  lastPolledAt?: string | null;
  pollAttempts?: number | null;
  deliveryError?: string | null;
}
interface MudadRow {
  id: number; period: string | null; type: string; employeeId: number;
  mudadRefId: string | null; status: string; amount: string | null;
  response: unknown; submittedAt: string | null; acknowledgedAt: string | null;
  attempts?: number | null;
  nextAttemptAt?: string | null;
  lastError?: string | null;
  giveUpReason?: string | null;
}
interface SkippedEntry {
  employeeId: number;
  employeeName: string | null;
  iqamaOrId: string | null;
  iban: string | null;
  netSalary: number | null;
  reason: "no_iban" | "non_saudi_iban" | "no_iqama_or_national_id" | "non_positive_net";
}
interface WpsRunDetail extends WpsRun {
  skippedEntries?: SkippedEntry[];
  lines?: Array<Record<string, unknown>>;
}

const SKIP_REASON_LABELS: Record<SkippedEntry["reason"], string> = {
  no_iban: "بدون رقم آيبان",
  non_saudi_iban: "آيبان غير سعودي",
  no_iqama_or_national_id: "بدون رقم إقامة أو هوية وطنية",
  non_positive_net: "صافي الراتب صفر أو أقل",
};

function statusBadge(status: string) {
  const variant: Record<string, string> = {
    draft: "bg-slate-200 text-slate-800",
    submitted: "bg-amber-100 text-amber-800",
    acknowledged: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    retry: "bg-orange-100 text-orange-800",
  };
  const labels: Record<string, string> = {
    draft: "مسودة", submitted: "تم التسليم",
    acknowledged: "تم الإقرار", rejected: "مرفوض", retry: "إعادة محاولة",
  };
  return (
    <Badge className={variant[status] ?? "bg-slate-100 text-slate-700"}>
      {labels[status] ?? status}
    </Badge>
  );
}

const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  sftp: "تسليم مباشر (SFTP)",
  https: "تسليم مباشر (HTTPS)",
  manual: "تسليم يدوي",
};

function DeliveryPanel({ run }: { run: WpsRunDetail }) {
  const channel = run.deliveryChannel ?? null;
  const ref = run.deliveryRef ?? null;
  const delivered = run.deliveredAt ?? null;
  const lastPolled = run.lastPolledAt ?? null;
  const attempts = run.pollAttempts ?? 0;
  const error = run.deliveryError ?? null;

  // Nothing to show until the run was pushed straight to the bank.
  if (!channel && !ref && !delivered && !lastPolled && !attempts && !error) {
    return null;
  }

  return (
    <Card className={error ? "border-red-300" : "border-emerald-200"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-emerald-600" />
          حالة التسليم للبنك
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">قناة التسليم</dt>
            <dd className="font-medium">
              {channel
                ? <Badge className="bg-emerald-100 text-emerald-800">{CHANNEL_LABELS[channel]}</Badge>
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">معرّف التسليم لدى البنك</dt>
            <dd className="font-mono text-xs" dir="ltr">{ref ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">تاريخ التسليم</dt>
            <dd>{delivered ? `${formatDateAr(delivered)} — ${formatTimeAr(delivered)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">آخر محاولة سحب إقرار</dt>
            <dd>{lastPolled ? `${formatDateAr(lastPolled)} — ${formatTimeAr(lastPolled)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">عدد محاولات السحب</dt>
            <dd>{formatNumber(attempts)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">آخر خطأ تسليم</dt>
            <dd>
              {error ? (
                <span className="text-xs text-red-700 break-words">{error}</span>
              ) : (
                <span className="text-slate-600">لا يوجد</span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function SkippedRowEditor({
  entry, onSaved, onCancel,
}: {
  entry: SkippedEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [iban, setIban] = useState(entry.iban ?? "");
  const [iqama, setIqama] = useState(entry.iqamaOrId ?? "");
  const [saving, setSaving] = useState(false);

  // Reset local state if a different entry is opened in the same slot.
  useEffect(() => {
    setIban(entry.iban ?? "");
    setIqama(entry.iqamaOrId ?? "");
  }, [entry.employeeId, entry.iban, entry.iqamaOrId]);

  const onSave = async () => {
    setSaving(true);
    try {
      // We send both fields whenever they were touched. The PATCH route
      // accepts iban + iqamaNumber and tags them with field names so any
      // validation error surfaces inline on the right input.
      const body: Record<string, string | null> = {};
      if ((iban || "") !== (entry.iban ?? "")) body.iban = iban.trim() || null;
      if ((iqama || "") !== (entry.iqamaOrId ?? "")) {
        // SkippedEntry.iqamaOrId is "iqama OR national id"; prefer iqamaNumber
        // for non-Saudis (most common skip reason). HR can still fix the
        // nationalId from the full employee page if needed.
        body.iqamaNumber = iqama.trim() || null;
      }
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }
      await apiPatch(`/employees/${entry.employeeId}`, body);
      toast({ title: "تم حفظ بيانات الموظف" });
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "تعذّر حفظ البيانات", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-amber-50/60 border-b">
      <td className="py-2 px-2 text-slate-700">
        {entry.employeeName ?? `#${entry.employeeId}`}
      </td>
      <td className="py-2 px-2" colSpan={2}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label className="text-xs">رقم الإقامة/الهوية</Label>
            <Input
              dir="ltr" value={iqama}
              onChange={(e) => setIqama(e.target.value)}
              placeholder="2xxxxxxxxx"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">آيبان</Label>
            <Input
              dir="ltr" value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="SA00 ..."
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
      </td>
      <td className="py-2 px-2" colSpan={2}>
        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" disabled={saving} onClick={onSave}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
            إلغاء
          </Button>
        </div>
      </td>
    </tr>
  );
}

function RunDetailPanel({
  runId, detail, isLoading, isError, onClose, onRetry,
}: {
  runId: number;
  detail: WpsRunDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const skipped = detail?.skippedEntries ?? [];
  const lines = detail?.lines ?? [];
  return (
    <div className="space-y-4 mb-4">
      <Card className={skipped.length > 0 ? "border-amber-300" : ""}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className={`h-5 w-5 ${skipped.length > 0 ? "text-amber-600" : "text-slate-400"}`} />
            الموظفون المستبعدون من الملف
            <Badge variant="outline" className="mr-2">
              {skipped.length}
            </Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingSpinner /> :
           isError ? <ErrorState onRetry={onRetry} /> :
           skipped.length === 0 ? (
            <div className="text-sm text-slate-600">
              لم يتم استبعاد أي موظف من ملف WPS لهذه التشغيلة.
            </div>
           ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-slate-600 border-b">
                <tr>
                  <th className="py-2 px-2">الموظف</th>
                  <th className="py-2 px-2">رقم الإقامة/الهوية</th>
                  <th className="py-2 px-2">آيبان</th>
                  <th className="py-2 px-2">صافي الراتب</th>
                  <th className="py-2 px-2">سبب الاستبعاد</th>
                  <th className="py-2 px-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {skipped.map((s) => (
                  editingId === s.employeeId ? (
                    <SkippedRowEditor
                      key={s.employeeId}
                      entry={s}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); onRetry(); }}
                    />
                  ) : (
                    <tr key={s.employeeId} className="border-b last:border-0">
                      <td className="py-2 px-2">
                        {s.employeeName ?? `#${s.employeeId}`}
                      </td>
                      <td className="py-2 px-2" dir="ltr">{s.iqamaOrId ?? "—"}</td>
                      <td className="py-2 px-2 font-mono text-xs" dir="ltr">
                        {s.iban ?? "—"}
                      </td>
                      <td className="py-2 px-2">
                        {s.netSalary != null ? formatCurrency(s.netSalary) : "—"}
                      </td>
                      <td className="py-2 px-2">
                        <Badge className="bg-amber-100 text-amber-800">
                          {SKIP_REASON_LABELS[s.reason]}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-left">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setEditingId(s.employeeId)}
                        >
                          <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                        </Button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
           )}
        </CardContent>
      </Card>

      {!isLoading && !isError && detail && <DeliveryPanel run={detail} />}

      {!isLoading && !isError && detail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              تفاصيل التشغيلة #{runId} — {lines.length} سطر مُدرج في الملف
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <div className="text-sm text-slate-600">
                لم يتم توليد ملف WPS بعد لهذه التشغيلة.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-right text-slate-600 border-b">
                  <tr>
                    <th className="py-2 px-2">رقم الموظف</th>
                    <th className="py-2 px-2">رقم الإقامة/الهوية</th>
                    <th className="py-2 px-2">آيبان</th>
                    <th className="py-2 px-2">المبلغ</th>
                    <th className="py-2 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={(l.id as number | undefined) ?? i} className="border-b last:border-0">
                      <td className="py-2 px-2">{String(l.employeeId ?? "—")}</td>
                      <td className="py-2 px-2" dir="ltr">{String(l.iqamaOrId ?? "—")}</td>
                      <td className="py-2 px-2 font-mono text-xs" dir="ltr">
                        {String(l.iban ?? "—")}
                      </td>
                      <td className="py-2 px-2">
                        {l.amount != null ? formatCurrency(Number(l.amount)) : "—"}
                      </td>
                      <td className="py-2 px-2">{statusBadge(String(l.status ?? "draft"))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SaudiCompliancePage() {
  const { scopeQueryString } = useAppContext();
  const [period, setPeriod] = useState(() => todayLocal().slice(0, 7));
  const [bankFormat, setBankFormat] = useState<string>("ncb");
  const [ackById, setAckById] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const banksQ = useApiQuery<{ data: BankOption[] }>(
    ["saudi-banks"], "/hr/saudi/banks",
  );
  const banks = banksQ.data?.data ?? [];

  const runsQ = useApiQuery<{ data: WpsRun[] }>(
    ["wps-runs", period, scopeQueryString],
    `/hr/saudi/wps/runs?period=${encodeURIComponent(period)}`,
  );
  const settlementsQ = useApiQuery<{ data: MudadRow[] }>(
    ["mudad-settlements", period, scopeQueryString],
    `/hr/saudi/mudad/settlements?period=${encodeURIComponent(period)}`,
  );
  const runDetailQ = useApiQuery<{ data: WpsRunDetail }>(
    ["wps-run-detail", String(selectedRunId ?? ""), scopeQueryString],
    selectedRunId ? `/hr/saudi/wps/runs/${selectedRunId}` : "",
    { enabled: selectedRunId != null },
  );

  async function call(
    label: string,
    key: string,
    path: string,
    body: Record<string, unknown>,
    refetch: () => void,
  ) {
    setBusy(key);
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      toast({ title: label });
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "تعذّر تنفيذ العملية", description: message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const downloadFile = async (id: number, fileName: string | null) => {
    const res = await fetch(`/api/hr/wps/runs/${id}/file`, { credentials: "include" });
    if (!res.ok) {
      toast({ title: "تعذّر تنزيل الملف", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? `wps_${id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wpsCols: DataTableColumn<WpsRun>[] = [
    { key: "period", header: "الفترة", sortable: true },
    { key: "bankCode", header: "البنك", sortable: true },
    { key: "recordCount", header: "عدد الموظفين", sortable: true,
      render: (r) => r.recordCount ?? "—" },
    { key: "totalAmount", header: "الإجمالي", sortable: true,
      render: (r) => r.totalAmount ? formatCurrency(Number(r.totalAmount)) : "—" },
    { key: "status", header: "الحالة", sortable: true, render: (r) => statusBadge(r.status) },
    { key: "submittedAt", header: "تاريخ التسليم",
      render: (r) => r.submittedAt ? formatDateAr(r.submittedAt) : "—" },
    { key: "actions", header: "الإجراءات", render: (r) => {
      // Look up the bank's delivery channel (sftp/https/manual) from
      // the bank list so we can hide "إرسال للبنك" for banks where
      // the operator still has to upload through the bank's portal.
      const bankChannel: DeliveryChannel | undefined =
        banks.find((b) => b.code === r.bankCode || b.format === r.bankCode)?.channel;
      const canSendToBank =
        r.status === "draft" &&
        (r.recordCount ?? 0) > 0 &&
        bankChannel != null &&
        bankChannel !== "manual";
      const canPollAck =
        (r.status === "submitted" || r.status === "partial") &&
        !!r.deliveryRef;
      return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline"
          onClick={() => setSelectedRunId(r.id)}>
          <Eye className="h-4 w-4 ml-1" /> تفاصيل
        </Button>
        {r.status === "draft" && (
          <Button size="sm" variant="outline"
            disabled={busy === `build:${r.id}`}
            onClick={() => call("تم توليد ملف WPS", `build:${r.id}`,
              `/hr/saudi/wps/runs/${r.id}/build`, { format: bankFormat },
              () => { runsQ.refetch?.(); runDetailQ.refetch?.(); })}>
            <FileCheck className="h-4 w-4 ml-1" /> توليد
          </Button>
        )}
        {(r.recordCount ?? 0) > 0 && (
          <Button size="sm" variant="outline" onClick={() => downloadFile(r.id, r.fileName)}>
            <Download className="h-4 w-4 ml-1" /> تنزيل
          </Button>
        )}
        {canSendToBank && (
          <Button size="sm"
            disabled={busy === `send-to-bank:${r.id}`}
            onClick={() => call("تم إرسال الملف للبنك", `send-to-bank:${r.id}`,
              `/hr/saudi/wps/runs/${r.id}/send-to-bank`, {},
              () => { runsQ.refetch?.(); runDetailQ.refetch?.(); })}>
            <Building2 className="h-4 w-4 ml-1" /> إرسال للبنك
          </Button>
        )}
        {r.status === "draft" && (r.recordCount ?? 0) > 0 && (
          <Button size="sm" variant="outline"
            disabled={busy === `submit:${r.id}`}
            onClick={() => call("تم تسليم الملف", `submit:${r.id}`,
              `/hr/saudi/wps/runs/${r.id}/submit`, {},
              () => runsQ.refetch?.())}>
            <Send className="h-4 w-4 ml-1" /> تسليم يدوي
          </Button>
        )}
        {canPollAck && (
          <Button size="sm" variant="outline"
            disabled={busy === `poll-ack:${r.id}`}
            onClick={() => call("تم سحب الإقرار", `poll-ack:${r.id}`,
              `/hr/saudi/wps/runs/${r.id}/poll-ack`, {},
              () => { runsQ.refetch?.(); runDetailQ.refetch?.(); })}>
            <Inbox className="h-4 w-4 ml-1" /> اسحب الإقرار الآن
          </Button>
        )}
        {r.status === "submitted" && (
          <div className="flex items-center gap-2 w-full">
            <Textarea
              dir="ltr" rows={1} placeholder="ألصق نص الإقرار من البنك"
              value={ackById[r.id] ?? ""}
              onChange={(e) => setAckById({ ...ackById, [r.id]: e.target.value })}
              className="min-h-0 h-8 text-xs"
            />
            <Button size="sm" variant="outline"
              disabled={!(ackById[r.id]?.length) || busy === `ack:${r.id}`}
              onClick={() => call("تم تطبيق الإقرار", `ack:${r.id}`,
                `/hr/saudi/wps/runs/${r.id}/ack`,
                { ackText: ackById[r.id] },
                () => runsQ.refetch?.())}>
              تطبيق
            </Button>
          </div>
        )}
      </div>
      );
    }},
  ];

  const mudadCols: DataTableColumn<MudadRow>[] = [
    { key: "period", header: "الفترة", sortable: true,
      render: (r) => r.period ?? "—" },
    { key: "type", header: "النوع", sortable: true, render: (r) => {
      const labels: Record<string, string> = {
        salary: "راتب", contract_register: "تسجيل عقد",
        leave_unpaid: "إجازة بدون راتب", exit_reentry: "خروج/عودة",
        termination: "إنهاء خدمة", contract_renewal: "تجديد عقد",
      };
      return labels[r.type] ?? r.type;
    }},
    { key: "employeeId", header: "رقم الموظف", sortable: true },
    { key: "mudadRefId", header: "رقم مُدد",
      render: (r) => r.mudadRefId ?? "—" },
    { key: "amount", header: "المبلغ",
      render: (r) => r.amount ? formatCurrency(Number(r.amount)) : "—" },
    { key: "status", header: "الحالة", sortable: true, render: (r) => (
      <div className="flex flex-col gap-1">
        {statusBadge(r.status)}
        {r.giveUpReason === "max_attempts_exceeded" ? (
          <Badge className="bg-red-200 text-red-900 flex items-center gap-1 w-fit">
            <AlertTriangle className="h-3 w-3" />
            تدخّل يدوي مطلوب
          </Badge>
        ) : null}
      </div>
    )},
    { key: "attempts", header: "المحاولات", render: (r) => {
      const n = r.attempts ?? 0;
      if (n === 0 && r.status !== "retry" && r.status !== "rejected") return "—";
      return formatNumber(n);
    }},
    { key: "nextAttemptAt", header: "المحاولة القادمة", render: (r) => {
      if (r.giveUpReason === "max_attempts_exceeded") return "—";
      if (r.status !== "retry" || !r.nextAttemptAt) return "—";
      const d = new Date(r.nextAttemptAt);
      if (isNaN(d.getTime())) return "—";
      return `${formatDateAr(r.nextAttemptAt)} — ${formatTimeAr(r.nextAttemptAt)}`;
    }},
    { key: "lastError", header: "آخر خطأ", render: (r) => (
      r.lastError ? (
        <span className="text-xs text-slate-700 line-clamp-2 max-w-[240px] inline-block"
          title={r.lastError}>
          {r.lastError}
        </span>
      ) : "—"
    )},
    { key: "submittedAt", header: "تاريخ الإرسال",
      render: (r) => r.submittedAt ? formatDateAr(r.submittedAt) : "—" },
    { key: "actions", header: "", render: (r) => (
      (r.status === "rejected" || r.status === "retry") ? (
        <Button size="sm" variant="outline"
          disabled={busy === `mudad:${r.id}`}
          onClick={() => call("تمت إعادة المحاولة", `mudad:${r.id}`,
            `/hr/saudi/mudad/settlements/${r.id}/retry`, {},
            () => settlementsQ.refetch?.())}>
          <RefreshCw className="h-4 w-4 ml-1" /> إعادة
        </Button>
      ) : null
    )},
  ];

  return (
    <PageShell
      title="الامتثال السعودي — WPS و مُدد"
      subtitle="رفع ملفات الرواتب للبنوك وتتبع تسويات مُدد"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/payroll", label: "الرواتب" },
      ]}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" /> فترة المتابعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>الفترة (YYYY-MM)</Label>
              <Input
                dir="ltr" value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-05"
              />
            </div>
            <div>
              <Label>البنك / صيغة الملف</Label>
              <Select value={bankFormat} onValueChange={setBankFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.format} value={b.format}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!period || !bankFormat || busy === "create"}
                onClick={() => {
                  const bank = banks.find((b) => b.format === bankFormat);
                  if (!bank) return;
                  call(
                    "تم إنشاء تشغيلة WPS", "create",
                    "/hr/saudi/wps/runs",
                    { period, bankCode: bank.code },
                    () => runsQ.refetch?.(),
                  );
                }}
              >
                + إنشاء تشغيلة WPS
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="wps" className="mt-6">
        <TabsList>
          <TabsTrigger value="wps">تشغيلات WPS</TabsTrigger>
          <TabsTrigger value="mudad">تسويات مُدد</TabsTrigger>
        </TabsList>

        <TabsContent value="wps">
          {selectedRunId != null && (
            <RunDetailPanel
              runId={selectedRunId}
              detail={runDetailQ.data?.data}
              isLoading={runDetailQ.isLoading}
              isError={runDetailQ.isError}
              onClose={() => setSelectedRunId(null)}
              onRetry={() => runDetailQ.refetch?.()}
            />
          )}
          <Card>
            <CardContent className="pt-6">
              {runsQ.isLoading ? <LoadingSpinner /> :
               runsQ.isError ? <ErrorState error={runsQ.error}
                 onRetry={() => { runsQ.refetch?.(); }} /> :
               <DataTable
                 columns={wpsCols}
                 data={runsQ.data?.data ?? []}
                 emptyMessage="لا توجد تشغيلات لهذه الفترة"
                 noToolbar
               />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mudad">
          <Card>
            <CardContent className="pt-6">
              {settlementsQ.isLoading ? <LoadingSpinner /> :
               settlementsQ.isError ? <ErrorState error={settlementsQ.error}
                 onRetry={() => { settlementsQ.refetch?.(); }} /> :
               <DataTable
                 columns={mudadCols}
                 data={settlementsQ.data?.data ?? []}
                 emptyMessage="لا توجد تسويات لهذه الفترة"
                 noToolbar
               />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
