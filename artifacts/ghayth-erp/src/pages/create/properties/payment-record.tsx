import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";

const schema = z.object({
  amount: z.string().refine((v) => Number(v) > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  method: z.enum(["cash", "bank_transfer", "cheque", "online"]),
  receiptNumber: z.string().optional(),
});

const METHOD_OPTIONS = [
  { value: "cash", label: "نقدي" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cheque", label: "شيك" },
  { value: "online", label: "إلكتروني" },
];

function PrefillAmount({ amount }: { amount: number | string | null | undefined }) {
  const { setValue, getValues } = useFormContext();
  useEffect(() => {
    if (amount != null && amount !== "" && !getValues("amount")) {
      setValue("amount", String(amount));
    }
  }, [amount, setValue, getValues]);
  return null;
}

export default function PaymentRecord() {
  const [, params] = useRoute("/properties/contracts/:contractId/pay/:installmentId") as [boolean, { contractId: string; installmentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: contractResp, isLoading, isError } = useApiQuery<any>(
    ["property-contract-detail", params?.contractId],
    `/properties/contracts/${params?.contractId}`,
  );
  const contract = contractResp?.data || contractResp;
  const schedule = Array.isArray(contract?.schedule) ? contract.schedule : [];
  const installment = schedule.find((i: any) => String(i.id) === params?.installmentId);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <CreatePageLayout
      title="تسجيل دفعة"
      subtitle={installment ? `القسط رقم ${installment.installmentNumber} — المبلغ: ${formatCurrency(installment.amount)}` : "تحميل..."}
      backPath="/properties/contracts"
    >
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-status-info" /> بيانات الدفعة
        </h3>
        {installment && (
          <div className="bg-status-info-surface rounded-lg p-3 text-sm space-y-1">
            <p>تاريخ الاستحقاق: <strong>{formatDateAr(installment.dueDate)}</strong></p>
            <p>المبلغ المطلوب: <strong>{formatCurrency(installment.amount)}</strong></p>
          </div>
        )}

        <FormShell
          schema={schema}
          defaultValues={{ amount: "", method: "bank_transfer", receiptNumber: "" }}
          submitLabel="تأكيد الدفع"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => setLocation("/properties/contracts")}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await apiFetch(`/properties/contracts/${params?.contractId}/schedule/${params?.installmentId}/pay`, {
              method: "POST",
              body: JSON.stringify({
                amount: Number(values.amount),
                method: values.method,
                receiptNumber: values.receiptNumber || undefined,
              }),
            });
            toast({ title: "تم تسجيل الدفعة بنجاح" });
            qc.invalidateQueries({ queryKey: ["property-contract"] });
            qc.invalidateQueries({ queryKey: ["property-contracts"] });
            setLocation("/properties/contracts");
          }}
        >
          <PrefillAmount amount={installment?.amount} />
          <FormGrid cols={2}>
            <FormNumberField name="amount" label="المبلغ المدفوع" required step="0.01" min="0.01" />
            <FormSelectField name="method" label="طريقة الدفع" options={METHOD_OPTIONS} />
            <FormTextField name="receiptNumber" label="رقم الإيصال (اختياري)" />
          </FormGrid>
        </FormShell>
      </div>
    </CreatePageLayout>
  );
}
