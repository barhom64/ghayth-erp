import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان الطلب"),
  typeId: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  requester: z.string().optional(),
  description: z.string().min(1, "يرجى إدخال وصف الطلب"),
});

const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
];

export default function RequestsItemCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>(
    "/requests",
    "POST",
    [["requests"]],
  );
  const { data: typesRes, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["request-types"],
    "/requests/types",
  );
  const types = typesRes?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const typeOptions = types.map((t: { id: number; name: string }) => ({
    value: String(t.id),
    label: t.name,
  }));

  return (
    <CreatePageLayout title="طلب جديد" backPath="/requests">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          typeId: "",
          priority: "medium",
          requester: "",
          description: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/requests")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            title: values.title,
            typeId: values.typeId || undefined,
            priority: values.priority,
            requester: values.requester || undefined,
            description: values.description,
          });
          toast({ title: "تم إنشاء الطلب بنجاح" });
          setLocation("/requests");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان الطلب" required placeholder="عنوان الطلب" />
          <FormSelectField name="typeId" label="النوع" placeholder="اختر النوع" options={typeOptions} />
          <FormSelectField name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
          <FormTextField name="requester" label="مقدم الطلب" placeholder="اسم مقدم الطلب" />
        </FormGrid>
        <FormTextareaField name="description" label="التفاصيل" required placeholder="تفاصيل الطلب..." />
      </FormShell>
    </CreatePageLayout>
  );
}
