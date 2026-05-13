import { useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, AlertCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import {
  FormShell,
  FormTextField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

const zatcaSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(["sandbox", "production"]),
  vatRegistrationNumber: z.string().trim(),
  crNumber: z.string().trim(),
  organizationName: z.string().trim(),
  organizationNameEn: z.string().trim(),
  streetName: z.string().trim(),
  buildingNumber: z.string().trim(),
  cityName: z.string().trim(),
  postalCode: z.string().trim(),
  countryCode: z.string().trim().max(2),
  oauthClientId: z.string().trim(),
  oauthClientSecret: z.string().trim(),
  pihKey: z.string().trim(),
  csid: z.string().trim(),
});
type ZatcaForm = z.infer<typeof zatcaSchema>;

export function ZatcaSettingsTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading, isError } = useApiQuery<{ data: Record<string, string> }>(["settings-zatca"], "/finance/zatca/settings");
  const settings = data?.data ?? {};
  const [testing, setTesting] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const defaults: ZatcaForm = {
    enabled: settings.enabled === "true",
    environment: (settings.environment as "sandbox" | "production") || "sandbox",
    vatRegistrationNumber: settings.vatRegistrationNumber || "",
    crNumber: settings.crNumber || "",
    organizationName: settings.organizationName || "",
    organizationNameEn: settings.organizationNameEn || "",
    streetName: settings.streetName || "",
    buildingNumber: settings.buildingNumber || "",
    cityName: settings.cityName || "",
    postalCode: settings.postalCode || "",
    countryCode: settings.countryCode || "SA",
    oauthClientId: settings.oauthClientId || "",
    oauthClientSecret: settings.oauthClientSecret || "",
    pihKey: settings.pihKey || "",
    csid: settings.csid || "",
  };
  const remountKey = JSON.stringify(defaults);

  const handleSave = async (values: ZatcaForm) => {
    try {
      await apiFetch("/finance/zatca/settings", {
        method: "PUT",
        body: JSON.stringify({ ...values, enabled: values.enabled ? "true" : "false" }),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات هيئة الزكاة والضريبة بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<any>("/finance/zatca/test-connection", { method: "POST", body: JSON.stringify({}) });
      toast({
        title: result.status === "connected" ? "الاتصال ناجح" : "تحقق من الإعدادات",
        description: result.message,
        variant: result.status === "connected" ? "default" : "destructive",
      });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل اختبار الاتصال", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const connectionStatus = settings?.connectionTestStatus;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-status-success-foreground" />
          ربط هيئة الزكاة والضريبة والجمارك
        </h3>
        {connectionStatus && (
          <Badge className={connectionStatus === "connected" ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
            {connectionStatus === "connected" ? "متصل" : "غير متصل"}
          </Badge>
        )}
      </div>

      {settings?.lastConnectionTest && (
        <div className={cn("flex items-start gap-3 p-3 rounded-md border", connectionStatus === "connected" ? "bg-status-success-surface border-status-success-surface" : "bg-status-warning-surface border-status-warning-surface")}>
          <AlertCircle className={cn("h-4 w-4 mt-0.5 shrink-0", connectionStatus === "connected" ? "text-status-success-foreground" : "text-status-warning-foreground")} />
          <div>
            <p className="text-sm font-medium">{settings.connectionTestMessage}</p>
            <p className="text-xs text-muted-foreground mt-0.5">آخر اختبار: {formatDateAr(settings.lastConnectionTest)}</p>
          </div>
        </div>
      )}

      <FormShell
        key={remountKey}
        schema={zatcaSchema}
        defaultValues={defaults}
        submitLabel="حفظ الإعدادات"
        secondaryActions={
          <GuardedButton perm="settings:create" type="button" variant="outline" onClick={handleTestConnection} disabled={testing}>
            <Zap className="h-4 w-4 me-1" />{testing ? "جاري الاختبار..." : "اختبار الاتصال"}
          </GuardedButton>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>حالة الربط</span>
              <EnabledToggle />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormSelectField
              name="environment"
              label="بيئة التشغيل"
              options={[
                { value: "sandbox", label: "بيئة الاختبار" },
                { value: "production", label: "بيئة الإنتاج" },
              ]}
            />
            <ProductionWarning />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">بيانات التسجيل</CardTitle></CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormTextField name="vatRegistrationNumber" label="الرقم الضريبي" placeholder="300XXXXXXXXX0003" />
              <FormTextField name="crNumber" label="رقم السجل التجاري" placeholder="رقم السجل التجاري" />
              <FormTextField name="organizationName" label="اسم المنشأة (عربي)" placeholder="اسم الشركة كما هو في السجل" />
              <FormTextField name="organizationNameEn" label="اسم المنشأة (إنجليزي)" placeholder="اسم المنشأة بالإنجليزية" />
              <FormTextField name="streetName" label="اسم الشارع" placeholder="اسم الشارع" />
              <FormTextField name="buildingNumber" label="رقم المبنى" placeholder="0000" />
              <FormTextField name="cityName" label="المدينة" placeholder="الرياض" />
              <FormTextField name="postalCode" label="الرمز البريدي" placeholder="00000" />
              <FormTextField name="countryCode" label="رمز الدولة" placeholder="SA" />
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">مفاتيح الربط التقني</CardTitle></CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormTextField name="oauthClientId" label="معرّف العميل لتفويض الدخول" placeholder="معرّف العميل من بوابة فاتورة" />
              <FormTextField name="oauthClientSecret" label="المفتاح السري لتفويض الدخول" type="password" placeholder="المفتاح السري من بوابة فاتورة" />
              <FormTextField name="csid" label="معرّف الختم التشفيري" placeholder="معرّف الختم التشفيري" />
              <FormTextField name="pihKey" label="بصمة الفاتورة السابقة" placeholder="بصمة الفاتورة السابقة" />
            </FormGrid>
            <p className="text-xs text-muted-foreground mt-3">المفاتيح التقنية تُوفّر من بوابة هيئة الزكاة والضريبة بعد التسجيل وإكمال عملية الاعتماد. هذه الإعدادات تُستخدم للتوقيع الرقمي وإرسال الفواتير.</p>
          </CardContent>
        </Card>
      </FormShell>
    </div>
  );
}

// The custom toggle pill that was previously bound to `form.enabled`.
// Lives in the CardTitle row, so it gets its own subcomponent that
// drives the boolean via useFormContext.
function EnabledToggle() {
  const { setValue } = useFormContext<ZatcaForm>();
  const enabled = useWatch<ZatcaForm, "enabled">({ name: "enabled" });
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => setValue("enabled", !enabled, { shouldDirty: true })}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-green-600" : "bg-gray-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className="text-sm">{enabled ? "مفعّل" : "معطّل"}</span>
    </label>
  );
}

// "Production environment" warning that follows the environment
// selector — uses useWatch so it appears/disappears without forcing
// a parent re-render of the entire FormShell.
function ProductionWarning() {
  const environment = useWatch<ZatcaForm, "environment">({ name: "environment" });
  if (environment !== "production") return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
      <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
      <p className="text-sm text-orange-700">بيئة الإنتاج تستخدم للإرسال الفعلي للهيئة. تأكد من صحة جميع البيانات قبل التفعيل.</p>
    </div>
  );
}
