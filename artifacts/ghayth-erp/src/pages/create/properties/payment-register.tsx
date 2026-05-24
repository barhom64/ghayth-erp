import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
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

export default function PaymentRegisterPage() {
  const [, params] = useRoute("/properties/payments/:paymentId/pay") as [
    boolean,
    { paymentId: string },
  ];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: paymentsResp, isLoading, isError } = useApiQuery<any>(
    ["rent-payments"],
    "/properties/payments",
  );
  const payments = asList(paymentsResp);
  const payment = payments.find((p: any) => String(p.id) === params?.paymentId);
  const remaining = payment ? payment.amount - (payment.paidAmount || 0) : 0;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <CreatePageLayout
      title="تسجيل دفعة إيجار"
      subtitle={payment ? `${payment.tenantName} — ${formatCurrency(payment.amount)}` : "تحميل..."}
      backPath="/properties/payments"
    >
      {payment && (
        <>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <Banknote className="h-5 w-5 text-status-success-foreground" /> بيانات الدفعة
          </h3>
          <div className="bg-status-info-surface rounded-lg p-4 text-sm space-y-1 mb-4">
            <p>المستأجر: <strong>{payment.tenantName}</strong></p>
            <p>الوحدة: <strong>{payment.unitNumber || "—"}</strong></p>
            <p>تاريخ الاستحقاق: <strong>{formatDateAr(payment.dueDate)}</strong></p>
            <p>المبلغ الكلي: <strong>{formatCurrency(payment.amount)}</strong></p>
            <p>المدفوع سابقاً: <strong>{formatCurrency(payment.paidAmount || 0)}</strong></p>
            <p>المتبقي: <strong className="text-status-error-foreground">{formatCurrency(remaining)}</strong></p>
          </div>
          <FormShell
            key={payment.id}
            schema={schema}
            defaultValues={{
              paidAmount: remaining > 0 ? String(remaining) : "",
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
              try {
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
              } catch (err: any) {
                toast({
                  variant: "destructive",
                  title: "حدث خطأ أثناء تسجيل الدفعة",
                  description: err?.fix ?? err?.message,
                });
              }
            }}
          >
            <FormGrid cols={2}>
              <FormNumberField name="paidAmount" label="المبلغ المدفوع" required step="0.01" min="0.01" />
              <FormDateField name="paymentDate" label="تاريخ الدفع" />
              <FormSelectField name="paymentMethod" label="طريقة الدفع" options={METHOD_OPTIONS} />
              <FormTextField name="notes" label="ملاحظات (اختياري)" placeholder="ملاحظات اختيارية" />
            </FormGrid>
          </FormShell>
        </>
      )}
    </CreatePageLayout>
  );
}
