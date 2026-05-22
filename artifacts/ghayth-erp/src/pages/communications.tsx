import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageStatusBadge } from "@/components/page-status-badge";
import { formatDateAr , todayLocal } from "@/lib/formatters";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { ErrorState } from "@/components/shared/loading-error-states";
import { MessageCircle, Mail, Phone, Send, Search, ArrowRightLeft, ClipboardList, Headphones, FileText, ChevronDown, ChevronUp, Bell, BellOff, BellRing, CheckCircle2, XCircle, Clock, Activity, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { GuardedButton } from "@/components/shared/permission-gate";

export default function Communications() {
  const [tab, setTab] = useState("monitor");
  return (
    <PageShell title="الاتصالات">
      <StatsCards />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="monitor" className="gap-2"><Activity className="h-4 w-4" /> المراقبة</TabsTrigger>
          <TabsTrigger value="log" className="gap-2"><Send className="h-4 w-4" /> سجل الاتصالات</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageCircle className="h-4 w-4" /> واتساب</TabsTrigger>
          <TabsTrigger value="sms" className="gap-2"><Mail className="h-4 w-4" /> رسائل نصية</TabsTrigger>
          <TabsTrigger value="pbx" className="gap-2"><Phone className="h-4 w-4" /> المكالمات</TabsTrigger>
        </TabsList>
        <TabsContent value="monitor" className="mt-6"><MonitorTab /></TabsContent>
        <TabsContent value="log" className="mt-6"><CommLogTab /></TabsContent>
        <TabsContent value="whatsapp" className="mt-6"><WhatsAppTab /></TabsContent>
        <TabsContent value="sms" className="mt-6"><SMSTab /></TabsContent>
        <TabsContent value="pbx" className="mt-6"><PBXTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function StatsCards() {
  const { data: stats, isError } = useApiQuery(["comm-stats"], "/communications/stats");
  if (isError) return <ErrorState />;
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي الاتصالات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.total || 0}</div></CardContent></Card>
      <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">واتساب</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.whatsapp || 0}</div>{stats?.pendingWhatsApp > 0 && <div className="text-xs opacity-80">{stats.pendingWhatsApp} في الانتظار</div>}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">رسائل نصية</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.sms || 0}</div>{stats?.pendingSms > 0 && <div className="text-xs text-status-warning-foreground">{stats.pendingSms} في الانتظار</div>}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">البريد</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.email || 0}</div></CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">المكالمات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.pbx || 0}</div></CardContent></Card>
    </div>
  );
}

function QueueStatusBar({ sent = 0, failed = 0, pending = 0, total = 0 }: { sent?: number; failed?: number; pending?: number; total?: number }) {
  const safeTotal = total || sent + failed + pending || 1;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-subtle">
        {sent > 0 && <div className="bg-status-success-surface0" style={{ width: `${(sent / safeTotal) * 100}%` }} title={`مرسل: ${sent}`} />}
        {failed > 0 && <div className="bg-status-error-surface0" style={{ width: `${(failed / safeTotal) * 100}%` }} title={`فاشل: ${failed}`} />}
        {pending > 0 && <div className="bg-amber-400" style={{ width: `${(pending / safeTotal) * 100}%` }} title={`في الانتظار: ${pending}`} />}
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-success-surface0 inline-block" />مرسل: {sent}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-error-surface0 inline-block" />فاشل: {failed}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />انتظار: {pending}</span>
      </div>
    </div>
  );
}

function PushNotificationsCard() {
  const { toast } = useToast();
  const { isSupported, permission, isSubscribed, isLoading, error, subscribe, unsubscribe, testPush } = usePushNotifications();

  const handleSubscribe = async () => {
    const ok = await subscribe();
    if (ok) toast({ title: "تم التفعيل", description: "ستصلك الإشعارات الآن حتى بدون فتح التطبيق" });
    else if (error) toast({ variant: "destructive", title: "خطأ", description: error });
  };

  const handleUnsubscribe = async () => {
    const ok = await unsubscribe();
    if (ok) toast({ title: "تم إلغاء التفعيل", description: "لن تصلك إشعارات المتصفح بعد الآن" });
  };

  const handleTest = async () => {
    await testPush();
    toast({ title: "تم الإرسال", description: "يجب أن تصلك إشعار تجريبي الآن" });
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BellOff className="h-4 w-4 text-muted-foreground" />
            إشعارات المتصفح الفورية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">متصفحك لا يدعم إشعارات المتصفح</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(isSubscribed ? "border-status-success-surface bg-status-success-surface" : "")}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isSubscribed ? <BellRing className="h-4 w-4 text-status-success-foreground" /> : <Bell className="h-4 w-4 text-muted-foreground" />}
          إشعارات المتصفح الفورية
          {isSubscribed && <Badge variant="outline" className="text-status-success-foreground border-status-success-surface bg-status-success-surface text-xs">مفعّل</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {permission === "denied" ? (
          <div className="flex items-start gap-2 text-sm text-status-error-foreground bg-status-error-surface rounded-md p-3">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">تم رفض الإذن</p>
              <p className="text-xs text-status-error mt-0.5">يجب السماح بالإشعارات من إعدادات المتصفح</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isSubscribed
              ? "أنت مشترك في إشعارات المتصفح. ستصلك الإشعارات حتى لو لم يكن التطبيق مفتوحاً."
              : "فعّل الإشعارات لتصلك تنبيهات المهام والعمليات المهمة حتى بدون فتح التطبيق."}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          {!isSubscribed ? (
            <GuardedButton perm="communications:create" size="sm" onClick={handleSubscribe} disabled={isLoading || permission === "denied"}>
              <Bell className="h-3.5 w-3.5 me-1" />
              {isLoading ? "جاري التفعيل..." : "تفعيل الإشعارات"}
            </GuardedButton>
          ) : (
            <>
              <GuardedButton perm="communications:create" size="sm" variant="outline" onClick={handleTest} disabled={isLoading}>
                <BellRing className="h-3.5 w-3.5 me-1" />
                إرسال تجريبي
              </GuardedButton>
              <GuardedButton perm="communications:create" size="sm" variant="ghost" onClick={handleUnsubscribe} disabled={isLoading} className="text-status-error-foreground hover:text-status-error-foreground">
                <BellOff className="h-3.5 w-3.5 me-1" />
                إلغاء الاشتراك
              </GuardedButton>
            </>
          )}
        </div>
        {error && <p className="text-xs text-status-error">{error}</p>}
      </CardContent>
    </Card>
  );
}

function MonitorTab() {
  const today = todayLocal();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queueUrl = `/communications/queue-stats?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const { data: queueStats, refetch } = useApiQuery<any>(["comm-queue-stats", dateFrom, dateTo], queueUrl);

  const sms = queueStats?.sms ?? {};
  const wa = queueStats?.whatsapp ?? {};
  const email = queueStats?.email ?? {};

  const smsSent = sms.sent ?? 0;
  const smsFailed = sms.failed ?? 0;
  const smsPending = sms.pending ?? 0;
  const smsTotal = smsSent + smsFailed + smsPending;

  const waSent = wa.sent ?? 0;
  const waFailed = wa.failed ?? 0;
  const waPending = wa.pending ?? 0;
  const waTotal = waSent + waFailed + waPending;

  const emailSent = email.sent ?? 0;
  const emailFailed = email.failed ?? 0;
  const emailPending = email.pending ?? 0;
  const emailTotal = emailSent + emailFailed + emailPending;

  const recentSms: any[] = queueStats?.recentSms ?? [];
  const recentWa: any[] = queueStats?.recentWhatsapp ?? [];

  const filterRows = (rows: any[]) =>
    statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const recentMsgColumns: DataTableColumn<any>[] = [
    { key: "recipient", header: "المستلم", ltr: true, render: (r: any) => <span className="max-w-[100px] truncate inline-block">{r.recipient}</span> },
    { key: "status", header: "الحالة", render: (r: any) => <PageStatusBadge status={r.status} /> },
    { key: "attemptCount", header: "المحاولات", align: "center", render: (r: any) => r.attemptCount ?? 0 },
    { key: "createdAt", header: "التاريخ", ltr: true, render: (r: any) => <span className="text-muted-foreground">{formatDateAr(r.createdAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">لوحة مراقبة قنوات الاتصال</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">من:</label>
            <UnifiedDateInput
              value={dateFrom}
              onChange={(iso) => setDateFrom(iso)}
              inputClassName="text-xs border rounded px-2 py-1"
              placeholder="من تاريخ"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">إلى:</label>
            <UnifiedDateInput
              value={dateTo}
              onChange={(iso) => setDateTo(iso)}
              inputClassName="text-xs border rounded px-2 py-1"
              placeholder="إلى تاريخ"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="text-xs h-8 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">انتظار</SelectItem>
              <SelectItem value="sent">مُرسل</SelectItem>
              <SelectItem value="failed">فشل</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Activity className="h-4 w-4 me-1" />
            تحديث
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-status-info" />
              الرسائل النصية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{smsTotal}</div>
            <QueueStatusBar sent={smsSent} failed={smsFailed} pending={smsPending} total={smsTotal} />
            {smsPending > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground">
                <Clock className="h-3 w-3" />
                {smsPending} رسالة في الانتظار — يعالجها المعالج الآلي كل دقيقة
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              رسائل واتساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{waTotal}</div>
            <QueueStatusBar sent={waSent} failed={waFailed} pending={waPending} total={waTotal} />
            {waPending > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground">
                <Clock className="h-3 w-3" />
                {waPending} رسالة في الانتظار — يعالجها المعالج الآلي كل دقيقة
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-500" />
              البريد الإلكتروني
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{emailTotal}</div>
            <QueueStatusBar sent={emailSent} failed={emailFailed} pending={emailPending} total={emailTotal} />
            {emailPending > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground">
                <Clock className="h-3 w-3" />
                {emailPending} رسالة في الانتظار
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PushNotificationsCard />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-status-info" />
              حالة خدمات المعالجة التشغيلية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: "معالج الرسائل النصية", desc: "يعالج قائمة انتظار الرسائل النصية كل دقيقة", active: true },
              { name: "معالج واتساب", desc: "يعالج قائمة انتظار واتساب كل دقيقة", active: true },
              { name: "معالج البريد الإلكتروني", desc: "يعالج قائمة انتظار البريد كل دقيقة", active: true },
            ].map((w) => (
              <div key={w.name} className="flex items-start gap-2 py-1.5">
                <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.desc}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2 border-t">
              للتكوين: اذهب إلى الإعدادات → قنوات الاتصال
            </p>
          </CardContent>
        </Card>
      </div>

      {(recentSms.length > 0 || recentWa.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {recentSms.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">آخر الرسائل النصية</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={recentMsgColumns}
                  data={filterRows(recentSms)}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا توجد رسائل"
                />
              </CardContent>
            </Card>
          )}
          {recentWa.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">آخر رسائل واتساب</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={recentMsgColumns}
                  data={filterRows(recentWa)}
                  noToolbar
                  pageSize={0}
                  emptyMessage="لا توجد رسائل"
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ConvertCommButton({ logEntry, onSuccess }: { logEntry: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [show, setShow] = useState(false);
  const [converting, setConverting] = useState(false);

  const options = [
    { key: "task", label: "طلب متابعة", icon: ClipboardList, color: "text-status-info-foreground border-status-info-surface hover:bg-status-info-surface" },
    { key: "ticket", label: "طلب دعم", icon: Headphones, color: "text-orange-600 border-orange-200 hover:bg-orange-50" },
    { key: "request", label: "طلب داخلي", icon: FileText, color: "text-purple-600 border-purple-200 hover:bg-purple-50" },
  ];

  const handleConvert = async (targetType: string) => {
    setConverting(true);
    try {
      const result = await apiFetch(`/communications/log/${logEntry.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ targetType }),
      });
      toast({ title: "تم التحويل بنجاح", description: result.message });
      setShow(false);
      onSuccess();
      if (result.targetPath) {
        setTimeout(() => setLocation(result.targetPath), 1000);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في التحويل", description: err.message });
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => setShow(!show)}>
        <ArrowRightLeft className="h-3 w-3" />
        تحويل
        {show ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>
      {show && (
        <div className="flex items-center gap-1">
          {options.map((opt) => (
            <GuardedButton
              perm="communications:create"
              key={opt.key}
              variant="outline"
              size="sm"
              disabled={converting}
              onClick={() => handleConvert(opt.key)}
              className={cn("h-7 px-2 gap-1 text-[11px]", opt.color)}
            >
              <opt.icon className="h-3 w-3" />
              {opt.label}
            </GuardedButton>
          ))}
        </div>
      )}
    </div>
  );
}

const COMM_LOG_STATUSES = ["queued", "sent", "delivered", "received", "read", "failed"];

function CommLogActions({ logEntry, onSuccess }: { logEntry: any; onSuccess: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subject: logEntry.subject || "", status: logEntry.status || "queued" });

  const save = async () => {
    setBusy(true);
    try {
      await apiFetch(`/communications/log/${logEntry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: form.subject, status: form.status }),
      });
      toast({ title: "تم تحديث السجل" });
      setEditing(false);
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiFetch(`/communications/log/${logEntry.id}`, { method: "DELETE" });
      toast({ title: "تم حذف السجل" });
      onSuccess();
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1">
        <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="الموضوع" className="h-7 w-28 text-xs" />
        <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMM_LOG_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={save}><Check className="h-3 w-3" /></Button>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <GuardedButton perm="communications:update" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></GuardedButton>
      {confirmDelete ? (
        <>
          <GuardedButton perm="communications:delete" variant="outline" size="sm" className="h-7 px-2 text-[11px] text-status-error-foreground" disabled={busy} onClick={remove}>تأكيد</GuardedButton>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setConfirmDelete(false)}><X className="h-3 w-3" /></Button>
        </>
      ) : (
        <GuardedButton perm="communications:delete" variant="ghost" size="sm" className="h-7 px-2 text-status-error-foreground" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3 w-3" /></GuardedButton>
      )}
    </div>
  );
}

function CommLogTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 20;
  const { data: logsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["comm-log", String(page)], `/communications/log?page=${page}&limit=${pageSize}`);
  const logs = asList(logsResp);
  const total = logsResp?.total || logs.length;
  const filtered = logs.filter((l: any) => !search || l.fromNumber?.includes(search) || l.toNumber?.includes(search) || l.subject?.includes(search));

  const columns: DataTableColumn<any>[] = [
    { key: "channel", header: "القناة", sortable: true, render: (l) => <span className={`px-2 py-1 rounded text-xs font-medium ${l.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : l.channel === 'sms' ? 'bg-status-info-surface text-status-info-foreground' : l.channel === 'email' ? 'bg-purple-100 text-purple-700' : 'bg-surface-subtle'}`}>{l.channel}</span> },
    { key: "direction", header: "الاتجاه", sortable: true, render: (l) => l.direction === 'inbound' ? 'وارد' : 'صادر' },
    { key: "fromNumber", header: "من", sortable: true, ltr: true, render: (l) => l.fromNumber || "-" },
    { key: "toNumber", header: "إلى", sortable: true, ltr: true, render: (l) => l.toNumber || "-" },
    { key: "subject", header: "الموضوع", sortable: true, render: (l) => <span className="max-w-[200px] truncate inline-block">{l.subject || "-"}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (l) => formatDateAr(l.createdAt) },
    { key: "actions", header: "إجراء", render: (l) => (
      <div className="inline-flex items-center gap-1">
        {l.relatedType ? <Badge variant="outline" className="text-[10px]">{l.relatedType}</Badge> : <ConvertCommButton logEntry={l} onSuccess={() => refetch()} />}
        <CommLogActions logEntry={l} onSuccess={() => refetch()} />
      </div>
    ) },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>سجل الاتصالات</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث بالرقم أو الموضوع..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد سجلات اتصالات"
          emptyIcon={<Send className="h-6 w-6 text-slate-400" />}
          noToolbar
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}

function WhatsAppTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;
  const { data: messagesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["comm-whatsapp", String(page), statusFilter],
    `/communications/whatsapp?page=${page}&limit=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`
  );
  const messages = asList(messagesResp);
  const total = messagesResp?.total || messages.length;
  const filtered = messages.filter((m: any) => !search || m.phone?.includes(search) || m.recipientPhone?.includes(search) || m.message?.includes(search));

  const columns: DataTableColumn<any>[] = [
    { key: "phone", header: "الرقم", sortable: true, ltr: true, render: (m) => m.phone || m.recipientPhone || "-" },
    { key: "recipientName", header: "المستلم", sortable: true, render: (m) => m.recipientName || "-" },
    { key: "message", header: "الرسالة", sortable: true, render: (m) => <span className="max-w-[300px] truncate inline-block">{m.message}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (m) => <PageStatusBadge status={m.status} /> },
    { key: "externalId", header: "معرف خارجي", render: (m) => <span className="text-xs text-muted-foreground">{m.externalId || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (m) => formatDateAr(m.createdAt) },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>رسائل واتساب</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" placeholder="بحث بالرقم أو الرسالة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || "_none"} onValueChange={(v) => setStatusFilter(v === "_none" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">جميع الحالات</SelectItem>
              <SelectItem value="pending">في الانتظار</SelectItem>
              <SelectItem value="sent">مرسل</SelectItem>
              <SelectItem value="failed">فاشل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد رسائل واتساب"
          emptyIcon={<MessageCircle className="h-6 w-6 text-slate-400" />}
          noToolbar
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}

function SMSTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;
  const { data: messagesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["comm-sms", String(page), statusFilter],
    `/communications/sms?page=${page}&limit=${pageSize}${statusFilter ? `&status=${statusFilter}` : ""}`
  );
  const messages = asList(messagesResp);
  const total = messagesResp?.total || messages.length;
  const filtered = messages.filter((m: any) => !search || m.recipientPhone?.includes(search) || m.message?.includes(search));

  const columns: DataTableColumn<any>[] = [
    { key: "recipientPhone", header: "الرقم", sortable: true, ltr: true, render: (m) => m.recipientPhone || "-" },
    { key: "message", header: "الرسالة", sortable: true, render: (m) => <span className="max-w-[300px] truncate inline-block">{m.message}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (m) => <PageStatusBadge status={m.status} /> },
    { key: "externalId", header: "معرف خارجي", render: (m) => <span className="text-xs text-muted-foreground">{m.externalId || "-"}</span> },
    { key: "attemptCount", header: "عدد المحاولات", align: "center", render: (m) => m.attemptCount ?? 0 },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (m) => formatDateAr(m.createdAt) },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>الرسائل النصية</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" placeholder="بحث بالرقم أو الرسالة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || "_none"} onValueChange={(v) => setStatusFilter(v === "_none" ? "" : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">جميع الحالات</SelectItem>
              <SelectItem value="pending">في الانتظار</SelectItem>
              <SelectItem value="sent">مرسل</SelectItem>
              <SelectItem value="failed">فاشل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد رسائل نصية"
          emptyIcon={<Mail className="h-6 w-6 text-slate-400" />}
          noToolbar
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}

function PBXTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 20;
  const { data: callsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["comm-pbx", String(page)], `/communications/pbx?page=${page}&limit=${pageSize}`);
  const calls = asList(callsResp);
  const total = callsResp?.total || calls.length;
  const filtered = calls.filter((c: any) => !search || c.callerNumber?.includes(search) || c.calledNumber?.includes(search));

  const columns: DataTableColumn<any>[] = [
    { key: "callerNumber", header: "المتصل", sortable: true, ltr: true, render: (c) => c.callerNumber || "-" },
    { key: "calledNumber", header: "المستقبل", sortable: true, ltr: true, render: (c) => c.calledNumber || "-" },
    { key: "direction", header: "الاتجاه", sortable: true, render: (c) => c.direction === 'inbound' ? 'وارد' : 'صادر' },
    { key: "duration", header: "المدة", sortable: true, render: (c) => c.duration ? `${Math.floor(c.duration/60)}:${String(c.duration%60).padStart(2,'0')}` : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <PageStatusBadge status={c.status} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (c) => formatDateAr(c.createdAt) },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>سجل المكالمات</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث برقم المتصل أو المستقبل..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد مكالمات مسجلة"
          emptyIcon={<Phone className="h-6 w-6 text-slate-400" />}
          noToolbar
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}
