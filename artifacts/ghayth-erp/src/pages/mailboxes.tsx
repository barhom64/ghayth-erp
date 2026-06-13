/**
 * /mailboxes — manage connected mailbox accounts (Microsoft 365 /
 * Hostinger / generic IMAP). Each row is a mailbox the current user has
 * connected; the sync worker pulls new messages from these into /inbox.
 *
 * Phase 2.x of the communications unification. The OAuth dance for
 * Microsoft 365 is intentionally deferred — this page shows the form
 * fields but the live-sync RPC backend is currently stubbed.
 */
import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Mail, Plus, Trash2, RefreshCw, FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";

type Provider = "microsoft365" | "imap" | "hostinger";

type MailboxRow = {
  id: number;
  provider: Provider;
  displayName: string | null;
  emailAddress: string;
  branchId: number | null;
  branchName?: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  syncEnabled: boolean;
  syncFolders: string[] | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
};

const PROVIDER_LABEL: Record<Provider, string> = {
  microsoft365: "Microsoft 365",
  imap: "IMAP",
  hostinger: "Hostinger",
};

export default function Mailboxes() {
  const { toast } = useToast();
  const [openConnect, setOpenConnect] = useState(false);
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: MailboxRow[] }>(
    ["mailboxes"],
    "/mailboxes",
  );

  const deleteMut = useApiMutation<unknown, { _id: number }>(
    (body) => `/mailboxes/${body._id}`,
    "DELETE",
    [["mailboxes"]],
    { onSuccess: () => { toast({ title: "تم فصل الصندوق" }); } }
  );

  // PATCH /mailboxes/:id — flips active / display name / per-mailbox
  // settings without re-running OAuth. Drives the "إعدادات" inline action.
  const patchMut = useApiMutation<unknown, { _id: number; syncEnabled?: boolean; displayName?: string }>(
    (body) => `/mailboxes/${body._id}`,
    "PATCH",
    [["mailboxes"]],
    {
      successMessage: "تم تحديث إعدادات الصندوق",
    },
  );

  const syncMut = useApiMutation<{ data: { status: string; messagesFetched: number; error?: string } }, { _id: number }>(
    (body) => `/mailboxes/${body._id}/sync`,
    "POST",
    [["mailboxes"]],
    {
      onSuccess: (resp) => {
        const r = resp?.data;
        toast({
          title: r?.status === "ok" ? `تمت المزامنة (${r.messagesFetched} رسالة)` : `الحالة: ${r?.status}`,
          description: r?.error ?? undefined,
        });
      },
    }
  );

  const testMut = useApiMutation<{ data: { ok: boolean; detail: string } }, { _id: number }>(
    (body) => `/mailboxes/${body._id}/test`,
    "POST",
    [["mailboxes"]],
    {
      onSuccess: (resp) => {
        toast({ title: resp?.data?.ok ? "الاتصال سليم" : "فشل الاتصال", description: resp?.data?.detail });
      },
    }
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const mailboxes = data?.data ?? [];

  return (
    <PageShell
      title="الصناديق المتصلة"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "الصناديق المتصلة" },
      ]}
      subtitle="مزامنة الإيميل من Microsoft 365 أو Hostinger أو IMAP عام"
      actions={
        <Button onClick={() => setOpenConnect(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          ربط صندوق جديد
        </Button>
      }
    >
      {mailboxes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="mb-1">لا توجد صناديق متصلة بعد</p>
            <p className="text-xs">اضغط "ربط صندوق جديد" لربط Microsoft 365 / Hostinger / IMAP</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {mailboxes.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-emerald-500" />
                    {m.displayName || m.emailAddress}
                  </span>
                  <Badge variant="outline">{PROVIDER_LABEL[m.provider]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-muted-foreground">{m.emailAddress}</div>
                {m.branchName && (
                  <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1">
                    <Mail className="w-3 h-3" />
                    فرع: {m.branchName}
                  </Badge>
                )}
                {m.imapHost && (
                  <div className="text-xs text-muted-foreground">
                    {m.imapHost}:{m.imapPort} ({m.imapUsername})
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  {m.lastSyncStatus === "ok" ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      آخر مزامنة سليمة
                    </Badge>
                  ) : m.lastSyncStatus ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {m.lastSyncStatus}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">لم تتم مزامنة بعد</Badge>
                  )}
                  {m.lastSyncedAt && (
                    <span className="text-muted-foreground">{new Date(m.lastSyncedAt).toLocaleString("ar")}</span>
                  )}
                </div>
                {m.lastSyncError && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">{m.lastSyncError}</p>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => testMut.mutate({ _id: m.id })}>
                    <FlaskConical className="w-3 h-3" />
                    اختبار
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => syncMut.mutate({ _id: m.id })}>
                    <RefreshCw className="w-3 h-3" />
                    مزامنة الآن
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => patchMut.mutate({ _id: m.id, syncEnabled: !m.syncEnabled })}
                    disabled={patchMut.isPending}
                    rateLimitAware
                  >
                    {m.syncEnabled ? "إيقاف المزامنة" : "تفعيل المزامنة"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 ms-auto text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm("هل أنت متأكد من فصل هذا الصندوق؟")) deleteMut.mutate({ _id: m.id });
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    فصل
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConnectDialog
        open={openConnect}
        onClose={() => setOpenConnect(false)}
        onSuccess={() => { setOpenConnect(false); refetch(); }}
      />
    </PageShell>
  );
}

function ConnectDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<Provider>("imap");
  const { data: branchesResp } = useApiQuery<{ data: { id: number; name: string }[] }>(
    ["branches-list"],
    "/settings/branches",
  );
  const branches = branchesResp?.data ?? [];
  const [form, setForm] = useState({
    displayName: "", emailAddress: "", branchId: "",
    imapHost: "", imapPort: 993, imapUsername: "", imapPassword: "",
    smtpHost: "", smtpPort: 587, smtpUsername: "", smtpPassword: "",
    accessToken: "", refreshToken: "", tenantId: "",
  });

  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/mailboxes",
    "POST",
    [["mailboxes"]],
    {
      onSuccess: () => { toast({ title: "تم ربط الصندوق" }); onSuccess(); },
    }
  );

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      provider,
      displayName: form.displayName || undefined,
      emailAddress: form.emailAddress,
      branchId: form.branchId ? Number(form.branchId) : undefined,
    };
    if (provider === "microsoft365") {
      Object.assign(payload, {
        accessToken: form.accessToken, refreshToken: form.refreshToken, tenantId: form.tenantId,
      });
    } else {
      Object.assign(payload, {
        imapHost: form.imapHost, imapPort: form.imapPort,
        imapUsername: form.imapUsername, imapPassword: form.imapPassword,
        smtpHost: form.smtpHost || undefined, smtpPort: form.smtpPort,
        smtpUsername: form.smtpUsername || undefined, smtpPassword: form.smtpPassword || undefined,
      });
    }
    createMut.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ربط صندوق بريد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm mb-1 block">المزود</label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="microsoft365">Microsoft 365 (Graph)</SelectItem>
                <SelectItem value="hostinger">Hostinger (IMAP/SMTP)</SelectItem>
                <SelectItem value="imap">IMAP عام</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="اسم العرض (اختياري)" value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            <Input placeholder="عنوان البريد" value={form.emailAddress}
              onChange={(e) => setForm({ ...form, emailAddress: e.target.value })} />
          </div>
          <div>
            <label className="text-sm mb-1 block">الفرع (اختياري — لربط الصندوق بفرع مشترك)</label>
            <Select
              value={form.branchId || "none"}
              onValueChange={(v) => setForm({ ...form, branchId: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="بدون فرع (صندوق شخصي)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون فرع (صندوق شخصي)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === "microsoft365" ? (
            <div className="space-y-3 rounded border border-border/40 p-3">
              <p className="text-sm">
                ربط صندوق Microsoft 365 يتم عبر تسجيل دخول آمن — سيُحوّلك للموقع الرسمي ثم يعود لك تلقائياً.
              </p>
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => { window.location.href = "/api/mailboxes/oauth/microsoft365/authorize"; }}
              >
                <Mail className="w-4 h-4" />
                تسجيل دخول بحساب Microsoft 365
              </Button>
              <p className="text-xs text-muted-foreground">
                التوكنات تُشفّر قبل الحفظ. أو ألصق Access/Refresh tokens يدوياً أدناه إذا كنت تعرفهم.
              </p>
              <Input placeholder="رمز الوصول (Access Token) — اختياري للإدخال اليدوي" value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
              <Input placeholder="رمز التجديد (Refresh Token) — اختياري" value={form.refreshToken}
                onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} />
              <Input placeholder="Azure Tenant ID (اختياري)" value={form.tenantId}
                onChange={(e) => setForm({ ...form, tenantId: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="خادم IMAP (مثل imap.hostinger.com)"
                  value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} />
                <Input type="number" placeholder="منفذ IMAP" value={form.imapPort}
                  onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })} />
                <Input placeholder="اسم مستخدم IMAP" value={form.imapUsername}
                  onChange={(e) => setForm({ ...form, imapUsername: e.target.value })} />
                <Input type="password" placeholder="كلمة مرور IMAP" value={form.imapPassword}
                  onChange={(e) => setForm({ ...form, imapPassword: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="خادم SMTP (اختياري)" value={form.smtpHost}
                  onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
                <Input type="number" placeholder="منفذ SMTP" value={form.smtpPort}
                  onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} />
                <Input placeholder="اسم مستخدم SMTP (اختياري)" value={form.smtpUsername}
                  onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
                <Input type="password" placeholder="كلمة مرور SMTP (اختياري)" value={form.smtpPassword}
                  onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الربط..." : "ربط"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
