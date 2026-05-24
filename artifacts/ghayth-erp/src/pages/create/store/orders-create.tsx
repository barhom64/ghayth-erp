import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormPhoneField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { NumberField } from "@/components/shared/form-field-wrapper";

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

const schema = z.object({
  customerName: z.string().min(1, "يرجى إدخال اسم العميل"),
  customerPhone: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "cancelled"]),
  notes: z.string().optional(),
});

const STATUS_OPTIONS = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "processing", label: "قيد التجهيز" },
  { value: "completed", label: "مكتمل" },
  { value: "cancelled", label: "ملغي" },
];

function ClientPicker({ clients }: { clients: any[] }) {
  const { setValue } = useFormContext();
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">اختر من العملاء</label>
      <Select
        value="_none"
        onValueChange={(v) => {
          if (v === "_none") return;
          const client = clients.find((c: any) => String(c.id) === v);
          if (client) {
            setValue("customerName", client.name || "");
            setValue("customerPhone", client.phone || "");
          }
        }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">— اختر عميل أو أدخل يدوياً —</SelectItem>
          {clients.map((c: any) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name} {c.phone ? `- ${c.phone}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function OrdersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const createMut = useApiMutation<unknown, Record<string, any>>(
    "/store/orders",
    "POST",
    [["store-orders"], ["store-stats"]],
  );
  const { data: clientsData, isLoading: loadingC, isError: errorC } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: productsData, isLoading: loadingP, isError: errorP } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");

  if (loadingC || loadingP) return <LoadingSpinner />;
  if (errorC || errorP) return <ErrorState />;

  const clients = clientsData?.data || [];
  const products = productsData?.data || [];

  const addItem = () => setItems([...items, { name: "", quantity: 1, unitPrice: 0 }]);
  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...items];
    if (field === "name") updated[idx].name = value as string;
    else if (field === "quantity") updated[idx].quantity = Number(value) || 0;
    else if (field === "unitPrice") updated[idx].unitPrice = Number(value) || 0;
    setItems(updated);
  };
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const selectProduct = (idx: number, productId: string) => {
    const product = products.find((p: any) => String(p.id) === productId);
    if (product) {
      const updated = [...items];
      updated[idx].name = product.name;
      updated[idx].unitPrice = Number(product.sellingPrice || product.price || 0);
      setItems(updated);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <CreatePageLayout title="طلب جديد" backPath="/store">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ customerName: "", customerPhone: "", status: "pending", notes: "" }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء الطلب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/store")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                customerName: values.customerName,
                customerPhone: values.customerPhone || undefined,
                status: values.status,
                notes: values.notes || undefined,
                totalAmount,
                items: items.length > 0 ? items : undefined,
              },
              {
                onSuccess: () => {
                  toast({ title: "تم إنشاء الطلب بنجاح" });
                  setLocation("/store");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <FormGrid cols={2}>
          <ClientPicker clients={clients} />
          <FormTextField name="customerName" label="اسم العميل" required />
          <FormPhoneField name="customerPhone" label="هاتف العميل" placeholder="05xxxxxxxx" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>

        <FileDropZone files={attachments} onFilesChange={setAttachments} />

        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-base font-semibold">عناصر الطلب</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ إضافة عنصر</Button>
          </div>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground border rounded-md p-4 text-center">
              لم تتم إضافة عناصر بعد. اضغط "إضافة عنصر" للبدء.
            </p>
          )}
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end mb-2">
              <div className="col-span-4">
                {idx === 0 && <Label className="text-xs">المنتج</Label>}
                <Select value="_none" onValueChange={(v) => { if (v !== "_none") selectProduct(idx, v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">اختر من المخزون</SelectItem>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.sku ? `${p.sku} - ` : ""}{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                {idx === 0 && <Label className="text-xs">الاسم</Label>}
                <Input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="اسم العنصر" />
              </div>
              <div className="col-span-2">
                <NumberField label="الكمية" min={1} value={item.quantity} onChange={(v) => updateItem(idx, "quantity", v)} placeholder="1" />
              </div>
              <div className="col-span-2">
                <NumberField label="السعر" step={0.01} value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} placeholder="0.00" />
              </div>
              <div className="col-span-1">
                <Button type="button" variant="ghost" size="sm" className="text-status-error" onClick={() => removeItem(idx)}>✕</Button>
              </div>
            </div>
          ))}
          {items.length > 0 && (
            <div className="flex justify-end mt-2 text-sm font-semibold">
              الإجمالي: {formatCurrency(totalAmount)}
            </div>
          )}
        </div>

        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." />
      </FormShell>
    </CreatePageLayout>
  );
}
