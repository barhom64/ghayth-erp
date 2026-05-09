import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "warehouse_suppliers_create";
const INITIAL = { name: "", contactPerson: "", phone: "", email: "", address: "", taxNumber: "", paymentTerms: "" };

export default function SuppliersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addSupplier = useApiMutation("/warehouse/suppliers", "POST", [["warehouse-suppliers"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم المورد",
      email: form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "صيغة البريد الإلكتروني غير صحيحة" : null,
      phone: form.phone && form.phone.replace(/\D/g, "").length < 9 ? "رقم الهاتف يجب أن يكون 9 أرقام على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await addSupplier.mutateAsync(form);
      clearDraft();
      toast({ title: "تمت إضافة المورد بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المورد", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة مورد جديد" backPath="/warehouse">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم المورد" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم المورد" error={fieldErrors.name} />
          <TextField label="جهة الاتصال" value={form.contactPerson} onChange={(v) => setForm((f) => ({ ...f, contactPerson: v }))} placeholder="جهة الاتصال" />
          <TextField label="الهاتف" type="tel" inputMode="tel" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="05xxxxxxxx" error={fieldErrors.phone} />
          <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="email@example.com" error={fieldErrors.email} />
          <TextField label="العنوان" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="المدينة، الحي..." />
          <TextField label="الرقم الضريبي" dir="ltr" value={form.taxNumber} onChange={(v) => setForm((f) => ({ ...f, taxNumber: v }))} placeholder="الرقم الضريبي" />
          <FormFieldWrapper label="شروط الدفع">
            <Select value={form.paymentTerms || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر الشروط" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الشروط</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="net_15">صافي 15 يوم</SelectItem>
                <SelectItem value="net_30">صافي 30 يوم</SelectItem>
                <SelectItem value="net_60">صافي 60 يوم</SelectItem>
                <SelectItem value="net_90">صافي 90 يوم</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addSupplier.isPending} rateLimitAware>{addSupplier.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
