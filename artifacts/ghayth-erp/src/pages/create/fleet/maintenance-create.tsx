import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "fleet_maintenance_create";
const INITIAL = {
  vehicleId: "", type: "", description: "", cost: "",
  mileageAtService: "", serviceDate: new Date().toISOString().split("T")[0],
  nextServiceDate: "", nextServiceKm: "", performedBy: "", status: "pending",
};

export default function MaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-maintenance"]]);
  const { data: vehiclesData, isLoading, isError } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const vehicles = vehiclesData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    const firstError = validate({
      vehicleId: form.vehicleId ? null : "يرجى اختيار المركبة",
      type: form.type ? null : "نوع الصيانة مطلوب",
      description: form.description.trim() ? null : "وصف الصيانة مطلوب",
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
        cost: form.cost ? Number(form.cost) : undefined,
        mileageAtService: form.mileageAtService ? Number(form.mileageAtService) : undefined,
        serviceDate: form.serviceDate || undefined,
        nextServiceDate: form.nextServiceDate || undefined,
        nextServiceKm: form.nextServiceKm ? Number(form.nextServiceKm) : undefined,
        performedBy: form.performedBy || undefined,
        status: form.status,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تم إضافة سجل الصيانة بنجاح" });
      setLocation("/fleet/maintenance");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الصيانة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة صيانة مركبة" backPath="/fleet/maintenance">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormFieldWrapper label="المركبة" required error={fieldErrors.vehicleId} className="md:col-span-3">
          <Select value={form.vehicleId} onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))}>
            <SelectTrigger><SelectValue placeholder="اختر المركبة" /></SelectTrigger>
            <SelectContent>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} - {v.make} {v.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.vehicleId && (
            <div className="mt-3">
              <VehicleContextCard vehicleId={form.vehicleId} section="maintenance" />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="نوع الصيانة" required error={fieldErrors.type}>
          <Select value={form.type || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, type: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر النوع</SelectItem>
              <SelectItem value="preventive">وقائية</SelectItem>
              <SelectItem value="corrective">إصلاحية</SelectItem>
              <SelectItem value="scheduled">مجدولة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">معلقة</SelectItem>
              <SelectItem value="in_progress">جارية</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <NumberField label="التكلفة" value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} step={0.01} min={0} />
        <NumberField label="قراءة العداد" value={form.mileageAtService} onChange={(v) => setForm((f) => ({ ...f, mileageAtService: v }))} min={0} />
        <FormFieldWrapper label="تاريخ الصيانة">
          <DatePicker value={form.serviceDate} onChange={(v) => setForm((f) => ({ ...f, serviceDate: v }))} />
        </FormFieldWrapper>
        <FormFieldWrapper label="موعد الصيانة القادمة">
          <DatePicker value={form.nextServiceDate} onChange={(v) => setForm((f) => ({ ...f, nextServiceDate: v }))} />
        </FormFieldWrapper>
        <NumberField label="الكيلومترات القادمة" value={form.nextServiceKm} onChange={(v) => setForm((f) => ({ ...f, nextServiceKm: v }))} placeholder="مثال: 50000" min={0} />
        <TextField label="الورشة / الفني" value={form.performedBy} onChange={(v) => setForm((f) => ({ ...f, performedBy: v }))} />
        <TextAreaField label="الوصف" required value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} error={fieldErrors.description} className="md:col-span-3" />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الصيانة" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/maintenance")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
