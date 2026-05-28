import { useState } from "react";
import { z } from "zod";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/components/shared/permission-gate";
import {
  FormShell,
  FormGrid,
  FormTextField,
} from "@workspace/ui-core";
import {
  Link2,
  AlertTriangle,
  Pencil,
  Wifi,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const integrationSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  username: z.string().optional(),
  subscriptionId: z.string().optional(),
});
type IntegrationForm = z.infer<typeof integrationSchema>;

const GOV_SYSTEM_INFO: Record<string, { color: string; desc: string; icon: string }> = {
  muqeem: { color: "bg-status-success-surface border-status-success-surface", desc: "إدارة الإقامات وتصاريح العمل ومعلومات الموظفين الأجانب", icon: "🏛️" },
  tam: { color: "bg-status-info-surface border-status-info-surface", desc: "تسجيل المركبات وبيانات اللوحات والفحص الدوري", icon: "🚗" },
  absher_business: { color: "bg-purple-50 border-purple-200", desc: "خدمات الأعمال الحكومية عبر منصة أبشر", icon: "📱" },
};

export function GovIntegrationsTab() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const canSave = usePermission("settings:create");
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-integrations"], "/gov-integrations");

  const integrations: any[] = data?.data || [];

  // Expiry alerts — iqama / registration documents nearing expiry.
  // Surfaced as warning banners above the integration cards.
  const { data: iqamaResp } = useApiQuery<{ data: any[] }>(
    ["gov-expiring-iqama"],
    "/gov-integrations/expiring/iqama",
  );
  const { data: registrationResp } = useApiQuery<{ data: any[] }>(
    ["gov-expiring-registration"],
    "/gov-integrations/expiring/registration",
  );
  const expiringIqamas: any[] = iqamaResp?.data ?? [];
  const expiringRegistrations: any[] = registrationResp?.data ?? [];

  // Entity links — vehicles / employees / properties tied to gov
  // integration records. Just count for now; full UI is the next
  // gov-integrations link manager page.
  const { data: linksResp } = useApiQuery<{ data: any[] }>(
    ["gov-integrations-links"],
    "/gov-integrations/links",
  );
  const linksCount = linksResp?.data?.length ?? 0;

  const handleSave = async (id: number, enabled: boolean, values: IntegrationForm) => {
    try {
      await apiFetch(`/gov-integrations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          config: {
            apiKey: values.apiKey,
            baseUrl: values.baseUrl,
            username: values.username,
            subscriptionId: values.subscriptionId,
          },
        }),
      });
      toast({ title: "تم الحفظ بنجاح" });
      setEditingId(null);
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: getErrorMessage(err) });
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingId(id);
    try {
      const json = await apiFetch<any>(`/gov-integrations/${id}/test`, { method: "POST" });
      toast({
        title: json.success ? "الاتصال ناجح (محاكاة)" : "فشل الاتصال",
        description: json.message,
        variant: json.success ? "default" : "destructive",
      });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الاتصال", description: getErrorMessage(err) });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (item: any) => {
    try {
      await apiFetch(`/gov-integrations/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      refetch();
      toast({ title: item.enabled ? "تم تعطيل النظام" : "تم تفعيل النظام" });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="h-5 w-5 text-status-info-foreground" />
        <div>
          <h2 className="text-lg font-semibold">التكاملات الحكومية</h2>
          <p className="text-sm text-muted-foreground">ربط النظام بالمنصات الحكومية السعودية (مقيم، تام، أبشر الأعمال)</p>
        </div>
      </div>

      <div className="rounded-md bg-status-warning-surface border border-status-warning-surface p-3 text-sm text-status-warning-foreground flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>هذه التكاملات تعمل حالياً في وضع المحاكاة — بيانات الربط الفعلي ستُفعَّل عند الاشتراك في الخدمات الحكومية المقابلة.</span>
      </div>

      {(expiringIqamas.length > 0 || expiringRegistrations.length > 0 || linksCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {expiringIqamas.length > 0 && (
            <div className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3">
              <p className="font-semibold text-status-warning-foreground mb-1">إقامات قاربت على الانتهاء ({expiringIqamas.length})</p>
              <p className="text-xs text-muted-foreground">{expiringIqamas[0]?.name ?? expiringIqamas[0]?.employeeName ?? ""}{expiringIqamas.length > 1 ? ` و${expiringIqamas.length - 1} أخرى` : ""}</p>
            </div>
          )}
          {expiringRegistrations.length > 0 && (
            <div className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3">
              <p className="font-semibold text-status-warning-foreground mb-1">سجلات تنتهي ({expiringRegistrations.length})</p>
              <p className="text-xs text-muted-foreground">{expiringRegistrations[0]?.name ?? expiringRegistrations[0]?.companyName ?? ""}</p>
            </div>
          )}
          {linksCount > 0 && (
            <div className="rounded-md border bg-surface-subtle p-3">
              <p className="font-semibold mb-1">روابط الكيانات المسجَّلة</p>
              <p className="text-xs text-muted-foreground">{linksCount} كيان مربوط بمنصات حكومية</p>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} error={error} />
      ) : (
        <div className="space-y-4">
          {integrations.map((item: any) => {
            const info = GOV_SYSTEM_INFO[item.type] || { color: "bg-surface-subtle border-border", desc: "", icon: "🔗" };
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className={`border rounded-lg p-4 ${info.color}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.enabled ? "bg-status-success-surface text-status-success-foreground" : "bg-surface-subtle text-muted-foreground"}`}>
                          {item.enabled ? "مفعّل" : "معطّل"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.desc}</p>
                      {item.lastCheckStatus && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.lastCheckStatus === "connected" ? "bg-status-success-surface text-status-success-foreground" :
                            item.lastCheckStatus === "auth_error" ? "bg-status-warning-surface text-status-warning-foreground" :
                            "bg-status-error-surface text-status-error-foreground"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.lastCheckStatus === "connected" ? "bg-status-success-surface0" :
                              item.lastCheckStatus === "auth_error" ? "bg-status-warning-surface0" :
                              "bg-status-error-surface0"
                            }`} />
                            {item.lastCheckStatus === "connected" ? "متصل" :
                             item.lastCheckStatus === "auth_error" ? "خطأ مصادقة" : "غير متصل"}
                          </span>
                          {item.lastCheckedAt && (
                            <span className="text-xs text-muted-foreground">
                              آخر فحص: {formatDateAr(item.lastCheckedAt)}
                            </span>
                          )}
                        </div>
                      )}
                      {item.lastCheckMessage && item.lastCheckStatus !== "connected" && (
                        <p className="text-xs text-status-error-foreground mt-1">{item.lastCheckMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`p-1.5 rounded-md ${item.enabled ? "text-status-success-foreground hover:bg-status-success-surface" : "text-muted-foreground hover:bg-surface-subtle"}`}
                      title={item.enabled ? "تعطيل" : "تفعيل"}
                    >
                      {item.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => setEditingId(isEditing ? null : item.id)}
                      className="p-1.5 rounded-md text-status-info-foreground hover:bg-status-info-surface"
                      title="تعديل الإعدادات"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleTestConnection(item.id)}
                      disabled={testingId === item.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-subtle disabled:opacity-50"
                      title="اختبار الاتصال"
                    >
                      {testingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isEditing && (() => {
                  const cfg = item.config || {};
                  return (
                    <div className="mt-4 pt-4 border-t">
                      <FormShell
                        schema={integrationSchema}
                        defaultValues={{
                          apiKey: cfg.apiKey || "",
                          baseUrl: cfg.baseUrl || "",
                          username: cfg.username || "",
                          subscriptionId: cfg.subscriptionId || "",
                        }}
                        submitLabel="حفظ"
                        disabled={!canSave}
                        secondaryActions={
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                        }
                        onSubmit={async (values) => {
                          await handleSave(item.id, item.enabled, values);
                        }}
                      >
                        <FormGrid cols={2}>
                          <FormTextField
                            name="apiKey"
                            label="مفتاح الربط البرمجي"
                            type="password"
                            placeholder="أدخل مفتاح الربط"
                          />
                          <FormTextField
                            name="baseUrl"
                            label="رابط الخدمة"
                            placeholder="https://api.gov.sa/..."
                          />
                          <FormTextField
                            name="username"
                            label="اسم المستخدم"
                            placeholder="اسم المستخدم"
                          />
                          <FormTextField
                            name="subscriptionId"
                            label="رقم الاشتراك"
                            placeholder="رقم الاشتراك / المرجع"
                          />
                        </FormGrid>
                      </FormShell>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
