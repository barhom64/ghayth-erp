import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Autocomplete } from "@/components/ui/autocomplete";
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
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن المركبة..."
            value={form.vehicleId}
            onChange={(v) => setForm((f) => ({ ...f, vehicleId: String(v) }))}
            options={vehicles.map((v: any) => ({ value: String(v.id), label: `${v.plateNumber} - ${v.make || ""} ${v.model || ""}` }))}
          />
        </div>
        <div>
          <Label>السائق</Label>
          <Autocomplete
            className="mt-1"
            placeholder="ابحث عن السائق..."
            value={form.driverId}
            onChange={(v) => setForm((f) => ({ ...f, driverId: String(v) }))}
            options={drivers.map((d: any) => ({ value: String(d.id), label: d.name }))}
          />
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
      {totalCost > 0 && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <p className="font-semibold mb-1">سيتم تلقائياً عند الحفظ:</p>
          <ul className="list-disc list-inside space-y-1 text-green-700">
            <li>إنشاء قيد محاسبي: مدين مصروف وقود / دائن النقدية بمبلغ {totalCost.toFixed(2)} ريال</li>
            <li>ربط القيد بالمركبة المحددة لتتبع تكاليف الوقود لكل مركبة</li>
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/fuel")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
