import { useLocation } from "wouter";
import { getCurrencySymbol } from "@/lib/formatters";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

export default function KpisCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("bi_kpis_create", {
    name: "", module: "", target: "", currentValue: "", unit: "", frequency: "monthly", formula: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | number | undefined>>("/bi/kpis", "POST", [["bi-kpis"]]);

  const handleSubmit = () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم المؤشر" });
      return;
    }
    createMut.mutate({
      name: form.name,
      module: form.module || undefined,
      target: Number(form.target) || 0,
      currentValue: Number(form.currentValue) || 0,
      unit: form.unit || undefined,
      frequency: form.frequency,
      formula: form.formula || undefined,
      description: form.description || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إضافة المؤشر بنجاح" }); setLocation("/bi/kpis"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المؤشر", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="إضافة مؤشر أداء" backPath="/bi/kpis">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>اسم المؤشر <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم مؤشر الأداء" /></div>
          <div>
            <Label>القسم</Label>
            <Select value={form.module || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, module: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر القسم</SelectItem>
                <SelectItem value="hr">الموارد البشرية</SelectItem>
                <SelectItem value="finance">المالية</SelectItem>
                <SelectItem value="sales">المبيعات</SelectItem>
                <SelectItem value="operations">العمليات</SelectItem>
                <SelectItem value="marketing">التسويق</SelectItem>
                <SelectItem value="support">الدعم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>القيمة المستهدفة</Label><Input className="mt-1" type="number" step="0.01" value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} placeholder="٠" /></div>
          <div><Label>القيمة الحالية</Label><Input className="mt-1" type="number" step="0.01" value={form.currentValue} onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))} placeholder="٠" /></div>
          <div><Label>وحدة القياس</Label><Input className="mt-1" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder={`% / ${getCurrencySymbol()} / عدد`} /></div>
          <div>
            <Label>فترة القياس</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="quarterly">ربع سنوي</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>المعادلة</Label><Input className="mt-1" value={form.formula} onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))} placeholder="مثال: (الإيرادات / الهدف) × 100" /></div>
        </div>
        <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف المؤشر وكيفية حسابه..." /></div>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/kpis")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
