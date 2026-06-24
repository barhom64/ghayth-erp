import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";
import { TextAreaField, NumberField, FormFieldWrapper, TextField } from "@/components/shared/form-field-wrapper";
import { SupplierSelect, UnitSelect } from "@/components/shared/entity-selects";

export default function PropertyMaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // POST /properties/maintenance-requests — full request entering the
  // approval workflow.
  const createMut = useApiMutation("/properties/maintenance-requests", "POST", [["maintenance-requests"]]);
  // POST /properties/maintenance — lightweight "log only" variant that
  // skips the approval workflow. Used when the operator is recording a
  // maintenance event that's already been handled (e.g., emergency
  // repair the tenant did themselves) so it shows up in the unit's
  // history without sitting in someone's inbox.
  const createSimpleMut = useApiMutation("/properties/maintenance", "POST", [["maintenance-requests"]]);
  const [simpleMode, setSimpleMode] = useState(false);

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("property_maintenance_create", {
    unitId: "", category: "", description: "", priority: "medium", cost: "",
    supplierId: "", unregisteredSupplierName: "", unregisteredSupplier: false,
  });

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
      const targetMut = simpleMode ? createSimpleMut : createMut;
      await targetMut.mutateAsync({
        unitId: Number(form.unitId),
        category: form.category || undefined,
        description: form.description,
        priority: form.priority,
        estimatedCost: form.cost ? Number(form.cost) : undefined,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        unregisteredSupplierName: form.unregisteredSupplier ? (form.unregisteredSupplierName || undefined) : undefined,
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
        <div>
          <UnitSelect
            label="الوحدة"
            required
            error={fieldErrors.unitId}
            placeholder="اختر الوحدة"
            value={form.unitId}
            onChange={(v) => setForm((f) => ({ ...f, unitId: v }))}
          />
          {form.unitId && (
            <div className="mt-3">
              <PropertyUnitContextCard unitId={form.unitId} section="maintenance" />
            </div>
          )}
        </div>
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
        {form.unregisteredSupplier ? (
          <div>
            <TextField label="اسم المقاول / المورد (غير مسجّل)" value={form.unregisteredSupplierName} onChange={(v) => setForm((f) => ({ ...f, unregisteredSupplierName: v }))} />
            <p className="text-xs text-status-warning-foreground mt-1">استثناء: مورد غير مسجّل (سياسة allowUnregisteredMaintenanceSupplier)</p>
          </div>
        ) : (
          <SupplierSelect value={form.supplierId} onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} label="المقاول / المورد" />
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer self-end pb-2">
          <input type="checkbox" checked={form.unregisteredSupplier} onChange={(e) => setForm((f) => ({ ...f, unregisteredSupplier: e.target.checked, supplierId: "", unregisteredSupplierName: "" }))} />
          مورد غير مسجّل
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 pt-6">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={simpleMode}
            onChange={(e) => setSimpleMode(e.target.checked)}
          />
          تسجيل فقط (تخطّي مسار الموافقة)
        </label>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setLocation("/properties/maintenance")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || createSimpleMut.isPending} rateLimitAware>
            {(createMut.isPending || createSimpleMut.isPending) ? "جاري الإرسال..." : (simpleMode ? "تسجيل" : "إرسال الطلب")}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
