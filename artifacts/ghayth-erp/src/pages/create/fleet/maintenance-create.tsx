import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
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
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { VehicleSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  vehicleId: z.string().min(1, "يرجى اختيار المركبة"),
  type: z.enum(["preventive", "corrective", "scheduled"]),
  description: z.string().min(1, "وصف الصيانة مطلوب"),
  cost: z.string().optional(),
  mileageAtService: z.string().optional(),
  serviceDate: z.string().optional(),
  nextServiceDate: z.string().optional(),
  nextServiceKm: z.string().optional(),
  performedBy: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]),
});

const TYPE_OPTIONS = [
  { value: "preventive", label: "وقائية" },
  { value: "corrective", label: "إصلاحية" },
  { value: "scheduled", label: "مجدولة" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "معلقة" },
  { value: "in_progress", label: "جارية" },
  { value: "completed", label: "مكتملة" },
];

function VehicleCard() {
  const { watch } = useFormContext();
  const vehicleId = watch("vehicleId") as string;
  if (!vehicleId) return null;
  return (
    <div className="mt-3">
      <VehicleContextCard vehicleId={vehicleId} section="maintenance" />
    </div>
  );
}

export default function MaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/maintenance", "POST", [["fleet-maintenance"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة صيانة مركبة" backPath="/fleet/maintenance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          vehicleId: "",
          type: "preventive",
          description: "",
          cost: "",
          mileageAtService: "",
          serviceDate: todayLocal(),
          nextServiceDate: "",
          nextServiceKm: "",
          performedBy: "",
          status: "pending",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet/maintenance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            vehicleId: Number(values.vehicleId),
            type: values.type,
            description: values.description,
            cost: values.cost ? Number(values.cost) : undefined,
            mileageAtService: values.mileageAtService ? Number(values.mileageAtService) : undefined,
            serviceDate: values.serviceDate || undefined,
            nextServiceDate: values.nextServiceDate || undefined,
            nextServiceKm: values.nextServiceKm ? Number(values.nextServiceKm) : undefined,
            performedBy: values.performedBy || undefined,
            status: values.status,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إضافة سجل الصيانة بنجاح" });
          setLocation("/fleet/maintenance");
        }}
      >
        <FormEntitySelect name="vehicleId" select={VehicleSelect} label="المركبة" required />
        <VehicleCard />
        <FormGrid cols={3}>
          <FormSelectField name="type" label="نوع الصيانة" required options={TYPE_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormNumberField name="cost" label="التكلفة" step="0.01" min="0" />
          <FormNumberField name="mileageAtService" label="قراءة العداد" min="0" />
          <FormDateField name="serviceDate" label="تاريخ الصيانة" />
          <FormDateField name="nextServiceDate" label="موعد الصيانة القادمة" />
          <FormNumberField name="nextServiceKm" label="الكيلومترات القادمة" placeholder="مثال: 50000" min="0" />
          <FormTextField name="performedBy" label="الورشة / الفني" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" required />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات الصيانة" />
      </FormShell>
    </CreatePageLayout>
  );
}
