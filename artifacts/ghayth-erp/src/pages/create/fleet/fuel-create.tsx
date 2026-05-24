import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { VehicleSelect, DriverSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  vehicleId: z.string().min(1, "يرجى اختيار المركبة"),
  driverId: z.string().optional(),
  liters: z
    .string()
    .min(1, "كمية الوقود يجب أن تكون أكبر من صفر")
    .refine((v) => Number(v) > 0, "كمية الوقود يجب أن تكون أكبر من صفر"),
  costPerLiter: z.string().optional(),
  mileageAtFuel: z.string().optional(),
  fuelDate: z.string().optional(),
  stationName: z.string().optional(),
});

function VehicleCard() {
  const { watch } = useFormContext();
  const vehicleId = watch("vehicleId") as string;
  if (!vehicleId) return null;
  return (
    <div className="mt-3">
      <VehicleContextCard vehicleId={vehicleId} section="fuel" />
    </div>
  );
}

function TotalCostDisplay() {
  const { watch } = useFormContext();
  const liters = Number(watch("liters") || 0);
  const cpl = Number(watch("costPerLiter") || 0);
  const total = roundMoney(liters * cpl);
  if (total <= 0) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">الإجمالي</Label>
      <Input className="bg-surface-subtle font-bold" value={formatCurrency(total)} readOnly />
    </div>
  );
}

export default function FuelCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/fuel-logs", "POST", [["fleet-fuel"], ["fuel"]]);

  return (
    <CreatePageLayout title="تسجيل تعبئة وقود" backPath="/fleet/fuel">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          vehicleId: "",
          driverId: "",
          liters: "",
          costPerLiter: "",
          mileageAtFuel: "",
          fuelDate: todayLocal(),
          stationName: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet/fuel")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            vehicleId: Number(values.vehicleId),
            driverId: values.driverId ? Number(values.driverId) : undefined,
            liters: Number(values.liters),
            costPerLiter: values.costPerLiter ? Number(values.costPerLiter) : undefined,
            mileageAtFuel: values.mileageAtFuel ? Number(values.mileageAtFuel) : undefined,
            fuelDate: values.fuelDate || undefined,
            stationName: values.stationName || undefined,
          });
          toast({ title: "تم تسجيل التعبئة بنجاح" });
          setLocation("/fleet/fuel");
        }}
      >
        <FormEntitySelect name="vehicleId" select={VehicleSelect} label="المركبة" required />
        <VehicleCard />
        <FormGrid cols={3}>
          <FormEntitySelect name="driverId" select={DriverSelect} label="السائق" />
          <FormNumberField name="liters" label="اللترات" required step="0.01" min="0" />
          <FormNumberField name="costPerLiter" label="سعر اللتر" step="0.01" min="0" />
          <TotalCostDisplay />
          <FormNumberField name="mileageAtFuel" label="قراءة العداد (كم)" min="0" />
          <FormTextField name="stationName" label="المحطة" />
          <FormDateField name="fuelDate" label="التاريخ" />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
