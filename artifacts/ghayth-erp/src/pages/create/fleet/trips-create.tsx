import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { VehicleSelect, DriverSelect, ClientSelect } from "@/components/shared/entity-selects";

const schema = z
  .object({
    vehicleId: z.string().min(1, "يرجى اختيار المركبة"),
    driverId: z.string().min(1, "يرجى اختيار السائق"),
    clientId: z.string().optional(),
    fromLocation: z.string().min(1, "نقطة الانطلاق مطلوبة"),
    toLocation: z.string().min(1, "نقطة الوصول مطلوبة"),
    distance: z.string().optional(),
    cost: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
    notes: z.string().optional(),
  })
  .refine(
    (v) => !v.startTime || !v.endTime || v.endTime > v.startTime,
    { message: "وقت الوصول يجب أن يكون بعد وقت الانطلاق", path: ["endTime"] },
  );

const STATUS_OPTIONS = [
  { value: "scheduled", label: "مجدولة" },
  { value: "in_progress", label: "جارية" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
];

function VehicleCard() {
  const { watch } = useFormContext();
  const vehicleId = watch("vehicleId") as string;
  if (!vehicleId) return null;
  return (
    <div className="mt-3">
      <VehicleContextCard vehicleId={vehicleId} section="trip" />
    </div>
  );
}

export default function TripsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/trips", "POST", [["trips"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="رحلة جديدة" backPath="/fleet/trips">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          vehicleId: "",
          driverId: "",
          clientId: "",
          fromLocation: "",
          toLocation: "",
          distance: "",
          cost: "",
          startTime: "",
          endTime: "",
          status: "scheduled",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet/trips")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            vehicleId: Number(values.vehicleId),
            driverId: Number(values.driverId),
            clientId: values.clientId ? Number(values.clientId) : undefined,
            fromLocation: values.fromLocation || undefined,
            toLocation: values.toLocation || undefined,
            distance: values.distance ? Number(values.distance) : undefined,
            cost: values.cost ? Number(values.cost) : undefined,
            startTime: values.startTime || undefined,
            endTime: values.endTime || undefined,
            status: values.status,
            notes: values.notes || undefined,
          });
          toast({ title: "تم إنشاء الرحلة بنجاح" });
          setLocation("/fleet/trips");
        }}
      >
        <FormEntitySelect name="vehicleId" select={VehicleSelect} label="المركبة" required />
        <VehicleCard />
        <FormGrid cols={3}>
          <FormEntitySelect name="driverId" select={DriverSelect} label="السائق" required />
          <FormEntitySelect name="clientId" select={ClientSelect} label="العميل" />
          <FormTextField name="fromLocation" label="من" required placeholder="نقطة الانطلاق" />
          <FormTextField name="toLocation" label="إلى" required placeholder="الوجهة" />
          <FormNumberField name="distance" label="المسافة (كم)" min="0" />
          <FormNumberField name="cost" label="التكلفة" step="0.01" min="0" />
          <FormTextField name="startTime" label="وقت المغادرة" type="datetime-local" />
          <FormTextField name="endTime" label="وقت الوصول" type="datetime-local" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
