import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { CreatePageLayout } from "@/components/create-page-layout";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function PaymentRecord() {
  const [, params] = useRoute("/properties/contracts/:contractId/pay/:installmentId") as [boolean, { contractId: string; installmentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { data: contractResp, isLoading, isError } = useApiQuery<any>(
    ["property-contract-detail", params?.contractId],
    `/properties/contracts/${params?.contractId}`
  );
  const contract = contractResp?.data || contractResp;
  const schedule = Array.isArray(contract?.schedule) ? contract.schedule : [];
  const installment = schedule.find((i: any) => String(i.id) === params?.installmentId);

  const [form, setForm] = useState({ amount: "", method: "bank_transfer", receiptNumber: "" });

  useEffect(() => {
    if (installment) {
      setForm(f => ({ ...f, amount: String(installment.amount || "") }));
    }
  }, [installment]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSave = async () => {
    const firstError = validate({
      amount: !form.amount || Number(form.amount) <= 0 ? "المبلغ يجب أن يكون أكبر من صفر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/properties/contracts/${params?.contractId}/schedule/${params?.installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.amount),
          method: form.method,
          receiptNumber: form.receiptNumber || undefined,
        }),
      });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      qc.invalidateQueries({ queryKey: ["property-contract"] });
      qc.invalidateQueries({ queryKey: ["property-contracts"] });
      setLocation(`/properties/contracts`);
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل الدفعة", description: err?.fix ?? err?.message });
    }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="تسجيل دفعة"
      subtitle={installment ? `القسط رقم ${installment.installmentNumber} — المبلغ: ${formatCurrency(installment.amount)}` : "تحميل..."}
      backPath="/properties/contracts"
    >
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-blue-500" /> بيانات الدفعة
        </h3>
        {installment && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
              <p>تاريخ الاستحقاق: <strong>{formatDateAr(installment.dueDate)}</strong></p>
              <p>المبلغ المطلوب: <strong>{formatCurrency(installment.amount)}</strong></p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField label="المبلغ المدفوع" required value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} step={0.01} min={0.01} error={fieldErrors.amount} />
            <FormFieldWrapper label="طريقة الدفع">
              <Select value={form.method} onValueChange={v => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="cheque">شيك</SelectItem>
                  <SelectItem value="online">إلكتروني</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            <TextField label="رقم الإيصال (اختياري)" dir="ltr" value={form.receiptNumber} onChange={(v) => setForm({ ...form, receiptNumber: v })} />
          </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/contracts")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تأكيد الدفع"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
