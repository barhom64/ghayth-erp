import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Checkbox } from "@/components/ui/checkbox";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function RequestsTypeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("requests_type_create", {
    name: "", category: "administrative", isActive: true, description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | boolean | undefined>>("/requests/types", "POST", [["request-types"]]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    setFieldErrors({});
    if (!form.name) {
      setFieldErrors({ name: "يرجى إدخال اسم نوع الطلب" });
      toast({ variant: "destructive", title: "يرجى إدخال اسم نوع الطلب" });
      return;
    }
    createMut.mutate({
      name: form.name,
      category: form.category,
      isActive: form.isActive,
      description: form.description || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إضافة نوع الطلب بنجاح" }); setLocation("/requests/types"); },
      onError: (err: any) => {
        if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة نوع الطلب", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="إضافة نوع طلب" backPath="/requests/types">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم النوع" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم نوع الطلب" error={fieldErrors.name} />
          <FormFieldWrapper label="التصنيف">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrative">إداري</SelectItem>
                <SelectItem value="financial">مالي</SelectItem>
                <SelectItem value="technical">تقني</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="maintenance">صيانة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v === true }))}
            />
            <Label htmlFor="isActive">نشط</Label>
          </div>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف نوع الطلب..." />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/requests/types")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
