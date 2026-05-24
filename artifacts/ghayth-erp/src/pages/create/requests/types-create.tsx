import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم نوع الطلب"),
  category: z.enum(["administrative", "financial", "technical", "hr", "maintenance"]),
  isActive: z.boolean(),
  description: z.string().optional(),
});

const CATEGORY_OPTIONS = [
  { value: "administrative", label: "إداري" },
  { value: "financial", label: "مالي" },
  { value: "technical", label: "تقني" },
  { value: "hr", label: "موارد بشرية" },
  { value: "maintenance", label: "صيانة" },
];

export default function RequestsTypeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | boolean | undefined>>(
    "/requests/types",
    "POST",
    [["request-types"]],
  );

  return (
    <CreatePageLayout title="إضافة نوع طلب" backPath="/requests/types">
      <FormShell
        schema={schema}
        defaultValues={{ name: "", category: "administrative", isActive: true, description: "" }}
        submitLabel={createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/requests/types")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            name: values.name,
            category: values.category,
            isActive: values.isActive,
            description: values.description || undefined,
          });
          toast({ title: "تم إضافة نوع الطلب بنجاح" });
          setLocation("/requests/types");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم النوع" required placeholder="اسم نوع الطلب" />
          <FormSelectField name="category" label="التصنيف" options={CATEGORY_OPTIONS} />
          <FormCheckboxField name="isActive" label="نشط" className="pt-6" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف نوع الطلب..." />
      </FormShell>
    </CreatePageLayout>
  );
}
