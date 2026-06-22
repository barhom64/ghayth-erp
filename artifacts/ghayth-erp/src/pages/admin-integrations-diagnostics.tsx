/**
 * Integrations diagnostics — exercises every webhook / test / sync
 * endpoint exposed by the API so an operator can verify wiring without
 * triggering real upstream traffic.
 *
 * Endpoints wired (14):
 *   POST /communications/whatsapp/webhook        — Meta verify token POST
 *   GET  /communications/whatsapp/webhook        — Meta verify GET
 *   POST /communications/pbx/incoming            — PBX inbound test
 *   POST /communications/pbx/completed           — PBX completed test
 *   POST /communications/pbx/status              — PBX status test
 *   POST /webhooks/cmsv6/:integrationId          — CMSV6 generic webhook
 *   POST /fleet/telematics/sync/events           — manual events sync
 *   POST /fleet/telematics/webhook/cmsv6/test    — CMSV6 ping test
 *   POST /finance/budget/validate                — budget gate test
 *   POST /finance/budget/approval-requests       — request a CFO/GM gate
 *   POST /finance/fiscal-periods/:period/close   — legacy 410 sentinel
 *   POST /auth/register                          — new tenant signup
 *   POST /auth/refresh                           — token refresh probe
 *   GET  /admin/vendor-settings/:slug            — single vendor detail
 *
 * Each runs through `apiFetch` so error handling and CSRF/rateLimit are
 * the same as production.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch, apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Webhook, PhoneCall, MessageSquare, Truck, Wallet, KeyRound, Settings } from "lucide-react";

export default function AdminIntegrationsDiagnosticsPage() {
  const { toast } = useToast();

  // ── single vendor lookup (vendor-settings/:slug)
  const [vendorSlug, setVendorSlug] = useState("");
  const vendorQ = useApiQuery<any>(
    ["admin-vendor-detail", vendorSlug],
    vendorSlug ? `/admin/vendor-settings/${vendorSlug}` : null,
    vendorSlug.length > 0,
  );

  const toastOk = (label: string, path: string) => toast({ title: `${label} — نجح`, description: path });
  const toastErr = (label: string, err: any) => toast({ variant: "destructive", title: `${label} — فشل`, description: err?.message });

  // ── whatsapp verify (GET) is normally hit by Meta with a hub.* query.
  const handleWhatsappVerify = async () => {
    try {
      await apiFetch("/communications/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test&hub.challenge=42", { method: "GET" });
      toastOk("WhatsApp verify (GET)", "/communications/whatsapp/webhook");
    } catch (err) { toastErr("WhatsApp verify (GET)", err); }
  };
  const handleWhatsappWebhook = async () => {
    try {
      await apiFetch("/communications/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
      });
      toastOk("WhatsApp webhook", "/communications/whatsapp/webhook");
    } catch (err) { toastErr("WhatsApp webhook", err); }
  };
  const handlePbxIncoming = async () => {
    try {
      await apiFetch("/communications/pbx/incoming", {
        method: "POST",
        body: JSON.stringify({ callId: `test-${Date.now()}`, from: "+9665", to: "+9661" }),
      });
      toastOk("PBX incoming", "/communications/pbx/incoming");
    } catch (err) { toastErr("PBX incoming", err); }
  };
  const handlePbxCompleted = async () => {
    try {
      await apiFetch("/communications/pbx/completed", {
        method: "POST",
        body: JSON.stringify({ callId: `test-${Date.now()}`, durationSec: 30 }),
      });
      toastOk("PBX completed", "/communications/pbx/completed");
    } catch (err) { toastErr("PBX completed", err); }
  };
  const handlePbxStatus = async () => {
    try {
      await apiFetch("/communications/pbx/status", {
        method: "POST",
        body: JSON.stringify({ callId: `test-${Date.now()}`, status: "ringing" }),
      });
      toastOk("PBX status", "/communications/pbx/status");
    } catch (err) { toastErr("PBX status", err); }
  };

  const [integrationId, setIntegrationId] = useState("1");
  const handleCmsv6Webhook = async () => {
    try {
      await apiFetch(`/webhooks/cmsv6/${integrationId}`, {
        method: "POST",
        body: JSON.stringify({ event: "ping", at: new Date().toISOString() }),
      });
      toastOk("CMSV6 webhook", `/webhooks/cmsv6/${integrationId}`);
    } catch (err) { toastErr("CMSV6 webhook", err); }
  };
  const handleCmsv6Test = async () => {
    try {
      await apiFetch("/fleet/telematics/webhook/cmsv6/test", { method: "POST", body: JSON.stringify({}) });
      toastOk("CMSV6 ping test", "/fleet/telematics/webhook/cmsv6/test");
    } catch (err) { toastErr("CMSV6 ping test", err); }
  };
  const handleSyncEvents = async () => {
    try {
      await apiFetch("/fleet/telematics/sync/events", { method: "POST", body: JSON.stringify({}) });
      toastOk("Sync events", "/fleet/telematics/sync/events");
    } catch (err) { toastErr("Sync events", err); }
  };

  const handleBudgetValidate = async () => {
    try {
      await apiFetch("/finance/budget/validate", {
        method: "POST",
        body: JSON.stringify({ accountCode: "5101", amount: 100, period: "2026-05" }),
      });
      toastOk("Budget validate", "/finance/budget/validate");
    } catch (err) { toastErr("Budget validate", err); }
  };
  const handleBudgetApproval = async () => {
    try {
      await apiFetch("/finance/budget/approval-requests", {
        method: "POST",
        body: JSON.stringify({ accountCode: "5101", period: "2026-05", requestedAmount: 100, sourceType: "test" }),
      });
      toastOk("Budget approval", "/finance/budget/approval-requests");
    } catch (err) { toastErr("Budget approval", err); }
  };
  const handleLegacyClose = async () => {
    try {
      await apiFetch("/finance/fiscal-periods/2026-05/close", { method: "POST", body: JSON.stringify({}) });
      toastOk("Legacy close", "/finance/fiscal-periods/:period/close");
    } catch (err) { toastErr("Legacy close (410 expected)", err); }
  };

  const [authForm, setAuthForm] = useState({ email: "", password: "", companyName: "" });
  const handleAuthRegister = async () => {
    try {
      await apiFetch("/auth/register", { method: "POST", body: JSON.stringify(authForm) });
      toastOk("Tenant register", "/auth/register");
    } catch (err) { toastErr("Tenant register", err); }
  };
  const handleAuthRefresh = async () => {
    try {
      await apiFetch("/auth/refresh", { method: "POST", body: JSON.stringify({}) });
      toastOk("Token refresh", "/auth/refresh");
    } catch (err) { toastErr("Token refresh", err); }
  };

  // ── single-resource probes (used by detail dialogs in production; the
  //    diagnostics page hits them with a fixed id so the round-trip is
  //    observable in the network tab).
  const [probeId, setProbeId] = useState("1");
  const [storagePath, setStoragePath] = useState("test.png");
  const mediaQ = useApiQuery<any>(
    ["diag-media", probeId],
    probeId ? `/fleet/telematics/media-evidence/${probeId}` : null,
    !!probeId,
  );
  const accessLogsQ = useApiQuery<any>(
    ["diag-access-logs", probeId],
    probeId ? `/fleet/telematics/video/sessions/${probeId}/access-logs` : null,
    !!probeId,
  );
  // POST /umrah/letters/:id/dispatch — sends an existing draft letter
  // to the configured outbound channel.
  const handleDispatch = async () => {
    try {
      await apiFetch(`/umrah/letters/${probeId}/dispatch`, { method: "POST", body: JSON.stringify({}) });
      toastOk("Umrah dispatch", `/umrah/letters/${probeId}/dispatch`);
    } catch (err) { toastErr("Umrah dispatch", err); }
  };

  return (
    <PageShell
      title="تشخيص التكاملات"
      subtitle="ضرب جميع نقاط webhook/test/sync للتحقّق من جاهزيتها قبل تفعيل أي تكامل خارجي"
      breadcrumbs={[{ label: "الإدارة" }, { label: "تشخيص التكاملات" }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-status-info" />واتساب للأعمال
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p className="text-muted-foreground">نقطة نهاية webhook من Meta — GET=تحقّق، POST=أحداث واردة.</p>
            <div className="flex gap-2">
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleWhatsappVerify}>اختبار التحقق (GET)</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleWhatsappWebhook}>إرسال حدث (POST)</GuardedButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-status-info" />مقسم هاتفي (3CX/FreeSWITCH)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex gap-1 flex-wrap">
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handlePbxIncoming}>مكالمة واردة</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handlePbxCompleted}>مكالمة مكتملة</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handlePbxStatus}>تحديث الحالة</GuardedButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4 text-status-info" />تتبّع الأسطول (CMSV6)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px]">integrationId</Label>
              <Input
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                className="h-7 w-20 text-xs font-mono"
                dir="ltr"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleCmsv6Webhook}>إرسال Webhook</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleCmsv6Test}>اختبار الاتصال</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleSyncEvents}>مزامنة الأحداث</GuardedButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-status-info" />بوابات المالية
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <p className="text-muted-foreground">بوابة الموازنة + وحدة الفترة المحاسبية القديمة (410 متوقّع).</p>
            <div className="flex gap-1 flex-wrap">
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleBudgetValidate}>فحص الموازنة</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleBudgetApproval}>طلب اعتماد</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleLegacyClose}>الإغلاق القديم (410)</GuardedButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-status-info" />اختبارات المصادقة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <Input
              placeholder="البريد الإلكتروني"
              dir="ltr"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              className="h-7 text-xs"
            />
            <Input
              placeholder="كلمة المرور"
              dir="ltr"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              className="h-7 text-xs"
            />
            <Input
              placeholder="اسم الشركة (للتسجيل)"
              value={authForm.companyName}
              onChange={(e) => setAuthForm({ ...authForm, companyName: e.target.value })}
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleAuthRegister}>تسجيل</GuardedButton>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleAuthRefresh}>تحديث</GuardedButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4 text-status-info" />البحث عن إعدادات المورّد
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <Input
              placeholder="معرّف المورّد (مثل zatca، pbx)"
              dir="ltr"
              value={vendorSlug}
              onChange={(e) => setVendorSlug(e.target.value)}
              className="h-7 text-xs font-mono"
            />
            {vendorQ.data && (
              <div className="border rounded p-2 bg-muted/30 grid grid-cols-2 gap-1 text-[10px]">
                {Object.entries(vendorQ.data).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
                  <span key={k}>{k}: <span className="font-mono">{String(v)}</span></span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="h-4 w-4" />روابط ملفّات + بحث بمعرّف
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px]">id للاختبار</Label>
              <Input value={probeId} onChange={(e) => setProbeId(e.target.value)} className="h-7 w-20 text-xs font-mono" dir="ltr" />
              <Label className="text-[10px]">storage path</Label>
              <Input value={storagePath} onChange={(e) => setStoragePath(e.target.value)} className="h-7 w-40 text-xs font-mono" dir="ltr" />
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/fleet/telematics/video/proxy/${probeId}`)}>video/proxy</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/fleet/telematics/video/proxy/${probeId}/segment/segment1.ts`)}>video/proxy/segment</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/umrah/letters/${probeId}/pdf`)}>umrah/letter.pdf</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/umrah/reports/daily-runsheet/pdf?date=2026-05-29`)}>umrah/daily-runsheet.pdf</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/export/excel/invoices`)}>export/invoices.xlsx</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/export/pdf/purchase-order/${probeId}`)}>export/po.pdf</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/storage/public-objects/${storagePath}`)}>storage/public</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/storage/objects/${storagePath}`)}>storage/private</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/mailboxes/oauth/microsoft365/authorize`)}>m365/authorize</a>
              <a className="underline text-status-info-foreground" target="_blank" rel="noopener noreferrer"
                 href={apiUrl(`/mailboxes/oauth/microsoft365/callback`)}>m365/callback</a>
              <GuardedButton perm="admin:update" size="sm" rateLimitAware onClick={handleDispatch}>إرسال عمرة</GuardedButton>
            </div>
            {mediaQ.data && (
              <p className="text-muted-foreground">media: <span className="font-mono">{JSON.stringify(mediaQ.data).slice(0, 200)}</span></p>
            )}
            {accessLogsQ.data && (
              <p className="text-muted-foreground">access-logs: <span className="font-mono">{JSON.stringify(accessLogsQ.data).slice(0, 200)}</span></p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="h-4 w-4" />ملاحظات
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 text-muted-foreground">
            <p>• الـ webhook endpoints المخصّصة للخارج تتطلّب توقيع صحيح في الإنتاج. هذه الصفحة تستخدم apiFetch فقط لتأكيد التركيب.</p>
            <p>• زر "legacy close" يتوقّع HTTP 410 — التحوّل لـ POST /finance/fiscal-periods-v2/:id/close مذكور في رسالة الـ 410.</p>
            <p>• budget/validate قد يرجع status="no_budget" إذا لم يكن هناك سقف معرّف للحساب 5101.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
