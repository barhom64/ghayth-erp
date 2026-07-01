/**
 * Admin → Vendor Settings (#1139 §6).
 *
 * Single hub where the operator wires every external integration —
 * PBX webhook signing, WhatsApp Cloud API, SMTP, web push VAPID, SIEM
 * forwarder, ZATCA endpoints. Every secret stored encrypted at rest
 * (server-side via secrets.ts); the GET response returns "*****" in
 * place of stored values so nothing leaks back to the browser.
 *
 * Each section card has:
 *   - status badge (active / disabled / env-fallback / unconfigured)
 *   - editable form for that vendor's keys
 *   - "Save" + "Test" buttons
 *   - source indicator (DB row / env var / none)
 */
import { useState, useEffect } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Settings, Phone, MessageSquare, Mail, Bell, Shield, Receipt,
  CheckCircle2, AlertOctagon, Save, FlaskConical, Smartphone,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

interface VendorRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "disabled";
  config: Record<string, unknown>;
  effectiveSource: "db" | "env" | "none";
  effectiveActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  source?: "db" | "env" | "none";
}

const SLUG_META: Record<string, {
  icon: typeof Settings;
  fields: Array<{ key: string; label: string; type?: "password" | "text" | "url" | "number"; placeholder?: string; hint?: string }>;
}> = {
  "pbx-webhook": {
    icon: Phone,
    fields: [
      { key: "webhookSecret", label: "سر توقيع Webhook", type: "password",
        placeholder: "32 بايت hex (استخدم زرّ التوليد في /admin/pbx-control)",
        hint: "يُستخدم لتوقيع كل webhook وارد من مزوّد PBX." },
    ],
  },
  "whatsapp": {
    icon: MessageSquare,
    fields: [
      { key: "accessToken", label: "رمز الوصول (Access Token)", type: "password",
        placeholder: "Meta Graph access token",
        hint: "Permanent System User token من Meta Business." },
      { key: "verifyToken", label: "رمز التحقق (Verify Token)", type: "password",
        placeholder: "نص يتطابق مع ما يضبطه Meta في إعداد الـ webhook." },
      { key: "phoneId", label: "معرّف رقم الهاتف", type: "text",
        placeholder: "مثل 1234567890" },
      { key: "appSecret", label: "سر التطبيق (App Secret)", type: "password",
        placeholder: "Meta App Secret",
        hint: "يُستخدم للتحقق من X-Hub-Signature-256 على inbound." },
    ],
  },
  "smtp": {
    icon: Mail,
    fields: [
      { key: "host", label: "خادم SMTP", type: "text", placeholder: "smtp.hostinger.com" },
      { key: "port", label: "المنفذ", type: "number", placeholder: "465" },
      { key: "user", label: "اسم المستخدم (البريد الكامل)", type: "text", placeholder: "rep@door.sa" },
      { key: "password", label: "كلمة المرور / كلمة مرور التطبيق", type: "password",
        hint: "تُشفَّر في قاعدة البيانات ولا تُعرض مرة أخرى. لا تُملأ تلقائيًا من أي preset." },
      { key: "from", label: "بريد المرسل", type: "text", placeholder: "rep@door.sa" },
      { key: "fromName", label: "اسم المرسل الظاهر", type: "text", placeholder: "نظام غيث" },
      { key: "replyTo", label: "بريد الرد (Reply-To)", type: "text", placeholder: "rep@door.sa" },
      { key: "secure", label: "تشفير TLS (true/false)", type: "text", placeholder: "true (SSL :465) أو false (STARTTLS :587)" },
      { key: "fallbackPort", label: "منفذ احتياطي (اختياري)", type: "number",
        placeholder: "587", hint: "يحاول العامل عليه بـ STARTTLS إذا فشل المنفذ الأساسي." },
    ],
  },
  "sms": {
    icon: Smartphone,
    fields: [
      { key: "accountSid", label: "معرّف الحساب (Account SID)", type: "text",
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        hint: "من لوحة تحكم Twilio. إعداد الشركة (إن وُجد) يتجاوز هذا الإعداد العام." },
      { key: "authToken", label: "رمز المصادقة (Auth Token)", type: "password",
        placeholder: "Twilio Auth Token",
        hint: "يُشفَّر في قاعدة البيانات ولا يُعرض مرة أخرى." },
      { key: "fromNumber", label: "رقم المرسل", type: "text",
        placeholder: "+14155552671",
        hint: "رقم Twilio بصيغة E.164." },
    ],
  },
  "vapid": {
    icon: Bell,
    fields: [
      { key: "publicKey", label: "المفتاح العام VAPID", type: "text",
        placeholder: "base64url EC P-256 — ~87 char",
        hint: "ولّد بـ: web-push generate-vapid-keys" },
      { key: "privateKey", label: "المفتاح الخاص VAPID", type: "password",
        placeholder: "base64url EC P-256 — ~43 char" },
      { key: "subject", label: "الموضوع", type: "text",
        placeholder: "mailto:admin@example.com" },
    ],
  },
  "siem": {
    icon: Shield,
    fields: [
      { key: "webhookUrl", label: "رابط Webhook لنظام SIEM", type: "url",
        placeholder: "https://siem.example.com/ingest" },
      { key: "authHeader", label: "ترويسة التفويض (Authorization) — اختياري", type: "password",
        placeholder: "Bearer xxx أو Basic xxx",
        hint: "يُرسَل في كل event كرأس Authorization." },
    ],
  },
  "zatca": {
    icon: Receipt,
    fields: [
      { key: "defaultProvider", label: "المزوّد الافتراضي", type: "text",
        placeholder: "fatoora أو direct" },
      { key: "prodUrl", label: "رابط الإنتاج", type: "url",
        placeholder: "https://gw-apic-gov.gazt.gov.sa/e-invoicing/core/" },
      { key: "sandboxUrl", label: "رابط بيئة الاختبار", type: "url",
        placeholder: "https://gw-apic-gov.gazt.gov.sa/e-invoicing/developer-portal/" },
    ],
  },
};

/**
 * Provider presets for the system-email card (#2137 §4). Selecting a
 * preset fills hosts/ports/security defaults + the rep@door.sa identity
 * fields — NEVER the password (the operator types that once and it is
 * encrypted server-side).
 */
const SMTP_PRESETS: Record<string, { label: string; values: Record<string, string> }> = {
  hostinger: {
    label: "Hostinger",
    values: {
      host: "smtp.hostinger.com", port: "465", secure: "true", fallbackPort: "587",
      user: "rep@door.sa", from: "rep@door.sa", fromName: "نظام غيث", replyTo: "rep@door.sa",
    },
  },
  microsoft365: {
    label: "Microsoft 365",
    values: { host: "smtp.office365.com", port: "587", secure: "false", fallbackPort: "" },
  },
  gmail: {
    label: "Gmail SMTP",
    values: { host: "smtp.gmail.com", port: "465", secure: "true", fallbackPort: "587" },
  },
  zoho: {
    label: "Zoho",
    values: { host: "smtp.zoho.com", port: "465", secure: "true", fallbackPort: "587" },
  },
};

export default function AdminVendorSettings() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: VendorRow[] }>(
    ["vendor-settings"], "/admin/vendor-settings",
  );
  // WhatsApp + push (VAPID) are configured/read from «قنوات الاتصال»
  // (system_settings) + env at runtime, and ZATCA from «هيئة الزكاة» (zatca_settings).
  // Their vendor_secrets rows here are dead duplicates, so they're hidden to avoid a
  // misleading second config surface that the runtime never reads.
  const MOVED_SLUGS = new Set(["whatsapp", "vapid", "zatca"]);
  const vendors = (data?.data ?? []).filter((v) => !MOVED_SLUGS.has(v.slug));

  return (
    <PageShell
      title="إعدادات المزوّدات الخارجية"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "إعدادات المزوّدات الخارجية" },
      ]}
      subtitle="أسرار التكاملات الخلفية — PBX والبريد وSMS وSIEM. مشفّرة في DB، وتُقرأ من البيئة عند فقدان السجل."
      actions={
        <RefreshAction onRefresh={() => refetch()} />
      }
    >
      <PageStateWrapper isLoading={isLoading && vendors.length === 0} error={error} onRetry={refetch}>
        <div className="space-y-4">
          {vendors.map((v) => (
            <VendorCard key={v.slug} vendor={v} onChange={refetch} />
          ))}
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            هذه الصفحة للأسرار الخلفية فقط (مفاتيح المزوّدين المشفّرة).
            واتساب والإشعارات الفورية تُضبط من «قنوات الاتصال» في الإعدادات، وهيئة الزكاة من تبويب «هيئة الزكاة والضريبة»،
            والربط التقني (استقبال واتساب، الويب هوك، GitHub) من «مركز التكاملات».
          </div>
          {vendors.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                لا توجد سجلات إعداد. طبّق migration 219 أولاً.
              </CardContent>
            </Card>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}

/**
 * Real test-send block for the system-email card (#2137 §3.3):
 * delivers an actual message through the SAME resolver the queue
 * worker uses (verify + sendMail), and shows the persisted last-test
 * outcome (lastTestAt / lastTestStatus / lastTestError / source).
 */
function SmtpTestSend({ vendor, onDone }: { vendor: VendorRow; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; source?: string; from?: string | null } | null>(null);

  const sendTest = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string; source?: string; from?: string | null }>(
      "/admin/vendor-settings/smtp/test-send",
      { method: "POST", body: JSON.stringify({ to: to.trim() }) },
    ),
    onSuccess: (r) => { setResult(r); onDone(); },
    onError: (e: Error) => { setResult({ ok: false, message: e.message }); onDone(); },
  });

  const lastTestAt = typeof vendor.config.lastTestAt === "string" ? vendor.config.lastTestAt : null;
  const lastTestStatus = typeof vendor.config.lastTestStatus === "string" ? vendor.config.lastTestStatus : null;
  const lastTestError = typeof vendor.config.lastTestError === "string" ? vendor.config.lastTestError : null;
  const lastTestSource = typeof vendor.config.lastTestSource === "string" ? vendor.config.lastTestSource : null;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-xs font-medium">إرسال بريد اختبار حقيقي</p>
      <p className="text-[10px] text-muted-foreground">
        يمر عبر نفس الإعدادات التي يستخدمها عامل قائمة الإرسال (resolver واحد) — مصادقة كاملة ثم تسليم فعلي. اختبار TCP وحده لم يعد كافيًا.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="بريد المستلم للاختبار"
          className="text-sm max-w-xs"
          data-testid="smtp-test-send-to"
        />
        <Button
          rateLimitAware
          variant="outline"
          disabled={!to.trim() || sendTest.isPending}
          onClick={() => sendTest.mutate()}
          data-testid="smtp-test-send-button"
        >
          <Mail className="w-4 h-4 me-1" />{sendTest.isPending ? "جاري الإرسال..." : "أرسل بريد اختبار حقيقي"}
        </Button>
      </div>
      {result && (
        <div className={cn(
          "rounded p-2 text-xs flex items-start gap-2",
          result.ok ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground",
        )} data-testid="smtp-test-send-result">
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertOctagon className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <div>
            <p>{result.message}</p>
            {result.from && <p className="text-[10px] mt-0.5">المرسل: {result.from}</p>}
            {result.source && <p className="text-[10px] text-muted-foreground mt-0.5">مصدر الإعداد: {result.source}</p>}
          </div>
        </div>
      )}
      {lastTestAt && (
        <p className="text-[10px] text-muted-foreground" data-testid="smtp-last-test">
          آخر اختبار: {lastTestAt} — {lastTestStatus === "ok" ? "نجح ✓" : `فشل: ${lastTestError ?? ""}`}
          {lastTestSource ? ` (المصدر: ${lastTestSource})` : ""}
        </p>
      )}
    </div>
  );
}

function VendorCard({ vendor, onChange }: { vendor: VendorRow; onChange: () => void }) {
  const meta = SLUG_META[vendor.slug] ?? { icon: Settings, fields: [] };
  const Icon = meta.icon;
  const [form, setForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Hydrate the form from the row's config every time the row data
  // refetches. Secret fields come back as "*****" — we keep the
  // mask so the server treats it as "leave unchanged".
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = vendor.config[f.key];
      next[f.key] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
    setForm(next);
  }, [vendor.config, vendor.slug]);

  const save = useMutation({
    mutationFn: (b: Partial<VendorRow>) => apiFetch(`/admin/vendor-settings/${vendor.slug}`, {
      method: "PATCH", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: `حُفظ: ${vendor.name}` }); setTestResult(null); onChange(); },
    onError: (e: Error) => toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: () => apiFetch<TestResult>(`/admin/vendor-settings/${vendor.slug}/test`, { method: "POST" }),
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) => toast({ title: "فشل الاختبار", description: e.message, variant: "destructive" }),
  });

  const toggleStatus = () => {
    save.mutate({ status: vendor.status === "active" ? "disabled" : "active" });
  };

  const handleSave = () => {
    save.mutate({ config: form });
  };

  const sourceBadge = vendor.effectiveSource === "db"
    ? { label: "قاعدة البيانات", color: "text-status-success-foreground" }
    : vendor.effectiveSource === "env"
      ? { label: "ENV (Fallback)", color: "text-status-info-foreground" }
      : { label: "غير مهيّأ", color: "text-status-error-foreground" };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="w-5 h-5 text-muted-foreground" />
            {vendor.name}
            <Badge variant="outline" className="text-[10px] font-mono">{vendor.slug}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]", sourceBadge.color)}>
              {sourceBadge.label}
            </Badge>
            <Button
              variant={vendor.status === "active" ? "outline" : "default"}
              size="sm"
              onClick={toggleStatus}
              disabled={save.isPending}
              rateLimitAware
            >
              {vendor.status === "active" ? "تعطيل" : "تفعيل"}
            </Button>
          </div>
        </div>
        {vendor.description && (
          <p className="text-xs text-muted-foreground mt-1">{vendor.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {vendor.slug === "smtp" && (
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-surface-subtle/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">قوالب مزوّد جاهزة:</span>
            {Object.entries(SMTP_PRESETS).map(([key, p]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                data-testid={`smtp-preset-${key}`}
                onClick={() => setForm((prev) => ({ ...prev, ...p.values }))}
              >
                {p.label}
              </Button>
            ))}
            <span className="text-[10px] text-muted-foreground w-full">
              الـ preset يملأ الخادم والمنافذ والهوية فقط — كلمة المرور تُدخل يدويًا ولا تُعرض بعد الحفظ.
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {meta.fields.map((f) => (
            <div key={f.key} className={f.type === "password" || f.label.length > 25 ? "md:col-span-2" : ""}>
              <Label className="text-xs">{f.label}</Label>
              {f.hint && <p className="text-[10px] text-muted-foreground mb-1">{f.hint}</p>}
              <Input
                type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className={f.type === "password" ? "font-mono text-xs" : ""}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button rateLimitAware onClick={handleSave} disabled={save.isPending}>
            <Save className="w-4 h-4 me-1" />حفظ
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !vendor.effectiveActive}>
            <FlaskConical className="w-4 h-4 me-1" />{test.isPending ? "جاري الاختبار..." : "اختبر الاتصال"}
          </Button>
        </div>

        {vendor.slug === "smtp" && (
          <SmtpTestSend vendor={vendor} onDone={onChange} />
        )}

        {testResult && (
          <div className={cn(
            "rounded p-3 text-sm flex items-start gap-2",
            testResult.ok ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground",
          )}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p>{testResult.message}</p>
              {testResult.source && (
                <p className="text-[10px] text-muted-foreground mt-1">المصدر: {testResult.source}</p>
              )}
              {testResult.details && Object.keys(testResult.details).length > 0 && (
                <pre className="text-[10px] font-mono mt-2 bg-surface-subtle/30 p-2 rounded">
                  {JSON.stringify(testResult.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
