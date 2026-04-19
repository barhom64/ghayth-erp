import { useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function OwnersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const [form, setForm] = useState<any>({
    ownerType: "individual", name: "", nationalId: "", crNumber: "", phone: "", email: "",
    iban: "", bankName: "", address: "", city: "",
    authorizationNumber: "", authorizationDate: "", authorizationExpiry: "", notes: "",
  });

  const handleSave = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "اسم المالك مطلوب";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) localErrors.email = "صيغة البريد الإلكتروني غير صحيحة";
    if (form.phone && form.phone.replace(/\D/g, "").length < 9) localErrors.phone = "رقم الهاتف يجب أن يكون 9 أرقام على الأقل";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, authorizationDate: form.authorizationDate || undefined, authorizationExpiry: form.authorizationExpiry || undefined };
      await apiFetch("/properties/owners", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "تمت إضافة المالك بنجاح" });
      setLocation("/properties/owners");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="إضافة مالك جديد"
      subtitle="تسجيل مالك عقار في النظام"
      backPath="/properties/owners"
    >
      <div className="space-y-6">
        <CreationDateField />
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Crown className="h-5 w-5 text-amber-500" /> بيانات المالك
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="نوع المالك">
              <Select value={form.ownerType} onValueChange={v => setForm({ ...form, ownerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">فرد</SelectItem>
                  <SelectItem value="company">شركة / مؤسسة</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="الاسم" required value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder={form.ownerType === "company" ? "اسم الشركة" : "الاسم الكامل"} error={fieldErrors.name} />
            <TextField label="رقم الهوية" dir="ltr" value={form.nationalId} onChange={v => setForm({ ...form, nationalId: v })} />
            {form.ownerType === "company" && (
              <TextField label="رقم السجل التجاري" dir="ltr" value={form.crNumber} onChange={v => setForm({ ...form, crNumber: v })} />
            )}
            <TextField label="الهاتف" dir="ltr" value={form.phone} onChange={v => setForm({ ...form, phone: v })} error={fieldErrors.phone} />
            <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={v => setForm({ ...form, email: v })} error={fieldErrors.email} />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">البيانات البنكية (لتحويل الإيرادات)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField label="رقم الآيبان" dir="ltr" value={form.iban} onChange={v => setForm({ ...form, iban: v })} placeholder="SA0000000000000000000000" />
              <TextField label="اسم البنك" value={form.bankName} onChange={v => setForm({ ...form, bankName: v })} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-bold text-gray-600 mb-3">الوكالة / التفويض</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextField label="رقم الوكالة" dir="ltr" value={form.authorizationNumber} onChange={v => setForm({ ...form, authorizationNumber: v })} />
              <FormFieldWrapper label="تاريخ الوكالة">
                <DatePicker value={form.authorizationDate} onChange={v => setForm({ ...form, authorizationDate: v })} />
              </FormFieldWrapper>
              <FormFieldWrapper label="تاريخ انتهاء الوكالة">
                <DatePicker value={form.authorizationExpiry} onChange={v => setForm({ ...form, authorizationExpiry: v })} />
              </FormFieldWrapper>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField label="المدينة" value={form.city} onChange={v => setForm({ ...form, city: v })} />
              <TextField label="العنوان" value={form.address} onChange={v => setForm({ ...form, address: v })} />
            </div>
          </div>

        <TextAreaField label="ملاحظات" rows={3} value={form.notes} onChange={v => setForm({ ...form, notes: v })} />
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/owners")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ المالك"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
