import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, NumberField, DateField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { VehicleSelect, EmployeeSelect, ClientSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "fleet_trips_create";
const INITIAL = {
  vehicleId: "", driverId: "", clientId: "",
  fromLocation: "", toLocation: "", distance: "", cost: "",
  startTime: "", endTime: "", status: "scheduled", notes: "",
};

export default function TripsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/trips", "POST", [["trips"]]);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      vehicleId: form.vehicleId ? null : "يرجى اختيار المركبة",
      driverId: form.driverId ? null : "يرجى اختيار السائق",
      fromLocation: form.fromLocation ? null : "نقطة الانطلاق مطلوبة",
      toLocation: form.toLocation ? null : "نقطة الوصول مطلوبة",
      endTime: form.startTime && form.endTime && form.endTime <= form.startTime ? "وقت الوصول يجب أن يكون بعد وقت الانطلاق" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        driverId: Number(form.driverId),
        clientId: form.clientId ? Number(form.clientId) : undefined,
        fromLocation: form.fromLocation || undefined,
        toLocation: form.toLocation || undefined,
        distance: form.distance ? Number(form.distance) : undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        status: form.status,
        notes: form.notes || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء الرحلة بنجاح" });
      setLocation("/fleet/trips");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الرحلة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="رحلة جديدة" backPath="/fleet/trips">
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
        <div className="md:col-span-3">
          <VehicleSelect value={form.vehicleId} onChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))} label="المركبة" required error={fieldErrors.vehicleId} />
          {form.vehicleId && (
            <div className="mt-3">
              <VehicleContextCard vehicleId={form.vehicleId} section="trip" />
            </div>
          )}
        </div>
        <EmployeeSelect value={form.driverId} onChange={(v) => setForm((f) => ({ ...f, driverId: v }))} label="السائق" required error={fieldErrors.driverId} />
        <ClientSelect value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: v }))} label="العميل" />
        <TextField label="من" required value={form.fromLocation} onChange={(v) => setForm((f) => ({ ...f, fromLocation: v }))} placeholder="نقطة الانطلاق" error={fieldErrors.fromLocation} />
        <TextField label="إلى" required value={form.toLocation} onChange={(v) => setForm((f) => ({ ...f, toLocation: v }))} placeholder="الوجهة" error={fieldErrors.toLocation} />
        <NumberField label="المسافة (كم)" value={form.distance} onChange={(v) => setForm((f) => ({ ...f, distance: v }))} min={0} />
        <NumberField label="التكلفة" value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} step={0.01} min={0} />
        <DateField label="وقت المغادرة" mode="datetime" value={form.startTime} onChange={(v) => setForm((f) => ({ ...f, startTime: v }))} />
        <DateField label="وقت الوصول" mode="datetime" value={form.endTime} onChange={(v) => setForm((f) => ({ ...f, endTime: v }))} error={fieldErrors.endTime} />
        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">مجدولة</SelectItem>
              <SelectItem value="in_progress">جارية</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} className="md:col-span-3" />
      </div>
      
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/trips")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
