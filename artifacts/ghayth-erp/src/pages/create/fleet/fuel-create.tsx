import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { formatCurrency, roundMoney , todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "fleet_fuel_create";
const INITIAL = {
  vehicleId: "", driverId: "", liters: "", costPerLiter: "",
  mileageAtFuel: "", fuelDate: todayLocal(), stationName: "",
};

export default function FuelCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/fuel-logs", "POST", [["fleet-fuel"], ["fuel"]]);
  const { data: vehiclesData, isLoading, isError } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: driversData } = useApiQuery<{ data: any[] }>(["fleet-drivers"], "/fleet/drivers");
  const vehicles = vehiclesData?.data || [];
  const drivers = driversData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    const firstError = validate({
      vehicleId: form.vehicleId ? null : "يرجى اختيار المركبة",
      liters: !form.liters || Number(form.liters) <= 0 ? "كمية الوقود يجب أن تكون أكبر من صفر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        vehicleId: Number(form.vehicleId),
        driverId: form.driverId ? Number(form.driverId) : undefined,
        liters: Number(form.liters),
        costPerLiter: form.costPerLiter ? Number(form.costPerLiter) : undefined,
        mileageAtFuel: form.mileageAtFuel ? Number(form.mileageAtFuel) : undefined,
        fuelDate: form.fuelDate || undefined,
        stationName: form.stationName || undefined,
      });
      clearDraft();
      toast({ title: "تم تسجيل التعبئة بنجاح" });
      setLocation("/fleet/fuel");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل التعبئة", description: err?.fix ?? err?.message });
    }
  };

  const totalCost = roundMoney((Number(form.liters) || 0) * (Number(form.costPerLiter) || 0));

  return (
    <CreatePageLayout title="تسجيل تعبئة وقود" backPath="/fleet/fuel">
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
              <VehicleContextCard vehicleId={form.vehicleId} section="fuel" />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="السائق">
          <Select value={form.driverId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, driverId: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختياري —</SelectItem>
              {drivers.map((d: any) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <NumberField label="اللترات" required value={form.liters} onChange={(v) => setForm((f) => ({ ...f, liters: v }))} step={0.01} min={0} error={fieldErrors.liters} />
        <NumberField label="سعر اللتر" value={form.costPerLiter} onChange={(v) => setForm((f) => ({ ...f, costPerLiter: v }))} step={0.01} min={0} />
        {totalCost > 0 && (
          <FormFieldWrapper label="الإجمالي">
            <Input className="bg-gray-50 font-bold" value={formatCurrency(totalCost)} readOnly />
          </FormFieldWrapper>
        )}
        <NumberField label="قراءة العداد (كم)" value={form.mileageAtFuel} onChange={(v) => setForm((f) => ({ ...f, mileageAtFuel: v }))} min={0} />
        <TextField label="المحطة" value={form.stationName} onChange={(v) => setForm((f) => ({ ...f, stationName: v }))} />
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.fuelDate} onChange={(v) => setForm((f) => ({ ...f, fuelDate: v }))} />
        </FormFieldWrapper>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/fuel")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
