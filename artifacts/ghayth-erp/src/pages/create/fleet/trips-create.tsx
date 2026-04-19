import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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
  const { data: vehiclesData, isLoading: loadingV, isError: errorV } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: driversData, isLoading: loadingD, isError: errorD } = useApiQuery<{ data: any[] }>(["fleet-drivers"], "/fleet/drivers");
  const { data: clientsData, isLoading: loadingC, isError: errorC } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const vehicles = vehiclesData?.data || [];
  const drivers = driversData?.data || [];
  const clients = clientsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (loadingV || loadingD || loadingC) return <LoadingSpinner />;
  if (errorV || errorD || errorC) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.vehicleId) localErrors.vehicleId = "يرجى اختيار المركبة";
    if (!form.driverId) localErrors.driverId = "يرجى اختيار السائق";
    if (!form.fromLocation) localErrors.fromLocation = "نقطة الانطلاق مطلوبة";
    if (!form.toLocation) localErrors.toLocation = "نقطة الوصول مطلوبة";
    if (form.startTime && form.endTime && form.endTime <= form.startTime) localErrors.endTime = "وقت الوصول يجب أن يكون بعد وقت الانطلاق";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      toast({ variant: "destructive", title: localErrors[Object.keys(localErrors)[0]] });
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
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
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
              <VehicleContextCard vehicleId={form.vehicleId} section="trip" />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="السائق" required error={fieldErrors.driverId}>
          <Select value={form.driverId} onValueChange={(v) => setForm((f) => ({ ...f, driverId: v }))}>
            <SelectTrigger><SelectValue placeholder="اختر السائق" /></SelectTrigger>
            <SelectContent>
              {drivers.map((d: any) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="العميل">
          <Select value={form.clientId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— بدون عميل —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— بدون عميل —</SelectItem>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="من" required value={form.fromLocation} onChange={(v) => setForm((f) => ({ ...f, fromLocation: v }))} placeholder="نقطة الانطلاق" error={fieldErrors.fromLocation} />
        <TextField label="إلى" required value={form.toLocation} onChange={(v) => setForm((f) => ({ ...f, toLocation: v }))} placeholder="الوجهة" error={fieldErrors.toLocation} />
        <NumberField label="المسافة (كم)" value={form.distance} onChange={(v) => setForm((f) => ({ ...f, distance: v }))} min={0} />
        <NumberField label="التكلفة" value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} step={0.01} min={0} />
        <FormFieldWrapper label="وقت المغادرة">
          <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
        </FormFieldWrapper>
        <FormFieldWrapper label="وقت الوصول" error={fieldErrors.endTime}>
          <Input type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
        </FormFieldWrapper>
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
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
