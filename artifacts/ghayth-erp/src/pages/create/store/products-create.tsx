import { useState } from "react";
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
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم المنتج"),
  sku: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["active", "inactive", "draft"]),
  price: z.string().optional(),
  costPrice: z.string().optional(),
  quantity: z.string().optional(),
  description: z.string().optional(),
});

const STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "inactive", label: "غير نشط" },
  { value: "draft", label: "مسودة" },
];

export default function ProductsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, string | number | undefined>>(
    "/store/products",
    "POST",
    [["store-products"], ["store-stats"]],
  );

  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/store">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          sku: "",
          category: "",
          status: "active",
          price: "",
          costPrice: "",
          quantity: "",
          description: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/store")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            name: values.name,
            sku: values.sku || undefined,
            category: values.category || undefined,
            status: values.status,
            price: Number(values.price) || 0,
            costPrice: Number(values.costPrice) || 0,
            quantity: Number(values.quantity) || 0,
            description: values.description || undefined,
          });
          toast({ title: "تمت إضافة المنتج بنجاح" });
          setLocation("/store");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المنتج" required placeholder="اسم المنتج" />
          <FormTextField name="sku" label="رمز المنتج" placeholder="رمز المنتج" />
          <FormTextField name="category" label="التصنيف" placeholder="تصنيف المنتج" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormNumberField name="price" label="السعر" placeholder="٠" step="0.01" min="0" />
          <FormNumberField name="costPrice" label="سعر التكلفة" placeholder="٠" step="0.01" min="0" />
          <FormNumberField name="quantity" label="الكمية" placeholder="٠" min="0" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف المنتج..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
