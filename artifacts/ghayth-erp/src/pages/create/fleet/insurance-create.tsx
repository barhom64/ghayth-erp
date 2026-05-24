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
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { VehicleContextCard } from "@/components/shared/vehicle-context-card";
import { VehicleSelect } from "@/components/shared/entity-selects";

const schema = z
  .object({
    vehicleId: z.string().min(1, "يرجى اختيار المركبة"),
    type: z.enum(["comprehensive", "third-party"]),
    provider: z.string().min(1, "شركة التأمين مطلوبة"),
    policyNumber: z.string().optional(),
    startDate: z.string().min(1, "تاريخ البدء مطلوب"),
    endDate: z.string().min(1, "تاريخ الانتهاء مطلوب"),
    premium: z.string().optional(),
    coverageAmount: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

const TYPE_OPTIONS = [
  { value: "comprehensive", label: "شامل" },
  { value: "third-party", label: "ضد الغير" },
];

function VehicleCard() {
  const { watch } = useFormContext();
  const vehicleId = watch("vehicleId") as string;
  if (!vehicleId) return null;
  return (
    <div className="mt-3">
      <VehicleContextCard vehicleId={vehicleId} section="insurance" />
    </div>
  );
}

export default function InsuranceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/insurance", "POST", [["insurance"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة تأمين مركبة" backPath="/fleet/insurance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          vehicleId: "",
          type: "comprehensive",
          provider: "",
          policyNumber: "",
          startDate: "",
          endDate: "",
          premium: "",
          coverageAmount: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet/insurance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            vehicleId: Number(values.vehicleId),
            type: values.type,
            provider: values.provider,
            policyNumber: values.policyNumber || undefined,
            startDate: values.startDate,
            endDate: values.endDate,
            premium: values.premium ? Number(values.premium) : 0,
            coverageAmount: values.coverageAmount ? Number(values.coverageAmount) : undefined,
            notes: values.notes || undefined,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إضافة التأمين بنجاح" });
          setLocation("/fleet/insurance");
        }}
      >
        <FormEntitySelect name="vehicleId" select={VehicleSelect} label="المركبة" required />
        <VehicleCard />
        <FormGrid cols={3}>
          <FormSelectField name="type" label="نوع التأمين" options={TYPE_OPTIONS} />
          <FormTextField name="provider" label="شركة التأمين" required />
          <FormTextField name="policyNumber" label="رقم الوثيقة" />
          <FormDateField name="startDate" label="تاريخ البدء" required />
          <FormDateField name="endDate" label="تاريخ الانتهاء" required />
          <FormNumberField name="premium" label="القسط" step="0.01" min="0" />
          <FormNumberField name="coverageAmount" label="مبلغ التغطية" step="0.01" min="0" />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التأمين" />
      </FormShell>
    </CreatePageLayout>
  );
}
