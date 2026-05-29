import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Save, ZapOff, Zap, FlaskConical, ServerCog } from "lucide-react";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";

interface IntegrationRow {
  id: number;
  provider: string;
  displayName: string;
  baseUrl: string;
  pollIntervalSec: number;
  videoOnDemandOnly: boolean;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  config: Record<string, unknown>;
  notes: string | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: "نشط", tone: "bg-status-success-surface text-status-success-foreground" },
  inactive: { label: "غير نشط", tone: "bg-surface-subtle text-muted-foreground" },
  paused: { label: "معلق", tone: "bg-status-warning-surface text-status-warning-foreground" },
  error: { label: "خطأ", tone: "bg-rose-100 text-rose-700" },
};

const DEFAULT_FORM = {
  displayName: "CMSV6 — التتبع المرئي",
  provider: "cmsv6",
  baseUrl: "",
  pollIntervalSec: "30",
  videoOnDemandOnly: true,
  status: "inactive",
  account: "",
  password: "",
  apiKey: "",
  webhookSecret: "",
  positionRetentionDays: "90",
  syncLogRetentionDays: "30",
  videoAccessLogRetentionDays: "90",
  offlineThresholdSec: "600",
  notes: "",
};

export default function FleetTelematicsSettings() {
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: IntegrationRow[] }>(
    ["fleet-telematics-integrations"],
    "/fleet/telematics/integrations",
  );
  const integrations = asList(data) as IntegrationRow[];

  const [form, setForm] = useState(DEFAULT_FORM);

  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/fleet/telematics/integrations",
    "POST",
    [["fleet-telematics-integrations"]],
    {
      successMessage: "تم حفظ إعدادات CMSV6",
      onSuccess: () => setForm(DEFAULT_FORM),
    },
  );
  const patchMut = useApiMutation<unknown, { id: number; payload: Record<string, unknown> }>(
    (body) => `/fleet/telematics/integrations/${body.id}`,
    "PATCH",
    [["fleet-telematics-integrations"]],
    { successMessage: "تم تحديث الإعدادات" },
  );
  const testMut = useApiMutation<unknown, { id: number }>(
    (body) => `/fleet/telematics/integrations/${body.id}/test`,
    "POST",
    [["fleet-telematics-integrations"]],
    { successMessage: "نجح اختبار الاتصال بـ CMSV6" },
  );
  const webhookTestMut = useApiMutation<unknown, Record<string, unknown>>(
    "/fleet/telematics/webhook/cmsv6/test",
    "POST",
    [["fleet-telematics-sync-logs"]],
    { successMessage: "تم تشغيل webhook التجريبي" },
  );

  const submit = () => {
    createMut.mutate({
      displayName: form.displayName,
      provider: form.provider,
      baseUrl: form.baseUrl,
      pollIntervalSec: Number(form.pollIntervalSec) || 30,
      videoOnDemandOnly: form.videoOnDemandOnly,
      status: form.status,
      config: {
        account: form.account,
        password: form.password,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      },
      ...(form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
      positionRetentionDays: Number(form.positionRetentionDays) || 90,
      syncLogRetentionDays: Number(form.syncLogRetentionDays) || 30,
      videoAccessLogRetentionDays: Number(form.videoAccessLogRetentionDays) || 90,
      offlineThresholdSec: Number(form.offlineThresholdSec) || 600,
      notes: form.notes,
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="إعدادات تكامل CMSV6"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "إعدادات CMSV6" },
      ]}
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />

      {/* Existing integrations list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerCog className="h-5 w-5" />
            التكاملات المسجّلة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا يوجد تكامل CMSV6 معد بعد. استخدم النموذج أدناه لإنشاء أول تكامل.
            </p>
          ) : (
            <div className="space-y-3">
              {integrations.map((r) => {
                const info = STATUS_LABEL[r.status] ?? { label: r.status, tone: "bg-surface-subtle" };
                return (
                  <div
                    key={r.id}
                    className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-[260px]">
                      <div className="font-medium flex items-center gap-2">
                        <Badge variant="outline" className={info.tone}>{info.label}</Badge>
                        {r.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{r.baseUrl}</div>
                      <div className="text-xs text-muted-foreground">
                        فاصل المزامنة: {r.pollIntervalSec} ث · فيديو عند الطلب فقط:
                        {" "}{r.videoOnDemandOnly ? "نعم" : "لا"}
                      </div>
                      {r.lastSyncAt && (
                        <div className="text-xs">
                          آخر مزامنة:{" "}
                          {new Date(r.lastSyncAt).toLocaleString("ar-SA")}
                          {" — "}
                          <span className={r.lastSyncStatus === "success" ? "text-status-success-foreground" : "text-rose-700"}>
                            {r.lastSyncStatus === "success" ? "نجاح" : (r.lastSyncError ?? r.lastSyncStatus)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <GuardedButton
                        perm="fleet.telematics.configure:update"
                        variant="outline"
                        size="sm"
                        onClick={() => testMut.mutate({ id: r.id })}
                        disabled={testMut.isPending}
                      >
                        <FlaskConical className="h-4 w-4 me-1" />
                        اختبار
                      </GuardedButton>
                      <GuardedButton
                        perm="fleet.telematics.configure:update"
                        variant="outline"
                        size="sm"
                        onClick={() => webhookTestMut.mutate({ events: [], alerts: [], positions: [], sensors: [] })}
                        disabled={webhookTestMut.isPending}
                        title="إرسال webhook فارغ لاختبار المسار"
                      >
                        <ServerCog className="h-4 w-4 me-1" />
                        webhook
                      </GuardedButton>
                      {r.status === "active" ? (
                        <GuardedButton
                          perm="fleet.telematics.configure:update"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            patchMut.mutate({ id: r.id, payload: { status: "paused" } })
                          }
                          disabled={patchMut.isPending}
                        >
                          <ZapOff className="h-4 w-4 me-1" />
                          تعليق
                        </GuardedButton>
                      ) : (
                        <GuardedButton
                          perm="fleet.telematics.configure:update"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            patchMut.mutate({ id: r.id, payload: { status: "active" } })
                          }
                          disabled={patchMut.isPending}
                        >
                          <Zap className="h-4 w-4 me-1" />
                          تفعيل
                        </GuardedButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New integration form */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            إضافة تكامل CMSV6 جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>اسم التكامل *</Label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </div>
          <div>
            <Label>المزود</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => setForm({ ...form, provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cmsv6">CMSV6 / Eastyle</SelectItem>
                <SelectItem value="wialon" disabled>Wialon — قريباً</SelectItem>
                <SelectItem value="teltonika" disabled>Teltonika — قريباً</SelectItem>
                <SelectItem value="manual">يدوي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>عنوان CMSV6 *</Label>
            <Input
              placeholder="https://gps.example.com"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              يجب أن يكون عنوان https عام — العناوين الداخلية مرفوضة لمنع SSRF.
            </p>
          </div>
          <div>
            <Label>اسم حساب CMSV6 *</Label>
            <Input
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            />
          </div>
          <div>
            <Label>كلمة المرور *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <Label>API Key (إن وُجد)</Label>
            <Input
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>مفتاح Webhook HMAC (للأمان عند الاستقبال)</Label>
            <Input
              type="password"
              placeholder="حد أدنى 16 حرفًا — يُستخدم لتوقيع طلبات webhook"
              value={form.webhookSecret}
              onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              يُحفظ مُشفّرًا في قاعدة البيانات. يجب إعداده في CMSV6 على نفس
              القيمة. عنوان الاستقبال:
              <code className="mx-1 px-1 bg-surface-subtle rounded">
                POST /api/webhooks/cmsv6/{"{integrationId}"}
              </code>
              مع رؤوس <code>x-cmsv6-signature</code> و
              <code>x-cmsv6-timestamp</code>.
            </p>
          </div>
          <div>
            <Label>فاصل المزامنة (بالثواني)</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={form.pollIntervalSec}
              onChange={(e) => setForm({ ...form, pollIntervalSec: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.videoOnDemandOnly}
              onCheckedChange={(v) => setForm({ ...form, videoOnDemandOnly: v })}
            />
            <Label>الفيديو عند الطلب فقط (موصى به)</Label>
          </div>
          <div>
            <Label>الحالة عند الإنشاء</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inactive">غير نشط</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>مدة الاحتفاظ بالمواقع (أيام)</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={form.positionRetentionDays}
              onChange={(e) => setForm({ ...form, positionRetentionDays: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              المواقع الأقدم تُحذف تلقائيًا في cron يومي 03:00. الافتراضي 90 يوم.
            </p>
          </div>
          <div>
            <Label>مدة الاحتفاظ بسجلات المزامنة (أيام)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.syncLogRetentionDays}
              onChange={(e) => setForm({ ...form, syncLogRetentionDays: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              سجلات `fleet_device_sync_logs` الأقدم تُحذف. الافتراضي 30 يوم.
            </p>
          </div>
          <div>
            <Label>مدة الاحتفاظ بسجلات وصول الفيديو (أيام)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.videoAccessLogRetentionDays}
              onChange={(e) => setForm({ ...form, videoAccessLogRetentionDays: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              سجلات `fleet_video_access_logs` (forensic audit للوصول).
              الافتراضي 90 يوم. ارفع للمتطلبات التنظيمية الأطول.
            </p>
          </div>
          <div>
            <Label>عتبة قطع الاتصال (ثوانٍ)</Label>
            <Input
              type="number"
              min={60}
              max={86400}
              value={form.offlineThresholdSec}
              onChange={(e) => setForm({ ...form, offlineThresholdSec: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              إذا لم يصل GPS من جهاز خلال هذه المدة، يُعتبر offline تلقائيًا
              (heartbeat كل دقيقتين). الافتراضي 600 (10 دقائق).
            </p>
          </div>
          <div className="md:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <GuardedButton
              perm="fleet.telematics.configure:create"
              onClick={submit}
              disabled={
                createMut.isPending ||
                !form.baseUrl ||
                !form.account ||
                !form.password
              }
            >
              <Save className="h-4 w-4 me-1" />
              حفظ التكامل
            </GuardedButton>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
