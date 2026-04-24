import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "finance_vendors_create";
const INITIAL = { name: "", contactPerson: "", phone: "", email: "", taxNumber: "", address: "", paymentTerms: "", category: "", date: todayLocal() };

export default function VendorsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/vendors", "POST", [["vendors"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "اسم المورد مطلوب",
      email: form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "صيغة البريد الإلكتروني غير صحيحة" : null,
      phone: form.phone && form.phone.replace(/\D/g, "").length < 9 ? "رقم الهاتف يجب أن يكون 9 أرقام على الأقل" : null,
      taxNumber: form.taxNumber && !/^\d{15}$/.test(form.taxNumber.replace(/\s/g, "")) ? "الرقم الضريبي يجب أن يكون 15 رقماً" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, date: form.date || undefined });
      clearDraft();
      toast({ title: "تم إضافة المورد بنجاح" });
      setLocation("/finance/vendors");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المورد", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة مورد جديد" backPath="/finance/vendors">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </FormFieldWrapper>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField label="الاسم" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} />
        <TextField label="جهة الاتصال" value={form.contactPerson} onChange={(v) => setForm((f) => ({ ...f, contactPerson: v }))} />
        <TextField label="الهاتف" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} error={fieldErrors.phone} />
        <TextField label="البريد" type="email" dir="ltr" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} error={fieldErrors.email} />
        <TextField label="الرقم الضريبي" dir="ltr" value={form.taxNumber} onChange={(v) => setForm((f) => ({ ...f, taxNumber: v }))} error={fieldErrors.taxNumber} />
        <TextField label="العنوان" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
        <FormFieldWrapper label="شروط الدفع">
          <Select value={form.paymentTerms || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر</SelectItem>
              <SelectItem value="net_30">صافي 30 يوم</SelectItem>
              <SelectItem value="net_60">صافي 60 يوم</SelectItem>
              <SelectItem value="net_90">صافي 90 يوم</SelectItem>
              <SelectItem value="cod">الدفع عند التسليم</SelectItem>
              <SelectItem value="advance">مقدماً</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/vendors")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
