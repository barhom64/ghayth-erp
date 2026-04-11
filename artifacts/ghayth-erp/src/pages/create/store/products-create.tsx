import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

export default function ProductsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, hasDraft, clearDraft } = useAutoDraft("store_products_create", {
    name: "", sku: "", category: "", status: "active",
    price: "", costPrice: "", quantity: "", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | number>>("/store/products", "POST", [["store-products"], ["store-stats"]]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم المنتج" });
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
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المنتج", description: err.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة منتج جديد" backPath="/store">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>اسم المنتج</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المنتج" /></div>
          <div><Label>رمز المنتج (SKU)</Label><Input className="mt-1" dir="ltr" value={form.sku} onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="رمز المنتج" /></div>
          <div><Label>التصنيف</Label><Input className="mt-1" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="تصنيف المنتج" /></div>
          <div><Label>الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
                <SelectItem value="out_of_stock">نفد المخزون</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>السعر</Label><Input className="mt-1" type="number" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} placeholder="٠" /></div>
          <div><Label>سعر التكلفة</Label><Input className="mt-1" type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="٠" /></div>
          <div><Label>الكمية</Label><Input className="mt-1" type="number" value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="٠" /></div>
        </div>
        <div><Label>الوصف</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف المنتج..." /></div>
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
