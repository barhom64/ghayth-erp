import { useState } from "react";
import { z } from "zod";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePageLayout } from "@/components/create-page-layout";
import {
  FormShell,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

const TYPE_OPTIONS = [
  { value: "full_time", label: "دوام كامل" },
  { value: "part_time", label: "دوام جزئي" },
  { value: "contract", label: "عقد مؤقت" },
  { value: "probation", label: "فترة تجربة" },
];

const contractEditSchema = z.object({
  contractType: z.string().min(1, "نوع العقد مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string(),
  probationEndDate: z.string(),
  salary: z.string(),
  housingAllowance: z.string(),
  transportAllowance: z.string(),
  notes: z.string(),
});
type ContractEditForm = z.infer<typeof contractEditSchema>;

const num = (v: string): number | undefined => (v ? Number(v) : undefined);
const day = (v: unknown): string => (v ? String(v).slice(0, 10) : "");

export default function ContractsEdit() {
  const [, params] = useRoute("/hr/contracts/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: contract, isLoading, isError, refetch } = useApiQuery<any>(
    ["hr-contract", String(id ?? "")],
    `/hr/contracts/${id}`,
    { enabled: !!id }
  );

  const handleSave = async (values: ContractEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/hr/contracts/${id}`, {
        contractType: values.contractType,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        probationEndDate: values.probationEndDate || undefined,
        salary: num(values.salary),
        housingAllowance: num(values.housingAllowance),
        transportAllowance: num(values.transportAllowance),
        notes: values.notes,
      });
      toast({ title: "تم تحديث العقد" });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["hr-contract", String(id)] });
      setLocation(`/hr/contracts/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!contract || !contract.id) {
    return <div className="text-center py-16 text-muted-foreground">العقد غير موجود</div>;
  }
  // The server only allows editing a contract while it is still a draft —
  // once submitted for approval its terms are locked (hr-contracts.ts PATCH).
  if (contract.approvalStatus !== "draft") {
    return (
      <CreatePageLayout title="تعذّر التعديل" subtitle="تعديل العقد" backPath={`/hr/contracts/${id}`}>
        <div className="text-center py-16 text-muted-foreground">
          لا يمكن تعديل العقد بعد إرساله للاعتماد.
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout
      title={`تعديل العقد — ${contract.ref || `CNT-${id}`}`}
      subtitle={contract.employeeName ? `الموظف: ${contract.employeeName}` : "تعديل بنود العقد (مسودة)"}
      backPath={`/hr/contracts/${id}`}
    >
      <FormShell
        key={contract.id}
        schema={contractEditSchema}
        defaultValues={{
          contractType: contract.contractType || "full_time",
          startDate: day(contract.startDate),
          endDate: day(contract.endDate),
          probationEndDate: day(contract.probationEndDate),
          salary: contract.salary != null ? String(contract.salary) : "",
          housingAllowance: contract.housingAllowance != null ? String(contract.housingAllowance) : "",
          transportAllowance: contract.transportAllowance != null ? String(contract.transportAllowance) : "",
          notes: contract.notes || "",
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/hr/contracts/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField name="contractType" label="نوع العقد" required options={TYPE_OPTIONS} />
          <FormDateField name="startDate" label="تاريخ البداية" required />
          <FormDateField name="endDate" label="تاريخ النهاية" />
          <FormDateField name="probationEndDate" label="نهاية فترة التجربة" />
          <FormNumberField name="salary" label="الراتب الأساسي" placeholder="0.00" />
          <FormNumberField name="housingAllowance" label="بدل السكن" placeholder="0.00" />
          <FormNumberField name="transportAllowance" label="بدل النقل" placeholder="0.00" />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
