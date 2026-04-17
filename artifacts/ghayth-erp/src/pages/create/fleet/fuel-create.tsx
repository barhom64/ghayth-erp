import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";

const DRAFT_KEY = "fleet_fuel_create";
const INITIAL = {
  vehicleId: "", driverId: "", liters: "", costPerLiter: "",
  mileageAtFuel: "", fuelDate: new Date().toISOString().split("T")[0], stationName: "",
};

export default function FuelCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/fuel-logs", "POST", [["fleet-fuel"], ["fuel"]]);
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles"], "/fleet/vehicles");
  const { data: driversData } = useApiQuery<{ data: any[] }>(["fleet-drivers"], "/fleet/drivers");
  const vehicles = vehiclesData?.data || [];
  const drivers = driversData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.vehicleId) {
      toast({ variant: "destructive", title: "يرجى اختيار المركبة" });
      return;
    }
    if (!form.liters) {
      toast({ variant: "destructive", title: "كمية الوقود مطلوبة" });
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
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل التعبئة" });
    }
  };

  const totalCost = (Number(form.liters) || 0) * (Number(form.costPerLiter) || 0);

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
        <div>
          <Label>المركبة <span className="text-red-500">*</span></Label>
          <Select value={form.vehicleId} onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر المركبة" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.plateNumber} - {v.make} {v.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>السائق</Label>
          <Select value={form.driverId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, driverId: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="— اختياري —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختياري —</SelectItem>
              {drivers.map((d: any) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>اللترات <span className="text-red-500">*</span></Label><Input className="mt-1" type="number" value={form.liters} onChange={(e) => setForm((f) => ({ ...f, liters: e.target.value }))} /></div>
        <div><Label>سعر اللتر</Label><Input className="mt-1" type="number" step="0.01" value={form.costPerLiter} onChange={(e) => setForm((f) => ({ ...f, costPerLiter: e.target.value }))} /></div>
        {totalCost > 0 && (
          <div><Label>الإجمالي</Label><Input className="mt-1 bg-gray-50 font-bold" value={totalCost.toFixed(2)} readOnly /></div>
        )}
        <div><Label>قراءة العداد (كم)</Label><Input className="mt-1" type="number" value={form.mileageAtFuel} onChange={(e) => setForm((f) => ({ ...f, mileageAtFuel: e.target.value }))} /></div>
        <div><Label>المحطة</Label><Input className="mt-1" value={form.stationName} onChange={(e) => setForm((f) => ({ ...f, stationName: e.target.value }))} /></div>
        <div><Label>التاريخ</Label><div className="mt-1"><DatePicker value={form.fuelDate} onChange={(v) => setForm((f) => ({ ...f, fuelDate: v }))} /></div></div>
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
