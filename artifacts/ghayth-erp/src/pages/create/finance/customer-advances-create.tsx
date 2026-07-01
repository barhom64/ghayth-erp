import { useState } from "react";
import { PAYMENT_METHOD_OPTIONS as PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { ActiveContextNotice, useActiveFinanceContext } from "@/components/shared/active-context-gate";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ClientSelect, BranchSelect } from "@/components/shared/entity-selects";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { FinanceOperationContextPanel } from "@/components/shared/finance-operation-context-panel";
import { EMPTY_ALLOCATION_TARGET, type AllocationTargetValue } from "@/components/shared/allocation-target-select";
import { buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { todayLocal, formatCurrency } from "@/lib/formatters";



export default function CustomerAdvancesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/customer-advances", "POST", [["customer-advances"]]);

  const [form, setForm] = useState({
    clientId: "",
    amount: "",
    method: "bank_transfer",
    receivedDate: todayLocal(),
    reference: "",
    notes: "",
    branchId: "",
  });

  const [allocTarget, setAllocTarget] = useState<AllocationTargetValue>(EMPTY_ALLOCATION_TARGET);

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      clientId: form.clientId ? null : "العميل مطلوب",
      amount: !form.amount ? "المبلغ مطلوب" : Number(form.amount) <= 0 ? "المبلغ يجب أن يكون أكبر من صفر" : null,
      receivedDate: form.receivedDate ? null : "تاريخ الاستلام مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        clientId: Number(form.clientId),
        amount: Number(form.amount),
        method: form.method,
        receivedDate: form.receivedDate,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        // Multi-branch users must pick a branch (backend resolver throws
        // BRANCH_REQUIRED otherwise). Single-branch users can leave blank.
        branchId: form.branchId ? Number(form.branchId) : undefined,
        // #1715 §6 — optional operation context, stamped on the cash line.
        lineAllocation: allocTarget.target !== "none" ? buildAllocationPayload(allocTarget.allocation) : undefined,
      });
      toast({ title: "تم تسجيل الدفعة المقدمة" });
      setLocation("/finance/customer-advances");
    } catch (err: any) {
      setApiError(err);
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  const amountNum = Number(form.amount) || 0;

  const activeCtx = useActiveFinanceContext();

  return (
    <CreatePageLayout title="دفعة مقدمة جديدة" backPath="/finance/customer-advances">
      <ActiveContextNotice ctx={activeCtx} />
      <div className="bg-status-info-surface/40 border border-status-info-surface rounded-lg p-4 mb-4 text-sm">
        <p className="font-semibold mb-1">ما هي الدفعة المقدمة؟</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          مبلغ يدفعه العميل قبل إصدار فاتورة، يُسجَّل في حساب الالتزامات
          (التزام على المنشأة) ويُطبَّق لاحقاً على فواتيره. الـ JE:
          <span className="font-mono mx-1">النقدية مدين / التزام دفعة مقدمة دائن</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormFieldWrapper label="العميل" required error={fieldErrors.clientId}>
          <ClientSelect
            value={form.clientId}
            onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
            label=""
            allowCreate={false}
          />
        </FormFieldWrapper>
        {form.clientId && (
          <div className="md:col-span-2">
            {/* الكيان يقود التجربة: الحالة المالية للعميل أمامك قبل تسجيل الدفعة المقدمة. */}
            <ClientContextCard clientId={form.clientId} section="invoice" />
          </div>
        )}

        <BranchSelect
          value={form.branchId}
          onChange={(v) => setForm((f) => ({ ...f, branchId: String(v ?? "") }))}
          label="الفرع"
          allowCreate={false}
          autoSelectOwnBranch
        />

        <FormFieldWrapper label="تاريخ الاستلام" required error={fieldErrors.receivedDate}>
          <DatePicker
            value={form.receivedDate}
            onChange={(v) => setForm((f) => ({ ...f, receivedDate: v }))}
          />
        </FormFieldWrapper>

        <NumberField
          label="المبلغ (ريال)" required
          value={form.amount}
          onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
          placeholder="0.00"
          step={0.01}
          min={0}
          error={fieldErrors.amount}
        />

        <FormFieldWrapper label="طريقة الاستلام">
          <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <TextField
          label="رقم المرجع (شيك / تحويل)"
          value={form.reference}
          onChange={(v) => setForm((f) => ({ ...f, reference: v }))}
          placeholder="اختياري — لتمييز الدفعة"
        />
      </div>

      <div className="mt-4">
        <FormFieldWrapper label="ملاحظات">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="سبب الدفعة المقدمة، تفاصيل الاتفاق، إلخ"
          />
        </FormFieldWrapper>
      </div>

      <div className="mt-4">
        <FinanceOperationContextPanel
          value={allocTarget}
          onChange={setAllocTarget}
          title="ربط الدفعة بـ (اختياري)"
          description="اربط الدفعة المقدمة بمشروع / مركز تكلفة / بُعد آخر ليظهر في تقاريره. العميل مرتبط تلقائياً."
        />
      </div>

      {amountNum > 0 && (
        <div className="mt-4 border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-semibold mb-2">معاينة القيد المُولّد</p>
          <div className="text-xs space-y-1 font-mono">
            <div className="flex justify-between">
              <span>النقدية / البنك (حسب طريقة الدفع)</span>
              <span className="text-orange-700">مدين {formatCurrency(amountNum)}</span>
            </div>
            <div className="flex justify-between">
              <span>التزام دفعة مقدمة من العميل</span>
              <span className="text-emerald-700">دائن {formatCurrency(amountNum)}</span>
            </div>
          </div>
          {/* #1945 (FIN-08) — الحسابات الفعلية يحدّدها محرك الترحيل
              (resolveAccountCode) عند الحفظ؛ لا نعرض أكوادًا ثابتة قد تخالف
              ما يُرحَّل فعليًا (كانت 1100/2400 وهي قد تكون حسابات رأس غير قابلة للترحيل). */}
          <p className="text-[10px] text-muted-foreground mt-2 font-sans">
            الحسابات الفعلية يحدّدها محرك الترحيل عند الحفظ حسب إعداد الشركة.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/customer-advances")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending || !activeCtx.ready} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "تسجيل الدفعة المقدمة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
