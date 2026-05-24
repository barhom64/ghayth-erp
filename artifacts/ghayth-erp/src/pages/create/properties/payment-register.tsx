import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";

const schema = z.object({
  paidAmount: z
    .string()
    .refine((v) => Number(v) > 0, "يرجى تحديد المبلغ"),
  paymentDate: z.string(),
  paymentMethod: z.enum(["bank_transfer", "cash", "check", "online"]),
  notes: z.string().optional(),
});

const METHOD_OPTIONS = [
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cash", label: "نقداً" },
  { value: "check", label: "شيك" },
  { value: "online", label: "دفع إلكتروني" },
];

function PrefillRemaining({ remaining }: { remaining: number }) {
  const { getValues, setValue } = useFormContext();
  useEffect(() => {
    if (remaining > 0 && !getValues("paidAmount")) {
      setValue("paidAmount", String(remaining));
    }
  }, [remaining, getValues, setValue]);
  return null;
}

export default function PaymentRegisterPage() {
  const [, params] = useRoute("/properties/payments/:paymentId/pay") as [boolean, { paymentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: paymentsResp, isLoading, isError } = useApiQuery<any>(
    ["rent-payments"],
    "/properties/payments",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const payments = asList(paymentsResp);
  const payment = payments.find((p: any) => String(p.id) === params?.paymentId);
  const remaining = payment ? payment.amount - (payment.paidAmount || 0) : 0;

  return (
    <CreatePageLayout
      title="تسجيل دفعة إيجار"
      subtitle={payment ? `${payment.tenantName} — ${formatCurrency(payment.amount)}` : "تحميل..."}
      backPath="/properties/payments"
    >
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

          <FormShell
            schema={schema}
            defaultValues={{
              paidAmount: "",
              paymentDate: todayLocal(),
              paymentMethod: "bank_transfer",
              notes: "",
            }}
            submitLabel="تسجيل الدفعة"
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setLocation("/properties/payments")}>
                إلغاء
              </Button>
            }
            onSubmit={async (values) => {
              await apiFetch(`/properties/payments/${params?.paymentId}/pay`, {
                method: "POST",
                body: JSON.stringify({
                  amount: Number(values.paidAmount),
                  paidDate: values.paymentDate,
                  method: values.paymentMethod,
                  notes: values.notes,
                }),
              });
              toast({ title: "تم تسجيل الدفعة بنجاح" });
              qc.invalidateQueries({ queryKey: ["rent-payments"] });
              setLocation("/properties/payments");
            }}
          >
            <PrefillRemaining remaining={remaining} />
            <FormGrid cols={2}>
              <FormNumberField name="paidAmount" label="المبلغ المدفوع" required step="0.01" min="0.01" />
              <FormDateField name="paymentDate" label="تاريخ الدفع" />
              <FormSelectField name="paymentMethod" label="طريقة الدفع" options={METHOD_OPTIONS} />
              <FormTextField name="notes" label="ملاحظات (اختياري)" placeholder="ملاحظات اختيارية" />
            </FormGrid>
          </FormShell>
        </div>
      )}
    </CreatePageLayout>
  );
}
