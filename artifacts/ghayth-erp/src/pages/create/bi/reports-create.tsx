import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان التقرير"),
  type: z.enum(["analytics", "summary", "detailed", "comparison"]),
  scheduledAt: z.string().optional(),
  description: z.string().optional(),
  query: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: "analytics", label: "تحليلي" },
  { value: "summary", label: "ملخص" },
  { value: "detailed", label: "تفصيلي" },
  { value: "comparison", label: "مقارنة" },
];

export default function BiReportsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>(
    "/bi/reports",
    "POST",
    [["bi-reports"]],
  );

  return (
    <CreatePageLayout title="إنشاء تقرير جديد" backPath="/bi/reports">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          type: "analytics",
          scheduledAt: "",
          description: "",
          query: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/reports")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            title: values.title,
            type: values.type,
            scheduledAt: values.scheduledAt || undefined,
            description: values.description || undefined,
            query: values.query || undefined,
          });
          toast({ title: "تم إنشاء التقرير بنجاح" });
          setLocation("/bi/reports");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان التقرير" required placeholder="عنوان التقرير" />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <FormDateField name="scheduledAt" label="تاريخ الجدولة" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف التقرير..." />
        <FormTextareaField name="query" label="استعلام البيانات" placeholder="استعلام SQL أو معرّف البيانات..." rows={4} />
      </FormShell>
    </CreatePageLayout>
  );
}
