/**
 * Admin → PBX Control Plane (#1139 §3 — voice side).
 *
 * Five tabs:
 *   1. Overview   — call counts + transcript queue depth + extension/menu summary
 *   2. Extensions — list + add (extension → employee/department map)
 *   3. IVR Menus  — list + detail editor (greeting + DTMF options)
 *   4. Recordings — pbx_call_recordings list with retention
 *   5. Transcripts — pending/failed queue + manual enqueue/run/summarise
 *
 * Same pattern as admin-ai-governance.tsx — single-file, dialog-driven,
 * tanstack mutations.
 */
import { useState } from "react";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { RefreshAction } from "@/components/page-actions";
import {
  Phone, ListTree, Headphones, Users, MessageSquareText, Plus, RefreshCw,
  PlayCircle, Trash2, FlaskConical, Sparkles, AlertOctagon,
  Settings, Copy, KeyRound, CheckCircle2,
} from "lucide-react";

interface ExtensionRow {
  id: number;
  extension: string;
  name: string;
  employeeId: number | null;
  departmentId: number | null;
  type: "employee" | "department" | "queue" | "voicemail";
  status: "active" | "disabled";
  ringTimeoutSeconds: number;
  voicemailEnabled: boolean;
  employeeName: string | null;
}

interface IvrMenuRow {
  id: number;
  slug: string;
  name: string;
  greetingText: string;
  greetingAudioUrl: string | null;
  language: string;
  timeoutSeconds: number;
  fallbackAction: string;
  status: "active" | "disabled";
  optionCount: number;
}

interface IvrOptionRow {
  id: number;
  dtmfKey: string;
  label: string;
  action: "extension" | "menu" | "voicemail" | "hangup" | "department";
  targetExtension: string | null;
  targetMenuId: number | null;
  targetDepartmentId: number | null;
  sortOrder: number;
}

interface RecordingRow {
  id: number;
  callId: number;
  recordingUrl: string;
  durationMs: number;
  fileSizeBytes: number;
  retentionExpiresAt: string | null;
  status: "active" | "expired" | "deleted";
  callerNumber: string;
  calledNumber: string;
  direction: string;
  callAt: string;
}

interface TranscriptRow {
  id: number;
  callId: number;
  provider: string | null;
  language: string | null;
  status: "pending" | "transcribing" | "completed" | "failed";
  errorMessage: string | null;
  transcribedAt: string | null;
  summarisedAt: string | null;
  createdAt: string;
  callerNumber: string;
  calledNumber: string;
  duration: number;
  transcriptPreview: string | null;
  summaryPreview: string | null;
  hasTranscript: boolean;
  hasSummary: boolean;
}

interface Overview {
  callsLast24h: Array<{ direction: string; count: number }>;
  menus: Array<{ id: number; slug: string; name: string; status: string }>;
  extensions: Array<{ type: string; active: number; disabled: number }>;
  transcripts: { pending: number; failed: number; readyForSummary: number };
  recordings: { active: number };
  collectedAt: string;
}

interface SetupInfo {
  baseUrl: string;
  webhooks: Array<{ event: string; url: string; description: string }>;
  signing: {
    configured: boolean;
    algorithm: string;
    bearerAlternative: string;
    envVarName: string;
  };
  didMappingsActive: number;
  vendorNotes: Record<string, string>;
}

interface SignatureTestResult {
  signatureHeader: string;
  bearerHeader: string;
  sampleBody: string;
  curlExample: string;
  note: string;
}

interface GeneratedSecret {
  secret: string;
  length: number;
  notes: string;
}

// Arabic transcript-status labels — mirrors the status <Select> options
// and the PageStatusBadge copy shown in the transcripts table.
const TRANSCRIPT_STATUS_AR: Record<string, string> = {
  pending: "بانتظار",
  transcribing: "قيد التحويل",
  completed: "مكتملة",
  failed: "فاشلة",
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtMs(ms: number): string {
  if (!ms) return "0s";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function AdminPbxControl() {
  const [tab, setTab] = useState("overview");
  const [extOpen, setExtOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMenuId, setEditMenuId] = useState<number | null>(null);
  const [ivrTestOpen, setIvrTestOpen] = useState(false);
  const [viewTranscriptId, setViewTranscriptId] = useState<number | null>(null);
  const [transcriptStatusFilter, setTranscriptStatusFilter] = useState<string>("");

  const { data: overview, isLoading: ovLoading, error: ovError, refetch: refetchOv } =
    useApiQuery<Overview>(["pbx-control-overview"], "/admin/pbx-control/overview");
  const { data: extResp, refetch: refetchExt } =
    useApiQuery<{ data: ExtensionRow[] }>(["pbx-control-extensions"], "/admin/pbx-control/extensions");
  const { data: menusResp, refetch: refetchMenus } =
    useApiQuery<{ data: IvrMenuRow[] }>(["pbx-control-menus"], "/admin/pbx-control/ivr-menus");
  const { data: recResp, refetch: refetchRec } =
    useApiQuery<{ data: RecordingRow[] }>(["pbx-control-recordings"], "/admin/pbx-control/recordings");
  // Static path + QS suffix so the audit can credit
  // /admin/pbx-control/transcripts via its scanner.
  const suffix = transcriptStatusFilter
    ? `?status=${transcriptStatusFilter}`
    : "";
  const { data: trResp, refetch: refetchTr } =
    useApiQuery<{ data: TranscriptRow[] }>(
      ["pbx-control-transcripts", transcriptStatusFilter],
      `/admin/pbx-control/transcripts${suffix}`,
    );

  const extensions = extResp?.data ?? [];
  const menus = menusResp?.data ?? [];
  const recordings = recResp?.data ?? [];
  const transcripts = trResp?.data ?? [];

  // Print wiring — the speech-to-text transcript queue is the primary
  // operational row-level list on this PBX control plane.
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<TranscriptRow>(transcripts);

  const refreshAll = () => {
    void refetchOv(); void refetchExt(); void refetchMenus(); void refetchRec(); void refetchTr();
  };

  const createExt = useMutation({
    mutationFn: (b: Partial<ExtensionRow>) => apiFetch("/admin/pbx-control/extensions", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "تم إنشاء الامتداد" }); setExtOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const toggleExt = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/admin/pbx-control/extensions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const createMenu = useMutation({
    mutationFn: (b: Partial<IvrMenuRow> & { greetingText: string }) =>
      apiFetch("/admin/pbx-control/ivr-menus", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { toast({ title: "أنشئت القائمة" }); setMenuOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const enqueueTranscript = useMutation({
    mutationFn: (callId: number) => apiFetch(`/admin/pbx-control/transcripts/${callId}/enqueue`, { method: "POST" }),
    onSuccess: () => { toast({ title: "أُضيفت للطابور" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const runNext = useMutation({
    mutationFn: () => apiFetch("/admin/pbx-control/transcripts/run-next", { method: "POST" }),
    onSuccess: (r: { processed: boolean; status?: string; message?: string }) => {
      toast({ title: r.processed ? `تمت معالجة عنصر (${r.status})` : (r.message ?? "لا شيء في الطابور") });
      refreshAll();
    },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const summarise = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/pbx-control/transcripts/${id}/summarise`, { method: "POST" }),
    onSuccess: () => { toast({ title: "أُنشئ ملخّص AI" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  // ─── Columns ─────────────────────────────────────────────────────────
  const extensionColumns: DataTableColumn<ExtensionRow>[] = [
    { key: "extension", header: "الامتداد", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.extension}</span>
    )},
    { key: "name", header: "الاسم", render: (r) => <span className="text-xs">{r.name}</span> },
    { key: "type", header: "النوع", render: (r) => <PageStatusBadge status={r.type} /> },
    { key: "employeeName", header: "الموظف", render: (r) => (
      <span className="text-xs">{r.employeeName ?? "—"}</span>
    )},
    { key: "ringTimeoutSeconds", header: "مهلة الرنين", render: (r) => (
      <span className="font-mono text-xs">{r.ringTimeoutSeconds}s</span>
    )},
    { key: "status", header: "الحالة", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => toggleExt.mutate({
        id: r.id, status: r.status === "active" ? "disabled" : "active",
      })}>
        <PageStatusBadge status={r.status} />
      </Button>
    )},
  ];

  const menuColumns: DataTableColumn<IvrMenuRow>[] = [
    { key: "slug", header: "المعرّف", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.slug}</span>
    )},
    { key: "name", header: "الاسم", render: (r) => <span className="text-xs">{r.name}</span> },
    { key: "optionCount", header: "خيارات", render: (r) => (
      <Badge variant="outline" className="font-mono">{r.optionCount}</Badge>
    )},
    { key: "language", header: "اللغة", render: (r) => (
      <span className="font-mono text-xs">{r.language}</span>
    )},
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "actions", header: "إجراءات", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => setEditMenuId(r.id)}>
        تحرير
      </Button>
    )},
  ];

  const recordingColumns: DataTableColumn<RecordingRow>[] = [
    { key: "callAt", header: "وقت المكالمة", render: (r) => (
      <span className="text-xs">{formatDateAr(r.callAt)}</span>
    )},
    { key: "direction", header: "اتجاه", render: (r) => (
      <Badge variant="outline" className="text-[10px]">{r.direction}</Badge>
    )},
    { key: "callerNumber", header: "من", render: (r) => (
      <span className="font-mono text-xs">{r.callerNumber}</span>
    )},
    { key: "calledNumber", header: "إلى", render: (r) => (
      <span className="font-mono text-xs">{r.calledNumber}</span>
    )},
    { key: "durationMs", header: "المدة", render: (r) => (
      <span className="font-mono text-xs">{fmtMs(r.durationMs)}</span>
    )},
    { key: "fileSizeBytes", header: "الحجم", render: (r) => (
      <span className="font-mono text-xs">{fmtBytes(r.fileSizeBytes)}</span>
    )},
    { key: "retentionExpiresAt", header: "انتهاء الاحتفاظ", render: (r) => (
      <span className="text-xs">{r.retentionExpiresAt ? formatDateAr(r.retentionExpiresAt) : "—"}</span>
    )},
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "actions", header: "", render: (r) => (
      <Button variant="ghost" size="sm" asChild>
        <a href={r.recordingUrl} target="_blank" rel="noreferrer">
          <PlayCircle className="w-3 h-3 me-1" />تشغيل
        </a>
      </Button>
    )},
  ];

  const transcriptColumns: DataTableColumn<TranscriptRow>[] = [
    { key: "createdAt", header: "أُضيفت", render: (r) => (
      <span className="text-xs">{formatDateAr(r.createdAt)}</span>
    )},
    { key: "callerNumber", header: "المكالمة", render: (r) => (
      <span className="font-mono text-xs">{r.callerNumber} → {r.calledNumber}</span>
    )},
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "language", header: "لغة", render: (r) => (
      <span className="font-mono text-xs">{r.language ?? "—"}</span>
    )},
    { key: "hasTranscript", header: "نسخة", render: (r) => r.hasTranscript ? "✓" : "—" },
    { key: "hasSummary", header: "ملخّص", render: (r) => r.hasSummary ? "✓" : "—" },
    { key: "actions", header: "إجراءات", render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setViewTranscriptId(r.id)}>تفاصيل</Button>
        {r.status === "failed" && (
          <Button variant="ghost" size="sm" onClick={() => enqueueTranscript.mutate(r.callId)}>
            <RefreshCw className="w-3 h-3 me-1" />إعادة محاولة
          </Button>
        )}
        {r.hasTranscript && !r.hasSummary && (
          <Button variant="ghost" size="sm" onClick={() => summarise.mutate(r.id)}>
            <Sparkles className="w-3 h-3 me-1" />لخّص
          </Button>
        )}
      </div>
    )},
  ];

  return (
    <PageShell
      title="مركز التحكّم بالـ PBX"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مركز التحكّم بالـ PBX" },
      ]}
      subtitle="الامتدادات، قوائم الـ IVR، التسجيلات، وطابور تحويل الصوت إلى نص"
      actions={
        <RefreshAction onRefresh={refreshAll} />
      }
    >
      <PageStateWrapper isLoading={ovLoading && !overview} error={ovError} onRetry={refetchOv}>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><Phone className="w-4 h-4 me-1" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="setup"><Settings className="w-4 h-4 me-1" />الإعداد</TabsTrigger>
            <TabsTrigger value="extensions"><Users className="w-4 h-4 me-1" />الامتدادات ({extensions.length})</TabsTrigger>
            <TabsTrigger value="ivr"><ListTree className="w-4 h-4 me-1" />الـ IVR ({menus.length})</TabsTrigger>
            <TabsTrigger value="recordings"><Headphones className="w-4 h-4 me-1" />التسجيلات ({recordings.length})</TabsTrigger>
            <TabsTrigger value="transcripts"><MessageSquareText className="w-4 h-4 me-1" />النسخ ({transcripts.length})</TabsTrigger>
          </TabsList>

          {/* ── Overview ───────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(overview?.callsLast24h ?? []).map((c) => (
                <Card key={c.direction} className="border-0 shadow-sm bg-status-info-surface">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Phone className="w-8 h-8 text-status-info-foreground" />
                    <div>
                      <p className="text-sm font-semibold">مكالمات {c.direction}</p>
                      <p className="text-xs text-muted-foreground">{c.count} خلال 24س</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card className={cn(
                "border-0 shadow-sm",
                (overview?.transcripts.failed ?? 0) > 0 ? "bg-status-error-surface" : "bg-status-success-surface",
              )}>
                <CardContent className="p-4 flex items-center gap-3">
                  <MessageSquareText className="w-8 h-8 text-status-info-foreground" />
                  <div>
                    <p className="text-sm font-semibold">طابور النسخ</p>
                    <p className="text-xs text-muted-foreground">
                      {overview?.transcripts.pending ?? 0} بانتظار / {overview?.transcripts.failed ?? 0} فشلت
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {overview?.transcripts.readyForSummary ?? 0} جاهز للتلخيص
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-status-info-surface">
                <CardContent className="p-4 flex items-center gap-3">
                  <Headphones className="w-8 h-8 text-status-info-foreground" />
                  <div>
                    <p className="text-sm font-semibold">التسجيلات النشطة</p>
                    <p className="text-xs text-muted-foreground">{overview?.recordings.active ?? 0} ملف</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">قوائم IVR</CardTitle></CardHeader>
                <CardContent>
                  {(overview?.menus ?? []).length > 0 ? (
                    <div className="space-y-1">
                      {(overview?.menus ?? []).map((m) => (
                        <div key={m.id} className="flex justify-between text-sm">
                          <span><span className="font-mono text-xs">{m.slug}</span> — {m.name}</span>
                          <PageStatusBadge status={m.status} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">لا توجد قوائم IVR بعد.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">الامتدادات حسب النوع</CardTitle></CardHeader>
                <CardContent>
                  {(overview?.extensions ?? []).length > 0 ? (
                    <div className="space-y-1">
                      {(overview?.extensions ?? []).map((e, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{e.type}</span>
                          <span className="font-mono">{e.active} نشط / {e.disabled} معطّل</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">لا توجد امتدادات بعد.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Setup (vendor wiring) ─────────────────────────── */}
          <TabsContent value="setup" className="space-y-4">
            <PbxSetupPanel />
          </TabsContent>

          {/* ── Extensions ─────────────────────────────────────── */}
          <TabsContent value="extensions" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setExtOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />امتداد جديد
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {extensions.length > 0
                  ? <DataTable columns={extensionColumns} data={extensions} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد امتدادات بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── IVR Menus ──────────────────────────────────────── */}
          <TabsContent value="ivr" className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIvrTestOpen(true)}>
                <FlaskConical className="w-4 h-4 me-1" />تجربة التوجيه
              </Button>
              <Button onClick={() => setMenuOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />قائمة IVR جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {menus.length > 0
                  ? <DataTable columns={menuColumns} data={menus} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد قوائم IVR بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Recordings ─────────────────────────────────────── */}
          <TabsContent value="recordings" className="space-y-3">
            <Card>
              <CardContent className="p-0">
                {recordings.length > 0
                  ? <DataTable columns={recordingColumns} data={recordings} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد تسجيلات بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Transcripts ────────────────────────────────────── */}
          <TabsContent value="transcripts" className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-sm">الحالة:</Label>
                <Select value={transcriptStatusFilter || "all"} onValueChange={(v) => setTranscriptStatusFilter(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="pending">بانتظار</SelectItem>
                    <SelectItem value="transcribing">قيد التحويل</SelectItem>
                    <SelectItem value="completed">مكتملة</SelectItem>
                    <SelectItem value="failed">فاشلة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <PrintButton
                  entityType="report_admin_pbx_control"
                  entityId="list"
                  size="icon"
                  payload={() => ({
                    entity: { title: "طابور النسخ (تحويل الصوت إلى نص) — مركز التحكّم بالـ PBX", total: printRows.length },
                    items: printRows.map((r: TranscriptRow) => ({
                      "المكالمة": `${r.callerNumber} → ${r.calledNumber}`,
                      "الحالة": TRANSCRIPT_STATUS_AR[r.status] ?? r.status,
                      "اللغة": r.language ?? "—",
                      "نسخة": r.hasTranscript ? "متوفرة" : "غير متوفرة",
                      "ملخّص": r.hasSummary ? "متوفر" : "غير متوفر",
                      "أُضيفت": r.createdAt,
                    })),
                  })}
                />
                <Button variant="outline" size="sm" onClick={() => runNext.mutate()} disabled={runNext.isPending}>
                  <PlayCircle className="w-4 h-4 me-1" />شغّل العنصر التالي
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                {transcripts.length > 0
                  ? <DataTable columns={transcriptColumns} data={transcripts} onSortedDataChange={setPrintRows} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد نسخ في النطاق المختار.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <NewExtensionDialog
          open={extOpen}
          onClose={() => setExtOpen(false)}
          onSubmit={(b) => createExt.mutate(b)}
          isSubmitting={createExt.isPending}
        />
        <NewIvrMenuDialog
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSubmit={(b) => createMenu.mutate(b)}
          isSubmitting={createMenu.isPending}
        />
        <IvrTestDialog
          open={ivrTestOpen}
          menus={menus}
          onClose={() => setIvrTestOpen(false)}
        />
        <IvrMenuEditorDialog
          menuId={editMenuId}
          onClose={() => { setEditMenuId(null); refetchMenus(); }}
        />
        <ViewTranscriptDialog
          transcriptId={viewTranscriptId}
          onClose={() => setViewTranscriptId(null)}
          onSummarise={(id) => summarise.mutate(id)}
        />
      </PageStateWrapper>
    </PageShell>
  );
}

// ─────────────────────── Dialogs ──────────────────────────────────────────

function NewExtensionDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<ExtensionRow>) => void; isSubmitting: boolean;
}) {
  const [extension, setExtension] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"employee" | "department" | "queue" | "voicemail">("employee");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [ringTimeout, setRingTimeout] = useState(30);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>امتداد PBX جديد</DialogTitle>
          <DialogDescription>اربط الامتداد بموظف أو قسم. الـ PBX vendor يتولّى الـ SIP routing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>الامتداد</Label><Input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="1001" /></div>
            <div>
              <Label>النوع</Label>
              <Select value={type} onValueChange={(v) => setType(v as "employee" | "department" | "queue" | "voicemail")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">موظف</SelectItem>
                  <SelectItem value="department">قسم</SelectItem>
                  <SelectItem value="queue">طابور</SelectItem>
                  <SelectItem value="voicemail">بريد صوتي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {type === "employee" && (
            <div><Label>معرّف الموظف (اختياري)</Label><Input type="number" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /></div>
          )}
          <div><Label>مهلة الرنين (ثوان)</Label><Input type="number" value={ringTimeout} onChange={(e) => setRingTimeout(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !extension || !name} onClick={() => onSubmit({
            extension, name, type, ringTimeoutSeconds: ringTimeout,
            employeeId: employeeId ? Number(employeeId) : null,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewIvrMenuDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<IvrMenuRow> & { greetingText: string }) => void; isSubmitting: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [greetingText, setGreetingText] = useState("أهلاً بك في غيث. اضغط 1 للمبيعات، 2 للدعم.");
  const [timeoutSeconds, setTimeoutSeconds] = useState(10);
  const [fallbackAction, setFallbackAction] = useState<"hangup" | "extension" | "menu">("hangup");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>قائمة IVR جديدة</DialogTitle>
          <DialogDescription>أضف الـ DTMF options بعد الإنشاء.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>المعرّف (slug)</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="main" /></div>
            <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="القائمة الرئيسية" /></div>
          </div>
          <div>
            <Label>نص الترحيب</Label>
            <Textarea value={greetingText} onChange={(e) => setGreetingText(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>مهلة الاستجابة (ثوان)</Label><Input type="number" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(Number(e.target.value))} /></div>
            <div>
              <Label>الإجراء الافتراضي عند انتهاء المهلة</Label>
              <Select value={fallbackAction} onValueChange={(v) => setFallbackAction(v as "hangup" | "extension" | "menu")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hangup">إنهاء</SelectItem>
                  <SelectItem value="extension">امتداد</SelectItem>
                  <SelectItem value="menu">قائمة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !slug || !name || !greetingText} onClick={() => onSubmit({
            slug, name, greetingText, timeoutSeconds, fallbackAction,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IvrMenuEditorDialog({ menuId, onClose }: {
  menuId: number | null; onClose: () => void;
}) {
  const { data: detail, refetch } = useApiQuery<{ menu: IvrMenuRow; options: IvrOptionRow[] }>(
    ["pbx-control-menu", String(menuId ?? 0)],
    menuId ? `/admin/pbx-control/ivr-menus/${menuId}` : null,
    { enabled: !!menuId },
  );
  const [addOpen, setAddOpen] = useState(false);
  const addOption = useMutation({
    mutationFn: (b: Partial<IvrOptionRow>) => apiFetch(`/admin/pbx-control/ivr-menus/${menuId}/options`, {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "أُضيف الخيار" }); setAddOpen(false); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const deleteOption = useMutation({
    mutationFn: (optionId: number) => apiFetch(`/admin/pbx-control/ivr-menus/${menuId}/options/${optionId}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذف الخيار" }); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  // Toggle the menu's status active⇄disabled in-place. The backend allows
  // partial updates on /admin/pbx-control/ivr-menus/:id; flipping the
  // status is the most common edit and doesn't need a full dialog.
  const toggleStatus = useMutation({
    mutationFn: () => apiFetch(`/admin/pbx-control/ivr-menus/${menuId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: detail?.menu.status === "active" ? "disabled" : "active" }),
    }),
    onSuccess: () => { toast({ title: "تم تحديث الحالة" }); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!menuId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {detail ? <>تحرير القائمة: <span className="font-mono text-sm">{detail.menu.slug}</span></> : "تحميل..."}
          </DialogTitle>
        </DialogHeader>
        {detail && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 p-2 border rounded">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">الحالة:</Label>
                <PageStatusBadge status={detail.menu.status} />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleStatus.mutate()}
                disabled={toggleStatus.isPending}
              >
                {detail.menu.status === "active" ? "تعطيل" : "تفعيل"}
              </Button>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">نص الترحيب</Label>
              <pre className="bg-surface-subtle p-2 rounded text-xs whitespace-pre-wrap">{detail.menu.greetingText}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">خيارات الـ DTMF ({detail.options.length})</Label>
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="w-3 h-3 me-1" />خيار جديد
                </Button>
              </div>
              {detail.options.length > 0 ? (
                <div className="space-y-1">
                  {detail.options.map((o) => (
                    <div key={o.id} className="text-xs bg-surface-subtle p-2 rounded flex items-center justify-between">
                      <span>
                        <Badge variant="outline" className="font-mono text-xs me-2">{o.dtmfKey}</Badge>
                        {o.label}
                        <span className="text-muted-foreground ms-2">→ {o.action}{o.targetExtension ? ` (${o.targetExtension})` : ""}</span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => deleteOption.mutate(o.id)}>
                        <Trash2 className="w-3 h-3 text-status-error-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد خيارات. أضف على الأقل خياراً واحداً لتفعيل القائمة.</p>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
        <NewOptionDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSubmit={(b) => addOption.mutate(b)}
          isSubmitting={addOption.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewOptionDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<IvrOptionRow>) => void; isSubmitting: boolean;
}) {
  const [dtmfKey, setDtmfKey] = useState("1");
  const [label, setLabel] = useState("");
  const [action, setAction] = useState<"extension" | "menu" | "voicemail" | "hangup" | "department">("extension");
  const [targetExtension, setTargetExtension] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>خيار DTMF جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>المفتاح</Label>
              <Select value={dtmfKey} onValueChange={setDtmfKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"].map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الإجراء</Label>
              <Select value={action} onValueChange={(v) => setAction(v as "extension" | "menu" | "voicemail" | "hangup" | "department")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="extension">امتداد</SelectItem>
                  <SelectItem value="menu">قائمة فرعية</SelectItem>
                  <SelectItem value="voicemail">بريد صوتي</SelectItem>
                  <SelectItem value="hangup">إنهاء</SelectItem>
                  <SelectItem value="department">قسم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>التسمية</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="اضغط 1 للمبيعات" /></div>
          {(action === "extension" || action === "voicemail" || action === "department") && (
            <div><Label>الامتداد الهدف</Label><Input value={targetExtension} onChange={(e) => setTargetExtension(e.target.value)} placeholder="1001" /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !label} onClick={() => onSubmit({
            dtmfKey, label, action,
            targetExtension: targetExtension || null,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IvrTestDialog({ open, menus, onClose }: {
  open: boolean; menus: IvrMenuRow[]; onClose: () => void;
}) {
  const [menuSlug, setMenuSlug] = useState("");
  const [dtmfKey, setDtmfKey] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const run = useMutation({
    mutationFn: () => apiFetch("/admin/pbx-control/ivr-test", {
      method: "POST", body: JSON.stringify({ menuSlug, dtmfKey: dtmfKey || null }),
    }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setResult(null); }}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجربة توجيه IVR</DialogTitle>
          <DialogDescription>محاكاة ما يفعله الـ PBX عند ضغط مفتاح.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>القائمة</Label>
            <Select value={menuSlug} onValueChange={setMenuSlug}>
              <SelectTrigger><SelectValue placeholder="اختر قائمة" /></SelectTrigger>
              <SelectContent>
                {menus.filter((m) => m.status === "active").map((m) => (
                  <SelectItem key={m.id} value={m.slug}>{m.slug} — {m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>مفتاح المتصل (فارغ = greeting)</Label>
            <Input value={dtmfKey} onChange={(e) => setDtmfKey(e.target.value)} placeholder="1" />
          </div>
          <Button rateLimitAware disabled={run.isPending || !menuSlug} onClick={() => run.mutate()}>
            <FlaskConical className="w-4 h-4 me-1" />شغّل
          </Button>
          {result != null && (
            <pre className="bg-surface-subtle p-3 rounded text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewTranscriptDialog({ transcriptId, onClose, onSummarise }: {
  transcriptId: number | null; onClose: () => void; onSummarise: (id: number) => void;
}) {
  const { data: tr } = useApiQuery<TranscriptRow & { transcript: string | null; summary: string | null }>(
    ["pbx-control-transcript", String(transcriptId ?? 0)],
    transcriptId ? `/admin/pbx-control/transcripts/${transcriptId}` : null,
    { enabled: !!transcriptId },
  );
  return (
    <Dialog open={!!transcriptId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {tr ? <>تفاصيل النسخة — <PageStatusBadge status={tr.status} /></> : "تحميل..."}
          </DialogTitle>
        </DialogHeader>
        {tr && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{tr.callerNumber}</span> → <span className="font-mono">{tr.calledNumber}</span>
              <span className="ms-3">المدة: {tr.duration}s</span>
            </div>
            {tr.errorMessage && (
              <div className="bg-status-error-surface text-status-error-foreground p-2 rounded text-sm">
                <AlertOctagon className="w-4 h-4 inline me-1" />{tr.errorMessage}
              </div>
            )}
            {tr.transcript && (
              <div>
                <Label className="text-xs text-muted-foreground">النسخة الكاملة</Label>
                <pre className="bg-surface-subtle p-3 rounded text-xs whitespace-pre-wrap">{tr.transcript}</pre>
              </div>
            )}
            {tr.summary ? (
              <div>
                <Label className="text-xs text-muted-foreground">ملخّص AI</Label>
                <pre className="bg-surface-subtle p-3 rounded text-xs whitespace-pre-wrap">{tr.summary}</pre>
              </div>
            ) : tr.transcript && (
              <Button rateLimitAware onClick={() => onSummarise(tr.id)}>
                <Sparkles className="w-4 h-4 me-1" />ولّد ملخّص AI
              </Button>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Setup panel (vendor wiring) ─────────────────────

function PbxSetupPanel() {
  const { data: setup, isLoading, error, refetch } = useApiQuery<SetupInfo>(
    ["pbx-control-setup"], "/admin/pbx-control/setup",
  );
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [testSecret, setTestSecret] = useState("");
  const [testResult, setTestResult] = useState<SignatureTestResult | null>(null);

  const generate = useMutation({
    mutationFn: () => apiFetch<GeneratedSecret>("/admin/pbx-control/setup/generate-secret", { method: "POST" }),
    onSuccess: (r) => { setGeneratedSecret(r.secret); toast({ title: "تم توليد سرّ جديد" }); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const testSig = useMutation({
    mutationFn: (b: { secret: string; body?: string }) => apiFetch<SignatureTestResult>(
      "/admin/pbx-control/setup/test-signature",
      { method: "POST", body: JSON.stringify(b) },
    ),
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: `نُسخ ${label}` }),
      () => toast({ title: "فشل النسخ", variant: "destructive" }),
    );
  };

  return (
    <PageStateWrapper isLoading={isLoading && !setup} error={error} onRetry={refetch}>
      {setup && (
        <div className="space-y-4">

          {/* Signing status banner */}
          <Card className={cn(
            "border-0 shadow-sm",
            setup.signing.configured ? "bg-status-success-surface" : "bg-status-warning-surface/60",
          )}>
            <CardContent className="p-4 flex items-center gap-3">
              {setup.signing.configured
                ? <CheckCircle2 className="w-8 h-8 text-status-success-foreground" />
                : <AlertOctagon className="w-8 h-8 text-status-warning-foreground" />}
              <div className="flex-1">
                <p className="text-sm font-semibold">
                  {setup.signing.configured ? "السرّ مضبوط في الخادم" : "السرّ غير مضبوط — الـ webhooks ستُرفض بـ 403"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  متغيّر البيئة: <span className="font-mono">{setup.signing.envVarName}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Webhook URLs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4" />Webhook URLs لمزوّد الـ PBX
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                هذه الـ URLs يضعها مزوّد الـ PBX (Twilio / 3CX / FreePBX / Asterisk) في إعدادات الـ webhooks لديه. كل طلب يجب أن يحمل توقيع HMAC أو Bearer header.
              </p>
              {setup.webhooks.map((w) => (
                <div key={w.event} className="bg-surface-subtle rounded p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="font-mono text-xs">{w.event}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => copy(w.url, w.event)}>
                      <Copy className="w-3 h-3 me-1" />نسخ
                    </Button>
                  </div>
                  <p className="font-mono text-xs break-all">{w.url}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{w.description}</p>
                </div>
              ))}
              <div className="bg-status-info-surface rounded p-3 text-xs">
                <p className="font-semibold mb-1">طريقة المصادقة:</p>
                <p className="font-mono text-[11px]">{setup.signing.algorithm}</p>
                <p className="font-mono text-[11px] mt-1">{setup.signing.bearerAlternative}</p>
              </div>
            </CardContent>
          </Card>

          {/* Generate secret */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4" />توليد سرّ webhook جديد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                ولّد سرّاً عشوائياً قويّاً (32 بايت/64 محرف hex). انسخه إلى <span className="font-mono">PBX_WEBHOOK_SECRET</span> في بيئة الخادم وأعد تشغيله. الـ webhooks بعدها ستُقبَل.
              </p>
              <Button rateLimitAware onClick={() => generate.mutate()} disabled={generate.isPending}>
                <KeyRound className="w-4 h-4 me-1" />ولّد سرّاً
              </Button>
              {generatedSecret && (
                <div className="bg-status-warning-surface/40 border border-status-warning-surface rounded p-3">
                  <p className="text-xs font-semibold mb-1 text-status-warning-foreground">السرّ — لن يُعرض مرّة أخرى:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono break-all flex-1">{generatedSecret}</code>
                    <Button variant="ghost" size="sm" onClick={() => copy(generatedSecret, "السرّ")}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test signature */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4" />اختبار توقيع HMAC
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                أدخل السرّ الذي وضعته في إعدادات الـ PBX؛ نُولّد لك header التوقيع + أمر curl جاهز للتشغيل من سطر الأوامر. لا يصل أي شيء للـ webhook الفعلي.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded font-mono"
                  value={testSecret}
                  onChange={(e) => setTestSecret(e.target.value)}
                  placeholder="السرّ الذي تستخدمه في الـ PBX"
                />
                <Button
                  rateLimitAware
                  disabled={testSig.isPending || testSecret.length < 8}
                  onClick={() => testSig.mutate({ secret: testSecret })}
                >
                  <FlaskConical className="w-4 h-4 me-1" />ولّد
                </Button>
              </div>
              {testResult && (
                <div className="space-y-2 mt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Header التوقيع</Label>
                    <div className="bg-surface-subtle rounded p-2 flex items-center gap-2">
                      <code className="text-[11px] font-mono break-all flex-1">{testResult.signatureHeader}</code>
                      <Button variant="ghost" size="sm" onClick={() => copy(testResult.signatureHeader, "header التوقيع")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">أمر curl للاختبار</Label>
                    <div className="bg-surface-subtle rounded p-2 flex items-start gap-2">
                      <pre className="text-[11px] font-mono whitespace-pre-wrap break-all flex-1">{testResult.curlExample}</pre>
                      <Button variant="ghost" size="sm" onClick={() => copy(testResult.curlExample, "أمر curl")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{testResult.note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DID mapping status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="w-4 h-4" />ربط أرقام الـ DID
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs">
                عدد أرقام DID المُسجَّلة لهذه الشركة: <span className="font-mono font-semibold">{setup.didMappingsActive}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                أضِف أرقام DID من <span className="font-mono">/admin/integrations</span> → integration بنوع <span className="font-mono">pbx</span> + حقل <span className="font-mono">config.did</span>. أرقام DID تحدّد أيّ شركة يُوجَّه إليها الاتصال الوارد عند تعدّد المستأجرين.
              </p>
            </CardContent>
          </Card>

          {/* Vendor cheatsheet */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">إرشادات لكل مزوّد</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(setup.vendorNotes).map(([vendor, note]) => (
                <div key={vendor} className="text-xs">
                  <span className="font-mono font-semibold">{vendor}:</span> <span className="text-muted-foreground">{note}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </PageStateWrapper>
  );
}
