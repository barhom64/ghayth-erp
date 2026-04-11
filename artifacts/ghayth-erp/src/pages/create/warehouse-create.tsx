import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const DRAFT_KEY = "warehouse_product_create";
const INITIAL = { name: "", sku: "", categoryId: "", unit: "piece", costPrice: "", sellPrice: "", currentStock: "", minStock: "", location: "" };

export default function WarehouseCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProduct = useApiMutation("/warehouse/products", "POST", [["warehouse-products"], ["warehouse-stats"]]);
  const { data: categoriesRes } = useApiQuery<{ data: any[] }>(["warehouse-categories"], "/warehouse/categories");
  const categories = categoriesRes?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم المنتج" });
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
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المنتج", description: err.message });
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
          <div><Label>اسم المنتج</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم المنتج" /></div>
          <div><Label>رمز المنتج (SKU)</Label><Input className="mt-1" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="رمز المنتج" /></div>
          <div>
            <Label>التصنيف</Label>
            <Select value={form.categoryId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === "_none" ? "" : v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون تصنيف</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الوحدة</Label>
            <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="piece">قطعة</SelectItem>
                <SelectItem value="kg">كيلوغرام</SelectItem>
                <SelectItem value="liter">لتر</SelectItem>
                <SelectItem value="meter">متر</SelectItem>
                <SelectItem value="box">صندوق</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>سعر التكلفة</Label><Input className="mt-1" type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))} placeholder="٠" /></div>
          <div><Label>سعر البيع</Label><Input className="mt-1" type="number" step="0.01" value={form.sellPrice} onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))} placeholder="٠" /></div>
          <div><Label>المخزون الحالي</Label><Input className="mt-1" type="number" value={form.currentStock} onChange={(e) => setForm((f) => ({ ...f, currentStock: e.target.value }))} placeholder="٠" /></div>
          <div><Label>الحد الأدنى</Label><Input className="mt-1" type="number" value={form.minStock} onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))} placeholder="٠" /></div>
        </div>
        <div><Label>الموقع في المستودع</Label><Input className="mt-1" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="الموقع في المستودع" /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addProduct.isPending}>{addProduct.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
