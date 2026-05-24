import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Globe } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "individual", label: "فرد" },
  { value: "company", label: "شركة" },
  { value: "government", label: "جهة حكومية" },
];
const CLASSIFICATION_OPTIONS = [
  { value: "vip", label: "كبار العملاء" },
  { value: "regular", label: "عادي" },
  { value: "new", label: "جديد" },
  { value: "inactive", label: "غير نشط" },
];
const LANGUAGE_OPTIONS = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
];
const SOURCE_OPTIONS = [
  { value: "website", label: "الموقع الإلكتروني" },
  { value: "referral", label: "توصية" },
  { value: "social_media", label: "وسائل التواصل" },
  { value: "advertisement", label: "إعلان" },
  { value: "direct", label: "مباشر" },
  { value: "other", label: "أخرى" },
];

export default function ClientsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<{ id: number; name: string }, Record<string, any>>(
    "/clients",
    "POST",
    [["clients"]],
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [createPortalAccount, setCreatePortalAccount] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");

  const schema = z.object({
    name: z.string().min(1, "يرجى إدخال اسم العميل"),
    phone: z
      .string()
      .optional()
      .refine(
        (v) => !v || v.replace(/\D/g, "").length >= 9,
        "رقم الجوال يجب أن يحتوي على 9 أرقام على الأقل",
      ),
    email: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "صيغة البريد الإلكتروني غير صحيحة",
      ),
    source: z.string().optional(),
    type: z.enum(["individual", "company", "government"]),
    nationality: z.string().optional(),
    language: z.enum(["ar", "en"]),
    classification: z.string().optional(),
    notes: z.string().optional(),
  });

  return (
    <CreatePageLayout title="إضافة عميل جديد" backPath="/clients">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          phone: "",
          email: "",
          source: "",
          type: "individual",
          nationality: "",
          language: "ar",
          classification: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ العميل"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/clients")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values, { setFieldError }) => {
          if (createPortalAccount && !values.email) {
            setFieldError("email", "يرجى إدخال البريد الإلكتروني لإنشاء حساب البوابة");
            return;
          }
          if (createPortalAccount && portalPassword.length < 6) {
            toast({ variant: "destructive", title: "كلمة مرور البوابة يجب أن تكون 6 أحرف على الأقل" });
            return;
          }
          const newClient = await createMut.mutateAsync({
            ...values,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          if (createPortalAccount && newClient?.id) {
            try {
              await apiFetch(`/clients/${newClient.id}/portal-account`, {
                method: "POST",
                body: JSON.stringify({ email: values.email, password: portalPassword }),
              });
              toast({ title: "تم إضافة العميل وإنشاء حساب البوابة بنجاح" });
            } catch (portalErr: any) {
              toast({
                title: "تم إضافة العميل، لكن فشل إنشاء حساب البوابة",
                description: portalErr.message,
                variant: "destructive",
              });
            }
          } else {
            toast({ title: "تم إضافة العميل بنجاح" });
          }
          setLocation("/clients");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم العميل / الشركة" required className="md:col-span-2" />
          <FormSelectField name="type" label="نوع العميل" options={TYPE_OPTIONS} />
          <FormSelectField name="classification" label="التصنيف" options={CLASSIFICATION_OPTIONS} placeholder="بدون تصنيف" />
          <FormPhoneField name="phone" label="رقم الجوال" placeholder="05xxxxxxxx" />
          <FormEmailField name="email" label="البريد الإلكتروني" />
          <FormTextField name="nationality" label="الجنسية" placeholder="سعودي" />
          <FormSelectField name="language" label="اللغة المفضلة" options={LANGUAGE_OPTIONS} />
          <FormSelectField name="source" label="مصدر العميل" options={SOURCE_OPTIONS} placeholder="اختر المصدر" className="md:col-span-2" />
          <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." className="md:col-span-2" />
        </FormGrid>

        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العميل" />

        <div className="border rounded-lg p-4 bg-status-info-surface">
          <div className="flex items-center gap-3">
            <Checkbox
              id="createPortal"
              checked={createPortalAccount}
              onCheckedChange={(v) => setCreatePortalAccount(v === true)}
            />
            <label htmlFor="createPortal" className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <Globe className="h-4 w-4 text-status-info-foreground" /> إنشاء حساب بوابة للعميل
            </label>
          </div>
          {createPortalAccount && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                سيتم إنشاء حساب بوابة للعميل باستخدام بريده الإلكتروني أعلاه. سيُطلب منه تغيير كلمة المرور عند أول دخول.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">كلمة المرور المؤقتة <span className="text-red-500 ms-1">*</span></label>
                <input
                  type="text"
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>
          )}
        </div>
      </FormShell>
    </CreatePageLayout>
  );
}
