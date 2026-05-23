import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, formatDateAr , todayLocal } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { CreatePageLayout } from "@workspace/ui-core";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function PaymentRegisterPage() {
  const [, params] = useRoute("/properties/payments/:paymentId/pay") as [boolean, { paymentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("properties_payment_register", {
    paidAmount: "",
    paymentDate: todayLocal(),
    paymentMethod: "bank_transfer",
    notes: "",
  });
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { data: paymentsResp, isLoading, isError } = useApiQuery<any>(["rent-payments"], "/properties/payments");
  const payments = asList(paymentsResp);
  const payment = payments.find((p: any) => String(p.id) === params?.paymentId);

  const remaining = payment ? payment.amount - (payment.paidAmount || 0) : 0;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  if (payment && !form.paidAmount && remaining > 0) {
    setForm(f => ({ ...f, paidAmount: String(remaining) }));
  }

  const handleSave = async () => {
    const firstError = validate({
      paidAmount: !form.paidAmount || Number(form.paidAmount) <= 0 ? "يرجى تحديد المبلغ" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/properties/payments/${params?.paymentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.paidAmount),
          paidDate: form.paymentDate,
          method: form.paymentMethod,
          notes: form.notes,
        }),
      });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      clearDraft();
      qc.invalidateQueries({ queryKey: ["rent-payments"] });
      setLocation("/properties/payments");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل الدفعة", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreatePageLayout
      title="تسجيل دفعة إيجار"
      subtitle={payment ? `${payment.tenantName} — ${formatCurrency(payment.amount)}` : "تحميل..."}
      backPath="/properties/payments"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      {payment && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Banknote className="h-5 w-5 text-emerald-500" /> بيانات الدفعة
          </h3>
          <div className="bg-status-info-surface rounded-lg p-4 text-sm space-y-1">
              <p>المستأجر: <strong>{payment.tenantName}</strong></p>
              <p>الوحدة: <strong>{payment.unitNumber || "—"}</strong></p>
              <p>تاريخ الاستحقاق: <strong>{formatDateAr(payment.dueDate)}</strong></p>
              <p>المبلغ الكلي: <strong>{formatCurrency(payment.amount)}</strong></p>
              <p>المدفوع سابقاً: <strong>{formatCurrency(payment.paidAmount || 0)}</strong></p>
              <p>المتبقي: <strong className="text-status-error-foreground">{formatCurrency(remaining)}</strong></p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NumberField label="المبلغ المدفوع" required value={form.paidAmount} onChange={(v) => setForm(f => ({ ...f, paidAmount: v }))} step={0.01} min={0.01} error={fieldErrors.paidAmount} />
              <FormFieldWrapper label="تاريخ الدفع">
                <DatePicker value={form.paymentDate} onChange={v => setForm(f => ({ ...f, paymentDate: v }))} />
              </FormFieldWrapper>
              <FormFieldWrapper label="طريقة الدفع">
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="check">شيك</SelectItem>
                    <SelectItem value="online">دفع إلكتروني</SelectItem>
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
              <TextField label="ملاحظات (اختياري)" value={form.notes} onChange={(v) => setForm(f => ({ ...f, notes: v }))} placeholder="ملاحظات اختيارية" />
            </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/payments")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تسجيل الدفعة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
