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
  FormCheckboxField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال اسم لوحة المعلومات"),
  description: z.string().optional(),
  isDefault: z.boolean(),
});

export default function DashboardsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | boolean | undefined>>(
    "/bi/dashboards",
    "POST",
    [["bi-dashboards"]],
  );

  return (
    <CreatePageLayout title="إنشاء لوحة معلومات" backPath="/bi/dashboards">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ title: "", description: "", isDefault: false }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/bi/dashboards")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            title: values.title,
            description: values.description || undefined,
            isDefault: values.isDefault,
          });
          toast({ title: "تم إنشاء لوحة المعلومات بنجاح" });
          setLocation("/bi/dashboards");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="اسم اللوحة" required placeholder="اسم لوحة المعلومات" />
          <FormCheckboxField name="isDefault" label="لوحة افتراضية" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف لوحة المعلومات..." />
      </FormShell>
    </CreatePageLayout>
  );
}
