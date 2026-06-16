/**
 * /inbox — conversation-first unified inbox (#2138 slice 2).
 *
 * Slice 2 converts this page from the computed-thread model (grouped on
 * the fly by channel+address via GET /inbox/threads) to the persisted
 * Conversation Canon (#2154):
 *
 *   - conversation list  ← GET  /inbox/conversations
 *   - thread + reply     ← GET  /inbox/conversations/:id
 *                          POST /inbox/conversations/:id/messages
 *   - context panel      ← conversation meta + conversation_links
 *
 * Three-column layout (the UX mandated by #2138 §2):
 *   [قائمة المحادثات] [Thread الرسائل] [Context Panel]
 *
 * Every send still flows through the canon endpoint → sendMessage()
 * (DLP / message_log / outbound_queue / audit / events). The legacy
 * /inbox/threads endpoints are NOT touched — they stay serving as the
 * compatibility surface per the slice-2 mandate.
 *
 * Existing features preserved: compose dialog, drafts, calls tab,
 * manual call logging, signatures, snooze (thread-keyed adapter on the
 * conversation's channel+address). The legacy message-folder sidebar
 * (starred/archive/trash/spam) is superseded by conversation status
 * (open / awaiting_reply / closed / escalated) — the folder endpoints
 * remain untouched server-side.
 */
import { useState, useEffect, useRef } from "react";
import { PageShell } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import { useApiQuery, apiFetch, ApiError } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileEdit, AlertTriangle, Link2, User, Lock, Unlock, Trash2,
  Save, PenSquare, Settings, Clock, BellOff,
} from "lucide-react";

type Channel = "email" | "whatsapp" | "sms";

type ConversationStatus = "open" | "awaiting_reply" | "closed" | "escalated";

const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: "مفتوحة",
  awaiting_reply: "بانتظار رد",
  closed: "مغلقة",
  escalated: "مصعدة",
};

const PRIORITY_LABELS: Record<string, { label: string; tone: string }> = {
  low:    { label: "منخفضة", tone: "text-muted-foreground border-muted" },
  high:   { label: "عالية",  tone: "text-orange-700 border-orange-200 bg-orange-50" },
  urgent: { label: "عاجلة",  tone: "text-status-error-foreground border-status-error-surface bg-status-error-surface/40" },
};

/** Arabic labels for conversation_links relatedType — mirrors the
 *  backend LINKABLE_ENTITIES contract (routes/inboxConversations.ts). */
const LINK_TYPE_LABELS: Record<string, string> = {
  clients: "عميل",
  suppliers: "مورد",
  employees: "موظف",
  invoices: "فاتورة",
  legal_cases: "قضية",
  legal_contracts: "عقد",
  projects: "مشروع",
  support_tickets: "تذكرة دعم",
  fleet_vehicles: "مركبة",
  fleet_trips: "رحلة",
  transport_bookings: "حجز نقل",
  hr_leave_requests: "طلب إجازة",
};

interface ConversationRow {
  id: number;
  channelPrimary: string;
  title: string | null;
  participantType: string | null;
  participantId: number | null;
  participantName: string | null;
  participantAddress: string;
  status: ConversationStatus;
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo: number | null;
  lastMessageAt: string | null;
  slaStatus: string | null;
  riskLevel: string | null;
  lastMessagePreview: string | null;
  lastDirection: "inbound" | "outbound" | null;
  lastMessageStatus: string | null;
  totalMessages: number;
  unreadCount: number;
}

interface ConversationLinkRow {
  id: number;
  relatedType: string;
  relatedId: number;
  linkedBy: number | null;
  createdAt: string;
}

interface MessageRow {
  id: number;
  channel: string;
  direction: "inbound" | "outbound";
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  body: string;
  status: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string | null;
}

interface ConversationDetail extends ConversationRow {
  links: ConversationLinkRow[];
  messages: MessageRow[];
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

/** DLP info distilled from either a 2xx body or a 422 ApiError whose
 *  meta carries the block details (code DLP_BLOCKED). */
interface DlpBlock {
  reason: string;
  rules: string[];
}

function dlpFromError(e: unknown): DlpBlock | null {
  if (e instanceof ApiError && e.code === "DLP_BLOCKED") {
    const meta = (e.meta ?? {}) as { reason?: string; dlpMatches?: Array<{ rule: string }> };
    return {
      reason: meta.reason ?? e.message,
      rules: (meta.dlpMatches ?? []).map((m) => m.rule),
    };
  }
  return null;
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
  in_app:   { icon: MessageSquare, label: "نظام",   color: "text-slate-600 bg-slate-50" },
  internal: { icon: MessageSquare, label: "داخلي",  color: "text-slate-600 bg-slate-50" },
  push:     { icon: MessageSquare, label: "إشعار",  color: "text-slate-600 bg-slate-50" },
};

const SENDABLE_CHANNELS = new Set(["email", "whatsapp", "sms"]);

export default function Inbox() {
  const [tab, setTab] = useState<"all" | Channel | "calls" | "drafts">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ConversationStatus>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [signaturesOpen, setSignaturesOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftRow | null>(null);

  const isDraftsTab = tab === "drafts";
  const isCallsTab = tab === "calls";

  // Entity filter — when the page is opened via /inbox?clientId=N (or
  // ?supplierId / ?employeeId), narrow conversations to the ones linked
  // to that entity through conversation_links. Powers the
  // "عرض كل المراسلات" link on entity detail pages.
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

  // Free-text search rides the same canon list endpoint (?q=) — no
  // separate search surface needed for conversations.
  const [searchTerm, setSearchTerm] = useState("");
  const trimmedSearch = searchTerm.trim();

  const listParams: string[] = [];
  if (tab !== "all" && tab !== "calls" && tab !== "drafts") listParams.push(`channel=${tab}`);
  if (statusFilter !== "all") listParams.push(`status=${statusFilter}`);
  if (trimmedSearch.length >= 2) listParams.push(`q=${encodeURIComponent(trimmedSearch)}`);
  if (entityFilter) {
    listParams.push(`relatedType=${entityFilter.relatedType}`);
    listParams.push(`relatedId=${entityFilter.relatedId}`);
  }
  const listQs = listParams.length ? `?${listParams.join("&")}` : "";

  const {
    data: conversationsResp,
    isLoading,
    isError: listFailed,
    refetch: refetchConversations,
  } = useApiQuery<{ data: ConversationRow[] }>(
    [
      "inbox-conversations", tab, statusFilter, trimmedSearch,
      entityFilter?.relatedType ?? "", String(entityFilter?.relatedId ?? ""),
    ],
    `/inbox/conversations${listQs}`,
    { enabled: !isCallsTab && !isDraftsTab },
  );
  const { data: draftsResp, refetch: refetchDrafts } = useApiQuery<{ data: DraftRow[] }>(
    ["inbox-drafts"],
    "/inbox/drafts",
    { enabled: isDraftsTab },
  );
  const { data: callsResp, refetch: refetchCalls } = useApiQuery<{ data: CallRow[] }>(
    ["inbox-calls"],
    "/inbox/calls",
    { enabled: isCallsTab },
  );

  const conversations = conversationsResp?.data ?? [];
  const drafts = draftsResp?.data ?? [];
  const calls = callsResp?.data ?? [];
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  const refreshAll = () => {
    void refetchConversations();
    void refetchDrafts();
    void refetchCalls();
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
      subtitle="كل التواصل كمحادثات: بريد، واتساب، رسائل نصية، ومكالمات — طرف + محادثة + سياق"
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
      <div className="space-y-2">
        {entityFilter && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2">
            <span className="text-xs text-indigo-800">
              مفلتر بمحادثات هذا الكيان:{" "}
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
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setActiveConversationId(null); }}>
            <TabsList>
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="email"><Mail className="w-4 h-4 me-1" />بريد</TabsTrigger>
              <TabsTrigger value="whatsapp"><MessageSquare className="w-4 h-4 me-1" />واتساب</TabsTrigger>
              <TabsTrigger value="sms"><MessageSquare className="w-4 h-4 me-1" />رسائل</TabsTrigger>
              <TabsTrigger value="calls"><Phone className="w-4 h-4 me-1" />مكالمات</TabsTrigger>
              <TabsTrigger value="drafts"><FileEdit className="w-4 h-4 me-1" />مسودّات</TabsTrigger>
            </TabsList>
          </Tabs>
          {!isCallsTab && !isDraftsTab && (
            <>
              <Input
                placeholder="ابحث في المحادثات (العنوان، الطرف...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm lg:max-w-xs"
                data-testid="inbox-search-input"
              />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setActiveConversationId(null); }}>
                <SelectTrigger className="w-[150px] text-sm" data-testid="inbox-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="open">مفتوحة</SelectItem>
                  <SelectItem value="awaiting_reply">بانتظار رد</SelectItem>
                  <SelectItem value="closed">مغلقة</SelectItem>
                  <SelectItem value="escalated">مصعدة</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {isCallsTab ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
            <CallList calls={calls} />
            <CallsHelp />
          </div>
        ) : isDraftsTab ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
            <DraftsList drafts={drafts} onOpen={openDraft} onChange={refreshAll} />
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                <FileEdit className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                اختر مسودّة من القائمة لمتابعة تعديلها أو إرسالها.
              </CardContent>
            </Card>
          </div>
        ) : (
          // The conversation-first three columns (#2138 §2):
          // قائمة المحادثات | Thread | Context Panel
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_2fr_minmax(220px,1fr)] gap-4">
            <div className={cn(activeConversationId && "hidden lg:block")}>
              <ConversationList
                conversations={conversations}
                isLoading={isLoading}
                isError={listFailed}
                activeId={activeConversationId}
                onSelect={setActiveConversationId}
                onRetry={() => void refetchConversations()}
              />
            </div>
            {activeConversationId ? (
              <ConversationThread
                key={activeConversationId}
                conversationId={activeConversationId}
                onBack={() => setActiveConversationId(null)}
                onChanged={refreshAll}
              />
            ) : (
              <Card>
                <CardContent className="p-12 text-center text-sm text-muted-foreground" data-testid="inbox-no-selection">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                  اختر محادثة من القائمة لقراءتها والرد عليها، أو ابدأ رسالة جديدة من زرّ "رسالة جديدة" بالأعلى.
                </CardContent>
              </Card>
            )}
            <div className="hidden lg:block">
              {activeConversationId ? (
                <ContextPanel conversationId={activeConversationId} onChanged={refreshAll} />
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-xs text-muted-foreground">
                    <Link2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    سياق المحادثة: الطرف، الحالة، والكيانات المرتبطة تظهر هنا عند اختيار محادثة.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
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

// ─────────────────────── Conversation list (canon) ──────────────────────

function ConversationList({ conversations, isLoading, isError, activeId, onSelect, onRetry }: {
  conversations: ConversationRow[];
  isLoading: boolean;
  isError: boolean;
  activeId: number | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground" data-testid="inbox-list-loading">
          جاري تحميل المحادثات...
        </CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm space-y-2" data-testid="inbox-list-error">
          <AlertTriangle className="w-8 h-8 mx-auto text-status-error-foreground/60" />
          <p className="text-status-error-foreground">تعذّر تحميل المحادثات.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 me-1" />أعد المحاولة
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground" data-testid="inbox-list-empty">
          لا توجد محادثات مطابقة. جرّب تغيير الفلتر أو ابدأ "رسالة جديدة".
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {conversations.map((c) => {
            const meta = CHANNEL_META[c.channelPrimary] ?? CHANNEL_META.email;
            const Icon = meta.icon;
            const isActive = activeId === c.id;
            const hasUnread = (c.unreadCount ?? 0) > 0;
            const priority = c.priority !== "normal" ? PRIORITY_LABELS[c.priority] : null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                data-testid={`conversation-row-${c.id}`}
                className={cn(
                  "w-full p-3 hover:bg-surface-subtle/60 flex gap-2 items-start transition-colors text-start",
                  isActive && "bg-status-info-surface",
                  hasUnread && !isActive && "bg-status-info-surface/30",
                )}
              >
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.color.split(" ")[1])}>
                  <Icon className={cn("w-4 h-4", meta.color.split(" ")[0])} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>
                      {c.participantName || c.participantAddress}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasUnread && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground">{c.unreadCount} جديد</Badge>
                      )}
                      {priority && (
                        <span className={cn("text-[9px] rounded border px-1.5 py-0.5 font-medium", priority.tone)}>
                          {priority.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {c.title && (
                    <p className={cn("text-xs truncate", hasUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{c.title}</p>
                  )}
                  {c.lastMessagePreview && (
                    <p className="text-xs text-muted-foreground truncate">
                      {c.lastDirection === "outbound" ? "← " : "→ "}{c.lastMessagePreview}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <div className="flex items-center gap-1 min-w-0">
                      {c.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatDateAr(c.lastMessageAt)}</span>
                      )}
                      <PageStatusBadge status={c.status} minimal className="text-[9px]">
                        {STATUS_LABELS[c.status] ?? c.status}
                      </PageStatusBadge>
                      {c.lastDirection === "outbound" && c.lastMessageStatus && (
                        <SendStatusBadge status={c.lastMessageStatus} />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.totalMessages} رسالة</span>
                  </div>
                </div>
              </button>
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

// ─────────────────────── Conversation thread (canon) ────────────────────

function ConversationThread({ conversationId, onBack, onChanged }: {
  conversationId: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: ConversationDetail }>(
    ["inbox-conversation", String(conversationId)],
    `/inbox/conversations/${conversationId}`,
  );
  const conversation = data?.data ?? null;
  const messages = conversation?.messages ?? [];
  const peerLabel = conversation?.participantName || conversation?.participantAddress || "";
  const [reply, setReply] = useState("");
  const [dlpInfo, setDlpInfo] = useState<DlpBlock | null>(null);

  // Mark inbound messages read once per conversation open. The read
  // marker endpoint is the existing per-(channel,address) one — the
  // conversation carries exactly that key, so this is a pure adapter
  // call, no new API. Idempotent server-side.
  const lastReadKey = useRef<number | null>(null);
  useEffect(() => {
    if (!conversation) return;
    if (lastReadKey.current === conversationId) return;
    if (!messages.some((m) => m.direction === "inbound" && !m.isRead)) return;
    lastReadKey.current = conversationId;
    apiFetch(
      `/inbox/threads/${conversation.channelPrimary}/${encodeURIComponent(conversation.participantAddress)}/read`,
      { method: "POST" },
    )
      .then(() => onChanged())
      .catch(() => { lastReadKey.current = null; });
  }, [conversation, conversationId, messages, onChanged]);

  // The single send path of this page: the canon endpoint, which goes
  // through sendMessage() server-side (DLP / queue / audit / events).
  const send = useMutation({
    mutationFn: () =>
      apiFetch<SendResult>(`/inbox/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      }),
    onSuccess: (r) => {
      if (r?.blocked) {
        setDlpInfo({ reason: r.reason ?? "حُجبت بواسطة DLP", rules: (r.dlpMatches ?? []).map((m) => m.rule) });
        toast({ title: "حُجبت بواسطة DLP", description: r.reason ?? "", variant: "destructive" });
        return;
      }
      setReply("");
      setDlpInfo(null);
      toast({ title: "أُرسلت" });
      void refetch();
      onChanged();
    },
    onError: (e: Error) => {
      const dlp = dlpFromError(e);
      if (dlp) {
        setDlpInfo(dlp);
        toast({ title: "حُجبت بواسطة DLP", description: dlp.reason, variant: "destructive" });
        return;
      }
      toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground" data-testid="inbox-thread-loading">
          جاري تحميل المحادثة...
        </CardContent>
      </Card>
    );
  }
  if (isError || !conversation) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm space-y-2" data-testid="inbox-thread-error">
          <AlertTriangle className="w-8 h-8 mx-auto text-status-error-foreground/60" />
          <p className="text-status-error-foreground">تعذّر تحميل المحادثة — قد تكون محذوفة أو خارج صلاحيتك.</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 me-1" />أعد المحاولة
            </Button>
            <Button variant="ghost" size="sm" onClick={onBack}>رجوع</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const meta = CHANNEL_META[conversation.channelPrimary] ?? CHANNEL_META.email;
  const Icon = meta.icon;
  const canReply = SENDABLE_CHANNELS.has(conversation.channelPrimary);
  const sendable = conversation.channelPrimary as Channel;

  return (
    <Card className="flex flex-col h-[calc(100vh-260px)] min-h-[400px]">
      <CardHeader className="pb-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Button variant="ghost" size="sm" className="lg:hidden me-2" onClick={onBack}>←</Button>
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span className="truncate">{peerLabel}</span>
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
            <PageStatusBadge status={conversation.status} minimal className="text-[10px]">
              {STATUS_LABELS[conversation.status] ?? conversation.status}
            </PageStatusBadge>
          </CardTitle>
          <div className="flex items-center gap-1">
            {canReply && (
              <ThreadSnoozeMenu
                channel={sendable}
                address={conversation.participantAddress}
                onSnoozed={onBack}
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={cn(
            "rounded-lg p-3 max-w-[80%]",
            m.direction === "outbound"
              ? "bg-status-info-surface ms-auto"
              : "bg-surface-subtle me-auto",
          )}>
            <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
              {m.direction === "outbound" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
              <span>{m.direction === "outbound" ? "أنت" : peerLabel}</span>
              <span>•</span>
              <span>{formatDateAr(m.createdAt)}</span>
              {m.direction === "inbound" && m.isRead === false && (
                <Badge className="text-[9px] bg-primary text-primary-foreground">جديد</Badge>
              )}
              {m.status === "blocked_dlp" && (
                <Badge variant="outline" className="text-[9px] text-status-error-foreground border-status-error-surface">حُجبت DLP</Badge>
              )}
              {m.direction === "outbound" && m.status === "failed" && (
                <SendStatusBadge status={m.status} />
              )}
            </div>
            {m.subject && <p className="text-xs font-semibold mb-1">{m.subject}</p>}
            <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8" data-testid="inbox-thread-empty">
            لا توجد رسائل في هذه المحادثة بعد.
          </p>
        )}
        <ThreadNotes channel={conversation.channelPrimary as Channel} address={conversation.participantAddress} />
      </CardContent>

      <div className="border-t p-3 shrink-0">
        {dlpInfo && (
          <div className="mb-2 p-2 bg-status-error-surface text-status-error-foreground rounded text-xs flex items-start gap-2" data-testid="inbox-dlp-blocked">
            <AlertOctagon className="w-3 h-3 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">حُجبت بواسطة DLP</p>
              <p>{dlpInfo.reason}</p>
              {dlpInfo.rules.length > 0 && (
                <p className="text-[10px] mt-1">القواعد المُفعَّلة: {dlpInfo.rules.join(", ")}</p>
              )}
            </div>
          </div>
        )}
        {canReply ? (
          <>
            <div className="flex gap-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="اكتب ردّك..."
                rows={2}
                className="flex-1 text-sm"
                data-testid="inbox-reply-input"
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
                data-testid="inbox-reply-send"
              >
                <Send className="w-4 h-4 me-1" />{send.isPending ? "..." : "أرسل"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter للإرسال السريع</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center" data-testid="inbox-reply-unavailable">
            قناة "{meta.label}" لا تدعم الرد المباشر من هنا.
          </p>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────── Context panel (canon) ──────────────────────────

/**
 * Third column of the conversation-first layout: the conversation's
 * context — participant identity, status/priority, and the business
 * entities linked through conversation_links. Read-only display plus
 * the two canon lifecycle actions (close / reopen); linking and
 * assignment management arrive in a later #2138 slice.
 */
function ContextPanel({ conversationId, onChanged }: {
  conversationId: number;
  onChanged: () => void;
}) {
  const { data, isLoading, refetch } = useApiQuery<{ data: ConversationDetail }>(
    ["inbox-conversation", String(conversationId)],
    `/inbox/conversations/${conversationId}`,
  );
  const conversation = data?.data ?? null;

  const lifecycle = useMutation({
    mutationFn: (action: "close" | "reopen") =>
      apiFetch(`/inbox/conversations/${conversationId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast({ title: "تم تحديث حالة المحادثة" });
      void refetch();
      onChanged();
    },
    onError: (e: Error) => toast({ title: "تعذّر تحديث الحالة", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !conversation) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-xs text-muted-foreground">
          {isLoading ? "جاري تحميل السياق..." : "لا يوجد سياق متاح."}
        </CardContent>
      </Card>
    );
  }

  const meta = CHANNEL_META[conversation.channelPrimary] ?? CHANNEL_META.email;
  const priority = conversation.priority !== "normal" ? PRIORITY_LABELS[conversation.priority] : null;

  return (
    <div className="space-y-3" data-testid="inbox-context-panel">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />الطرف
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1 text-xs">
          {conversation.participantName && (
            <p className="font-semibold text-sm">{conversation.participantName}</p>
          )}
          <p className="font-mono text-muted-foreground break-all">{conversation.participantAddress}</p>
          <div className="flex items-center gap-1 flex-wrap pt-1">
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
            <PageStatusBadge status={conversation.status} className="text-[10px]">
              {STATUS_LABELS[conversation.status] ?? conversation.status}
            </PageStatusBadge>
            {priority && (
              <span className={cn("text-[9px] rounded border px-1.5 py-0.5 font-medium", priority.tone)}>
                أولوية {priority.label}
              </span>
            )}
            {conversation.participantType && (
              <Badge variant="outline" className="text-[10px]">
                {LINK_TYPE_LABELS[conversation.participantType] ?? conversation.participantType}
                {conversation.participantId ? ` #${conversation.participantId}` : ""}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground pt-1 space-y-0.5">
            <p>{conversation.totalMessages} رسالة{conversation.unreadCount > 0 ? ` — ${conversation.unreadCount} غير مقروءة` : ""}</p>
            {conversation.lastMessageAt && <p>آخر نشاط: {formatDateAr(conversation.lastMessageAt)}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="w-4 h-4 text-muted-foreground" />الكيانات المرتبطة
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {conversation.links.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="inbox-links-empty">
              لا توجد كيانات مرتبطة بهذه المحادثة بعد.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="inbox-links-list">
              {conversation.links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {LINK_TYPE_LABELS[l.relatedType] ?? l.relatedType}
                  </Badge>
                  <span className="font-mono text-muted-foreground">#{l.relatedId}</span>
                  <span className="text-[10px] text-muted-foreground ms-auto">{formatDateAr(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          {conversation.status === "closed" ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("reopen")}
              data-testid="inbox-reopen-conversation"
            >
              <Unlock className="w-3.5 h-3.5 me-1" />إعادة فتح
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("close")}
              data-testid="inbox-close-conversation"
            >
              <Lock className="w-3.5 h-3.5 me-1" />إغلاق المحادثة
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
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
            {saveDraft.isPending ? "جاري الحفظ..." : (draftId ? "تحديث المسوّدة" : "حفظ كمسوّدة")}
          </Button>
          <Button
            rateLimitAware
            disabled={send.isPending || !recipient || !body || (channel === "email" && !subject)}
            onClick={() => send.mutate()}
          >
            <Send className="w-4 h-4 me-1" />
            {send.isPending ? "جاري الإرسال..." : (scheduledAt ? "جدولة الإرسال" : "أرسل")}
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

// ─── SendStatusBadge ────────────────────────────────────────────
// Outbound messages carry a delivery status: pending (in the queue),
// queued (worker has it), sent (provider accepted), failed (worker
// gave up after retries), blocked_dlp (DLP blocked the send). Until
// now the inbox didn't show this — the user had to assume their
// message went out. Tiny badge that surfaces it inline.
// ─────────────────────── Thread internal notes ─────────────────────────

interface NoteRow {
  id: number;
  body: string;
  createdAt: string;
  authorId: number;
  authorName: string | null;
}

function ThreadNotes({ channel, address }: { channel: Channel; address: string }) {
  const { data, refetch } = useApiQuery<{ data: NoteRow[] }>(
    ["thread-notes", channel, address],
    `/inbox/threads/${channel}/${encodeURIComponent(address)}/notes`,
  );
  const notes = data?.data ?? [];
  const [text, setText] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/inbox/threads/${channel}/${encodeURIComponent(address)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: text.trim() }),
      }),
    onSuccess: () => { setText(""); void refetch(); },
    onError: (e: Error) => toast({ title: "تعذّر إضافة الملاحظة", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/inbox/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذفت الملاحظة" }); void refetch(); },
    onError: (e: Error) => toast({ title: "تعذّر الحذف", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border-t border-dashed border-status-warning-surface pt-3 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3 h-3 text-status-warning-foreground" />
        <span className="text-xs font-semibold text-status-warning-foreground">ملاحظات داخلية</span>
        <Badge variant="outline" className="text-[10px]">لا تُرسَل للعميل</Badge>
      </div>
      <div className="space-y-2 mb-2">
        {notes.map((n) => (
          <div key={n.id} className="bg-status-warning-surface/30 rounded p-2 text-xs flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground mb-0.5">
                {n.authorName ?? `#${n.authorId}`} • {formatDateAr(n.createdAt)}
              </div>
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
            </div>
            <button
              type="button"
              onClick={() => del.mutate(n.id)}
              className="p-1 hover:bg-status-error-surface rounded shrink-0"
              title="حذف الملاحظة"
            >
              <Trash2 className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">لا توجد ملاحظات داخلية بعد.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ملاحظة للفريق فقط (لن تُرسَل للعميل)..."
          rows={2}
          className="flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!text.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "..." : "أضف ملاحظة"}
        </Button>
      </div>
    </div>
  );
}

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
