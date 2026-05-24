import { useLocation } from "wouter";
import { z } from "zod";
import { getCurrencySymbol } from "@/lib/formatters";
import { useApiMutation } from "@/lib/api";
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
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم المؤشر"),
  module: z.string().optional(),
  target: z.string().optional(),
  currentValue: z.string().optional(),
  unit: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  formula: z.string().optional(),
  description: z.string().optional(),
});

const MODULE_OPTIONS = [
  { value: "hr", label: "الموارد البشرية" },
  { value: "finance", label: "المالية" },
  { value: "sales", label: "المبيعات" },
  { value: "operations", label: "العمليات" },
  { value: "marketing", label: "التسويق" },
  { value: "support", label: "الدعم" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "yearly", label: "سنوي" },
];

export default function KpisCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | number | undefined>>(
    "/bi/kpis",
    "POST",
    [["bi-kpis"]],
  );

  return (
    <CreatePageLayout title="إضافة مؤشر أداء" backPath="/bi/kpis">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          module: "",
          target: "",
          currentValue: "",
          unit: "",
          frequency: "monthly",
          formula: "",
          description: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/kpis")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            name: values.name,
            module: values.module || undefined,
            target: Number(values.target) || 0,
            currentValue: Number(values.currentValue) || 0,
            unit: values.unit || undefined,
            frequency: values.frequency,
            formula: values.formula || undefined,
            description: values.description || undefined,
          });
          toast({ title: "تم إضافة المؤشر بنجاح" });
          setLocation("/bi/kpis");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المؤشر" required placeholder="اسم مؤشر الأداء" />
          <FormSelectField name="module" label="القسم" options={MODULE_OPTIONS} placeholder="اختر القسم" />
          <FormNumberField name="target" label="القيمة المستهدفة" placeholder="٠" step="0.01" />
          <FormNumberField name="currentValue" label="القيمة الحالية" placeholder="٠" step="0.01" />
          <FormTextField name="unit" label="وحدة القياس" placeholder={`% / ${getCurrencySymbol()} / عدد`} />
          <FormSelectField name="frequency" label="فترة القياس" options={FREQUENCY_OPTIONS} />
          <FormTextField name="formula" label="المعادلة" placeholder="مثال: (الإيرادات / الهدف) × 100" className="md:col-span-2" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف المؤشر وكيفية حسابه..." />
      </FormShell>
    </CreatePageLayout>
  );
}
