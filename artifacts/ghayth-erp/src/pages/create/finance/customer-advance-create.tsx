import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { useIdempotencyKey } from "@/lib/idempotency";
import { Button } from "@/components/ui/button";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { ClientSelect } from "@/components/shared/entity-selects";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { todayLocal } from "@/lib/formatters";

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cash", label: "نقدي" },
  { value: "check", label: "شيك" },
  { value: "credit_card", label: "بطاقة ائتمان" },
];

export default function CustomerAdvanceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { headers, reset } = useIdempotencyKey();

  const createMut = useApiMutation(
    "/finance/customer-advances",
    "POST",
    [["customer-advances"], ["finance-invoices"]],
    { headers: () => headers },
  );

  const [form, setForm] = useState({
    clientId: "",
    amount: "",
    method: "bank_transfer",
    receivedDate: todayLocal(),
    reference: "",
    notes: "",
  });

  const handleSubmit = async () => {
    if (!form.clientId) {
      toast({ variant: "destructive", title: "العميل مطلوب" });
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ variant: "destructive", title: "المبلغ مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        clientId: Number(form.clientId),
        amount: Number(form.amount),
        method: form.method,
        receivedDate: form.receivedDate || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      toast({ title: "تم تسجيل الدفعة المقدمة بنجاح" });
      reset();
      setLocation("/finance/invoices");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "خطأ في الحفظ",
        description: err?.message || "حدث خطأ أثناء تسجيل الدفعة المقدمة",
      });
    }
  };

  return (
    <CreatePageLayout title="تسجيل دفعة مقدمة من عميل" backPath="/finance/invoices">
      <div data-form className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClientSelect
            value={form.clientId}
            onChange={(v) => setForm({ ...form, clientId: v })}
            label="العميل"
            required
          />
          {form.clientId && (
            <div className="md:col-span-2">
              {/* الكيان يقود التجربة: الحالة المالية للعميل أمامك قبل تسجيل السُّلفة. */}
              <ClientContextCard clientId={form.clientId} section="invoice" />
            </div>
          )}
          <NumberField
            label="المبلغ (ريال)"
            required
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v })}
            min={0}
            step={0.01}
            placeholder="0.00"
          />
          <FormFieldWrapper label="طريقة الاستلام">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الاستلام">
            <DatePicker
              value={form.receivedDate}
              onChange={(v) => setForm({ ...form, receivedDate: v })}
            />
          </FormFieldWrapper>
          <TextField
            label="المرجع"
            value={form.reference}
            onChange={(v) => setForm({ ...form, reference: v })}
            placeholder="ADV-..."
          />
          <TextField
            label="ملاحظات"
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setLocation("/finance/invoices")}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
            {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
