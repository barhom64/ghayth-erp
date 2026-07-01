/**
 * Admin → Communication Control Plane (#1139 §3).
 *
 * Tabs:
 *   1. Overview      — provider counts + DLP rule counts + 24h inbound volume
 *   2. Unified Inbox — UNION across communications_log + pbx_calls
 *   3. Providers     — failover registry CRUD
 *   4. DLP Rules     — outbound scan rule CRUD + dry-run tester
 *
 * Same nesting + dialog pattern as admin-ai-governance.tsx so an
 * operator who knows one knows the other.
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
import { resolveStatus } from "@workspace/ui-core";
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
import {
  Radio, Inbox, Shield, AlertOctagon, Plus, FlaskConical, Phone, MessageSquare, Mail,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

interface ProviderRow {
  id: number;
  channel: string;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  config: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DlpRuleRow {
  id: number;
  companyId: number | null;
  name: string;
  description: string | null;
  channel: string | null;
  pattern: string;
  action: "flag" | "redact" | "block";
  replacement: string | null;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InboxRow {
  source: "message" | "call";
  id: string;
  channel: string;
  direction: string;
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  createdAt: string;
}

interface Overview {
  providers: Array<{ channel: string; status: string; count: number }>;
  dlpRules: Array<{ severity: string; action: string; count: number }>;
  inboundLast24h: Array<{ channel: string; direction: string; count: number }>;
  pbxLast24h: Array<{ direction: string; status: string; count: number }>;
  pendingTranscripts: number;
  collectedAt: string;
}

interface DlpTestResult {
  body: string;
  blocked: boolean;
  reason: string | null;
  matches: Array<{ ruleId: number; ruleName: string; action: string; severity: string; matchedText: string }>;
}

const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: MessageSquare,
  pbx: Phone,
  webhook: Radio,
};

// Arabic labels mirroring the channel/direction copy shown across the page
// (the channel <Select> options + the inbox direction badge). Named
// INBOX_* to avoid colliding with the channel-readiness CHANNEL_LABEL_AR
// defined later in this file for a different (readiness) concept.
const INBOX_CHANNEL_LABEL_AR: Record<string, string> = {
  email: "بريد إلكتروني",
  whatsapp: "واتساب",
  sms: "رسائل SMS",
  pbx: "سنترال (PBX)",
  webhook: "Webhook",
};
const DIRECTION_LABEL_AR: Record<string, string> = {
  inbound: "وارد",
  outbound: "صادر",
};

export default function AdminCommunicationControl() {
  const [tab, setTab] = useState("overview");
  const [providerOpen, setProviderOpen] = useState(false);
  const [dlpOpen, setDlpOpen] = useState(false);
  const [dlpTestOpen, setDlpTestOpen] = useState(false);
  const [inboxChannel, setInboxChannel] = useState<string>("all");

  const { data: overview, isLoading: ovLoading, error: ovError, refetch: refetchOverview } =
    useApiQuery<Overview>(["comm-control-overview"], "/admin/communication-control/overview");

  const { data: inboxResp, isLoading: ibLoading, refetch: refetchInbox } =
    useApiQuery<{ data: InboxRow[] }>(
      ["comm-control-inbox", inboxChannel],
      inboxChannel === "all"
        ? "/admin/communication-control/inbox"
        : `/admin/communication-control/inbox?channel=${inboxChannel}`,
    );

  const { data: providersResp, refetch: refetchProviders } =
    useApiQuery<{ data: ProviderRow[] }>(["comm-control-providers"], "/admin/communication-control/providers");

  const { data: rulesResp, refetch: refetchRules } =
    useApiQuery<{ data: DlpRuleRow[] }>(["comm-control-dlp"], "/admin/communication-control/dlp-rules");

  const providers = providersResp?.data ?? [];
  const rules = rulesResp?.data ?? [];
  const inbox = inboxResp?.data ?? [];

  // Print wiring — the Unified Inbox is the primary operational row-level
  // table (messages + calls); providers/DLP are smaller config registries.
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<InboxRow>(inbox);

  const refreshAll = () => {
    void refetchOverview();
    void refetchInbox();
    void refetchProviders();
    void refetchRules();
  };

  const createProvider = useMutation({
    mutationFn: (b: Partial<ProviderRow>) => apiFetch("/admin/communication-control/providers", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "تم إنشاء المزوّد" }); setProviderOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" }),
  });

  const toggleProvider = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/admin/communication-control/providers/${id}`, {
        method: "PATCH", body: JSON.stringify({ status }),
      }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل التحديث", description: e.message, variant: "destructive" }),
  });

  const createRule = useMutation({
    mutationFn: (b: Partial<DlpRuleRow>) => apiFetch("/admin/communication-control/dlp-rules", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "تم إنشاء القاعدة" }); setDlpOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" }),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/admin/communication-control/dlp-rules/${id}`, {
        method: "PATCH", body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل التحديث", description: e.message, variant: "destructive" }),
  });

  // ─── Columns ─────────────────────────────────────────────────────────
  const providerColumns: DataTableColumn<ProviderRow>[] = [
    { key: "channel", header: "القناة", searchable: true, render: (r) => {
      const Icon = CHANNEL_ICON[r.channel] ?? Radio;
      return <span className="flex items-center gap-1 text-xs"><Icon className="w-3 h-3" />{r.channel}</span>;
    }},
    { key: "slug", header: "المعرّف", render: (r) => <span className="font-mono text-xs">{r.slug}</span> },
    { key: "name", header: "الاسم", render: (r) => <span className="text-xs">{r.name}</span> },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "priority", header: "الأولوية", render: (r) => <span className="font-mono text-xs">{r.priority}</span> },
    { key: "actions", header: "إجراءات", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => toggleProvider.mutate({
        id: r.id, status: r.status === "active" ? "disabled" : "active",
      })}>
        {r.status === "active" ? "تعطيل" : "تفعيل"}
      </Button>
    )},
  ];

  const ruleColumns: DataTableColumn<DlpRuleRow>[] = [
    { key: "name", header: "القاعدة", searchable: true, render: (r) => (
      <div>
        <p className="text-xs font-medium">{r.name}</p>
        {r.description && <p className="text-[11px] text-muted-foreground">{r.description}</p>}
      </div>
    )},
    { key: "channel", header: "القناة", render: (r) => (
      <span className="font-mono text-xs">{r.channel ?? "الكل"}</span>
    )},
    { key: "action", header: "الإجراء", render: (r) => <PageStatusBadge status={r.action} /> },
    { key: "severity", header: "الخطورة", render: (r) => <PageStatusBadge status={r.severity} /> },
    { key: "enabled", header: "مفعّلة", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => toggleRule.mutate({ id: r.id, enabled: !r.enabled })}>
        {r.enabled ? "مفعّلة" : "معطّلة"}
      </Button>
    )},
  ];

  const inboxColumns: DataTableColumn<InboxRow>[] = [
    { key: "channel", header: "القناة", render: (r) => {
      const Icon = CHANNEL_ICON[r.channel] ?? Radio;
      return <span className="flex items-center gap-1 text-xs"><Icon className="w-3 h-3" />{r.channel}</span>;
    }},
    { key: "direction", header: "الاتجاه", render: (r) => (
      <Badge variant="outline" className="text-[10px]">{r.direction}</Badge>
    )},
    { key: "from_addr", header: "من", render: (r) => (
      <span className="font-mono text-xs">{r.from_addr ?? "—"}</span>
    )},
    { key: "subject", header: "الموضوع / المحتوى", render: (r) => (
      <span className="text-xs max-w-[400px] truncate block" title={r.body ?? ""}>
        {r.subject ?? r.body ?? "—"}
      </span>
    )},
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "createdAt", header: "التاريخ", render: (r) => (
      <span className="text-xs">{formatDateAr(r.createdAt)}</span>
    )},
  ];

  // Aggregate by channel for the overview tab.
  const inboundByChannel = (overview?.inboundLast24h ?? []).reduce<Record<string, { in: number; out: number }>>((acc, r) => {
    acc[r.channel] = acc[r.channel] ?? { in: 0, out: 0 };
    if (r.direction === "inbound") acc[r.channel].in += r.count;
    else acc[r.channel].out += r.count;
    return acc;
  }, {});

  return (
    <PageShell
      title="مركز التحكّم بالاتصالات"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مركز التحكّم بالاتصالات" },
      ]}
      subtitle="صندوق الوارد الموحّد، سجل المزوّدات مع التحويل عند الفشل، وقواعد منع تسريب البيانات (DLP)"
      actions={
        <RefreshAction onRefresh={refreshAll} />
      }
    >
      <PageStateWrapper isLoading={ovLoading && !overview} error={ovError} onRetry={refetchOverview}>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><Radio className="w-4 h-4 me-1" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="inbox"><Inbox className="w-4 h-4 me-1" />الصندوق الموحّد</TabsTrigger>
            <TabsTrigger value="providers"><Radio className="w-4 h-4 me-1" />المزوّدات ({providers.length})</TabsTrigger>
            <TabsTrigger value="dlp"><Shield className="w-4 h-4 me-1" />قواعد DLP ({rules.length})</TabsTrigger>
          </TabsList>

          {/* ── Overview ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            <ReadinessPanel />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(inboundByChannel).map(([ch, v]) => {
                const Icon = CHANNEL_ICON[ch] ?? Radio;
                return (
                  <Card key={ch} className="border-0 shadow-sm bg-status-info-surface">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Icon className="w-8 h-8 text-status-info-foreground" />
                      <div>
                        <p className="text-sm font-semibold">{ch}</p>
                        <p className="text-xs text-muted-foreground">{v.in} وارد / {v.out} صادر (24س)</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {overview?.pendingTranscripts !== undefined && overview.pendingTranscripts > 0 && (
                <Card className="border-0 shadow-sm bg-status-warning-surface/60">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertOctagon className="w-8 h-8 text-status-warning-foreground" />
                    <div>
                      <p className="text-sm font-semibold">نسخ نصّية بانتظار</p>
                      <p className="text-xs text-muted-foreground">{overview.pendingTranscripts} مكالمة بحاجة تحويل صوت→نص</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">المزوّدات حسب القناة</CardTitle></CardHeader>
                <CardContent>
                  {(overview?.providers ?? []).length > 0 ? (
                    <div className="space-y-1">
                      {(overview?.providers ?? []).map((p, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span><span className="font-mono">{p.channel}</span> — {p.status}</span>
                          <span className="font-mono font-semibold">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">لا توجد مزوّدات مسجّلة. ابدأ من تبويب "المزوّدات".</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">قواعد DLP المفعّلة</CardTitle></CardHeader>
                <CardContent>
                  {(overview?.dlpRules ?? []).length > 0 ? (
                    <div className="space-y-1">
                      {(overview?.dlpRules ?? []).map((r, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{r.severity} / {r.action}</span>
                          <span className="font-mono font-semibold">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">لا توجد قواعد DLP مفعّلة.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Unified Inbox ─────────────────────────────────────── */}
          <TabsContent value="inbox" className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">القناة:</Label>
              <Select value={inboxChannel} onValueChange={setInboxChannel}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع القنوات</SelectItem>
                  <SelectItem value="email">بريد إلكتروني</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">رسائل SMS</SelectItem>
                  <SelectItem value="pbx">سنترال (PBX)</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">آخر 24 ساعة، حد أقصى 100 سجل</span>
              <div className="ms-auto">
                <PrintButton
                  entityType="report_admin_communication_control"
                  entityId="list"
                  size="icon"
                  payload={() => ({
                    entity: { title: "الصندوق الموحّد — مركز التحكّم بالاتصالات", total: printRows.length },
                    items: printRows.map((r: InboxRow) => ({
                      "القناة": INBOX_CHANNEL_LABEL_AR[r.channel] ?? r.channel,
                      "الاتجاه": DIRECTION_LABEL_AR[r.direction] ?? r.direction,
                      "من": r.from_addr ?? "—",
                      "الموضوع / المحتوى": r.subject ?? r.body ?? "—",
                      "الحالة": resolveStatus(r.status)?.label ?? r.status,
                      "التاريخ": r.createdAt,
                    })),
                  })}
                />
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <PageStateWrapper isLoading={ibLoading && inbox.length === 0} compact onRetry={refetchInbox}>
                  {inbox.length > 0
                    ? <DataTable columns={inboxColumns} data={inbox} onSortedDataChange={setPrintRows} noToolbar pageSize={0} />
                    : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد رسائل واردة في النطاق المختار.</p>}
                </PageStateWrapper>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Providers ─────────────────────────────────────────── */}
          <TabsContent value="providers" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setProviderOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />مزوّد جديد
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {providers.length > 0
                  ? <DataTable columns={providerColumns} data={providers} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد مزوّدات مسجّلة بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DLP rules ────────────────────────────────────────── */}
          <TabsContent value="dlp" className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDlpTestOpen(true)}>
                <FlaskConical className="w-4 h-4 me-1" />تجربة قاعدة
              </Button>
              <Button onClick={() => setDlpOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />قاعدة جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {rules.length > 0
                  ? <DataTable columns={ruleColumns} data={rules} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد قواعد DLP بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <NewProviderDialog
          open={providerOpen}
          onClose={() => setProviderOpen(false)}
          onSubmit={(b) => createProvider.mutate(b)}
          isSubmitting={createProvider.isPending}
        />
        <NewDlpRuleDialog
          open={dlpOpen}
          onClose={() => setDlpOpen(false)}
          onSubmit={(b) => createRule.mutate(b)}
          isSubmitting={createRule.isPending}
        />
        <DlpTesterDialog
          open={dlpTestOpen}
          onClose={() => setDlpTestOpen(false)}
        />
      </PageStateWrapper>
    </PageShell>
  );
}

function NewProviderDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<ProviderRow>) => void; isSubmitting: boolean;
}) {
  const [channel, setChannel] = useState<string>("email");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل مزوّد جديد</DialogTitle>
          <DialogDescription>أولوية أقل = يُجرَّب أولاً عند الـ failover.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>القناة</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">رسائل SMS</SelectItem>
                <SelectItem value="pbx">سنترال (PBX)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المعرّف (slug)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="smtp-primary" />
          </div>
          <div>
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SendGrid Primary" />
          </div>
          <div>
            <Label>الأولوية</Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !slug || !name} onClick={() => onSubmit({
            channel, slug, name, priority, notes: notes || null,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDlpRuleDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<DlpRuleRow>) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<string>("");
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<string>("flag");
  const [replacement, setReplacement] = useState("[REDACTED]");
  const [severity, setSeverity] = useState<string>("warning");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>قاعدة DLP جديدة</DialogTitle>
          <DialogDescription>يُفحص بها محتوى الرسائل الصادرة قبل الإرسال.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>القناة</Label>
              <Select value={channel || "_none"} onValueChange={(v) => setChannel(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">الكل</SelectItem>
                  <SelectItem value="email">بريد إلكتروني</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">رسائل SMS</SelectItem>
                  <SelectItem value="pbx">سنترال (PBX)</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الإجراء</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flag">flag (تسجيل فقط)</SelectItem>
                  <SelectItem value="redact">redact (إخفاء)</SelectItem>
                  <SelectItem value="block">block (منع الإرسال)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>النمط (regex)</Label>
            <Input className="font-mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="\bSA\d{22}\b" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>النص البديل (للـ redact)</Label>
              <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
            </div>
            <div>
              <Label>الخطورة</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warning">warning</SelectItem>
                  <SelectItem value="critical">critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !name || !pattern} onClick={() => onSubmit({
            name, description: description || null,
            channel: channel || null,
            pattern, action: action as "flag" | "redact" | "block",
            replacement: replacement || null,
            severity: severity as "info" | "warning" | "critical",
            enabled: true,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DlpTesterDialog({ open, onClose }: { open: boolean; onClose: () => void; }) {
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<string>("email");
  const [result, setResult] = useState<DlpTestResult | null>(null);
  const run = useMutation({
    mutationFn: () => apiFetch<DlpTestResult>("/admin/communication-control/dlp-rules/test", {
      method: "POST", body: JSON.stringify({ body, channel }),
    }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast({ title: "فشل التجربة", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setResult(null); setBody(""); }}}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>تجربة قواعد DLP</DialogTitle>
          <DialogDescription>أدخل نصاً وستظهر القواعد التي ستفعّل (dry-run، لا يُرسل شيء).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>القناة</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">رسائل SMS</SelectItem>
                <SelectItem value="pbx">سنترال (PBX)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>النص</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="font-mono text-xs" />
          </div>
          <Button rateLimitAware disabled={run.isPending || !body} onClick={() => run.mutate()}>
            <FlaskConical className="w-4 h-4 me-1" />شغّل التجربة
          </Button>
          {result && (
            <div className="space-y-3 border-t pt-3">
              <div className={cn(
                "p-2 rounded text-sm flex items-center gap-2",
                result.blocked ? "bg-status-error-surface text-status-error-foreground" : "bg-status-success-surface text-status-success-foreground",
              )}>
                {result.blocked
                  ? <><AlertOctagon className="w-4 h-4" />سيتمّ منع الإرسال — {result.reason}</>
                  : <>سيُسمح بالإرسال{result.matches.length > 0 ? ` (${result.matches.length} قاعدة فعّلت)` : ""}</>}
              </div>
              {result.matches.length > 0 && (
                <div>
                  <Label className="text-xs">القواعد التي فعّلت ({result.matches.length})</Label>
                  <div className="space-y-1 mt-2">
                    {result.matches.map((m, i) => (
                      <div key={i} className="text-xs p-2 bg-surface-subtle rounded flex items-center justify-between">
                        <span><span className="font-medium">{m.ruleName}</span> <Badge variant="outline" className="text-[10px] ms-1">{m.action}</Badge></span>
                        <span className="font-mono text-[11px] text-muted-foreground">يطابق: "{m.matchedText}"</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.body !== body && (
                <div>
                  <Label className="text-xs">النص بعد المعالجة</Label>
                  <pre className="bg-surface-subtle p-2 rounded text-xs font-mono whitespace-pre-wrap">{result.body}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ReadinessPanel ─────────────────────────────────────────────
// "Can I trust an email actually arrives if I trigger an event right
// now?" — Pulls /admin/communication-control/readiness and renders a
// status tile per channel showing the three things that have to line
// up: an active integration with credentials, a routing rule sending
// to this channel, and no failed queue rows in the last 24h.
type ChannelReadiness = {
  channel: "email" | "sms" | "whatsapp" | "pbx";
  status: "ready" | "partial" | "inactive" | "blocked";
  hasIntegration: boolean;
  hasRoutingRule: boolean;
  pendingQueue: number;
  failedQueue: number;
  connectedMailboxes?: number;
  activeExtensions?: number;
};

const STATUS_LABEL: Record<ChannelReadiness["status"], string> = {
  ready: "جاهز",
  partial: "غير مكتمل",
  inactive: "غير مفعّل",
  blocked: "إرسال معطّل",
};
const STATUS_TONE: Record<ChannelReadiness["status"], string> = {
  ready: "bg-status-success-surface text-status-success-foreground",
  partial: "bg-status-warning-surface text-status-warning-foreground",
  inactive: "bg-muted text-muted-foreground",
  blocked: "bg-status-error-surface text-status-error-foreground",
};
const CHANNEL_LABEL_AR: Record<ChannelReadiness["channel"], string> = {
  email: "البريد",
  sms: "الرسائل النصية",
  whatsapp: "واتساب",
  pbx: "السنترال",
};

function ReadinessPanel() {
  const { data, isLoading } = useApiQuery<{ data: { channels: ChannelReadiness[]; rulesActive: number } }>(
    ["comm-control-readiness"],
    "/admin/communication-control/readiness",
  );
  if (isLoading || !data?.data) return null;
  const { channels, rulesActive } = data.data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>جاهزية القنوات</span>
          <span className="text-xs text-muted-foreground font-normal">{rulesActive} قاعدة توجيه نشطة</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {channels.map((c) => {
            const reasons: string[] = [];
            if (!c.hasIntegration) reasons.push("لا يوجد مزوّد مفعّل بمفاتيح اعتماد");
            if (!c.hasRoutingRule) reasons.push("لا توجد قاعدة توجيه تُرسل لهذه القناة");
            if (c.failedQueue > 0) reasons.push(`${c.failedQueue} رسالة فاشلة خلال 24س`);
            return (
              <div key={c.channel} className={`rounded-lg p-3 ${STATUS_TONE[c.status]}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{CHANNEL_LABEL_AR[c.channel]}</p>
                  <Badge className="text-[10px] bg-white/40">{STATUS_LABEL[c.status]}</Badge>
                </div>
                <div className="text-xs space-y-0.5">
                  <p>{c.hasIntegration ? "✓ مزوّد مفعّل" : "✗ لا مزوّد"}</p>
                  <p>{c.hasRoutingRule ? "✓ مفعّل في التوجيه" : "✗ خارج التوجيه"}</p>
                  {c.channel === "email" && (
                    <p>{(c.connectedMailboxes ?? 0)} صندوق مربوط</p>
                  )}
                  {c.channel === "pbx" && (
                    <p>{(c.activeExtensions ?? 0)} تحويلة نشطة</p>
                  )}
                  <p>{c.pendingQueue} معلّقة · {c.failedQueue} فاشلة (24س)</p>
                </div>
                {reasons.length > 0 && (
                  <p className="text-[11px] mt-2 opacity-90">{reasons.join(" · ")}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
