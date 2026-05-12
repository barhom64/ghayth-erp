import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Checkbox } from "@/components/ui/checkbox";
import { TextField, TextAreaField } from "@/components/shared/form-field-wrapper";

export default function DashboardsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("bi_dashboards_create", {
    title: "", description: "", isDefault: false,
  });
  const createMut = useApiMutation<unknown, Record<string, string | boolean | undefined>>("/bi/dashboards", "POST", [["bi-dashboards"]]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "يرجى إدخال اسم لوحة المعلومات",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({ title: form.title, description: form.description || undefined, isDefault: form.isDefault }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء لوحة المعلومات بنجاح" }); setLocation("/bi/dashboards"); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء لوحة المعلومات", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="إنشاء لوحة معلومات" backPath="/bi/dashboards">
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
          <TextField label="اسم اللوحة" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="اسم لوحة المعلومات" error={fieldErrors.title} />
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="isDefault"
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v === true }))}
            />
            <Label htmlFor="isDefault">لوحة افتراضية</Label>
          </div>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف لوحة المعلومات..." />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/dashboards")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
