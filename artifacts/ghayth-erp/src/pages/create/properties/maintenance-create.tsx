import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { PropertyUnitContextCard } from "@/components/shared/property-unit-context-card";

const schema = z.object({
  unitId: z.string().min(1, "يرجى اختيار الوحدة"),
  category: z.string().optional(),
  description: z.string().min(1, "وصف الطلب مطلوب"),
  priority: z.enum(["low", "medium", "high"]),
  cost: z
    .string()
    .optional()
    .refine(
      (v) => !v || Number(v) >= 0,
      "التكلفة يجب أن تكون صفر أو أكثر",
    ),
});

const CATEGORY_OPTIONS = [
  { value: "plumbing", label: "سباكة" },
  { value: "electrical", label: "كهرباء" },
  { value: "hvac", label: "تكييف" },
  { value: "general", label: "عامة" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
];

function UnitContextCard() {
  const { watch } = useFormContext();
  const unitId = watch("unitId") as string;
  if (!unitId) return null;
  return (
    <div className="mt-3">
      <PropertyUnitContextCard unitId={unitId} section="maintenance" />
    </div>
  );
}

export default function PropertyMaintenanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation(
    "/properties/maintenance-requests",
    "POST",
    [["maintenance-requests"]],
  );
  const { data: unitsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["property-units"],
    "/properties/units",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const units = unitsData?.data || [];
  const unitOptions = units.map((u: any) => ({
    value: String(u.id),
    label: `${u.unitNumber} - ${u.buildingName || ""}`,
  }));

  return (
    <CreatePageLayout title="طلب صيانة جديد" backPath="/properties/maintenance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          unitId: "",
          category: "",
          description: "",
          priority: "medium",
          cost: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/properties/maintenance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            unitId: Number(values.unitId),
            category: values.category || undefined,
            description: values.description,
            priority: values.priority,
            estimatedCost: values.cost ? Number(values.cost) : undefined,
          });
          toast({ title: "تم إنشاء طلب الصيانة بنجاح" });
          setLocation("/properties/maintenance");
        }}
      >
        <FormGrid cols={2}>
          <div>
            <FormSelectField name="unitId" label="الوحدة" required options={unitOptions} placeholder="اختر الوحدة" />
            <UnitContextCard />
          </div>
          <FormSelectField name="category" label="الفئة" options={CATEGORY_OPTIONS} placeholder="اختر الفئة" />
          <FormSelectField name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
          <FormNumberField name="cost" label="التكلفة" placeholder="0" step="0.01" min="0" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" required rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
