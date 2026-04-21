import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency, roundMoney , todayLocal } from "@/lib/formatters";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect, SupplierSelect, BranchSelect } from "@/components/shared/entity-selects";
import { useAppContext } from "@/contexts/app-context";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

const DRAFT_KEY = "finance_purchase_orders_create";

export default function PurchaseOrdersCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/finance/purchase-requests", "POST", [["purchase-orders"], ["purchase-requests"]]);
  const { data: productsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const products = productsData?.data || [];
  const { data: copySource } = useApiQuery<any>(["po-copy", copyFromId || ""], `/finance/purchase-orders/${copyFromId}`, !!copyFromId);

  const INITIAL = { supplierId: "", notes: "", branchId: selectedBranchId ? String(selectedBranchId) : "", companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "", costCenter: "", expectedDelivery: "", date: todayLocal() };
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [items, setItems] = useState([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [copied, setCopied] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  useEffect(() => {
    if (copySource && !copied) {
      setCopied(true);
      setForm((prev) => ({
        ...prev,
        supplierId: String(copySource.supplierId || ""),
        notes: copySource.notes || "",
        branchId: copySource.branchId ? String(copySource.branchId) : prev.branchId,
        companyId: copySource.companyId ? String(copySource.companyId) : prev.companyId,
        costCenter: copySource.costCenter || "",
        expectedDelivery: copySource.expectedDelivery || "",
      }));
      if (copySource.lines?.length) {
        setItems(copySource.lines.map((l: any) => ({ productId: String(l.productId || ""), quantity: String(l.quantity || 1), unitPrice: String(l.unitPrice || "") })));
      }
    }
  }, [copySource, copied, setForm]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const addItem = () => setItems([...items, { productId: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const totalAmount = roundMoney(items.reduce((sum, i) => sum + roundMoney(Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0));

  const handleSubmit = async () => {
    const validItems = items.filter((i) => Number(i.unitPrice) > 0 && i.productId);
    const firstError = validate({
      supplierId: form.supplierId ? null : "المورد مطلوب",
      branchId: form.branchId ? null : "الفرع مطلوب",
      items: validItems.length === 0 ? "يرجى إضافة بند واحد على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        notes: form.notes || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        companyId: form.companyId ? Number(form.companyId) : undefined,
        costCenter: form.costCenter || undefined,
        expectedDelivery: form.expectedDelivery || undefined,
        date: form.date || undefined,
        totalAmount,
        items: validItems.map((i) => ({
          productId: i.productId ? Number(i.productId) : undefined,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      clearDraft();
      toast({ title: "تم إنشاء طلب الشراء بنجاح" });
      setLocation("/finance/purchase-orders");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء طلب الشراء", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="طلب شراء جديد" backPath="/finance/purchase-orders">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </FormFieldWrapper>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <SupplierSelect
            value={form.supplierId}
            onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
            label="المورد"
            required
            error={fieldErrors.supplierId}
          />
          {form.supplierId && (
            <div className="mt-3">
              <SupplierContextCard supplierId={form.supplierId} />
            </div>
          )}
        </div>
        <BranchSelect
          value={form.branchId}
          onChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
          label="الفرع"
          required
          error={fieldErrors.branchId}
        />
        <CostCenterSelect
          value={form.costCenter}
          onChange={(v) => setForm((f) => ({ ...f, costCenter: v }))}
        />
        <FormFieldWrapper label="تاريخ التسليم المتوقع">
          <DatePicker value={form.expectedDelivery} onChange={(v) => setForm((f) => ({ ...f, expectedDelivery: v }))} />
        </FormFieldWrapper>
        <TextField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} className="md:col-span-2" />
      </div>

      <div className="mb-4">
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
                  {products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.sku ? `${p.sku} - ` : ""}{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">الكمية</Label><Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} /></div>
            <div><Label className="text-xs">سعر الوحدة</Label><Input type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} /></div>
            <Button type="button" variant="destructive" size="sm" onClick={() => removeItem(idx)} disabled={items.length <= 1}>حذف</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>+ إضافة بند</Button>
      </div>

      <div className="bg-muted/50 p-4 rounded-md text-sm">
        <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{formatCurrency(totalAmount)}</span></div>
      </div>

      {form.supplierId && totalAmount > 0 && (
        <ImpactPreviewButton
          endpoint="/finance/purchase-requests/impact-preview"
          payload={{
            supplierId: Number(form.supplierId),
            costCenter: form.costCenter || undefined,
            items: items.map((i) => ({
              quantity: Number(i.quantity || 0),
              unitPrice: Number(i.unitPrice || 0),
            })),
          }}
          label="معاينة أثر الطلب"
        />
      )}

      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/purchase-orders")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
