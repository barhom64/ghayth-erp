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
  FormTextField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { ProductContextCard } from "@/components/shared/product-context-card";

const STOCK_DECREASE_TYPES = new Set(["out", "transfer_out", "adjustment_out"]);

const schema = z.object({
  productId: z.string().min(1, "يرجى اختيار المنتج"),
  type: z.enum(["in", "out", "return", "transfer_in", "transfer_out", "adjustment_in", "adjustment_out"]),
  quantity: z
    .string()
    .refine((v) => Number(v) > 0, "الكمية يجب أن تكون أكبر من صفر"),
  unitCost: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: "in", label: "إدخال" },
  { value: "out", label: "إخراج" },
  { value: "return", label: "إرجاع" },
  { value: "transfer_in", label: "تحويل وارد" },
  { value: "transfer_out", label: "تحويل صادر" },
  { value: "adjustment_in", label: "تسوية - زيادة" },
  { value: "adjustment_out", label: "تسوية - نقص" },
];

function ProductCard({ products }: { products: any[] }) {
  const { watch } = useFormContext();
  const productId = watch("productId") as string;
  const type = watch("type") as string;
  if (!productId) return null;
  return (
    <div className="mt-3">
      <ProductContextCard
        productId={productId}
        section={STOCK_DECREASE_TYPES.has(type) ? "out" : "in"}
      />
    </div>
  );
}

function OverdrawWarning({ products }: { products: any[] }) {
  const { watch } = useFormContext();
  const productId = watch("productId") as string;
  const type = watch("type") as string;
  const quantity = Number(watch("quantity") || 0);
  const selectedProduct = products.find((p: any) => String(p.id) === productId);
  const currentStock = Number(selectedProduct?.currentStock ?? 0);
  const wouldOverdraw = Boolean(selectedProduct && STOCK_DECREASE_TYPES.has(type) && quantity > currentStock);
  if (!wouldOverdraw) return null;
  return (
    <div className="rounded-lg border border-status-error-surface bg-status-error-surface px-4 py-3 text-sm text-status-error-foreground">
      الكمية المطلوبة ({quantity}) تتجاوز المخزون المتاح ({currentStock}). سيمنع النظام تنفيذ هذه الحركة.
    </div>
  );
}

export default function MovementsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation(
    "/warehouse/movements",
    "POST",
    [["warehouse-movements"], ["warehouse-stats"]],
  );
  const { data: productsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["warehouse-products"],
    "/warehouse/products",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const products = productsData?.data || [];
  const productOptions = products.map((p: any) => ({
    value: String(p.id),
    label: `${p.sku ? `${p.sku} - ` : ""}${p.name}`,
  }));

  return (
    <CreatePageLayout title="حركة مخزون جديدة" backPath="/warehouse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          productId: "",
          type: "in",
          quantity: "",
          unitCost: "",
          reference: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/warehouse")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values, { setFieldError }) => {
          const selectedProduct = products.find((p: any) => String(p.id) === values.productId);
          const currentStock = Number(selectedProduct?.currentStock ?? 0);
          const requestedQty = Number(values.quantity);
          if (selectedProduct && STOCK_DECREASE_TYPES.has(values.type) && requestedQty > currentStock) {
            setFieldError("quantity", `الكمية المطلوبة تتجاوز المخزون المتاح (${currentStock})`);
            return;
          }
          await createMut.mutateAsync({
            productId: Number(values.productId),
            type: values.type,
            quantity: requestedQty,
            unitCost: values.unitCost ? Number(values.unitCost) : undefined,
            reference: values.reference || undefined,
            notes: values.notes || undefined,
          });
          toast({ title: "تمت إضافة الحركة بنجاح" });
          setLocation("/warehouse");
        }}
      >
        <div>
          <FormSelectField
            name="productId"
            label="المنتج"
            required
            options={productOptions}
            placeholder="اختر المنتج"
            className="md:col-span-2"
          />
          <ProductCard products={products} />
        </div>
        <FormGrid cols={2}>
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <FormNumberField name="quantity" label="الكمية" required min="0" step="0.01" />
          <FormNumberField name="unitCost" label="تكلفة الوحدة" step="0.01" min="0" />
          <FormTextField name="reference" label="المرجع" />
          <FormTextField name="notes" label="ملاحظات" />
        </FormGrid>
        <OverdrawWarning products={products} />
      </FormShell>
    </CreatePageLayout>
  );
}
