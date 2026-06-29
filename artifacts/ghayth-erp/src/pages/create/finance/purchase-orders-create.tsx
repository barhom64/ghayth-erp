import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency, roundMoney , todayLocal } from "@/lib/formatters";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { CostCenterSelect, SupplierSelect, BranchSelect } from "@/components/shared/entity-selects";
import { ProductSelect } from "@/components/shared/product-select";
import { useAppContext } from "@/contexts/app-context";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { SupplierContextCard } from "@/components/shared/supplier-context-card";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { Select as LineTreatmentSelect, SelectContent as LTSC, SelectItem as LTSI, SelectTrigger as LTST, SelectValue as LTSV } from "@/components/ui/select";
// #1945 — the line-treatment list + its expected accounting come from the
// central finance model (mirrors the backend TREATMENT_PURPOSE; parity tested).
import { PURCHASE_LINE_TREATMENTS as LINE_TREATMENTS, resolvePurchaseTreatment } from "@/lib/finance/scenario-model";

const DRAFT_KEY = "finance_purchase_orders_create";

export default function PurchaseOrdersCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const activeCtx = useActiveFinanceContext();
  const createMut = useApiMutation("/finance/purchase-requests", "POST", [["purchase-orders"], ["purchase-requests"]]);
  // POST /finance/purchase-orders — alternate path that creates a PO
  // directly without going through the purchase-request approval loop.
  // Same permission as the standard flow (`finance.purchase:create`);
  // use sparingly — the bypass skips multi-step approvals so it should
  // be reserved for cases that don't need them (single-line emergency
  // procurement, manager-direct issuance, etc).
  const createDirectMut = useApiMutation("/finance/purchase-orders", "POST", [["purchase-orders"]]);
  const [createMode, setCreateMode] = useState<"request" | "direct">("request");
  const { data: copySource } = useApiQuery<any>(["po-copy", copyFromId || ""], `/finance/purchase-orders/${copyFromId}`, !!copyFromId);

  const INITIAL = { supplierId: "", notes: "", branchId: selectedBranchId ? String(selectedBranchId) : "", companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "", costCenter: "", expectedDelivery: "", date: todayLocal() };
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [items, setItems] = useState([{
    productId: "", quantity: "1", unitPrice: "",
    lineTreatment: "inventory" as string,
    allocation: {} as LineAllocation,
  }]);
  const [copied, setCopied] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

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
        // Carry every line field — lineTreatment and allocation
        // silently default back to "inventory" + {} otherwise, which
        // re-routes the GL on copied expense-treated POs.
        setItems(copySource.lines.map((l: any) => ({
          productId: String(l.productId || ""),
          quantity: String(l.quantity || 1),
          unitPrice: String(l.unitPrice || ""),
          lineTreatment: l.lineTreatment || "inventory",
          allocation: (l.allocation ?? {}) as LineAllocation,
        })));
      }
    }
  }, [copySource, copied, setForm]);

  const addItem = () => setItems([...items, {
    productId: "", quantity: "1", unitPrice: "",
    lineTreatment: "inventory",
    allocation: {} as LineAllocation,
  }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const totalAmount = roundMoney(items.reduce((sum, i) => sum + roundMoney(Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0));

  const handleSubmit = async () => {
    const validItems = items.filter((i) => Number(i.unitPrice) > 0 && i.productId);
    const firstError = validate({
      supplierId: form.supplierId ? null : "المورد مطلوب",
      // الفرع اختياري في الخلفية ويُعبّأ من سياق الدخول — لا يُفرض.
      items: validItems.length === 0 ? "يرجى إضافة بند واحد على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      const submitMut = createMode === "direct" ? createDirectMut : createMut;
      await submitMut.mutateAsync({
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
          lineTreatment: i.lineTreatment || undefined,
          ...buildAllocationPayload(i.allocation ?? {}),
        })),
      });
      clearDraft();
      toast({
        title: createMode === "direct"
          ? "تم إنشاء أمر الشراء مباشرةً"
          : "تم إنشاء طلب الشراء بنجاح",
      });
      setLocation("/finance/purchase-orders");
    } catch (err: any) {
      setApiError(err);
      toast({
        variant: "destructive",
        title: createMode === "direct"
          ? "حدث خطأ أثناء إنشاء أمر الشراء"
          : "حدث خطأ أثناء إنشاء طلب الشراء",
        description: err?.fix ?? err?.message,
      });
    }
  };

  return (
    <CreatePageLayout title="طلب شراء جديد" backPath="/finance/purchase-orders">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <ActiveContextNotice ctx={activeCtx} />
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </FormFieldWrapper>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <SupplierSelect
            value={form.supplierId}
            onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
            label="المورد"
            required
            error={fieldErrors.supplierId}
          />
          {form.supplierId && (
            <div className="mt-3">
              <SupplierContextCard supplierId={form.supplierId} />
            </div>
          )}
        </div>
        <BranchSelect
          value={form.branchId}
          onChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
          label="الفرع"
          required
          error={fieldErrors.branchId}
          autoSelectOwnBranch
        />
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
        {/* الجدول الموحّد للإدخالات المالية — المكوّن المشترك <LineItemsTable>
            بدل بطاقة لكل بند (المنتج/الكمية/سعر الوحدة أعمدة؛ معالجة البند
            والتوجيه المحاسبي ولوحة الأبعاد عبر renderExpansion). */}
        <div className="mt-2">
          <LineItemsTable
            items={items}
            minItems={1}
            onAdd={addItem}
            onRemove={removeItem}
            addLabel="إضافة بند"
            columns={[
              {
                header: "المنتج", className: "min-w-[10rem]",
                render: (item, idx) => (
                  <ProductSelect
                    value={item.productId}
                    onChange={(v) => updateItem(idx, "productId", v)}
                    placeholder="اختر من المخزون"
                    allowCreate
                    className="text-sm"
                  />
                ),
              },
              {
                header: "الكمية",
                render: (item, idx) => (
                  <NumberField label="الكمية" hideLabel className="w-24" value={item.quantity} onChange={(v) => updateItem(idx, "quantity", v)} placeholder="1" />
                ),
              },
              {
                header: "سعر الوحدة",
                render: (item, idx) => (
                  <NumberField label="سعر الوحدة" hideLabel className="w-24" value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} placeholder="0.00" />
                ),
              },
            ]}
            renderExpansion={(item, idx) => (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">معالجة البند (Line Treatment)</Label>
                  <LineTreatmentSelect value={item.lineTreatment} onValueChange={(v) => updateItem(idx, "lineTreatment", v)}>
                    <LTST className="text-sm"><LTSV /></LTST>
                    <LTSC>
                      {LINE_TREATMENTS.map((t) => (
                        <LTSI key={t.value} value={t.value}>{t.label}</LTSI>
                      ))}
                    </LTSC>
                  </LineTreatmentSelect>
                  {/* #1945 — التوجيه المحاسبي المتوقع لهذا البند، مشتق من النموذج
                      المركزي (مطابق لتوجيه الخادم عند الـ GRN). */}
                  {(() => {
                    const t = resolvePurchaseTreatment(item.lineTreatment);
                    return (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ⓘ التوجيه المحاسبي عند الـ GRN:{" "}
                        {t ? `${t.hint}${t.capitalize ? " (رسملة — ميزانية)" : " (مصروف — قائمة الدخل)"}` : "يُحدَّد حسب نوع البند."}
                      </p>
                    );
                  })()}
                </div>
                <LineAllocationPanel
                  value={item.allocation ?? {}}
                  onChange={(next) => {
                    const updated = [...items];
                    (updated[idx] as any).allocation = next;
                    setItems(updated);
                  }}
                  status={deriveAllocationStatus(item.allocation ?? {})}
                  required={false}
                />
              </div>
            )}
          />
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-md text-sm">
        <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{formatCurrency(totalAmount)}</span></div>
      </div>

      {form.supplierId && totalAmount > 0 && (
        <ImpactPreviewButton
          endpoint="/finance/purchase-requests/impact-preview"
          payload={{
            supplierId: Number(form.supplierId),
            costCenter: form.costCenter || undefined,
            items: items.map((i) => ({
              quantity: Number(i.quantity || 0),
              unitPrice: Number(i.unitPrice || 0),
            })),
          }}
          label="معاينة أثر الطلب"
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-6">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={createMode === "direct"}
            onChange={(e) => setCreateMode(e.target.checked ? "direct" : "request")}
          />
          إنشاء أمر شراء مباشر (تخطّي مسار الموافقة)
        </label>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setLocation("/finance/purchase-orders")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || createDirectMut.isPending || !activeCtx.ready} rateLimitAware>
            {(createMut.isPending || createDirectMut.isPending) ? "جاري الحفظ..." : (createMode === "direct" ? "إنشاء PO مباشر" : "حفظ")}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
