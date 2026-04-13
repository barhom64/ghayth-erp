import { useEffect, useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CommunicationChannelsTab() {
  const { toast } = useToast();
  const { data, refetch } = useApiQuery<{ data: Record<string, string> }>(["settings-channels"], "/settings/channels");
  const settings = data?.data ?? {};
  const [saving, setSaving] = useState(false);

  const [smsForm, setSmsForm] = useState({ sms_account_sid: "", sms_auth_token: "", sms_from_number: "", sms_enabled: "true" });
  const [waForm, setWaForm] = useState({ whatsapp_access_token: "", whatsapp_phone_id: "", whatsapp_verify_token: "", whatsapp_enabled: "true" });
  const [pushEnabled, setPushEnabled] = useState("true");
  const [smsTokenConfigured, setSmsTokenConfigured] = useState(false);
  const [waTokenConfigured, setWaTokenConfigured] = useState(false);

  useEffect(() => {
    if (settings) {
      const smsAuthRaw = settings.sms_auth_token ?? "";
      const waTokenRaw = settings.whatsapp_access_token ?? "";
      const smsConfigured = smsAuthRaw === "__configured__";
      const waConfigured = waTokenRaw === "__configured__";
      setSmsTokenConfigured(smsConfigured);
      setWaTokenConfigured(waConfigured);
      setSmsForm({
        sms_account_sid: settings.sms_account_sid ?? "",
        sms_auth_token: "",
        sms_from_number: settings.sms_from_number ?? "",
        sms_enabled: settings.sms_enabled ?? "true",
      });
      setWaForm({
        whatsapp_access_token: "",
        whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
        whatsapp_verify_token: settings.whatsapp_verify_token ?? "",
        whatsapp_enabled: settings.whatsapp_enabled ?? "true",
      });
      setPushEnabled(settings.push_enabled ?? "true");
    }
  }, [data]);

  const handleSave = async (entries: Record<string, string>, secretFields?: { key: string; configured: boolean }[]) => {
    setSaving(true);
    try {
      const payload = { ...entries };
      if (secretFields) {
        for (const { key, configured } of secretFields) {
          if (!payload[key] && configured) {
            payload[key] = "__configured__";
          }
        }
      }
      await apiFetch("/settings/channels", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات قنوات الاتصال بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-blue-500" />
        إعدادات قنوات الاتصال
      </h3>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">📱</span>
              الرسائل النصية القصيرة
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={smsForm.sms_enabled === "true"}
                onChange={(e) => setSmsForm({ ...smsForm, sms_enabled: e.target.checked ? "true" : "false" })}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">أدخل بيانات حساب مزود خدمة الرسائل لإرسال الرسائل النصية. يمكنك إنشاء حساب مجاني من موقع المزود.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">معرّف الحساب</Label>
              <Input
                value={smsForm.sms_account_sid}
                onChange={(e) => setSmsForm({ ...smsForm, sms_account_sid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">رمز المصادقة</Label>
              {smsTokenConfigured && !smsForm.sms_auth_token && (
                <p className="text-xs text-green-600 mb-1">✓ تم الضبط — اتركه فارغاً للإبقاء على القيمة الحالية</p>
              )}
              <Input
                type="password"
                value={smsForm.sms_auth_token}
                onChange={(e) => setSmsForm({ ...smsForm, sms_auth_token: e.target.value })}
                placeholder={smsTokenConfigured ? "••• (محفوظ — أدخل قيمة جديدة للتغيير)" : "••••••••••••••••••••••••••••••••"}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">رقم الإرسال</Label>
              <Input
                value={smsForm.sms_from_number}
                onChange={(e) => setSmsForm({ ...smsForm, sms_from_number: e.target.value })}
                placeholder="+15551234567"
                dir="ltr"
              />
            </div>
          </div>
          <Button size="sm" onClick={() => handleSave(smsForm, [{ key: "sms_auth_token", configured: smsTokenConfigured }])} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات الرسائل النصية
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">💬</span>
              واتساب — واجهة السحابة
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={waForm.whatsapp_enabled === "true"}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_enabled: e.target.checked ? "true" : "false" })}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">أدخل بيانات واجهة ربط أعمال واتساب من منصة ميتا للمطورين. تحتاج إلى حساب تجاري معتمد من ميتا.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">رمز الوصول</Label>
              {waTokenConfigured && !waForm.whatsapp_access_token && (
                <p className="text-xs text-green-600 mb-1">✓ تم الضبط — اتركه فارغاً للإبقاء على القيمة الحالية</p>
              )}
              <Input
                type="password"
                value={waForm.whatsapp_access_token}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_access_token: e.target.value })}
                placeholder={waTokenConfigured ? "••• (محفوظ — أدخل قيمة جديدة للتغيير)" : "EAAxxxxxxxxxxxxxxx..."}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">معرّف رقم الهاتف</Label>
              <Input
                value={waForm.whatsapp_phone_id}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_phone_id: e.target.value })}
                placeholder="123456789012345"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">رمز التحقق (لخطاف الاستدعاء)</Label>
              <Input
                value={waForm.whatsapp_verify_token}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_verify_token: e.target.value })}
                placeholder="ghayth_erp_verify"
                dir="ltr"
              />
            </div>
          </div>
          <div className="bg-blue-50 rounded-md p-3 text-xs text-blue-700 space-y-1">
            <p className="font-medium">رابط خطاف الاستدعاء:</p>
            <code className="bg-blue-100 px-2 py-1 rounded block" dir="ltr">{window.location.origin}/api/communications/whatsapp/webhook</code>
          </div>
          <Button size="sm" onClick={() => handleSave(waForm, [{ key: "whatsapp_access_token", configured: waTokenConfigured }])} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات واتساب
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">🔔</span>
              إشعارات المتصفح الفورية
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={pushEnabled === "true"}
                onChange={(e) => setPushEnabled(e.target.checked ? "true" : "false")}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">إشعارات المتصفح تعمل عبر VAPID keys. يجب ضبط متغيرات البيئة VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY على الخادم لتفعيل هذه الميزة.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">لتوليد مفاتيح VAPID:</p>
            <code className="bg-amber-100 px-2 py-1 rounded block" dir="ltr">npx web-push generate-vapid-keys</code>
            <p className="mt-1">أضف المفاتيح الناتجة كمتغيرات بيئة: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT</p>
          </div>
          <Button size="sm" onClick={() => handleSave({ push_enabled: pushEnabled })} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات الإشعارات
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
