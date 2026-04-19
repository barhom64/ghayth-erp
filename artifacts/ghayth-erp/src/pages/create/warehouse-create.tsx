import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "warehouse_product_create";
const INITIAL = { name: "", sku: "", categoryId: "", unit: "piece", costPrice: "", sellPrice: "", currentStock: "", minStock: "", location: "" };

export default function WarehouseCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProduct = useApiMutation("/warehouse/products", "POST", [["warehouse-products"], ["warehouse-stats"]]);
  const { data: categoriesRes, isLoading, isError } = useApiQuery<{ data: any[] }>(["warehouse-categories"], "/warehouse/categories");
  const categories = categoriesRes?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "يرجى إدخال اسم المنتج";
    if (form.costPrice && Number(form.costPrice) < 0) localErrors.costPrice = "سعر التكلفة يجب أن يكون صفر أو أكثر";
    if (form.sellPrice && Number(form.sellPrice) < 0) localErrors.sellPrice = "سعر البيع يجب أن يكون صفر أو أكثر";
    if (form.minStock && Number(form.minStock) < 0) localErrors.minStock = "الحد الأدنى يجب أن يكون صفر أو أكثر";
    if (form.currentStock && Number(form.currentStock) < 0) localErrors.currentStock = "المخزون الحالي يجب أن يكون صفر أو أكثر";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await addProduct.mutateAsync({
        name: form.name,
        sku: form.sku || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        unit: form.unit,
        costPrice: Number(form.costPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
        currentStock: Number(form.currentStock) || 0,
        minStock: Number(form.minStock) || 0,
        location: form.location || undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة المنتج بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المنتج", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/warehouse">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم المنتج" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم المنتج" error={fieldErrors.name} />
          <TextField label="رمز المنتج" dir="ltr" value={form.sku} onChange={(v) => setForm((f) => ({ ...f, sku: v }))} placeholder="رمز المنتج" />
          <FormFieldWrapper label="التصنيف">
            <Select value={form.categoryId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون تصنيف</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الوحدة">
            <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="piece">قطعة</SelectItem>
                <SelectItem value="kg">كيلوغرام</SelectItem>
                <SelectItem value="liter">لتر</SelectItem>
                <SelectItem value="meter">متر</SelectItem>
                <SelectItem value="box">صندوق</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label="سعر التكلفة" value={form.costPrice} onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.costPrice} />
          <NumberField label="سعر البيع" value={form.sellPrice} onChange={(v) => setForm((f) => ({ ...f, sellPrice: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.sellPrice} />
          <NumberField label="المخزون الحالي" value={form.currentStock} onChange={(v) => setForm((f) => ({ ...f, currentStock: v }))} placeholder="٠" min={0} error={fieldErrors.currentStock} />
          <NumberField label="الحد الأدنى" value={form.minStock} onChange={(v) => setForm((f) => ({ ...f, minStock: v }))} placeholder="٠" min={0} error={fieldErrors.minStock} />
        </div>
        <TextField label="الموقع في المستودع" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="الموقع في المستودع" />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addProduct.isPending}>{addProduct.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
