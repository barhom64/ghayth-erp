/**
 * Client portal admin preview — wires every endpoint exposed by the
 * `/portal` API so the back-office can inspect what a logged-in client
 * sees. The portal itself is a separate client-facing app; this page
 * exists purely as an admin tool that reuses the same APIs.
 *
 * Endpoints (26):
 *   POST   /portal/auth/login                    — dev login switcher
 *   GET    /portal/me                            — current portal identity
 *   GET    /portal/dashboard                     — KPIs
 *   GET    /portal/invoices                      — invoice list
 *   GET    /portal/invoices/:id                  — invoice detail
 *   GET    /portal/tickets                       — ticket list
 *   POST   /portal/tickets                       — create ticket
 *   GET    /portal/tickets/:id                   — ticket detail
 *   GET    /portal/tickets/:id/replies           — reply thread
 *   POST   /portal/tickets/:id/replies           — post reply
 *   PATCH  /portal/profile/password              — change password
 *   POST   /portal/invoices/:id/pay              — record portal payment
 *   POST   /portal/tickets/:id/csat              — submit satisfaction score
 *   GET    /portal/kb                            — knowledge-base index
 *   GET    /portal/kb/:id                        — KB article
 *   POST   /portal/kb/:id/feedback               — mark helpful / not
 *   GET    /portal/projects                      — client projects list
 *   GET    /portal/projects/:id                  — project detail
 *   GET    /portal/umrah/invoices                — umrah-only invoice view
 *   GET    /portal/umrah/groups                  — assigned umrah groups
 *   GET    /portal/umrah/payments                — umrah payment ledger
 *   GET    /portal/property/contracts            — leasing contracts
 *   GET    /portal/property/rent-payments        — rent payment history
 *   GET    /portal/property/maintenance-requests — open work orders
 *   GET    /portal/legal/cases                   — legal case visibility
 *   GET    /portal/legal/sessions/upcoming       — court session calendar
 *
 * The page renders each section as a collapsible card. Empty/error
 * states fall through gracefully so a client without (say) legal cases
 * still loads.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  UserCircle, LayoutDashboard, FileText, MessageSquare, BookOpen,
  Briefcase, Plane, Building, Scale, KeyRound, CreditCard, Star,
} from "lucide-react";

export default function ClientPortalAdminPage() {
  const { toast } = useToast();

  // Active selectors so detail endpoints can fetch a single row.
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [kbId, setKbId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);

  // ── identity + dashboard
  const meQ = useApiQuery<any>(["portal-me"], "/portal/me");
  const dashQ = useApiQuery<any>(["portal-dashboard"], "/portal/dashboard");

  // ── invoices
  const invoicesQ = useApiQuery<{ data: any[] }>(["portal-invoices"], "/portal/invoices");
  const invoiceDetailQ = useApiQuery<any>(
    ["portal-invoice", String(invoiceId ?? 0)],
    invoiceId ? `/portal/invoices/${invoiceId}` : null,
    !!invoiceId,
  );

  // ── tickets + replies + CSAT
  const ticketsQ = useApiQuery<{ data: any[] }>(["portal-tickets"], "/portal/tickets");
  const ticketDetailQ = useApiQuery<any>(
    ["portal-ticket", String(ticketId ?? 0)],
    ticketId ? `/portal/tickets/${ticketId}` : null,
    !!ticketId,
  );
  const repliesQ = useApiQuery<{ data: any[] }>(
    ["portal-ticket-replies", String(ticketId ?? 0)],
    ticketId ? `/portal/tickets/${ticketId}/replies` : null,
    !!ticketId,
  );

  // ── knowledge base
  const kbQ = useApiQuery<{ data: any[] }>(["portal-kb"], "/portal/kb");
  const kbDetailQ = useApiQuery<any>(
    ["portal-kb-article", String(kbId ?? 0)],
    kbId ? `/portal/kb/${kbId}` : null,
    !!kbId,
  );

  // ── projects
  const projectsQ = useApiQuery<{ data: any[] }>(["portal-projects"], "/portal/projects");
  const projectDetailQ = useApiQuery<any>(
    ["portal-project", String(projectId ?? 0)],
    projectId ? `/portal/projects/${projectId}` : null,
    !!projectId,
  );

  // ── umrah
  const umrahInvoicesQ = useApiQuery<{ data: any[] }>(["portal-umrah-invoices"], "/portal/umrah/invoices");
  const umrahGroupsQ = useApiQuery<{ data: any[] }>(["portal-umrah-groups"], "/portal/umrah/groups");
  const umrahPaymentsQ = useApiQuery<{ data: any[] }>(["portal-umrah-payments"], "/portal/umrah/payments");

  // ── property
  const propContractsQ = useApiQuery<{ data: any[] }>(["portal-prop-contracts"], "/portal/property/contracts");
  const propRentsQ = useApiQuery<{ data: any[] }>(["portal-prop-rents"], "/portal/property/rent-payments");
  const propMaintenanceQ = useApiQuery<{ data: any[] }>(["portal-prop-maintenance"], "/portal/property/maintenance-requests");

  // ── legal
  const legalCasesQ = useApiQuery<{ data: any[] }>(["portal-legal-cases"], "/portal/legal/cases");
  const legalUpcomingQ = useApiQuery<{ data: any[] }>(["portal-legal-upcoming"], "/portal/legal/sessions/upcoming");

  // ── auth dev-login (admins use the same endpoint to spoof a portal user)
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const handleLogin = async () => {
    try {
      const res: any = await apiFetch("/portal/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      toast({ title: "تم تسجيل الدخول للعميل", description: res?.email ?? loginEmail });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الدخول", description: err?.message });
    }
  };

  // ── password change
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const handlePwd = async () => {
    try {
      await apiFetch("/portal/profile/password", {
        method: "PATCH",
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      toast({ title: "تم تغيير كلمة المرور" });
      setOldPwd(""); setNewPwd("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التغيير", description: err?.message });
    }
  };

  // ── invoice pay (portal users record their own payment)
  const handlePayInvoice = async (id: number) => {
    try {
      await apiFetch(`/portal/invoices/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: "card" }),
      });
      toast({ title: "تم تسجيل الدفعة" });
      invoicesQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر الدفع", description: err?.message });
    }
  };

  // ── ticket create + reply + csat
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const handleCreateTicket = async () => {
    if (!newTicketSubject.trim()) return;
    try {
      await apiFetch("/portal/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: newTicketSubject, description: newTicketSubject }),
      });
      toast({ title: "تم فتح التذكرة" });
      setNewTicketSubject("");
      ticketsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر الإنشاء", description: err?.message });
    }
  };

  const [replyDraft, setReplyDraft] = useState("");
  const handleReply = async () => {
    if (!ticketId || !replyDraft.trim()) return;
    try {
      await apiFetch(`/portal/tickets/${ticketId}/replies`, {
        method: "POST",
        body: JSON.stringify({ body: replyDraft }),
      });
      toast({ title: "تم إرسال الرد" });
      setReplyDraft("");
      repliesQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: err?.message });
    }
  };

  const handleCsat = async (score: number) => {
    if (!ticketId) return;
    try {
      await apiFetch(`/portal/tickets/${ticketId}/csat`, {
        method: "POST",
        body: JSON.stringify({ score }),
      });
      toast({ title: `تم تسجيل التقييم: ${score}/5` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التقييم", description: err?.message });
    }
  };

  const handleKbFeedback = async (id: number, helpful: boolean) => {
    try {
      await apiFetch(`/portal/kb/${id}/feedback`, {
        method: "POST",
        body: JSON.stringify({ helpful }),
      });
      toast({ title: "شكراً للملاحظة" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: err?.message });
    }
  };

  return (
    <PageShell
      title="معاينة بوابة العميل"
      subtitle="عرض كل ما يراه العميل عند تسجيل دخوله للبوابة، يستخدمه فريق الدعم للتحقّق"
      breadcrumbs={[{ label: "الإدارة" }, { label: "بوابة العميل" }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── identity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-status-info" />الهوية المختارة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px]">بريد العميل</Label>
              <Input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} dir="ltr" className="h-7 text-xs" />
              <Label className="text-[10px]">كلمة المرور</Label>
              <Input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} type="password" dir="ltr" className="h-7 text-xs" />
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleLogin}>
                <KeyRound className="h-3 w-3 me-1" />دخول كعميل
              </GuardedButton>
            </div>
            {meQ.data && (
              <div className="border-t pt-2 grid grid-cols-2 gap-1">
                {Object.entries(meQ.data).filter(([, v]) => typeof v !== "object").slice(0, 6).map(([k, v]) => (
                  <span key={k}>{k}: <span className="font-mono">{String(v)}</span></span>
                ))}
              </div>
            )}
            <div className="border-t pt-2 space-y-1">
              <Label className="text-[10px]">كلمة مرور حالية</Label>
              <Input value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} type="password" className="h-7 text-xs" dir="ltr" />
              <Label className="text-[10px]">كلمة مرور جديدة</Label>
              <Input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} type="password" className="h-7 text-xs" dir="ltr" />
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handlePwd}>
                تغيير كلمة المرور
              </GuardedButton>
            </div>
          </CardContent>
        </Card>

        {/* ── dashboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />لوحة العميل
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            {dashQ.isLoading ? <LoadingSpinner /> : (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(dashQ.data ?? {}).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
                  <div key={k} className="border rounded p-1.5">
                    <p className="text-muted-foreground text-[10px]">{k}</p>
                    <p className="font-mono">{v == null ? "—" : String(v)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />الفواتير ({(invoicesQ.data?.data ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs max-h-48 overflow-y-auto">
              {(invoicesQ.data?.data ?? []).slice(0, 30).map((inv: any) => (
                <div key={inv.id} className="px-3 py-1.5 flex items-center justify-between">
                  <button type="button" className="text-start" onClick={() => setInvoiceId(inv.id)}>
                    <span className="font-mono">{inv.ref ?? inv.invoiceNumber ?? `#${inv.id}`}</span>
                    {inv.total != null && <span className="ms-2 font-mono">{formatCurrency(Number(inv.total))}</span>}
                  </button>
                  <GuardedButton perm="admin:update" variant="ghost" size="sm" rateLimitAware onClick={() => handlePayInvoice(inv.id)}>
                    <CreditCard className="h-3 w-3" />
                  </GuardedButton>
                </div>
              ))}
            </div>
            {invoiceDetailQ.data && (
              <div className="border-t p-2 text-[10px] grid grid-cols-2 gap-1">
                {Object.entries(invoiceDetailQ.data).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
                  <span key={k}>{k}: <span className="font-mono">{String(v)}</span></span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── tickets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />التذاكر ({(ticketsQ.data?.data ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={newTicketSubject} onChange={(e) => setNewTicketSubject(e.target.value)} placeholder="عنوان تذكرة جديدة" className="h-7 text-xs" />
              <GuardedButton perm="admin:create" size="sm" rateLimitAware onClick={handleCreateTicket}>إنشاء</GuardedButton>
            </div>
            <div className="divide-y text-xs max-h-32 overflow-y-auto border rounded">
              {(ticketsQ.data?.data ?? []).slice(0, 20).map((t: any) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTicketId(t.id)}
                  className={`w-full px-2 py-1 text-start hover:bg-surface-subtle ${ticketId === t.id ? "bg-status-info-surface/40" : ""}`}
                >
                  <span className="font-mono">#{t.id}</span> {t.subject}
                  <Badge variant="outline" className="ms-2 text-[10px]">{t.status}</Badge>
                </button>
              ))}
            </div>
            {ticketId && (
              <div className="border-t pt-2 space-y-2">
                {ticketDetailQ.data && (
                  <p className="text-[10px] text-muted-foreground">
                    {ticketDetailQ.data.priority} · {ticketDetailQ.data.status}
                  </p>
                )}
                <div className="text-[10px] divide-y border rounded max-h-24 overflow-y-auto">
                  {(repliesQ.data?.data ?? []).map((r: any, i: number) => (
                    <div key={r.id ?? i} className="p-1.5">
                      <span className="font-mono text-muted-foreground">{r.author ?? "—"}: </span>{r.body}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="ردّك" className="h-7 text-xs" />
                  <GuardedButton perm="admin:create" size="sm" rateLimitAware onClick={handleReply}>إرسال</GuardedButton>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground">تقييم:</span>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleCsat(s)}
                      className="hover:text-status-warning-foreground"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── knowledge base */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />قاعدة المعرفة ({(kbQ.data?.data ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs max-h-48 overflow-y-auto">
              {(kbQ.data?.data ?? []).slice(0, 30).map((a: any) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setKbId(a.id)}
                  className="w-full px-3 py-1.5 text-start hover:bg-surface-subtle"
                >
                  {a.title}
                </button>
              ))}
            </div>
            {kbDetailQ.data && (
              <div className="border-t p-2 space-y-1 text-[10px]">
                <p className="font-medium">{kbDetailQ.data.title}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{(kbDetailQ.data.content ?? "").slice(0, 200)}…</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" rateLimitAware onClick={() => handleKbFeedback(kbDetailQ.data.id, true)}>مفيد</Button>
                  <Button size="sm" variant="outline" rateLimitAware onClick={() => handleKbFeedback(kbDetailQ.data.id, false)}>غير مفيد</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── projects */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" />المشاريع ({(projectsQ.data?.data ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs max-h-48 overflow-y-auto">
              {(projectsQ.data?.data ?? []).slice(0, 20).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className="w-full px-3 py-1.5 text-start hover:bg-surface-subtle"
                >
                  {p.name ?? p.title ?? `مشروع #${p.id}`}
                </button>
              ))}
            </div>
            {projectDetailQ.data && (
              <div className="border-t p-2 text-[10px] grid grid-cols-2 gap-1">
                {Object.entries(projectDetailQ.data).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
                  <span key={k}>{k}: <span className="font-mono">{String(v)}</span></span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── umrah trio */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plane className="h-4 w-4" />العمرة
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-muted-foreground">فواتير ({(umrahInvoicesQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(umrahInvoicesQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1 font-mono">{x.ref ?? `#${x.id}`}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">مجموعات ({(umrahGroupsQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(umrahGroupsQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1">{x.name ?? `مجموعة #${x.id}`}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">دفعات ({(umrahPaymentsQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(umrahPaymentsQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1 font-mono">{formatCurrency(Number(x.amount ?? 0))}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── property trio */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building className="h-4 w-4" />العقارات
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-muted-foreground">عقود الإيجار ({(propContractsQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(propContractsQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1">{x.ref ?? `#${x.id}`}</div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">دفعات الإيجار ({(propRentsQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(propRentsQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1 font-mono">
                    {formatCurrency(Number(x.amount ?? 0))}
                    {x.paidAt && <span className="ms-2 text-muted-foreground">{formatDateAr(x.paidAt)}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">طلبات صيانة ({(propMaintenanceQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(propMaintenanceQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1">{x.title ?? `#${x.id}`}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── legal duo */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" />القضايا
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="text-muted-foreground">القضايا ({(legalCasesQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(legalCasesQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1">
                    <span className="font-mono">{x.caseNumber ?? `#${x.id}`}</span>
                    <span className="ms-2">{x.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">الجلسات القادمة ({(legalUpcomingQ.data?.data ?? []).length})</p>
              <div className="divide-y border rounded max-h-32 overflow-y-auto">
                {(legalUpcomingQ.data?.data ?? []).slice(0, 10).map((x: any) => (
                  <div key={x.id} className="px-2 py-1">
                    {x.sessionDate && formatDateAr(x.sessionDate)}
                    {x.location && <span className="ms-2">{x.location}</span>}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </PageShell>
  );
}
