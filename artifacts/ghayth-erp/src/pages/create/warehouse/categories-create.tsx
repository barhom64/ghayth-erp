import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "warehouse_categories_create";
const INITIAL = { name: "" };

export default function CategoriesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addCategory = useApiMutation("/warehouse/categories", "POST", [["warehouse-categories"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم التصنيف",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await addCategory.mutateAsync(form);
      clearDraft();
      toast({ title: "تمت إضافة التصنيف بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة التصنيف", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="تصنيف جديد" backPath="/warehouse">
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
        <TextField label="اسم التصنيف" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم التصنيف" error={fieldErrors.name} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addCategory.isPending} rateLimitAware>{addCategory.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
