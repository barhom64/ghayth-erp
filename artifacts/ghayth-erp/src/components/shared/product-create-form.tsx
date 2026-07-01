import { useState } from "react";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ITEM_TYPES, isStockItem } from "@/lib/item-type";

const INITIAL = { name: "", sku: "", itemType: "product", categoryId: "", unit: "piece", costPrice: "", sellPrice: "", currentStock: "", minStock: "", location: "" };

export interface ProductCreateFormProps {
  /** Called with the freshly-created product row after a successful save. */
  onCreated: (product: any) => void;
  /** Called when the operator cancels (back / إلغاء). */
  onCancel: () => void;
  /** Draft-recovery key — distinct per host so the page and an inline
   *  drawer don't clobber each other's draft. */
  draftKey?: string;
  /** Hide the attachments dropzone (e.g. the inline drawer keeps it lean). */
  showAttachments?: boolean;
}

/**
 * The unified product-creation form body — shared by the full page
 * (`warehouse-create.tsx`) and the inline `allowCreate` drawer in
 * `ProductSelect`. Owns its own state, validation, mutation, audit/event
 * side-effects (server-side), so an inline create is identical to a
 * page create — no truncated quick-add.
 */
export function ProductCreateForm({ onCreated, onCancel, draftKey = "warehouse_product_create", showAttachments = true }: ProductCreateFormProps) {
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProduct = useApiMutation("/warehouse/products", "POST", [["warehouse-products"], ["warehouse-stats"]]);
  const { data: categoriesRes, isLoading, isError } = useApiQuery<{ data: any[] }>(["warehouse-categories"], "/warehouse/categories");
  const categories = categoriesRes?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(draftKey, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  // D-1 (توجيه إبراهيم) — هل النوع المختار مخزني؟ الخدمة/الأصل/الرقمي لا يُمسك لها
  // مخزون (تطابق سلوك الخلفية)، فحقول المخزون لا تُعرض ولا تُتحقَّق ولا تُرسَل لها.
  const stockTracked = isStockItem(form.itemType);

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم المنتج",
      sku: form.sku ? null : "يرجى إدخال رمز المنتج",
      costPrice: form.costPrice && Number(form.costPrice) < 0 ? "سعر التكلفة يجب أن يكون صفر أو أكثر" : null,
      sellPrice: form.sellPrice && Number(form.sellPrice) < 0 ? "سعر البيع يجب أن يكون صفر أو أكثر" : null,
      minStock: stockTracked && form.minStock && Number(form.minStock) < 0 ? "الحد الأدنى يجب أن يكون صفر أو أكثر" : null,
      currentStock: stockTracked && form.currentStock && Number(form.currentStock) < 0 ? "المخزون الحالي يجب أن يكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      const created = await addProduct.mutateAsync({
        name: form.name,
        sku: form.sku,
        itemType: form.itemType,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        costPrice: Number(form.costPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
        // حقول المخزون تُرسَل للأنواع المخزنية فقط؛ غير المخزني يُحفظ بلا رصيد/وحدة/موقع.
        unit: stockTracked ? form.unit : undefined,
        currentStock: stockTracked ? Number(form.currentStock) || 0 : 0,
        minStock: stockTracked ? Number(form.minStock) || 0 : 0,
        location: stockTracked ? form.location || undefined : undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة المنتج بنجاح" });
      onCreated(created);
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المنتج", description: err?.fix ?? err?.message });
    }
  };

  return (
    <>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم المنتج" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="اسم المنتج" error={fieldErrors.name} />
          <TextField label="رمز المنتج" required dir="ltr" value={form.sku} onChange={(v) => setForm((f) => ({ ...f, sku: v }))} placeholder="رمز المنتج" error={fieldErrors.sku} />
          <FormFieldWrapper label="نوع الصنف">
            <Select value={form.itemType} onValueChange={(v) => setForm((f) => ({ ...f, itemType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="التصنيف">
            <Select value={form.categoryId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون تصنيف</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          {stockTracked && (
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
          )}
          <NumberField label="سعر التكلفة" value={form.costPrice} onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.costPrice} />
          <NumberField label="سعر البيع" value={form.sellPrice} onChange={(v) => setForm((f) => ({ ...f, sellPrice: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.sellPrice} />
          {stockTracked && (
            <>
              <NumberField label="المخزون الحالي" value={form.currentStock} onChange={(v) => setForm((f) => ({ ...f, currentStock: v }))} placeholder="٠" min={0} error={fieldErrors.currentStock} />
              <NumberField label="الحد الأدنى" value={form.minStock} onChange={(v) => setForm((f) => ({ ...f, minStock: v }))} placeholder="٠" min={0} error={fieldErrors.minStock} />
            </>
          )}
        </div>
        {stockTracked && (
          <TextField label="الموقع في المستودع" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="الموقع في المستودع" />
        )}
        {showAttachments && <FileDropZone files={attachments} onFilesChange={setAttachments} />}
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addProduct.isPending} rateLimitAware>{addProduct.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </>
  );
}
