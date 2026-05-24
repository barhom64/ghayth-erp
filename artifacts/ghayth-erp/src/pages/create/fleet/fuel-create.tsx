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

// Watches the FormShell context to render the live vehicle card + total
// cost. Lives inside FormShell so it has access to useFormContext.
function FuelExtras() {
  const { watch } = useFormContext();
  const vehicleId = watch("vehicleId") as string;
  const liters = watch("liters") as string;
  const costPerLiter = watch("costPerLiter") as string;
  const totalCost = roundMoney((Number(liters) || 0) * (Number(costPerLiter) || 0));
  return (
    <>
      {vehicleId && (
        <div className="mt-3">
          <VehicleContextCard vehicleId={vehicleId} section="fuel" />
        </div>
      )}
      {totalCost > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">الإجمالي</label>
            <Input className="bg-surface-subtle font-bold mt-1" value={formatCurrency(totalCost)} readOnly />
          </div>
        </div>
      )}
    </>
  );
}

export default function FuelCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/fuel-logs", "POST", [
    ["fleet-fuel"],
    ["fuel"],
  ]);

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
        <FuelExtras />
        <FormGrid cols={3}>
          <FormEntitySelect name="driverId" select={DriverSelect} label="السائق" />
          <FormNumberField name="liters" label="اللترات" required step="0.01" min="0" />
          <FormNumberField name="costPerLiter" label="سعر اللتر" step="0.01" min="0" />
          <FormNumberField name="mileageAtFuel" label="قراءة العداد (كم)" min="0" />
          <FormTextField name="stationName" label="المحطة" />
          <FormDateField name="fuelDate" label="التاريخ" />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
