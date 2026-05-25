import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect, SupplierSelect, BranchSelect } from "@/components/shared/entity-selects";
import { useAppContext } from "@/contexts/app-context";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { NumberField } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

const schema = z.object({
  supplierId: z.string().min(1, "المورد مطلوب"),
  notes: z.string().optional(),
  branchId: z.string().min(1, "الفرع مطلوب"),
  companyId: z.string().optional(),
  costCenter: z.string().optional(),
  expectedDelivery: z.string().optional(),
  date: z.string(),
});

function SupplierCard() {
  const { watch } = useFormContext();
  const supplierId = watch("supplierId") as string;
  if (!supplierId) return null;
  return (
    <div className="mt-3">
      <SupplierContextCard supplierId={supplierId} />
    </div>
  );
}

function ImpactPreview({ items }: { items: any[] }) {
  const { watch } = useFormContext();
  const supplierId = watch("supplierId") as string;
  const costCenter = watch("costCenter") as string;
  const totalAmount = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
  if (!supplierId || totalAmount <= 0) return null;
  return (
    <ImpactPreviewButton
      endpoint="/finance/purchase-requests/impact-preview"
      payload={{
        supplierId: Number(supplierId),
        costCenter: costCenter || undefined,
        items: items.map((i) => ({
          quantity: Number(i.quantity || 0),
          unitPrice: Number(i.unitPrice || 0),
        })),
      }}
      label="معاينة أثر الطلب"
    />
  );
}

export default function PurchaseOrdersCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/finance/purchase-requests", "POST", [["purchase-orders"], ["purchase-requests"]]);
  const { data: productsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const { data: copySource } = useApiQuery<any>(["po-copy", copyFromId || ""], `/finance/purchase-orders/${copyFromId}`, !!copyFromId);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [items, setItems] = useState([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copySource && !copied) {
      setCopied(true);
      if (copySource.lines?.length) {
        setItems(copySource.lines.map((l: any) => ({
          productId: String(l.productId || ""),
          quantity: String(l.quantity || 1),
          unitPrice: String(l.unitPrice || ""),
        })));
      }
    }
  }, [copySource, copied]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const products = productsData?.data || [];

  const addItem = () => setItems([...items, { productId: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const totalAmount = roundMoney(items.reduce((sum, i) => sum + roundMoney(Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0));

  return (
    <CreatePageLayout title="طلب شراء جديد" backPath="/finance/purchase-orders">
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          supplierId: copySource?.supplierId ? String(copySource.supplierId) : "",
          notes: copySource?.notes || "",
          branchId: selectedBranchId ? String(selectedBranchId) : (copySource?.branchId ? String(copySource.branchId) : ""),
          companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : (copySource?.companyId ? String(copySource.companyId) : ""),
          costCenter: copySource?.costCenter || "",
          expectedDelivery: copySource?.expectedDelivery || "",
          date: todayLocal(),
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/purchase-orders")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const validItems = items.filter((i) => Number(i.unitPrice) > 0 && i.productId);
          if (validItems.length === 0) {
            toast({ variant: "destructive", title: "يرجى إضافة بند واحد على الأقل" });
            return;
          }
          await createMut.mutateAsync({
            supplierId: values.supplierId ? Number(values.supplierId) : undefined,
            notes: values.notes || undefined,
            branchId: values.branchId ? Number(values.branchId) : undefined,
            companyId: values.companyId ? Number(values.companyId) : undefined,
            costCenter: values.costCenter || undefined,
            expectedDelivery: values.expectedDelivery || undefined,
            date: values.date || undefined,
            totalAmount,
            items: validItems.map((i) => ({
              productId: i.productId ? Number(i.productId) : undefined,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unitPrice),
            })),
          });
          toast({ title: "تم إنشاء طلب الشراء بنجاح" });
          setLocation("/finance/purchase-orders");
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="date" label="التاريخ" />
        </FormGrid>
        <FormGrid cols={2}>
          <div>
            <FormEntitySelect name="supplierId" select={SupplierSelect} label="المورد" required />
            <SupplierCard />
          </div>
          <FormEntitySelect name="branchId" select={BranchSelect} label="الفرع" required />
          <FormEntitySelect name="costCenter" select={CostCenterSelect} label="مركز التكلفة" />
          <FormDateField name="expectedDelivery" label="تاريخ التسليم المتوقع" />
          <FormTextField name="notes" label="ملاحظات" className="md:col-span-2" />
        </FormGrid>

        <div>
          <Label className="text-base font-semibold">البنود</Label>
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 mt-2 items-end">
              <div>
                <Label className="text-xs">المنتج</Label>
                <Select value={item.productId || "_none"} onValueChange={(v) => updateItem(idx, "productId", v === "_none" ? "" : v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="اختر من المخزون" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">اختر من المخزون</SelectItem>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.sku ? `${p.sku} - ` : ""}{p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField label="الكمية" value={item.quantity} onChange={(v) => updateItem(idx, "quantity", v)} placeholder="1" />
              <NumberField label="سعر الوحدة" value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} placeholder="0.00" />
              <Button type="button" variant="destructive" size="sm" onClick={() => removeItem(idx)} disabled={items.length <= 1}>حذف</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>+ إضافة بند</Button>
        </div>

        <div className="bg-muted/50 p-4 rounded-md text-sm">
          <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{formatCurrency(totalAmount)}</span></div>
        </div>

        <ImpactPreview items={items} />

        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
