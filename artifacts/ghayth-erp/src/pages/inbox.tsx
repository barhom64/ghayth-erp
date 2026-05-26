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
import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
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
} from "lucide-react";

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
  relatedType: string | null;
  relatedId: number | null;
  createdAt: string;
  total_messages: number;
  inbound_count: number;
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

const CHANNEL_META: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  email:    { icon: Mail,          label: "بريد",   color: "text-purple-600 bg-purple-50" },
  whatsapp: { icon: MessageSquare, label: "واتساب",  color: "text-emerald-600 bg-emerald-50" },
  sms:      { icon: MessageSquare, label: "رسالة",  color: "text-sky-600 bg-sky-50" },
  pbx:      { icon: Phone,         label: "مكالمة", color: "text-orange-600 bg-orange-50" },
};

export default function Inbox() {
  const [tab, setTab] = useState<"all" | Channel | "calls">("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [activeThread, setActiveThread] = useState<{ channel: Channel; address: string } | null>(null);

  const threadsPath = tab === "all" || tab === "calls"
    ? "/inbox/threads"
    : `/inbox/threads?channel=${tab}`;

  const { data: threadsResp, isLoading, refetch: refetchThreads } = useApiQuery<{ data: ThreadRow[] }>(
    ["inbox-threads", tab],
    threadsPath,
    { enabled: tab !== "calls" },
  );
  const { data: callsResp, refetch: refetchCalls } = useApiQuery<{ data: CallRow[] }>(
    ["inbox-calls"],
    "/inbox/calls",
    { enabled: tab === "calls" },
  );
  const threads = threadsResp?.data ?? [];
  const calls = callsResp?.data ?? [];

  const refreshAll = () => {
    void refetchThreads();
    void refetchCalls();
  };

  return (
    <PageShell
      title="صندوقي الموحّد"
      subtitle="بريد إلكتروني، واتساب، رسائل نصية، ومكالمات — كلها في مكان واحد، مع إمكانية الإرسال والرد"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 me-1" />تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCallLogOpen(true)}>
            <PhoneCall className="w-4 h-4 me-1" />سجّل مكالمة
          </Button>
          <Button size="sm" rateLimitAware onClick={() => setComposeOpen(true)}>
            <Plus className="w-4 h-4 me-1" />رسالة جديدة
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">الكل</TabsTrigger>
          <TabsTrigger value="email"><Mail className="w-4 h-4 me-1" />بريد</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="w-4 h-4 me-1" />واتساب</TabsTrigger>
          <TabsTrigger value="sms"><MessageSquare className="w-4 h-4 me-1" />رسائل</TabsTrigger>
          <TabsTrigger value="calls"><Phone className="w-4 h-4 me-1" />مكالمات</TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: thread list / call list */}
          <div className={cn("lg:col-span-1", activeThread && "hidden lg:block")}>
            {tab === "calls" ? (
              <CallList calls={calls} />
            ) : (
              <ThreadList
                threads={threads}
                isLoading={isLoading}
                active={activeThread}
                onSelect={(channel, address) => setActiveThread({ channel, address })}
              />
            )}
          </div>

          {/* Right: thread detail / placeholder */}
          <div className="lg:col-span-2">
            {tab === "calls" ? (
              <CallsHelp />
            ) : activeThread ? (
              <ThreadView
                channel={activeThread.channel}
                address={activeThread.address}
                onBack={() => setActiveThread(null)}
                onSent={refreshAll}
              />
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
      </Tabs>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={() => { refreshAll(); setComposeOpen(false); }}
      />
      <CallLogDialog
        open={callLogOpen}
        onClose={() => setCallLogOpen(false)}
        onLogged={() => { refreshAll(); setCallLogOpen(false); }}
      />
    </PageShell>
  );
}

// ─────────────────────── Thread list ────────────────────────────────────

function ThreadList({ threads, isLoading, active, onSelect }: {
  threads: ThreadRow[];
  isLoading: boolean;
  active: { channel: Channel; address: string } | null;
  onSelect: (channel: Channel, address: string) => void;
}) {
  if (threads.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          لا توجد محادثات بعد. ابدأ رسالة جديدة لإنشاء محادثة.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {threads.map((t) => {
            const meta = CHANNEL_META[t.channel] ?? CHANNEL_META.email;
            const Icon = meta.icon;
            const isActive = active?.channel === t.channel && active.address === t.peer;
            return (
              <button
                key={`${t.channel}-${t.peer}-${t.id}`}
                type="button"
                onClick={() => t.channel !== "pbx" && onSelect(t.channel as Channel, t.peer)}
                className={cn(
                  "w-full text-start p-3 hover:bg-surface-subtle/60 flex gap-3 items-start transition-colors",
                  isActive && "bg-status-info-surface",
                  t.channel === "pbx" && "opacity-60 cursor-default",
                )}
              >
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.color.split(" ")[1])}>
                  <Icon className={cn("w-4 h-4", meta.color.split(" ")[0])} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{t.peer}</span>
                    {t.inbound_count > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t.inbound_count} وارد
                      </Badge>
                    )}
                  </div>
                  {t.subject && (
                    <p className="text-xs font-medium text-muted-foreground truncate">{t.subject}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {t.direction === "outbound" ? "← " : "→ "}{t.body_preview}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{formatDateAr(t.createdAt)}</span>
                    <span className="text-[10px] text-muted-foreground">{t.total_messages} رسالة</span>
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
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3" />
          </Button>
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

function ComposeDialog({ open, onClose, onSent }: {
  open: boolean; onClose: () => void; onSent: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dlpInfo, setDlpInfo] = useState<SendResult | null>(null);

  const reset = () => { setRecipient(""); setSubject(""); setBody(""); setDlpInfo(null); };

  const send = useMutation({
    mutationFn: () => apiFetch<SendResult>("/inbox/send", {
      method: "POST",
      body: JSON.stringify({
        channel, recipient, subject: channel === "email" ? subject : undefined, body,
      }),
    }),
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

  const placeholderRecipient = channel === "email"
    ? "user@example.com"
    : "+966500000000";

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
                    onClick={() => setChannel(c)}
                  >
                    <Icon className="w-4 h-4 me-1" />{meta.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>المستلم</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={placeholderRecipient} />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            rateLimitAware
            disabled={send.isPending || !recipient || !body || (channel === "email" && !subject)}
            onClick={() => send.mutate()}
          >
            <Send className="w-4 h-4 me-1" />{send.isPending ? "جارٍ الإرسال..." : "أرسل"}
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
