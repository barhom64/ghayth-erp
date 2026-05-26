import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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
  const { data: clientsData, isLoading: loadingC, isError: errorC } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: productsData, isLoading: loadingP, isError: errorP } = useApiQuery<{ data: any[] }>(["warehouse-products"], "/warehouse/products");
  const clients = clientsData?.data || [];
  const products = productsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("store_orders_create", {
    customerName: "", customerPhone: "", status: "pending", notes: "",
  });
  const [items, setItems] = useState<OrderItem[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (loadingC || loadingP) return <LoadingSpinner />;
  if (errorC || errorP) return <ErrorState />;

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
    const firstError = validate({
      customerName: form.customerName ? null : "يرجى إدخال اسم العميل",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
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
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الطلب", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="طلب جديد" backPath="/store">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormFieldWrapper label="اختر من العملاء">
          <Select value="_none" onValueChange={(v) => { if (v !== "_none") handleClientSelect(v); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختر عميل أو أدخل يدوياً —</SelectItem>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.phone ? `- ${c.phone}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="اسم العميل" required value={form.customerName} onChange={(v) => setForm((f) => ({ ...f, customerName: v }))} error={fieldErrors.customerName} />
        <TextField label="هاتف العميل" type="tel" inputMode="tel" dir="ltr" value={form.customerPhone} onChange={(v) => setForm((f) => ({ ...f, customerPhone: v }))} placeholder="05xxxxxxxx" />
        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="processing">قيد التجهيز</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
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
              <NumberField label="الكمية" min={1} value={item.quantity} onChange={(v) => updateItem(idx, "quantity", v)} placeholder="1" />
            </div>
            <div className="col-span-2">
              <NumberField label="السعر" step={0.01} value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} placeholder="0.00" />
            </div>
            <div className="col-span-1">
              <Button type="button" variant="ghost" size="sm" className="text-status-error" onClick={() => removeItem(idx)}>✕</Button>
            </div>
          </div>
        ))}
        {items.length > 0 && (
          <div className="flex justify-end mt-2 text-sm font-semibold">
            الإجمالي: {formatCurrency(totalAmount)}
          </div>
        )}
      </div>

      <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." className="mt-4" />

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/store")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء الطلب"}</Button>
      </div>
    </CreatePageLayout>
  );
}
