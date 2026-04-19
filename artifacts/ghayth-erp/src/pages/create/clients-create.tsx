import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe } from "lucide-react";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "clients_create";
const INITIAL = {
  name: "", phone: "", email: "", source: "",
  type: "individual", nationality: "", language: "ar",
  classification: "", notes: "",
};

export default function ClientsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<{ id: number; name: string }, Record<string, string | Attachment[]>>("/clients", "POST", [["clients"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [createPortalAccount, setCreatePortalAccount] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "يرجى إدخال اسم العميل";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) localErrors.email = "صيغة البريد الإلكتروني غير صحيحة";
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) localErrors.phone = "رقم الجوال يجب أن يحتوي على 9 أرقام على الأقل";
    if (createPortalAccount && !form.email) localErrors.email = "يرجى إدخال البريد الإلكتروني لإنشاء حساب البوابة";
    if (createPortalAccount && portalPassword.length < 6) localErrors.portalPassword = "كلمة مرور البوابة يجب أن تكون 6 أحرف على الأقل";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      const newClient = await createMut.mutateAsync({ ...form, ...(attachments.length > 0 ? { attachments } : {}) });
      if (createPortalAccount && newClient?.id) {
        try {
          await apiFetch(`/clients/${newClient.id}/portal-account`, {
            method: "POST",
            body: JSON.stringify({ email: form.email, password: portalPassword }),
          });
          toast({ title: "تم إضافة العميل وإنشاء حساب البوابة بنجاح" });
        } catch (portalErr: any) {
          toast({ title: "تم إضافة العميل، لكن فشل إنشاء حساب البوابة", description: portalErr.message, variant: "destructive" });
        }
      } else {
        toast({ title: "تم إضافة العميل بنجاح" });
      }
      clearDraft();
      setLocation("/clients");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة العميل", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة عميل جديد" backPath="/clients">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="اسم العميل / الشركة" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} className="md:col-span-2" />
        <FormFieldWrapper label="نوع العميل">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">فرد</SelectItem>
              <SelectItem value="company">شركة</SelectItem>
              <SelectItem value="government">جهة حكومية</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="التصنيف">
          <Select value={form.classification || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, classification: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">بدون تصنيف</SelectItem>
              <SelectItem value="vip">كبار العملاء</SelectItem>
              <SelectItem value="regular">عادي</SelectItem>
              <SelectItem value="new">جديد</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="رقم الجوال" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="05xxxxxxxx" error={fieldErrors.phone} />
        <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} error={fieldErrors.email} />
        <TextField label="الجنسية" value={form.nationality} onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} placeholder="سعودي" />
        <FormFieldWrapper label="اللغة المفضلة">
          <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">الإنجليزية</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="مصدر العميل" className="md:col-span-2">
          <Select value={form.source || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, source: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر المصدر</SelectItem>
              <SelectItem value="website">الموقع الإلكتروني</SelectItem>
              <SelectItem value="referral">توصية</SelectItem>
              <SelectItem value="social_media">وسائل التواصل</SelectItem>
              <SelectItem value="advertisement">إعلان</SelectItem>
              <SelectItem value="direct">مباشر</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." className="md:col-span-2" />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العميل" />

      <div className="mt-6 border rounded-lg p-4 bg-blue-50/50">
        <div className="flex items-center gap-3">
          <Checkbox
            id="createPortal"
            checked={createPortalAccount}
            onCheckedChange={(v) => setCreatePortalAccount(v === true)}
          />
          <label htmlFor="createPortal" className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
            <Globe className="h-4 w-4 text-blue-600" />
            إنشاء حساب بوابة للعميل
          </label>
        </div>
        {createPortalAccount && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">سيتم إنشاء حساب بوابة للعميل باستخدام بريده الإلكتروني أعلاه. سيُطلب منه تغيير كلمة المرور عند أول دخول.</p>
            <TextField
              label="كلمة المرور المؤقتة"
              required
              value={portalPassword}
              onChange={setPortalPassword}
              placeholder="6 أحرف على الأقل"
              error={fieldErrors.portalPassword}
            />
            {!form.email && (
              <p className="text-xs text-amber-600">يرجى إدخال البريد الإلكتروني للعميل في الحقل أعلاه</p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/clients")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ العميل"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
