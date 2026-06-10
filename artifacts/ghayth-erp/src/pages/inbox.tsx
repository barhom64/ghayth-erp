/**
 * /inbox — employee-facing unified inbox.
 *
 * What the previous /communications page was missing: actual ability
 * for an employee to:
 *   - compose a new email / WhatsApp / SMS from the UI (Compose button)
 *   - reply to a conversation thread inline
 *   - browse calls + see their AI summaries
 *   - manually log a phone call made from a personal mobile
 *
 * Layout:
 *   - Left rail: list of conversation threads grouped by recipient,
 *     filterable by channel
 *   - Right pane: selected thread's full history + reply box
 *   - Compose button (top right) opens a dialog that sends through
 *     the same DLP-aware backend
 */
import { useState, useEffect, useRef } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Mail, MessageSquare, Phone, Send, Plus, RefreshCw,
  ArrowDownLeft, ArrowUpRight, AlertOctagon, Sparkles,
  PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Inbox as InboxIcon, FileEdit, Star, Archive, Trash2, AlertTriangle,
  Save, PenSquare, Settings, Clock, BellOff,
} from "lucide-react";

type Folder = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash" | "spam";

const FOLDER_META: Record<Folder, { icon: typeof InboxIcon; label: string }> = {
  inbox:    { icon: InboxIcon,     label: "الوارد" },
  sent:     { icon: Send,          label: "المرسلة" },
  drafts:   { icon: FileEdit,      label: "المسودّات" },
  starred:  { icon: Star,          label: "بنجمة" },
  archive:  { icon: Archive,       label: "الأرشيف" },
  trash:    { icon: Trash2,        label: "المحذوفة" },
  spam:     { icon: AlertTriangle, label: "السبام" },
};

type Channel = "email" | "whatsapp" | "sms";

interface ThreadRow {
  id: number;
  channel: Channel | "pbx";
  direction: "inbound" | "outbound";
  peer: string;
  fromNumber: string | null;
  toNumber: string | null;
  subject: string | null;
  body_preview: string;
  status: string;
  folder: Folder | string;
  isStarred: boolean;
  relatedType: string | null;
  relatedId: number | null;
  createdAt: string;
  total_messages: number;
  inbound_count: number;
  unread_count: number;
}

interface MessageRow {
  id: number;
  channel: string;
  direction: "inbound" | "outbound";
  fromNumber: string | null;
  toNumber: string | null;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
}

interface CallRow {
  id: number;
  callId: string;
  callerNumber: string;
  calledNumber: string;
  direction: "inbound" | "outbound";
  duration: number;
  status: string;
  recordingUrl: string | null;
  transcriptStatus: string | null;
  hasSummary: boolean;
  summaryPreview: string | null;
  createdAt: string;
}

interface SendResult {
  logId: number;
  queued: boolean;
  blocked: boolean;
  reason?: string;
  dlpMatches?: Array<{ rule: string; action: string }>;
}

interface DraftRow {
  id: number;
  channel: Channel;
  recipient: string | null;
  recipientName: string | null;
  subject: string | null;
  body: string;
  templateKey: string | null;
  relatedType: string | null;
  relatedId: number | null;
  scheduledAt: string | null;
  lastSavedAt: string;
  createdAt: string;
}

interface SignatureRow {
  id: number;
  name: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_META: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  email:    { icon: Mail,          label: "بريد",   color: "text-purple-600 bg-purple-50" },
  whatsapp: { icon: MessageSquare, label: "واتساب",  color: "text-emerald-600 bg-emerald-50" },
  sms:      { icon: MessageSquare, label: "رسالة",  color: "text-sky-600 bg-sky-50" },
  pbx:      { icon: Phone,         label: "مكالمة", color: "text-orange-600 bg-orange-50" },
};

export default function Inbox() {
  const [tab, setTab] = useState<"all" | Channel | "calls">("all");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [composeOpen, setComposeOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [activeThread, setActiveThread] = useState<{ channel: Channel; address: string } | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftRow | null>(null);

  // Build the threads URL with channel + folder filters. The drafts
  // folder reads from /inbox/drafts not /inbox/threads, so we branch
  // the query path entirely.
  const isDraftsFolder = folder === "drafts";
  const isCallsTab = tab === "calls";

  // Entity filter — when the page is opened via /inbox?clientId=N (or
  // ?supplierId / ?employeeId), narrow threads to that entity. Powers the
  // "عرض كل المراسلات" link on client/supplier/employee detail pages so
  // the inbox shows only their thread without forcing the operator to
  // hunt with the search box.
  const entityFilter = (() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const map: Array<[string, string]> = [
      ["clientId", "clients"],
      ["supplierId", "suppliers"],
      ["employeeId", "employees"],
    ];
    for (const [param, relType] of map) {
      const id = sp.get(param);
      if (id) return { relatedType: relType, relatedId: Number(id) };
    }
    return null;
  })();

  const threadsParams: string[] = [];
  if (tab !== "all" && tab !== "calls") threadsParams.push(`channel=${tab}`);
  if (folder !== "inbox") threadsParams.push(`folder=${folder}`);
  if (entityFilter) {
    threadsParams.push(`relatedType=${entityFilter.relatedType}`);
    threadsParams.push(`relatedId=${entityFilter.relatedId}`);
  }
  const threadsQs = threadsParams.length ? `?${threadsParams.join("&")}` : "";

  const { data: threadsResp, isLoading, refetch: refetchThreads } = useApiQuery<{ data: ThreadRow[] }>(
    ["inbox-threads", tab, folder, entityFilter?.relatedType ?? "", String(entityFilter?.relatedId ?? "")],
    `/inbox/threads${threadsQs}`,
    { enabled: !isCallsTab && !isDraftsFolder },
  );
  const { data: draftsResp, refetch: refetchDrafts } = useApiQuery<{ data: DraftRow[] }>(
    ["inbox-drafts"],
    "/inbox/drafts",
    { enabled: isDraftsFolder },
  );
  const { data: callsResp, refetch: refetchCalls } = useApiQuery<{ data: CallRow[] }>(
    ["inbox-calls"],
    "/inbox/calls",
    { enabled: isCallsTab },
  );
  const { data: countsResp, refetch: refetchCounts } = useApiQuery<Record<Folder, number>>(
    ["inbox-folder-counts"],
    "/inbox/folder-counts",
  );

  // Free-text search across subject + body + addresses. Only enabled
  // when the user has typed a 2+ char query; otherwise the regular
  // threads listing renders.
  const [searchTerm, setSearchTerm] = useState("");
  const trimmedSearch = searchTerm.trim();
  const isSearching = trimmedSearch.length >= 2;
  const { data: searchHitsResp, isLoading: searchLoading } = useApiQuery<{
    data: Array<{
      id: number; channel: string; direction: "inbound" | "outbound";
      fromNumber: string | null; toNumber: string | null;
      subject: string | null; body_preview: string;
      status: string; folder: string; isStarred: boolean;
      relatedType: string | null; relatedId: number | null;
      createdAt: string;
    }>;
  }>(
    ["inbox-search", trimmedSearch, tab],
    `/inbox/search?q=${encodeURIComponent(trimmedSearch)}${tab !== "all" && tab !== "calls" ? `&channel=${tab}` : ""}`,
    { enabled: isSearching },
  );
  const searchHits = searchHitsResp?.data ?? [];

  const threads = threadsResp?.data ?? [];
  const drafts = draftsResp?.data ?? [];
  const calls = callsResp?.data ?? [];
  const counts = countsResp ?? { inbox: 0, sent: 0, drafts: 0, starred: 0, archive: 0, trash: 0, spam: 0 };

  const refreshAll = () => {
    void refetchThreads();
    void refetchDrafts();
    void refetchCalls();
    void refetchCounts();
  };

  const openCompose = () => { setEditingDraft(null); setComposeOpen(true); };
  const openDraft = (d: DraftRow) => { setEditingDraft(d); setComposeOpen(true); };

  return (
    <PageShell
      title="صندوقي الموحّد"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "صندوقي الموحّد" },
      ]}
      subtitle="بريد إلكتروني، واتساب، رسائل نصية، ومكالمات — كلها في مكان واحد، مع إمكانية الإرسال والرد"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 me-1" />تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSignaturesOpen(true)}>
            <PenSquare className="w-4 h-4 me-1" />التواقيع
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCallLogOpen(true)}>
            <PhoneCall className="w-4 h-4 me-1" />سجّل مكالمة
          </Button>
          <Button size="sm" rateLimitAware onClick={openCompose}>
            <Plus className="w-4 h-4 me-1" />رسالة جديدة
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_2fr] gap-4">
        {/* Folder sidebar */}
        <Card className="lg:row-span-2 h-fit">
          <CardContent className="p-2 space-y-0.5">
            {(["inbox","sent","drafts","starred","archive","trash","spam"] as Folder[]).map((f) => {
              const meta = FOLDER_META[f];
              const Icon = meta.icon;
              const isActive = folder === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFolder(f); setActiveThread(null); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
                    isActive
                      ? "bg-status-info-surface text-status-info-foreground font-medium"
                      : "hover:bg-surface-subtle",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-start">{meta.label}</span>
                  {counts[f] > 0 && (
                    <Badge variant="outline" className="text-[10px]">{counts[f]}</Badge>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Tabs (channel filter) — only relevant when browsing threads, not drafts/calls */}
        <div className="lg:col-span-2 space-y-2">
          {entityFilter && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
              <span className="text-xs text-indigo-800">
                مفلتر بمراسلات هذا الكيان:{" "}
                <span className="font-mono font-semibold">{entityFilter.relatedType}#{entityFilter.relatedId}</span>
              </span>
              <button
                type="button"
                onClick={() => { if (typeof window !== "undefined") window.location.href = "/inbox"; }}
                className="text-[11px] text-indigo-700 hover:underline"
                data-testid="inbox-clear-entity-filter"
              >
                إلغاء الفلتر
              </button>
            </div>
          )}
          <Input
            placeholder="ابحث في الرسائل (الموضوع، النص، العنوان...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm"
            data-testid="inbox-search-input"
          />
          <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setActiveThread(null); }} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="email"><Mail className="w-4 h-4 me-1" />بريد</TabsTrigger>
              <TabsTrigger value="whatsapp"><MessageSquare className="w-4 h-4 me-1" />واتساب</TabsTrigger>
              <TabsTrigger value="sms"><MessageSquare className="w-4 h-4 me-1" />رسائل</TabsTrigger>
              <TabsTrigger value="calls"><Phone className="w-4 h-4 me-1" />مكالمات</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Left content: search hits / thread list / draft list / call list */}
        <div className={cn(activeThread && "hidden lg:block")}>
          {isSearching ? (
            <SearchHitsList hits={searchHits} isLoading={searchLoading} query={trimmedSearch} />
          ) : isCallsTab ? (
            <CallList calls={calls} />
          ) : isDraftsFolder ? (
            <DraftsList drafts={drafts} onOpen={openDraft} onChange={refreshAll} />
          ) : (
            <ThreadList
              threads={threads}
              isLoading={isLoading}
              active={activeThread}
              onSelect={(channel, address) => setActiveThread({ channel, address })}
              onChange={refreshAll}
            />
          )}
        </div>

        {/* Right pane: detail / placeholder */}
        <div>
          {isCallsTab ? (
            <CallsHelp />
          ) : activeThread ? (
            <ThreadView
              channel={activeThread.channel}
              address={activeThread.address}
              onBack={() => setActiveThread(null)}
              onSent={refreshAll}
            />
          ) : isDraftsFolder ? (
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                <FileEdit className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                اختر مسودّة من القائمة لمتابعة تعديلها أو إرسالها.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                اختر محادثة من القائمة لقراءتها والرد عليها، أو ابدأ رسالة جديدة من زرّ "رسالة جديدة" بالأعلى.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => { setComposeOpen(false); setEditingDraft(null); }}
        onSent={() => { refreshAll(); setComposeOpen(false); setEditingDraft(null); }}
        editingDraft={editingDraft}
      />
      <CallLogDialog
        open={callLogOpen}
        onClose={() => setCallLogOpen(false)}
        onLogged={() => { refreshAll(); setCallLogOpen(false); }}
      />
      <SignaturesDialog
        open={signaturesOpen}
        onClose={() => setSignaturesOpen(false)}
      />
    </PageShell>
  );
}

// ─────────────────────── Thread list ────────────────────────────────────

function ThreadList({ threads, isLoading, active, onSelect, onChange }: {
  threads: ThreadRow[];
  isLoading: boolean;
  active: { channel: Channel; address: string } | null;
  onSelect: (channel: Channel, address: string) => void;
  onChange?: () => void;
}) {
  const toggleStar = useMutation({
    mutationFn: (id: number) => apiFetch(`/inbox/messages/${id}/star`, { method: "POST" }),
    onSuccess: () => onChange?.(),
  });
  const moveTo = useMutation({
    mutationFn: ({ id, folder }: { id: number; folder: string }) =>
      apiFetch(`/inbox/messages/${id}/folder`, { method: "POST", body: JSON.stringify({ folder }) }),
    onSuccess: () => { toast({ title: "تم النقل" }); onChange?.(); },
  });
  // Retry a failed outbound message — see /inbox/messages/:id/retry.
  // The endpoint resets the queue row to status='pending' so the next
  // worker tick picks it up. Most useful after fixing SMTP credentials
  // or a recipient typo without rewriting the message.
  const retryMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ status: string }>(`/inbox/messages/${id}/retry`, { method: "POST" }),
    onSuccess: () => { toast({ title: "أُعيد إلى قائمة الإرسال" }); onChange?.(); },
    onError: (e: Error) => toast({ title: "فشل إعادة المحاولة", description: e.message, variant: "destructive" }),
  });
  // Cancel a scheduled outbound message — backend enforces it must be
  // a pending row with a future scheduledAt. Surfacing for any pending
  // outbound row; if the user clicks on one that's actually immediate
  // the backend returns 422 with a clear reason.
  const cancelMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/inbox/messages/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { toast({ title: "تم إلغاء الإرسال المجدول" }); onChange?.(); },
    onError: (e: Error) => toast({ title: "تعذّر الإلغاء", description: e.message, variant: "destructive" }),
  });

  // Bulk selection: selected message ids. Single round-trip move via
  // /inbox/messages/bulk-folder so 50 threads → 1 request, not 50.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allOnPageSelected = threads.length > 0 && threads.every((t) => selected.has(t.id));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      if (threads.every((t) => prev.has(t.id))) {
        const next = new Set(prev);
        for (const t of threads) next.delete(t.id);
        return next;
      }
      const next = new Set(prev);
      for (const t of threads) next.add(t.id);
      return next;
    });
  const bulkMove = useMutation({
    mutationFn: (folder: string) =>
      apiFetch<{ affected: number }>("/inbox/messages/bulk-folder", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selected), folder }),
      }),
    onSuccess: (r) => {
      toast({ title: `نُقلت ${r?.affected ?? "—"} رسالة` });
      setSelected(new Set());
      onChange?.();
    },
    onError: (e: Error) => toast({ title: "فشل النقل", description: e.message, variant: "destructive" }),
  });

  if (threads.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          لا توجد محادثات في هذا المجلد.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      {(selected.size > 0 || threads.length > 0) && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAll}
              className="cursor-pointer"
              data-testid="inbox-bulk-toggle-all"
              aria-label="تحديد الكل"
            />
            <span className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} محدّدة` : "اختر للنقل الجماعي"}
            </span>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkMove.isPending}
                onClick={() => bulkMove.mutate("archive")}
                title="أرشفة المحدّدة"
              >
                <Archive className="w-3.5 h-3.5 me-1" />
                أرشفة
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkMove.isPending}
                onClick={() => bulkMove.mutate("trash")}
                title="نقل للسلّة"
              >
                <Trash2 className="w-3.5 h-3.5 me-1 text-status-error-foreground" />
                سلّة
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkMove.isPending}
                onClick={() => bulkMove.mutate("spam")}
                title="رسائل سبام"
              >
                <AlertTriangle className="w-3.5 h-3.5 me-1 text-orange-600" />
                سبام
              </Button>
            </div>
          )}
        </div>
      )}
      <CardContent className="p-0">
        <div className="divide-y">
          {threads.map((t) => {
            const meta = CHANNEL_META[t.channel] ?? CHANNEL_META.email;
            const Icon = meta.icon;
            const isActive = active?.channel === t.channel && active.address === t.peer;
            const isChecked = selected.has(t.id);
            const hasUnread = (t.unread_count ?? 0) > 0;
            return (
              <div
                key={`${t.channel}-${t.peer}-${t.id}`}
                className={cn(
                  "p-3 hover:bg-surface-subtle/60 flex gap-2 items-start transition-colors group",
                  isActive && "bg-status-info-surface",
                  isChecked && "bg-indigo-50/30",
                  hasUnread && !isActive && "bg-status-info-surface/30",
                  t.channel === "pbx" && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(t.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 shrink-0 cursor-pointer"
                  aria-label="تحديد الرسالة"
                />
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.color.split(" ")[1])}>
                  <Icon className={cn("w-4 h-4", meta.color.split(" ")[0])} />
                </div>
                <button
                  type="button"
                  onClick={() => t.channel !== "pbx" && onSelect(t.channel as Channel, t.peer)}
                  className="flex-1 min-w-0 text-start"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>{t.peer}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasUnread && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground">{t.unread_count} جديد</Badge>
                      )}
                      {t.inbound_count > 0 && (
                        <Badge variant="outline" className="text-[10px]">{t.inbound_count} وارد</Badge>
                      )}
                    </div>
                  </div>
                  {t.subject && (
                    <p className={cn("text-xs truncate", hasUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{t.subject}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {t.direction === "outbound" ? "← " : "→ "}{t.body_preview}
                  </p>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDateAr(t.createdAt)}</span>
                      {t.direction === "outbound" && t.status && <SendStatusBadge status={t.status} />}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.total_messages} رسالة</span>
                  </div>
                </button>
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {t.direction === "outbound" && t.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retryMut.mutate(t.id)}
                      disabled={retryMut.isPending}
                      className="p-1 hover:bg-status-success-surface/60 rounded"
                      title="إعادة محاولة الإرسال"
                      data-testid={`retry-${t.id}`}
                    >
                      <RefreshCw className={cn("w-3 h-3 text-status-success-foreground", retryMut.isPending && "animate-spin")} />
                    </button>
                  )}
                  {t.direction === "outbound" && t.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancelMut.mutate(t.id)}
                      disabled={cancelMut.isPending}
                      className="p-1 hover:bg-status-error-surface rounded"
                      title="إلغاء الإرسال المجدول"
                      data-testid={`cancel-scheduled-${t.id}`}
                    >
                      <Trash2 className={cn("w-3 h-3 text-status-error-foreground", cancelMut.isPending && "opacity-50")} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleStar.mutate(t.id)}
                    className="p-1 hover:bg-status-warning-surface/40 rounded"
                    title={t.isStarred ? "إزالة النجمة" : "تمييز بنجمة"}
                  >
                    <Star className={cn("w-3 h-3", t.isStarred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} />
                  </button>
                  {t.folder !== "archive" && (
                    <button
                      type="button"
                      onClick={() => moveTo.mutate({ id: t.id, folder: "archive" })}
                      className="p-1 hover:bg-status-info-surface rounded"
                      title="أرشفة"
                    >
                      <Archive className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                  {t.folder !== "trash" && (
                    <button
                      type="button"
                      onClick={() => moveTo.mutate({ id: t.id, folder: "trash" })}
                      className="p-1 hover:bg-status-error-surface rounded"
                      title="حذف"
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DraftsList({ drafts, onOpen, onChange }: {
  drafts: DraftRow[];
  onOpen: (d: DraftRow) => void;
  onChange: () => void;
}) {
  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/inbox/drafts/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذفت المسوّدة" }); onChange(); },
  });
  if (drafts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          لا توجد مسوّدات محفوظة. اضغط "رسالة جديدة" ثم "حفظ كمسوّدة" لتظهر هنا.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {drafts.map((d) => (
            <div key={d.id} className="p-3 hover:bg-surface-subtle/60 flex gap-2 items-start group">
              <FileEdit className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <button type="button" onClick={() => onOpen(d)} className="flex-1 min-w-0 text-start">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{d.channel}</Badge>
                  <span className="text-sm font-medium truncate">{d.recipient ?? "(بدون مستلم)"}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{d.subject ?? "(بدون عنوان)"}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{d.body.slice(0, 100) || "(فارغة)"}</p>
                <p className="text-[10px] text-muted-foreground mt-1">آخر حفظ: {formatDateAr(d.lastSavedAt)}</p>
              </button>
              <button
                type="button"
                onClick={() => del.mutate(d.id)}
                className="p-1 hover:bg-status-error-surface rounded opacity-0 group-hover:opacity-100"
                title="حذف"
              >
                <Trash2 className="w-3 h-3 text-status-error-foreground" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────── Thread view ────────────────────────────────────

function ThreadView({ channel, address, onBack, onSent }: {
  channel: Channel;
  address: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const { data, isLoading, refetch } = useApiQuery<{ data: MessageRow[]; peer: string; channel: string }>(
    ["inbox-thread", channel, address],
    `/inbox/threads/${channel}/${encodeURIComponent(address)}`,
  );
  const messages = data?.data ?? [];
  const [reply, setReply] = useState("");
  const [dlpInfo, setDlpInfo] = useState<SendResult | null>(null);

  // Mark every inbound message in this thread as read once the thread
  // is loaded. We dedupe via the (channel,address) key so the network
  // call doesn't fire on every refetch — only when the user first
  // opens (or switches to) this thread. The server-side endpoint is
  // idempotent so a stale fire-and-forget would be harmless anyway.
  const lastReadKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${channel}:${address}`;
    if (lastReadKey.current === key) return;
    if (!messages.some((m) => m.direction === "inbound" && !m.isRead)) return;
    lastReadKey.current = key;
    apiFetch(`/inbox/threads/${channel}/${encodeURIComponent(address)}/read`, { method: "POST" })
      .then(() => onSent())
      .catch(() => { lastReadKey.current = null; });
  }, [channel, address, messages, onSent]);

  const send = useMutation({
    mutationFn: () => {
      const lastId = messages[messages.length - 1]?.id;
      if (!lastId) throw new Error("لا يمكن الرد على محادثة فارغة");
      return apiFetch<SendResult>(`/inbox/threads/${lastId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
    },
    onSuccess: (r) => {
      if (r.blocked) {
        setDlpInfo(r);
        toast({ title: "حُجبت بواسطة DLP", description: r.reason ?? "", variant: "destructive" });
      } else {
        setReply("");
        setDlpInfo(null);
        toast({ title: "أُرسلت" });
        void refetch();
        onSent();
      }
    },
    onError: (e: Error) => toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" }),
  });

  const meta = CHANNEL_META[channel] ?? CHANNEL_META.email;
  const Icon = meta.icon;

  return (
    <Card className="flex flex-col h-[calc(100vh-260px)] min-h-[400px]">
      <CardHeader className="pb-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Button variant="ghost" size="sm" className="lg:hidden me-2" onClick={onBack}>←</Button>
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span>{address}</span>
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <ThreadSnoozeMenu channel={channel} address={address} onSnoozed={onBack} />
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && messages.length === 0 && <p className="text-xs text-muted-foreground">جارٍ التحميل...</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn(
            "rounded-lg p-3 max-w-[80%]",
            m.direction === "outbound"
              ? "bg-status-info-surface ms-auto"
              : "bg-surface-subtle me-auto",
          )}>
            <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
              {m.direction === "outbound" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
              <span>{m.direction === "outbound" ? "أنت" : address}</span>
              <span>•</span>
              <span>{formatDateAr(m.createdAt)}</span>
              {m.direction === "inbound" && m.isRead === false && (
                <Badge className="text-[9px] bg-primary text-primary-foreground">جديد</Badge>
              )}
              {m.status === "blocked_dlp" && (
                <Badge variant="outline" className="text-[9px] text-status-error-foreground border-status-error-surface">حُجبت DLP</Badge>
              )}
            </div>
            {m.subject && <p className="text-xs font-semibold mb-1">{m.subject}</p>}
            <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground text-center py-8">لا توجد رسائل في هذه المحادثة بعد.</p>
        )}
      </CardContent>

      <div className="border-t p-3 shrink-0">
        {dlpInfo?.blocked && (
          <div className="mb-2 p-2 bg-status-error-surface text-status-error-foreground rounded text-xs flex items-start gap-2">
            <AlertOctagon className="w-3 h-3 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">حُجبت بواسطة DLP</p>
              <p>{dlpInfo.reason}</p>
              {dlpInfo.dlpMatches && dlpInfo.dlpMatches.length > 0 && (
                <p className="text-[10px] mt-1">القواعد المُفعَّلة: {dlpInfo.dlpMatches.map((m) => m.rule).join(", ")}</p>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="اكتب ردّك..."
            rows={2}
            className="flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && reply.trim()) {
                send.mutate();
              }
            }}
          />
          <Button
            rateLimitAware
            disabled={!reply.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            <Send className="w-4 h-4 me-1" />{send.isPending ? "..." : "أرسل"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter للإرسال السريع</p>
      </div>
    </Card>
  );
}

// ─────────────────────── Thread snooze menu ────────────────────────────

const SNOOZE_PRESETS: { label: string; hours: number }[] = [
  { label: "ساعة", hours: 1 },
  { label: "4 ساعات", hours: 4 },
  { label: "غداً ٩ صباحًا", hours: snoozeUntilTomorrowMorning() },
  { label: "أسبوع", hours: 24 * 7 },
];

function snoozeUntilTomorrowMorning(): number {
  const now = new Date();
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return Math.max(1, (tomorrow9.getTime() - now.getTime()) / 3600_000);
}

function ThreadSnoozeMenu({ channel, address, onSnoozed }: {
  channel: Channel;
  address: string;
  onSnoozed: () => void;
}) {
  const [open, setOpen] = useState(false);

  const snooze = useMutation({
    mutationFn: (hours: number) => {
      const wakeAt = new Date(Date.now() + hours * 3600_000).toISOString();
      return apiFetch(`/inbox/threads/${channel}/${encodeURIComponent(address)}/snooze`, {
        method: "POST",
        body: JSON.stringify({ wakeAt }),
      });
    },
    onSuccess: () => {
      setOpen(false);
      toast({ title: "تم تأجيل المحادثة", description: "سيتم تذكيرك في الوقت المحدد" });
      onSnoozed();
    },
    onError: (e: Error) => toast({ title: "تعذّر التأجيل", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="تأجيل المحادثة">
        <Clock className="w-3 h-3" />
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BellOff className="w-4 h-4" />
            تأجيل المحادثة
          </DialogTitle>
          <DialogDescription className="text-xs">
            ستختفي المحادثة من الوارد، ثم تظهر مهمّة متابعة تلقائية عند الوقت المحدد.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-2">
          {SNOOZE_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              disabled={snooze.isPending}
              onClick={() => snooze.mutate(p.hours)}
              className="justify-start"
            >
              <Clock className="w-3 h-3 me-2" />{p.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Call list ──────────────────────────────────────

function CallList({ calls }: { calls: CallRow[] }) {
  if (calls.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          لا توجد مكالمات بعد. استخدم زرّ "سجّل مكالمة" لإضافة مكالمة يدوياً.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {calls.map((c) => {
            const Icon = c.status === "no_answer" || c.status === "failed"
              ? PhoneMissed
              : c.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
            const peer = c.direction === "inbound" ? c.callerNumber : c.calledNumber;
            return (
              <div key={c.id} className="p-3 flex items-start gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  c.status === "completed" ? "bg-status-success-surface" :
                  c.status === "no_answer" ? "bg-status-error-surface" : "bg-status-warning-surface/60",
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{peer}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.status === "completed" ? "تمّ" : c.status === "no_answer" ? "لم يرد" : c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.direction === "inbound" ? "وارد" : "صادر"} · {c.duration > 0 ? `${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : "0:00"}
                    {c.callId.startsWith("manual-") && <Badge variant="outline" className="text-[9px] ms-2">يدوي</Badge>}
                  </p>
                  {c.summaryPreview && (
                    <div className="mt-2 p-2 bg-surface-subtle/60 rounded text-xs">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3" />ملخّص AI:
                      </p>
                      <p>{c.summaryPreview}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateAr(c.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CallsHelp() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">سجلّ المكالمات</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p>المكالمات الواردة تُسجَّل تلقائياً من الـ PBX (إذا كان مفعّلاً في /admin/pbx-control).</p>
        <p>للمكالمات الشخصية التي تجريها من جوّالك، استخدم زرّ <strong>"سجّل مكالمة"</strong> أعلى الشاشة لتدوينها يدوياً.</p>
        <p>المكالمات المُسجَّلة تُحوَّل تلقائياً إلى نص (STT) + ملخّص AI خلال دقيقتَين عند توفّر مزوّد STT في /admin/ai-governance.</p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────── Compose dialog ─────────────────────────────────

interface RecipientHit {
  kind: "client" | "employee";
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  code: string;
}

interface TemplateRow {
  id: number;
  templateKey: string;
  channel: string;
  titleTemplate: string | null;
  bodyTemplate: string;
  variables: unknown;
  language: string;
  isDefault: boolean;
}

export function ComposeDialog({ open, onClose, onSent, initialChannel, initialRecipient, initialSubject, initialBody, initialRelated, editingDraft }: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  initialChannel?: Channel;
  initialRecipient?: string;
  initialSubject?: string;
  initialBody?: string;
  initialRelated?: { type: string; id: number };
  /** When set, the dialog is editing an existing draft — Save updates it, Send finalises it. */
  editingDraft?: DraftRow | null;
}) {
  const [channel, setChannel] = useState<Channel>(editingDraft?.channel ?? initialChannel ?? "email");
  const [recipient, setRecipient] = useState(editingDraft?.recipient ?? initialRecipient ?? "");
  const [recipientName, setRecipientName] = useState(editingDraft?.recipientName ?? "");
  const [subject, setSubject] = useState(editingDraft?.subject ?? initialSubject ?? "");
  const [body, setBody] = useState(editingDraft?.body ?? initialBody ?? "");
  const [dlpInfo, setDlpInfo] = useState<SendResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(editingDraft?.id ?? null);
  // Scheduled-send: when set, the body is queued with scheduledAt in
  // the future and the cron worker leaves it alone until then. Empty
  // string = send immediately (the default).
  const [scheduledAt, setScheduledAt] = useState<string>(
    editingDraft?.scheduledAt ? editingDraft.scheduledAt.slice(0, 16) : "",
  );

  const reset = () => {
    setRecipient(""); setRecipientName(""); setSubject(""); setBody("");
    setDlpInfo(null); setDraftId(null); setScheduledAt("");
  };

  // Hydrate from props whenever the dialog opens.
  useEffect(() => {
    if (open) {
      if (editingDraft) {
        setChannel(editingDraft.channel);
        setRecipient(editingDraft.recipient ?? "");
        setRecipientName(editingDraft.recipientName ?? "");
        setSubject(editingDraft.subject ?? "");
        setBody(editingDraft.body);
        setDraftId(editingDraft.id);
      } else {
        if (initialChannel) setChannel(initialChannel);
        if (initialRecipient !== undefined) setRecipient(initialRecipient);
        if (initialSubject !== undefined) setSubject(initialSubject);
        if (initialBody !== undefined) setBody(initialBody);
        setDraftId(null);
      }
    }
  }, [open, editingDraft, initialChannel, initialRecipient, initialSubject, initialBody]);

  // User signatures — auto-applied if there's a default and the
  // body is empty / matches initial.
  const { data: sigResp } = useApiQuery<{ data: SignatureRow[] }>(
    ["inbox-signatures"], "/inbox/signatures",
  );
  const signatures = sigResp?.data ?? [];
  const defaultSig = signatures.find((s) => s.isDefault);

  // Recipient autocomplete — fires after 2 chars + 300ms debounce
  // (debounce inlined via useDeferredValue alternative — keep simple).
  const recipientSuggestEnabled =
    recipient.length >= 2 &&
    !recipient.includes("@") &&
    !recipient.startsWith("+") &&
    showSuggestions;
  const { data: searchResp } = useApiQuery<{ data: RecipientHit[] }>(
    ["inbox-recipients", channel, recipient],
    recipientSuggestEnabled
      ? `/inbox/recipients/search?channel=${channel}&q=${encodeURIComponent(recipient)}`
      : null,
    { enabled: recipient.length >= 2 && showSuggestions },
  );
  const suggestions = searchResp?.data ?? [];

  // Templates filtered to the current channel.
  const { data: tmplResp } = useApiQuery<{ data: TemplateRow[] }>(
    ["inbox-templates", channel],
    `/inbox/templates?channel=${channel}`,
  );
  const templates = tmplResp?.data ?? [];

  const send = useMutation({
    mutationFn: async () => {
      // If editing a draft, send via /drafts/:id/send so the draft is
      // deleted on success. Otherwise just call /inbox/send.
      if (draftId) {
        return apiFetch<SendResult>(`/inbox/drafts/${draftId}/send`, { method: "POST" });
      }
      return apiFetch<SendResult>("/inbox/send", {
        method: "POST",
        body: JSON.stringify({
          channel, recipient, recipientName: recipientName || undefined,
          subject: channel === "email" ? subject : undefined, body,
          relatedType: initialRelated?.type,
          relatedId: initialRelated?.id,
          // Convert datetime-local (no zone) → ISO with the browser's TZ
          // so the backend knows when 'now' is for this user. Empty
          // string → omit (immediate send).
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
    },
    onSuccess: (r) => {
      if (r.blocked) {
        setDlpInfo(r);
        toast({ title: "حُجبت بواسطة DLP", description: r.reason ?? "", variant: "destructive" });
      } else {
        toast({ title: "أُرسلت الرسالة" });
        reset();
        onSent();
      }
    },
    onError: (e: Error) => toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" }),
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        channel, recipient: recipient || null, recipientName: recipientName || null,
        subject: subject || null, body,
        relatedType: initialRelated?.type ?? null,
        relatedId: initialRelated?.id ?? null,
      };
      if (draftId) {
        return apiFetch<{ id: number }>(`/inbox/drafts/${draftId}`, {
          method: "PATCH", body: JSON.stringify(payload),
        });
      }
      return apiFetch<{ id: number }>("/inbox/drafts", {
        method: "POST", body: JSON.stringify(payload),
      });
    },
    onSuccess: (r) => {
      if (!draftId && r.id) setDraftId(r.id);
      toast({ title: "حُفظت كمسوّدة" });
    },
    onError: (e: Error) => toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" }),
  });

  const applySignature = (sig: SignatureRow) => {
    setBody((prev) => prev.endsWith(sig.body) ? prev : `${prev}\n\n${sig.body}`);
  };

  const pickRecipient = (hit: RecipientHit) => {
    const addr = channel === "email" ? hit.email : hit.phone;
    setRecipient(addr ?? "");
    setRecipientName(hit.name);
    setShowSuggestions(false);
  };

  const applyTemplate = (t: TemplateRow) => {
    if (t.titleTemplate) setSubject(t.titleTemplate);
    setBody(t.bodyTemplate);
  };

  const placeholderRecipient = channel === "email"
    ? "user@example.com أو ابحث بالاسم"
    : "+966500000000 أو ابحث بالاسم";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); }}}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>رسالة جديدة</DialogTitle>
          <DialogDescription>
            الرسالة تُمرَّر عبر DLP scanner تلقائياً (يحجب أرقام الهوية والـ IBAN افتراضياً).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>القناة</Label>
            <div className="flex gap-2 mt-2">
              {(["email", "whatsapp", "sms"] as Channel[]).map((c) => {
                const meta = CHANNEL_META[c];
                const Icon = meta.icon;
                return (
                  <Button
                    key={c}
                    variant={channel === c ? "default" : "outline"}
                    size="sm"
                    type="button"
                    onClick={() => { setChannel(c); setShowSuggestions(false); }}
                  >
                    <Icon className="w-4 h-4 me-1" />{meta.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="relative">
            <Label>المستلم {recipientName && <span className="text-[10px] text-muted-foreground">({recipientName})</span>}</Label>
            <Input
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setShowSuggestions(true); setRecipientName(""); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={placeholderRecipient}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-card border rounded shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((h) => (
                  <button
                    key={`${h.kind}-${h.id}`}
                    type="button"
                    className="w-full text-start p-2 hover:bg-surface-subtle text-xs border-b last:border-0"
                    onClick={() => pickRecipient(h)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{h.name}</span>
                      <Badge variant="outline" className="text-[9px]">
                        {h.kind === "client" ? "عميل" : "موظف"}
                      </Badge>
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                      {channel === "email" ? h.email : h.phone}
                      {h.code && <span className="ms-2">#{h.code}</span>}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          {templates.length > 0 && (
            <div>
              <Label className="text-xs">قالب جاهز (اختياري)</Label>
              <Select value="" onValueChange={(v) => {
                const t = templates.find((x) => String(x.id) === v);
                if (t) applyTemplate(t);
              }}>
                <SelectTrigger className="text-xs"><SelectValue placeholder={`اختر قالب من ${templates.length} متاح`} /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.templateKey} {t.isDefault && "★"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {channel === "email" && (
            <div>
              <Label>العنوان</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="عنوان الرسالة" />
            </div>
          )}
          <div>
            <Label>المحتوى</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </div>
          {dlpInfo?.blocked && (
            <div className="p-2 bg-status-error-surface text-status-error-foreground rounded text-xs flex items-start gap-2">
              <AlertOctagon className="w-3 h-3 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">حُجبت بواسطة DLP — {dlpInfo.reason}</p>
                {dlpInfo.dlpMatches && (
                  <p className="text-[10px] mt-1">القواعد: {dlpInfo.dlpMatches.map((m) => m.rule).join(", ")}</p>
                )}
              </div>
            </div>
          )}
          {signatures.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
              <span className="text-xs text-muted-foreground">إلحاق توقيع:</span>
              {signatures.map((s) => (
                <Button
                  key={s.id} type="button" variant="outline" size="sm"
                  onClick={() => applySignature(s)}
                  className="text-xs h-6"
                >
                  {s.name}{s.isDefault && " ★"}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t pt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">جدولة الإرسال (اختياري)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              className="h-8 text-xs"
              data-testid="compose-scheduled-at"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {scheduledAt
                ? `سيتم الإرسال في ${formatDateAr(new Date(scheduledAt).toISOString())}`
                : "اتركه فارغاً للإرسال الفوري"}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            variant="outline"
            disabled={saveDraft.isPending || !body}
            onClick={() => saveDraft.mutate()}
          >
            <Save className="w-4 h-4 me-1" />
            {saveDraft.isPending ? "جارٍ الحفظ..." : (draftId ? "تحديث المسوّدة" : "حفظ كمسوّدة")}
          </Button>
          <Button
            rateLimitAware
            disabled={send.isPending || !recipient || !body || (channel === "email" && !subject)}
            onClick={() => send.mutate()}
          >
            <Send className="w-4 h-4 me-1" />
            {send.isPending ? "جارٍ الإرسال..." : (scheduledAt ? "جدولة الإرسال" : "أرسل")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── Call log dialog ────────────────────────────────

function CallLogDialog({ open, onClose, onLogged }: {
  open: boolean; onClose: () => void; onLogged: () => void;
}) {
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [peerNumber, setPeerNumber] = useState("");
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<"completed" | "no_answer" | "busy" | "failed">("completed");
  const [notes, setNotes] = useState("");

  const log = useMutation({
    mutationFn: () => apiFetch("/inbox/calls", {
      method: "POST",
      body: JSON.stringify({
        callerNumber: direction === "inbound" ? peerNumber : "self",
        calledNumber: direction === "inbound" ? "self" : peerNumber,
        direction, duration, status, notes: notes || null,
      }),
    }),
    onSuccess: () => { toast({ title: "سُجّلت المكالمة" }); onLogged(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سجّل مكالمة يدوياً</DialogTitle>
          <DialogDescription>للمكالمات التي تجريها أو تستقبلها على جوّالك الشخصي خارج الـ PBX.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>الاتجاه</Label>
            <div className="flex gap-2 mt-2">
              <Button variant={direction === "outbound" ? "default" : "outline"} size="sm" type="button" onClick={() => setDirection("outbound")}>
                <PhoneOutgoing className="w-4 h-4 me-1" />صادرة
              </Button>
              <Button variant={direction === "inbound" ? "default" : "outline"} size="sm" type="button" onClick={() => setDirection("inbound")}>
                <PhoneIncoming className="w-4 h-4 me-1" />واردة
              </Button>
            </div>
          </div>
          <div>
            <Label>{direction === "outbound" ? "اتصلت بـ" : "اتّصل من"}</Label>
            <Input value={peerNumber} onChange={(e) => setPeerNumber(e.target.value)} placeholder="+966500000000" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>المدة (ثوان)</Label>
              <Input type="number" min={0} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <Label>النتيجة</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">تمّت</SelectItem>
                  <SelectItem value="no_answer">لم يرد</SelectItem>
                  <SelectItem value="busy">مشغول</SelectItem>
                  <SelectItem value="failed">فشلت</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={!peerNumber || log.isPending} onClick={() => log.mutate()}>
            <PhoneCall className="w-4 h-4 me-1" />سجّل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignaturesDialog({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const { data: resp, refetch } = useApiQuery<{ data: SignatureRow[] }>(
    ["inbox-signatures"], "/inbox/signatures", { enabled: open },
  );
  const signatures = resp?.data ?? [];
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const reset = () => { setName(""); setBody(""); setIsDefault(false); setEditingId(null); };

  const create = useMutation({
    mutationFn: () => apiFetch("/inbox/signatures", {
      method: "POST", body: JSON.stringify({ name, body, isDefault }),
    }),
    onSuccess: () => { toast({ title: "أُضيف التوقيع" }); reset(); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: () => apiFetch(`/inbox/signatures/${editingId}`, {
      method: "PATCH", body: JSON.stringify({ name, body, isDefault }),
    }),
    onSuccess: () => { toast({ title: "حُدِّث التوقيع" }); reset(); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/inbox/signatures/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذف" }); refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const edit = (s: SignatureRow) => {
    setEditingId(s.id); setName(s.name); setBody(s.body); setIsDefault(s.isDefault);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); }}}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إدارة التواقيع</DialogTitle>
          <DialogDescription>
            توقيع افتراضي واحد يُقترَح أوّل القائمة عند إنشاء رسالة. يمكنك أيضاً إنشاء تواقيع متعددة (رسمي/قانوني/شخصي).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2 border-b pb-3">
            <Label className="text-xs">{editingId ? "تعديل توقيع" : "توقيع جديد"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم التوقيع (رسمي / قانوني / شخصي)" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="نص التوقيع الذي يُلصَق نهاية الرسالة" />
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="sig-default" checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <Label htmlFor="sig-default" className="text-xs cursor-pointer">اجعله التوقيع الافتراضي</Label>
            </div>
            <div className="flex gap-2">
              {editingId ? (
                <>
                  <Button rateLimitAware size="sm" disabled={update.isPending || !name || !body} onClick={() => update.mutate()}>
                    حدّث
                  </Button>
                  <Button variant="outline" size="sm" onClick={reset}>إلغاء التعديل</Button>
                </>
              ) : (
                <Button rateLimitAware size="sm" disabled={create.isPending || !name || !body} onClick={() => create.mutate()}>
                  <Plus className="w-4 h-4 me-1" />أضف توقيع
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">التواقيع الحالية ({signatures.length})</Label>
            {signatures.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">لا توجد تواقيع بعد.</p>
            ) : (
              <div className="space-y-2">
                {signatures.map((s) => (
                  <div key={s.id} className="p-3 border rounded text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{s.name} {s.isDefault && <Badge variant="outline" className="text-[10px] ms-1">افتراضي</Badge>}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => edit(s)}>تعديل</Button>
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate(s.id)}>
                          <Trash2 className="w-3 h-3 text-status-error-foreground" />
                        </Button>
                      </div>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans bg-surface-subtle/60 p-2 rounded">{s.body}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SearchHitsList ─────────────────────────────────────────────
// Renders /inbox/search hits as a flat list (no thread grouping —
// the user typed a query, they want to see every match). Each row
// shows channel + direction + subject + body preview + date, and
// the user can click to open the original thread.
function SearchHitsList({ hits, isLoading, query }: {
  hits: Array<{
    id: number; channel: string; direction: "inbound" | "outbound";
    fromNumber: string | null; toNumber: string | null;
    subject: string | null; body_preview: string;
    folder: string; isStarred: boolean; createdAt: string;
  }>;
  isLoading: boolean;
  query: string;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (hits.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          لا توجد نتائج لـ <span className="font-mono">{query}</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center justify-between">
          <span>{hits.length} نتيجة لـ <span className="font-mono">{query}</span></span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y">
        {hits.map((h) => {
          const meta = CHANNEL_META[h.channel] ?? CHANNEL_META.sms;
          const Icon = meta.icon;
          return (
            <div key={h.id} className="p-3 hover:bg-muted/30 cursor-pointer">
              <div className="flex items-start gap-3">
                <div className={cn("rounded-md p-1.5", meta.color)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium" dir="ltr">
                      {h.direction === "inbound" ? (h.fromNumber ?? "—") : (h.toNumber ?? "—")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateAr(h.createdAt)}
                    </span>
                  </div>
                  {h.subject && (
                    <p className="text-sm font-medium line-clamp-1 mt-1">{h.subject}</p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{h.body_preview}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── SendStatusBadge ────────────────────────────────────────────
// Outbound messages carry a delivery status: pending (in the queue),
// queued (worker has it), sent (provider accepted), failed (worker
// gave up after retries), blocked_dlp (DLP blocked the send). Until
// now the inbox didn't show this — the user had to assume their
// message went out. Tiny badge that surfaces it inline.
function SendStatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; tone: string }> = {
    pending:     { label: "في الانتظار",  tone: "bg-muted text-muted-foreground" },
    queued:      { label: "في الطابور",   tone: "bg-status-info-surface text-status-info-foreground" },
    sending:     { label: "يُرسَل",       tone: "bg-status-info-surface text-status-info-foreground" },
    sent:        { label: "أُرسلت",       tone: "bg-status-success-surface text-status-success-foreground" },
    delivered:   { label: "وصلت",         tone: "bg-status-success-surface text-status-success-foreground" },
    failed:      { label: "فشل الإرسال",  tone: "bg-status-error-surface text-status-error-foreground" },
    cancelled:   { label: "أُلغيت",       tone: "bg-muted text-muted-foreground" },
    blocked_dlp: { label: "حُجبت DLP",    tone: "bg-status-error-surface text-status-error-foreground" },
    received:    { label: "وارد",         tone: "bg-status-info-surface text-status-info-foreground" },
  };
  const m = meta[status];
  if (!m) return null;
  return (
    <span className={cn("text-[9px] rounded px-1.5 py-0.5 font-medium shrink-0", m.tone)} data-testid={`send-status-${status}`}>
      {m.label}
    </span>
  );
}
