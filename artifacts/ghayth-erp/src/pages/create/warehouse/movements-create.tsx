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
import { ProductContextCard } from "@/components/shared/product-context-card";

const DRAFT_KEY = "warehouse_movements_create";
const INITIAL = { productId: "", type: "in", quantity: "", unitCost: "", reference: "", notes: "" };

export default function MovementsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/warehouse/movements", "POST", [["warehouse-movements"], ["warehouse-stats"]]);
  const { data: productsData } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const products = productsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const handleSubmit = async () => {
    if (!form.productId) {
      toast({ variant: "destructive", title: "يرجى اختيار المنتج" });
      return;
    }
    if (!form.quantity) {
      toast({ variant: "destructive", title: "الكمية مطلوبة" });
      return;
    }
    try {
      await createMut.mutateAsync({
        productId: Number(form.productId),
        type: form.type,
        quantity: Number(form.quantity),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      clearDraft();
      toast({ title: "تمت إضافة الحركة بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الحركة", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="حركة مخزون جديدة" backPath="/warehouse">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label>المنتج</Label>
          <Select value={form.productId} onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر المنتج" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.sku ? `${p.sku} - ` : ""}{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.productId && (
            <div className="mt-3">
              <ProductContextCard
                productId={form.productId}
                section={form.type === "out" ? "out" : "in"}
              />
            </div>
          )}
        </div>
        <div>
          <Label>النوع</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">إدخال</SelectItem>
              <SelectItem value="out">إخراج</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>الكمية</Label><Input className="mt-1" type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
        <div><Label>تكلفة الوحدة</Label><Input className="mt-1" type="number" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} /></div>
        <div><Label>المرجع</Label><Input className="mt-1" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} /></div>
        <div><Label>ملاحظات</Label><Input className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
