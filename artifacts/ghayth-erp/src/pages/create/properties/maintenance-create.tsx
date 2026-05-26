import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function PropertyMaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/properties/maintenance-requests", "POST", [["maintenance-requests"]]);
  const { data: unitsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["property-units"], "/properties/units");
  const units = unitsData?.data || [];

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("property_maintenance_create", {
    unitId: "", category: "", description: "", priority: "medium", cost: "",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      unitId: form.unitId ? null : "يرجى اختيار الوحدة",
      description: form.description ? null : "وصف الطلب مطلوب",
      cost: form.cost && Number(form.cost) < 0 ? "التكلفة يجب أن تكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        unitId: Number(form.unitId),
        category: form.category || undefined,
        description: form.description,
        priority: form.priority,
        estimatedCost: form.cost ? Number(form.cost) : undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء طلب الصيانة بنجاح" });
      setLocation("/properties/maintenance");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="طلب صيانة جديد" backPath="/properties/maintenance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormFieldWrapper label="الوحدة" required error={fieldErrors.unitId}>
          <Select value={form.unitId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, unitId: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الوحدة</SelectItem>
              {units.map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber} - {u.buildingName || ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.unitId && (
            <div className="mt-3">
              <PropertyUnitContextCard unitId={form.unitId} section="maintenance" />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="الفئة">
          <Select value={form.category || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الفئة</SelectItem>
              <SelectItem value="plumbing">سباكة</SelectItem>
              <SelectItem value="electrical">كهرباء</SelectItem>
              <SelectItem value="hvac">تكييف</SelectItem>
              <SelectItem value="general">عامة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الأولوية">
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">منخفضة</SelectItem>
              <SelectItem value="medium">متوسطة</SelectItem>
              <SelectItem value="high">عالية</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextAreaField label="الوصف" required value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} rows={3} error={fieldErrors.description} className="md:col-span-2" />
        <NumberField label="التكلفة" value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} placeholder="0" step={0.01} min={0} error={fieldErrors.cost} />
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/maintenance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
