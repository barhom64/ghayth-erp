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
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم التصنيف"),
});

export default function CategoriesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addCategory = useApiMutation("/warehouse/categories", "POST", [["warehouse-categories"]]);

  return (
    <CreatePageLayout title="تصنيف جديد" backPath="/warehouse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ name: "" }}
        submitLabel={addCategory.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/warehouse")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addCategory.mutateAsync(values);
          toast({ title: "تمت إضافة التصنيف بنجاح" });
          setLocation("/warehouse");
        }}
      >
        <FormGrid cols={1}>
          <FormTextField name="name" label="اسم التصنيف" required placeholder="اسم التصنيف" />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
