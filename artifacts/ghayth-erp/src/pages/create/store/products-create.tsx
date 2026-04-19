import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function ProductsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, hasDraft, clearDraft } = useAutoDraft("store_products_create", {
    name: "", sku: "", category: "", status: "active",
    price: "", costPrice: "", quantity: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | number | undefined>>("/store/products", "POST", [["store-products"], ["store-stats"]]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "يرجى إدخال اسم المنتج";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      toast({ variant: "destructive", title: localErrors[Object.keys(localErrors)[0]] });
      return;
    }
    try {
      await createMut.mutateAsync({
        name: form.name,
        sku: form.sku || undefined,
        category: form.category || undefined,
        status: form.status,
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        quantity: Number(form.quantity) || 0,
        description: form.description || undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة المنتج بنجاح" });
      setLocation("/store");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المنتج", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/store">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم المنتج" required value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} placeholder="اسم المنتج" error={fieldErrors.name} />
          <TextField label="رمز المنتج" dir="ltr" value={form.sku} onChange={(v) => setForm(f => ({ ...f, sku: v }))} placeholder="رمز المنتج" />
          <TextField label="التصنيف" value={form.category} onChange={(v) => setForm(f => ({ ...f, category: v }))} placeholder="تصنيف المنتج" />
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
                <SelectItem value="out_of_stock">نفد المخزون</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label="السعر" value={form.price} onChange={(v) => setForm(f => ({ ...f, price: v }))} placeholder="٠" step={0.01} min={0} />
          <NumberField label="سعر التكلفة" value={form.costPrice} onChange={(v) => setForm(f => ({ ...f, costPrice: v }))} placeholder="٠" step={0.01} min={0} />
          <NumberField label="الكمية" value={form.quantity} onChange={(v) => setForm(f => ({ ...f, quantity: v }))} placeholder="٠" min={0} />
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm(f => ({ ...f, description: v }))} placeholder="وصف المنتج..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/store")}>إلغاء</Button>
          <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
      </form>
    </CreatePageLayout>
  );
}
