import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  FormShell,
  FormTextField,
  FormGrid,
} from "@/components/form-shell";

// Secret-token UX: server returns "__configured__" as a placeholder
// for a stored token. We DON'T surface that value in the form; we
// just remember it as a flag (token already exists). On save, if the
// operator left the field empty AND a token was configured, we put
// "__configured__" back so the server preserves the existing value.
const SMS_SECRETS = ["sms_auth_token"] as const;
const WA_SECRETS = ["whatsapp_access_token"] as const;
const PRESERVE_TOKEN_SENTINEL = "__configured__";

const smsSchema = z.object({
  sms_account_sid: z.string().trim(),
  sms_auth_token: z.string().trim(),
  sms_from_number: z.string().trim(),
  sms_enabled: z.boolean(),
});
type SmsForm = z.infer<typeof smsSchema>;

const whatsappSchema = z.object({
  whatsapp_access_token: z.string().trim(),
  whatsapp_phone_id: z.string().trim(),
  whatsapp_verify_token: z.string().trim(),
  whatsapp_enabled: z.boolean(),
});
type WhatsappForm = z.infer<typeof whatsappSchema>;

const pushSchema = z.object({
  push_enabled: z.boolean(),
});
type PushForm = z.infer<typeof pushSchema>;

export function CommunicationChannelsTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading, isError } = useApiQuery<{ data: Record<string, string> }>(["settings-channels"], "/settings/channels");
  const settings = data?.data ?? {};

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const smsTokenConfigured = (settings.sms_auth_token ?? "") === PRESERVE_TOKEN_SENTINEL;
  const waTokenConfigured = (settings.whatsapp_access_token ?? "") === PRESERVE_TOKEN_SENTINEL;

  const smsDefaults: SmsForm = {
    sms_account_sid: settings.sms_account_sid ?? "",
    sms_auth_token: "",
    sms_from_number: settings.sms_from_number ?? "",
    sms_enabled: (settings.sms_enabled ?? "true") === "true",
  };
  const waDefaults: WhatsappForm = {
    whatsapp_access_token: "",
    whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
    whatsapp_verify_token: settings.whatsapp_verify_token ?? "",
    whatsapp_enabled: (settings.whatsapp_enabled ?? "true") === "true",
  };
  const pushDefaults: PushForm = {
    push_enabled: (settings.push_enabled ?? "true") === "true",
  };

  const save = async (entries: Record<string, unknown>) => {
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(entries)) {
        payload[k] = typeof v === "boolean" ? (v ? "true" : "false") : String(v ?? "");
      }
      await apiFetch("/settings/channels", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات قنوات الاتصال بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-blue-500" />
        إعدادات قنوات الاتصال
      </h3>

      <FormShell
        key={`sms-${JSON.stringify(smsDefaults)}`}
        schema={smsSchema}
        defaultValues={smsDefaults}
        submitLabel="حفظ إعدادات الرسائل النصية"
        onSubmit={async (values) => {
          const payload: Record<string, unknown> = { ...values };
          for (const key of SMS_SECRETS) {
            if (!values[key] && smsTokenConfigured) payload[key] = PRESERVE_TOKEN_SENTINEL;
          }
          await save(payload);
        }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">📱</span>
                الرسائل النصية القصيرة
              </CardTitle>
              <BooleanToggle<SmsForm> name="sms_enabled" />
            </div>
            <p className="text-xs text-gray-500">أدخل بيانات حساب مزود خدمة الرسائل لإرسال الرسائل النصية. يمكنك إنشاء حساب مجاني من موقع المزود.</p>
          </CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <FormTextField name="sms_account_sid" label="معرّف الحساب" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              <SecretField<SmsForm>
                name="sms_auth_token"
                label="رمز المصادقة"
                configured={smsTokenConfigured}
                placeholderEmpty="••••••••••••••••••••••••••••••••"
              />
              <FormTextField name="sms_from_number" label="رقم الإرسال" placeholder="+15551234567" />
            </FormGrid>
          </CardContent>
        </Card>
      </FormShell>

      <FormShell
        key={`wa-${JSON.stringify(waDefaults)}`}
        schema={whatsappSchema}
        defaultValues={waDefaults}
        submitLabel="حفظ إعدادات واتساب"
        onSubmit={async (values) => {
          const payload: Record<string, unknown> = { ...values };
          for (const key of WA_SECRETS) {
            if (!values[key] && waTokenConfigured) payload[key] = PRESERVE_TOKEN_SENTINEL;
          }
          await save(payload);
        }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">💬</span>
                واتساب — واجهة السحابة
              </CardTitle>
              <BooleanToggle<WhatsappForm> name="whatsapp_enabled" />
            </div>
            <p className="text-xs text-gray-500">أدخل بيانات واجهة ربط أعمال واتساب من منصة ميتا للمطورين. تحتاج إلى حساب تجاري معتمد من ميتا.</p>
          </CardHeader>
          <CardContent>
            <FormGrid cols={2}>
              <SecretField<WhatsappForm>
                name="whatsapp_access_token"
                label="رمز الوصول"
                configured={waTokenConfigured}
                placeholderEmpty="EAAxxxxxxxxxxxxxxx..."
                className="md:col-span-2"
              />
              <FormTextField name="whatsapp_phone_id" label="معرّف رقم الهاتف" placeholder="123456789012345" />
              <FormTextField name="whatsapp_verify_token" label="رمز التحقق (لخطاف الاستدعاء)" placeholder="ghayth_erp_verify" />
            </FormGrid>
            <div className="bg-blue-50 rounded-md p-3 text-xs text-blue-700 space-y-1 mt-3">
              <p className="font-medium">رابط خطاف الاستدعاء:</p>
              <code className="bg-blue-100 px-2 py-1 rounded block" dir="ltr">{window.location.origin}/api/communications/whatsapp/webhook</code>
            </div>
          </CardContent>
        </Card>
      </FormShell>

      <FormShell
        key={`push-${JSON.stringify(pushDefaults)}`}
        schema={pushSchema}
        defaultValues={pushDefaults}
        submitLabel="حفظ إعدادات الإشعارات"
        onSubmit={async (values) => {
          await save(values);
        }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">🔔</span>
                إشعارات المتصفح الفورية
              </CardTitle>
              <BooleanToggle<PushForm> name="push_enabled" />
            </div>
            <p className="text-xs text-gray-500">إشعارات المتصفح تعمل عبر VAPID keys. يجب ضبط متغيرات البيئة VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY على الخادم لتفعيل هذه الميزة.</p>
          </CardHeader>
          <CardContent>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">لتوليد مفاتيح VAPID:</p>
              <code className="bg-amber-100 px-2 py-1 rounded block" dir="ltr">npx web-push generate-vapid-keys</code>
              <p className="mt-1">أضف المفاتيح الناتجة كمتغيرات بيئة: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT</p>
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </div>
  );
}

// Tiny checkbox bound to a boolean form field — sits in CardTitle row
// alongside the section name. Generic on TForm so each call site
// keeps its own typed form context (SmsForm / WhatsappForm /
// PushForm).
function BooleanToggle<TForm extends Record<string, unknown>>({ name }: { name: keyof TForm & string }) {
  const { setValue } = useFormContext<TForm>();
  // `as never` is a typing escape hatch since the generic erases TForm.
  const value = useWatch({ name: name as never }) as unknown as boolean | undefined;
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-gray-500">تفعيل</Label>
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => setValue(name as never, e.target.checked as never, { shouldDirty: true })}
        className="h-4 w-4"
      />
    </div>
  );
}

// Password input that respects the server's "__configured__"
// sentinel — empty value + configured flag = "keep current".
function SecretField<TForm extends Record<string, unknown>>({
  name, label, configured, placeholderEmpty, className,
}: {
  name: keyof TForm & string;
  label: string;
  configured: boolean;
  placeholderEmpty: string;
  className?: string;
}) {
  const value = useWatch({ name: name as never }) as unknown as string | undefined;
  return (
    <div className={className}>
      {configured && !value && (
        <p className="text-xs text-green-600 mb-1">✓ تم الضبط — اتركه فارغاً للإبقاء على القيمة الحالية</p>
      )}
      <FormTextField
        name={name}
        label={label}
        type="password"
        placeholder={configured ? "••• (محفوظ — أدخل قيمة جديدة للتغيير)" : placeholderEmpty}
      />
    </div>
  );
}
