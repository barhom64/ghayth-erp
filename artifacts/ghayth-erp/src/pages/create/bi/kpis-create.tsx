import { useLocation } from "wouter";
import { getCurrencySymbol } from "@/lib/formatters";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function KpisCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("bi_kpis_create", {
    name: "", module: "", target: "", currentValue: "", unit: "", frequency: "monthly", formula: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | number | undefined>>("/bi/kpis", "POST", [["bi-kpis"]]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم المؤشر",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
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
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المؤشر", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="إضافة مؤشر أداء" backPath="/bi/kpis">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم المؤشر" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم مؤشر الأداء" error={fieldErrors.name} />
          <FormFieldWrapper label="القسم">
            <Select value={form.module || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, module: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
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
          </FormFieldWrapper>
          <NumberField label="القيمة المستهدفة" value={form.target} onChange={(v) => setForm((f) => ({ ...f, target: v }))} placeholder="٠" step={0.01} />
          <NumberField label="القيمة الحالية" value={form.currentValue} onChange={(v) => setForm((f) => ({ ...f, currentValue: v }))} placeholder="٠" step={0.01} />
          <TextField label="وحدة القياس" value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} placeholder={`% / ${getCurrencySymbol()} / عدد`} />
          <FormFieldWrapper label="فترة القياس">
            <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="quarterly">ربع سنوي</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="المعادلة" value={form.formula} onChange={(v) => setForm((f) => ({ ...f, formula: v }))} placeholder="مثال: (الإيرادات / الهدف) × 100" className="md:col-span-2" />
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف المؤشر وكيفية حسابه..." />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/kpis")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
