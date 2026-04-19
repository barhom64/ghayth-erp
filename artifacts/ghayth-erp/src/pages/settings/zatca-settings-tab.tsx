import { useEffect, useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, AlertCircle, AlertTriangle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";

export function ZatcaSettingsTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading, isError } = useApiQuery<{ data: Record<string, string> }>(["settings-zatca"], "/finance/zatca/settings");
  const settings = data?.data ?? {};
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [form, setForm] = useState({
    enabled: false,
    environment: "sandbox",
    vatRegistrationNumber: "",
    crNumber: "",
    organizationName: "",
    organizationNameEn: "",
    streetName: "",
    buildingNumber: "",
    cityName: "",
    postalCode: "",
    countryCode: "SA",
    oauthClientId: "",
    oauthClientSecret: "",
    pihKey: "",
    csid: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled === "true",
        environment: settings.environment || "sandbox",
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
      });
    }
  }, [settings]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/finance/zatca/settings", {
        method: "PUT",
        body: JSON.stringify({ ...form, enabled: form.enabled ? "true" : "false" }),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات هيئة الزكاة والضريبة بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
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
          <Zap className="h-5 w-5 text-green-600" />
          ربط هيئة الزكاة والضريبة والجمارك
        </h3>
        {connectionStatus && (
          <Badge className={connectionStatus === "connected" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
            {connectionStatus === "connected" ? "متصل" : "غير متصل"}
          </Badge>
        )}
      </div>

      {settings?.lastConnectionTest && (
        <div className={cn("flex items-start gap-3 p-3 rounded-md border", connectionStatus === "connected" ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200")}>
          <AlertCircle className={cn("h-4 w-4 mt-0.5 shrink-0", connectionStatus === "connected" ? "text-green-600" : "text-yellow-600")} />
          <div>
            <p className="text-sm font-medium">{settings.connectionTestMessage}</p>
            <p className="text-xs text-gray-500 mt-0.5">آخر اختبار: {formatDateAr(settings.lastConnectionTest)}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>حالة الربط</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? "bg-green-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm">{form.enabled ? "مفعّل" : "معطّل"}</span>
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>بيئة التشغيل</Label>
            <Select value={form.environment} onValueChange={(v) => setForm(f => ({ ...f, environment: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">بيئة الاختبار</SelectItem>
                <SelectItem value="production">بيئة الإنتاج</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.environment === "production" && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <p className="text-sm text-orange-700">بيئة الإنتاج تستخدم للإرسال الفعلي للهيئة. تأكد من صحة جميع البيانات قبل التفعيل.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">بيانات التسجيل</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>الرقم الضريبي</Label><Input className="mt-1" value={form.vatRegistrationNumber} onChange={e => setForm(f => ({ ...f, vatRegistrationNumber: e.target.value }))} placeholder="300XXXXXXXXX0003" /></div>
          <div><Label>رقم السجل التجاري</Label><Input className="mt-1" value={form.crNumber} onChange={e => setForm(f => ({ ...f, crNumber: e.target.value }))} placeholder="رقم السجل التجاري" /></div>
          <div><Label>اسم المنشأة (عربي)</Label><Input className="mt-1" value={form.organizationName} onChange={e => setForm(f => ({ ...f, organizationName: e.target.value }))} placeholder="اسم الشركة كما هو في السجل" /></div>
          <div><Label>اسم المنشأة (إنجليزي)</Label><Input className="mt-1" value={form.organizationNameEn} onChange={e => setForm(f => ({ ...f, organizationNameEn: e.target.value }))} placeholder="اسم المنشأة بالإنجليزية" /></div>
          <div><Label>اسم الشارع</Label><Input className="mt-1" value={form.streetName} onChange={e => setForm(f => ({ ...f, streetName: e.target.value }))} placeholder="اسم الشارع" /></div>
          <div><Label>رقم المبنى</Label><Input className="mt-1" value={form.buildingNumber} onChange={e => setForm(f => ({ ...f, buildingNumber: e.target.value }))} placeholder="0000" /></div>
          <div><Label>المدينة</Label><Input className="mt-1" value={form.cityName} onChange={e => setForm(f => ({ ...f, cityName: e.target.value }))} placeholder="الرياض" /></div>
          <div><Label>الرمز البريدي</Label><Input className="mt-1" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} placeholder="00000" /></div>
          <div><Label>رمز الدولة</Label><Input className="mt-1" value={form.countryCode} onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))} maxLength={2} placeholder="SA" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">مفاتيح الربط التقني</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>معرّف العميل لتفويض الدخول</Label><Input className="mt-1" value={form.oauthClientId} onChange={e => setForm(f => ({ ...f, oauthClientId: e.target.value }))} placeholder="معرّف العميل من بوابة فاتورة" dir="ltr" /></div>
          <div><Label>المفتاح السري لتفويض الدخول</Label><Input className="mt-1" type="password" value={form.oauthClientSecret} onChange={e => setForm(f => ({ ...f, oauthClientSecret: e.target.value }))} placeholder="المفتاح السري من بوابة فاتورة" dir="ltr" /></div>
          <div><Label>معرّف الختم التشفيري</Label><Input className="mt-1" value={form.csid} onChange={e => setForm(f => ({ ...f, csid: e.target.value }))} placeholder="معرّف الختم التشفيري" dir="ltr" /></div>
          <div><Label>بصمة الفاتورة السابقة</Label><Input className="mt-1" value={form.pihKey} onChange={e => setForm(f => ({ ...f, pihKey: e.target.value }))} placeholder="بصمة الفاتورة السابقة" dir="ltr" /></div>
          <div className="md:col-span-2">
            <p className="text-xs text-gray-500">المفاتيح التقنية تُوفّر من بوابة هيئة الزكاة والضريبة بعد التسجيل وإكمال عملية الاعتماد. هذه الإعدادات تُستخدم للتوقيع الرقمي وإرسال الفواتير.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
        <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
          <Zap className="h-4 w-4 me-1" />{testing ? "جاري الاختبار..." : "اختبار الاتصال"}
        </Button>
      </div>
    </div>
  );
}
