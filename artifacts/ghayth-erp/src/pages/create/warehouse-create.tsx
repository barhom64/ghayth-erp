import { useState } from "react";
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
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const nonNegative = (label: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || Number(v) >= 0, `${label} يجب أن يكون صفر أو أكثر`);

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم المنتج"),
  sku: z.string().min(1, "يرجى إدخال رمز المنتج"),
  categoryId: z.string().optional(),
  unit: z.enum(["piece", "kg", "liter", "meter", "box"]),
  costPrice: nonNegative("سعر التكلفة"),
  sellPrice: nonNegative("سعر البيع"),
  currentStock: nonNegative("المخزون الحالي"),
  minStock: nonNegative("الحد الأدنى"),
  location: z.string().optional(),
});

const UNIT_OPTIONS = [
  { value: "piece", label: "قطعة" },
  { value: "kg", label: "كيلوغرام" },
  { value: "liter", label: "لتر" },
  { value: "meter", label: "متر" },
  { value: "box", label: "صندوق" },
];

export default function WarehouseCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProduct = useApiMutation(
    "/warehouse/products",
    "POST",
    [["warehouse-products"], ["warehouse-stats"]],
  );
  const { data: categoriesRes, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["warehouse-categories"],
    "/warehouse/categories",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const categories = categoriesRes?.data || [];
  const categoryOptions = categories.map((c: any) => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/warehouse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          sku: "",
          categoryId: "",
          unit: "piece",
          costPrice: "",
          sellPrice: "",
          currentStock: "",
          minStock: "",
          location: "",
        }}
        submitLabel={addProduct.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/warehouse")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addProduct.mutateAsync({
            name: values.name,
            sku: values.sku,
            categoryId: values.categoryId ? Number(values.categoryId) : undefined,
            unit: values.unit,
            costPrice: Number(values.costPrice) || 0,
            sellPrice: Number(values.sellPrice) || 0,
            currentStock: Number(values.currentStock) || 0,
            minStock: Number(values.minStock) || 0,
            location: values.location || undefined,
          });
          toast({ title: "تمت إضافة المنتج بنجاح" });
          setLocation("/warehouse");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المنتج" required placeholder="اسم المنتج" />
          <FormTextField name="sku" label="رمز المنتج" required placeholder="رمز المنتج" />
          <FormSelectField name="categoryId" label="التصنيف" options={categoryOptions} placeholder="بدون تصنيف" />
          <FormSelectField name="unit" label="الوحدة" options={UNIT_OPTIONS} />
          <FormNumberField name="costPrice" label="سعر التكلفة" placeholder="٠" step="0.01" min="0" />
          <FormNumberField name="sellPrice" label="سعر البيع" placeholder="٠" step="0.01" min="0" />
          <FormNumberField name="currentStock" label="المخزون الحالي" placeholder="٠" min="0" />
          <FormNumberField name="minStock" label="الحد الأدنى" placeholder="٠" min="0" />
        </FormGrid>
        <FormTextField name="location" label="الموقع في المستودع" placeholder="الموقع في المستودع" />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
