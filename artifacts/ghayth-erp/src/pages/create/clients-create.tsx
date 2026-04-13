import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Globe } from "lucide-react";

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

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم العميل" });
      return;
    }
    if (createPortalAccount && !form.email) {
      toast({ variant: "destructive", title: "يرجى إدخال البريد الإلكتروني لإنشاء حساب البوابة" });
      return;
    }
    if (createPortalAccount && portalPassword.length < 6) {
      toast({ variant: "destructive", title: "كلمة مرور البوابة يجب أن تكون 6 أحرف على الأقل" });
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
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة العميل" });
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
        <div className="md:col-span-2"><Label>اسم العميل / الشركة <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div>
          <Label>نوع العميل</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">فرد</SelectItem>
              <SelectItem value="company">شركة</SelectItem>
              <SelectItem value="government">جهة حكومية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>التصنيف</Label>
          <Select value={form.classification || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, classification: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">بدون تصنيف</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="regular">عادي</SelectItem>
              <SelectItem value="new">جديد</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>رقم الجوال</Label><Input className="mt-1" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="05xxxxxxxx" /></div>
        <div><Label>البريد الإلكتروني</Label><Input className="mt-1" type="email" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
        <div><Label>الجنسية</Label><Input className="mt-1" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="سعودي" /></div>
        <div>
          <Label>اللغة المفضلة</Label>
          <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>مصدر العميل</Label>
          <Select value={form.source || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, source: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="اختر المصدر" /></SelectTrigger>
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
        </div>
        <div className="md:col-span-2"><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات إضافية..." /></div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العميل" />

      <div className="mt-6 border rounded-lg p-4 bg-blue-50/50">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="createPortal"
            checked={createPortalAccount}
            onChange={(e) => setCreatePortalAccount(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <label htmlFor="createPortal" className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
            <Globe className="h-4 w-4 text-blue-600" />
            إنشاء حساب بوابة للعميل
          </label>
        </div>
        {createPortalAccount && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">سيتم إنشاء حساب بوابة للعميل باستخدام بريده الإلكتروني أعلاه. سيُطلب منه تغيير كلمة المرور عند أول دخول.</p>
            <div>
              <Label>كلمة المرور المؤقتة <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                type="text"
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
              />
            </div>
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
