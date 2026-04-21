import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { VehicleSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "fleet_alerts_create";
const INITIAL = { vehicleId: "", type: "scheduled", description: "", serviceDate: "", performedBy: "" };

export default function FleetAlertsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-alerts"], ["fleet-maintenance"]]);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      vehicleId: form.vehicleId ? null : "يرجى اختيار المركبة",
      type: form.type ? null : "نوع التنبيه مطلوب",
      description: form.description.trim() ? null : "وصف التنبيه مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        type: form.type,
        description: form.description,
        serviceDate: form.serviceDate || undefined,
        performedBy: form.performedBy || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء التنبيه بنجاح" });
      setLocation("/fleet/alerts");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التنبيه", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة تنبيه صيانة" backPath="/fleet/alerts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <VehicleSelect value={form.vehicleId} onChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))} label="المركبة" required error={fieldErrors.vehicleId} />
          {form.vehicleId && (
            <div className="mt-3">
              <VehicleContextCard vehicleId={form.vehicleId} section="maintenance" />
            </div>
          )}
        </div>
        <FormFieldWrapper label="نوع التنبيه" required error={fieldErrors.type}>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">صيانة مجدولة</SelectItem>
              <SelectItem value="preventive">صيانة وقائية</SelectItem>
              <SelectItem value="corrective">صيانة إصلاحية</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="تاريخ الاستحقاق">
          <DatePicker value={form.serviceDate} onChange={(v) => setForm((f) => ({ ...f, serviceDate: v }))} />
        </FormFieldWrapper>
        <TextField label="الفني المسؤول" value={form.performedBy} onChange={(v) => setForm((f) => ({ ...f, performedBy: v }))} />
        <TextAreaField label="التفاصيل" required value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="تفاصيل التنبيه..." error={fieldErrors.description} className="md:col-span-2" />
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button type="button" variant="outline" onClick={() => setLocation("/fleet/alerts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
