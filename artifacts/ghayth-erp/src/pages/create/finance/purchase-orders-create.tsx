import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { CostCenterSelect } from "@/components/shared/entity-selects";
import { useAppContext } from "@/contexts/app-context";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "finance_purchase_orders_create";

export default function PurchaseOrdersCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/finance/purchase-requests", "POST", [["purchase-orders"], ["purchase-requests"]]);
  const { data: suppliersData, isLoading, isError } = useApiQuery<{ data: any[] }>(["suppliers-list"], "/warehouse/suppliers");
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: productsData } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const suppliers = suppliersData?.data || [];
  const branches = branchesData?.data || [];
  const products = productsData?.data || [];
  const { data: copySource } = useApiQuery<any>(["po-copy", copyFromId || ""], `/finance/purchase-orders/${copyFromId}`, !!copyFromId);

  const INITIAL = { supplierId: "", notes: "", branchId: selectedBranchId ? String(selectedBranchId) : "", companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "", costCenter: "", expectedDelivery: "", date: new Date().toISOString().split("T")[0] };
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [items, setItems] = useState([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  const totalAmount = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.supplierId) localErrors.supplierId = "المورد مطلوب";
    if (!form.branchId) localErrors.branchId = "الفرع مطلوب";
    const validItems = items.filter((i) => Number(i.unitPrice) > 0 && i.productId);
    if (validItems.length === 0) localErrors.items = "يرجى إضافة بند واحد على الأقل";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      toast({ variant: "destructive", title: localErrors[Object.keys(localErrors)[0]] });
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
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
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
        <FormFieldWrapper label="المورد" required error={fieldErrors.supplierId}>
          <Autocomplete
            value={form.supplierId}
            onChange={(v) => setForm((f) => ({ ...f, supplierId: String(v) }))}
            options={suppliers.map((s: any) => ({ value: String(s.id), label: s.name }))}
            placeholder="ابحث عن مورد..."
            emptyMessage="لا يوجد موردين"
          />
          {form.supplierId && (
            <div className="mt-3">
              <SupplierContextCard supplierId={form.supplierId} />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="الفرع" required error={fieldErrors.branchId}>
          <Select value={form.branchId} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v }))}>
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {branches.map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
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
        <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{totalAmount.toFixed(2)}</span></div>
      </div>

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
