import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

const DRAFT_KEY = "warehouse_suppliers_create";
const INITIAL = { name: "", contactPerson: "", phone: "", email: "", address: "", taxNumber: "", paymentTerms: "" };

export default function SuppliersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addSupplier = useApiMutation("/warehouse/suppliers", "POST", [["warehouse-suppliers"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم المورد" });
      return;
    }
    try {
      await addSupplier.mutateAsync(form);
      clearDraft();
      toast({ title: "تمت إضافة المورد بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المورد", description: err.message });
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
          <div><Label>اسم المورد <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم المورد" /></div>
          <div><Label>جهة الاتصال</Label><Input className="mt-1" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} placeholder="جهة الاتصال" /></div>
          <div><Label>الهاتف</Label><Input className="mt-1" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="05xxxxxxxx" /></div>
          <div><Label>البريد الإلكتروني</Label><Input className="mt-1" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></div>
          <div><Label>العنوان</Label><Input className="mt-1" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="المدينة، الحي..." /></div>
          <div><Label>الرقم الضريبي</Label><Input className="mt-1" dir="ltr" value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} placeholder="الرقم الضريبي" /></div>
          <div>
            <Label>شروط الدفع</Label>
            <Select value={form.paymentTerms || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الشروط" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الشروط</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="net_15">صافي 15 يوم</SelectItem>
                <SelectItem value="net_30">صافي 30 يوم</SelectItem>
                <SelectItem value="net_60">صافي 60 يوم</SelectItem>
                <SelectItem value="net_90">صافي 90 يوم</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addSupplier.isPending}>{addSupplier.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
