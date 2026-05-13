import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function BiReportsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("bi_reports_create", {
    title: "", type: "analytics", scheduledAt: "", description: "", query: "",
  });
  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/bi/reports", "POST", [["bi-reports"]]);

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "يرجى إدخال عنوان التقرير",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      title: form.title,
      type: form.type,
      scheduledAt: form.scheduledAt || undefined,
      description: form.description || undefined,
      query: form.query || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء التقرير بنجاح" }); setLocation("/bi/reports"); },
      onError: (err: any) => { setApiError(err); toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التقرير", description: err.message }); },
    });
  };

  return (
    <CreatePageLayout title="إنشاء تقرير جديد" backPath="/bi/reports">
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
          <TextField
            label="عنوان التقرير"
            required
            value={form.title}
            onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="عنوان التقرير"
            error={fieldErrors.title}
          />
          <FormFieldWrapper label="النوع">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="analytics">تحليلي</SelectItem>
                <SelectItem value="summary">ملخص</SelectItem>
                <SelectItem value="detailed">تفصيلي</SelectItem>
                <SelectItem value="comparison">مقارنة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الجدولة">
            <DatePicker value={form.scheduledAt} onChange={(v) => setForm((f) => ({ ...f, scheduledAt: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField
          label="الوصف"
          value={form.description}
          onChange={(v) => setForm((f) => ({ ...f, description: v }))}
          placeholder="وصف التقرير..."
        />
        <FormFieldWrapper label="استعلام البيانات">
          <Textarea
            value={form.query}
            onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
            placeholder="استعلام SQL أو معرّف البيانات..."
            className="min-h-[80px] font-mono text-sm"
            dir="ltr"
          />
        </FormFieldWrapper>
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/reports")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الحفظ..." : "حفظ"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
