import { useState } from "react";
import { z } from "zod";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePageLayout } from "@workspace/ui-core";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

// Only non-structural proposal fields are editable here. Branch/department
// changes are intentionally excluded — they re-trigger the destination-branch
// validation in POST /hr/transfers and are effectively a new transfer.
const transferEditSchema = z.object({
  effectiveDate: z.string(),
  toJobTitle: z.string(),
  toSalary: z.string(),
  reason: z.string(),
  notes: z.string(),
});
type TransferEditForm = z.infer<typeof transferEditSchema>;

export default function TransfersEdit() {
  const [, params] = useRoute("/hr/transfers/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: transfer, isLoading, isError, refetch } = useApiQuery<any>(
    ["hr-transfer", String(id ?? "")],
    `/hr/transfers/${id}`,
    { enabled: !!id }
  );

  const handleSave = async (values: TransferEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/hr/transfers/${id}`, {
        effectiveDate: values.effectiveDate || undefined,
        toJobTitle: values.toJobTitle,
        toSalary: values.toSalary ? Number(values.toSalary) : undefined,
        reason: values.reason,
        notes: values.notes,
      });
      toast({ title: "تم تحديث طلب النقل" });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["hr-transfer", String(id)] });
      setLocation(`/hr/transfers/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!transfer || !transfer.id) {
    return <div className="text-center py-16 text-muted-foreground">طلب النقل غير موجود</div>;
  }
  if (transfer.status !== "pending") {
    return (
      <CreatePageLayout title="تعذّر التعديل" subtitle="تعديل طلب النقل" backPath={`/hr/transfers/${id}`}>
        <div className="text-center py-16 text-muted-foreground">
          لا يمكن تعديل طلب نقل بعد اعتماده أو رفضه.
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout
      title={`تعديل طلب النقل — TRF-${id}`}
      subtitle={transfer.employeeName ? `الموظف: ${transfer.employeeName}` : "تعديل بيانات طلب النقل"}
      backPath={`/hr/transfers/${id}`}
    >
      <FormShell
        key={transfer.id}
        schema={transferEditSchema}
        defaultValues={{
          effectiveDate: transfer.effectiveDate ? String(transfer.effectiveDate).slice(0, 10) : "",
          toJobTitle: transfer.toJobTitle || "",
          toSalary: transfer.toSalary != null ? String(transfer.toSalary) : "",
          reason: transfer.reason || "",
          notes: transfer.notes || "",
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/hr/transfers/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="effectiveDate" label="تاريخ النقل" />
          <FormTextField name="toJobTitle" label="المسمى الوظيفي بعد النقل" />
          <FormNumberField name="toSalary" label="الراتب بعد النقل" placeholder="0.00" />
        </FormGrid>
        <FormTextareaField name="reason" label="سبب النقل" rows={3} />
        <FormTextareaField name="notes" label="ملاحظات" rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
