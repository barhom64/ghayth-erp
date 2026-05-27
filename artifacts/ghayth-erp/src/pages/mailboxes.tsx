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
  const [form, setForm] = useState({
    displayName: "", emailAddress: "",
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

          {provider === "microsoft365" ? (
            <div className="space-y-2">
              <Input placeholder="Access Token" value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
              <Input placeholder="Refresh Token" value={form.refreshToken}
                onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} />
              <Input placeholder="Azure Tenant ID" value={form.tenantId}
                onChange={(e) => setForm({ ...form, tenantId: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                التوكنات تُشفّر قبل الحفظ. مسار OAuth التلقائي يضاف لاحقاً.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="IMAP Host (e.g. imap.hostinger.com)"
                  value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })} />
                <Input type="number" placeholder="IMAP Port" value={form.imapPort}
                  onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })} />
                <Input placeholder="IMAP Username" value={form.imapUsername}
                  onChange={(e) => setForm({ ...form, imapUsername: e.target.value })} />
                <Input type="password" placeholder="IMAP Password" value={form.imapPassword}
                  onChange={(e) => setForm({ ...form, imapPassword: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="SMTP Host (اختياري)" value={form.smtpHost}
                  onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
                <Input type="number" placeholder="SMTP Port" value={form.smtpPort}
                  onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} />
                <Input placeholder="SMTP Username (اختياري)" value={form.smtpUsername}
                  onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
                <Input type="password" placeholder="SMTP Password (اختياري)" value={form.smtpPassword}
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
