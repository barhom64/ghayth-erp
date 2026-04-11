import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function OrdersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, any>>("/store/orders", "POST", [["store-orders"], ["store-stats"]]);
  const { data: clientsData } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: productsData } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const clients = clientsData?.data || [];
  const products = productsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("store_orders_create", {
    customerName: "", customerPhone: "", status: "pending", notes: "",
  });
  const [items, setItems] = useState<OrderItem[]>([]);

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c: any) => String(c.id) === clientId);
    if (client) {
      setForm((f) => ({ ...f, customerName: client.name || "", customerPhone: client.phone || "" }));
    }
  };

  const addItem = () => {
    setItems([...items, { name: "", quantity: 1, unitPrice: 0 }]);
  };

  const updateItem = (idx: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...items];
    if (field === "name") updated[idx].name = value as string;
    else if (field === "quantity") updated[idx].quantity = Number(value) || 0;
    else if (field === "unitPrice") updated[idx].unitPrice = Number(value) || 0;
    setItems(updated);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

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

  const handleSubmit = () => {
    if (!form.customerName) {
      toast({ variant: "destructive", title: "يرجى إدخال اسم العميل" });
      return;
    }
    createMut.mutate({
      customerName: form.customerName,
      customerPhone: form.customerPhone || undefined,
      status: form.status,
      notes: form.notes || undefined,
      totalAmount,
      items: items.length > 0 ? items : undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء الطلب بنجاح" }); setLocation("/store"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="طلب جديد" backPath="/store">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>اختر من العملاء</Label>
          <Select value="_none" onValueChange={(v) => { if (v !== "_none") handleClientSelect(v); }}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختر عميل أو أدخل يدوياً —</SelectItem>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.phone ? `- ${c.phone}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>اسم العميل <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} /></div>
        <div><Label>هاتف العميل</Label><Input className="mt-1" dir="ltr" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="05xxxxxxxx" /></div>
        <div>
          <Label>الحالة</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="confirmed">مؤكد</SelectItem>
              <SelectItem value="processing">قيد التجهيز</SelectItem>
              <SelectItem value="shipped">تم الشحن</SelectItem>
              <SelectItem value="delivered">تم التسليم</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} />

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-base font-semibold">عناصر الطلب</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>+ إضافة عنصر</Button>
        </div>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground border rounded-md p-4 text-center">لم تتم إضافة عناصر بعد. اضغط "إضافة عنصر" للبدء.</p>
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
              {idx === 0 && <Label className="text-xs">الكمية</Label>}
              <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} />
            </div>
            <div className="col-span-2">
              {idx === 0 && <Label className="text-xs">السعر</Label>}
              <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
            </div>
            <div className="col-span-1">
              <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => removeItem(idx)}>✕</Button>
            </div>
          </div>
        ))}
        {items.length > 0 && (
          <div className="flex justify-end mt-2 text-sm font-semibold">
            الإجمالي: {totalAmount.toLocaleString()} {getCurrencySymbol()}
          </div>
        )}
      </div>

      <div><Label>ملاحظات</Label><Textarea className="mt-1" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات إضافية..." /></div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/store")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء الطلب"}</Button>
      </div>
    </CreatePageLayout>
  );
}
