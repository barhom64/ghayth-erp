import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { ProductContextCard } from "@/components/shared/product-context-card";
import { ProductSelect } from "@/components/shared/product-select";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "warehouse_movements_create";
const INITIAL = { productId: "", type: "in", quantity: "", unitCost: "", reference: "", notes: "", lotId: "", lotNumber: "", expiryDate: "" };
const STOCK_DECREASE_TYPES = new Set(["out", "transfer_out", "adjustment_out"]);

export default function MovementsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/warehouse/movements", "POST", [["warehouse-movements"], ["warehouse-stats"]]);
  // Used only for the client-side overdraw check; the dropdown itself is the
  // self-contained ProductSelect. Limit 500 so a selected item isn't missed.
  const { data: productsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["warehouse-products-overdraw"], "/warehouse/products?limit=500");
  const products = productsData?.data || [];
  // Company-controllable policies (سياسات المستودع in system controls):
  // when warehouse.require_movement_reference is on, المرجع becomes required
  // here AND is enforced server-side.
  const { data: controlsResp } = useApiQuery<{ data: Record<string, unknown> }>(["system-controls"], "/settings/system-controls");
  const requireReference = controlsResp?.data?.["warehouse.require_movement_reference"] === true;

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const selectedProduct = products.find((p: any) => String(p.id) === form.productId);
  const requestedQty = Number(form.quantity || 0);
  const currentStock = Number(selectedProduct?.currentStock ?? 0);
  const wouldOverdraw = Boolean(selectedProduct && STOCK_DECREASE_TYPES.has(form.type) && requestedQty > currentStock);
  const canPreview = Boolean(form.productId && requestedQty > 0);
  // F1 — lot-tracked products: inbound needs a lot number (+optional expiry);
  // outbound may name a lot, else the server picks FEFO.
  const tracksLots = selectedProduct?.tracksLots === true;
  const isOutbound = STOCK_DECREASE_TYPES.has(form.type);

  const handleSubmit = async () => {
    const firstError = validate({
      productId: form.productId ? null : "يرجى اختيار المنتج",
      quantity: !form.quantity || requestedQty <= 0
        ? "الكمية يجب أن تكون أكبر من صفر"
        : wouldOverdraw
          ? `الكمية المطلوبة تتجاوز المخزون المتاح (${currentStock})`
          : null,
      reference: requireReference && !form.reference.trim()
        ? "المرجع مطلوب لكل حركة (سياسة الشركة: لا حركة بلا سبب)"
        : null,
      lotNumber: tracksLots && !isOutbound && !form.lotNumber.trim() && !form.lotId
        ? "هذا الصنف يتتبّع الدفعات — رقم الدفعة مطلوب عند الاستلام"
        : null,
    });

    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }

    try {
      await createMut.mutateAsync({
        productId: Number(form.productId),
        type: form.type,
        quantity: requestedQty,
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        // F1 — only meaningful for tracksLots products; harmless otherwise.
        lotId: tracksLots && form.lotId ? Number(form.lotId) : undefined,
        lotNumber: tracksLots && !isOutbound && form.lotNumber ? form.lotNumber.trim() : undefined,
        expiryDate: tracksLots && !isOutbound && form.expiryDate ? form.expiryDate : undefined,
      });

      clearDraft();
      toast({ title: "تمت إضافة الحركة بنجاح" });
      setLocation("/warehouse");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الحركة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="حركة مخزون جديدة" backPath="/warehouse">
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
        <FormFieldWrapper label="المنتج" required error={fieldErrors.productId} className="md:col-span-2">
          <ProductSelect
            value={form.productId}
            onChange={(id) => setForm((f) => ({ ...f, productId: id }))}
            allowCreate
            stockableOnly
          />

          {form.productId && (
            <div className="mt-3">
              <ProductContextCard productId={form.productId} section={STOCK_DECREASE_TYPES.has(form.type) ? "out" : "in"} />
            </div>
          )}
        </FormFieldWrapper>

        <FormFieldWrapper label="النوع">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">إدخال</SelectItem>
              <SelectItem value="out">إخراج</SelectItem>
              <SelectItem value="return">إرجاع</SelectItem>
              <SelectItem value="transfer_in">تحويل وارد</SelectItem>
              <SelectItem value="transfer_out">تحويل صادر</SelectItem>
              <SelectItem value="adjustment_in">تسوية - زيادة</SelectItem>
              <SelectItem value="adjustment_out">تسوية - نقص</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <NumberField label="الكمية" required value={form.quantity} onChange={(v) => setForm((f) => ({ ...f, quantity: v }))} min={0} step={0.01} error={fieldErrors.quantity} />

        <NumberField label="تكلفة الوحدة" value={form.unitCost} onChange={(v) => setForm((f) => ({ ...f, unitCost: v }))} step={0.01} min={0} />

        <TextField label="المرجع" required={requireReference} placeholder={requireReference ? "GRN / أمر صرف / تذكرة صيانة — إلزامي" : "GRN / أمر صرف / تذكرة صيانة"} value={form.reference} onChange={(v) => setForm((f) => ({ ...f, reference: v }))} error={fieldErrors.reference} />

        <TextField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />

        {tracksLots && !isOutbound && (
          <>
            <TextField label="رقم الدفعة" required placeholder="رقم الدفعة المستلمة" value={form.lotNumber} onChange={(v) => setForm((f) => ({ ...f, lotNumber: v }))} error={fieldErrors.lotNumber} />
            <TextField label="تاريخ الصلاحية" type="date" value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} />
          </>
        )}
        {tracksLots && isOutbound && (
          <TextField label="رقم الدفعة (اختياري)" placeholder="اتركه فارغاً للاختيار التلقائي بالأقرب انتهاءً (FEFO)" value={form.lotId} onChange={(v) => setForm((f) => ({ ...f, lotId: v }))} />
        )}
      </div>

      {wouldOverdraw && (
        <div className="mt-4 rounded-lg border border-status-error-surface bg-status-error-surface px-4 py-3 text-sm text-status-error-foreground">
          الكمية المطلوبة ({requestedQty}) تتجاوز المخزون المتاح ({currentStock}). سيمنع النظام تنفيذ هذه الحركة.
        </div>
      )}

      {/* W6 — معاينة الأثر قبل الحفظ: الرصيد قبل/بعد، تنبيه الحد الأدنى
          (وطلب الشراء التلقائي حسب السياسة)، السحب الزائد، والقيمة
          التقديرية (التقييم النهائي في المالية). */}
      {canPreview && (
        <div className="mt-4">
          <ImpactPreviewButton
            endpoint="/warehouse/movements/impact-preview"
            payload={{
              productId: Number(form.productId),
              type: form.type,
              quantity: requestedQty,
              unitCost: form.unitCost ? Number(form.unitCost) : undefined,
              reference: form.reference || undefined,
            }}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/warehouse")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending || wouldOverdraw} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
