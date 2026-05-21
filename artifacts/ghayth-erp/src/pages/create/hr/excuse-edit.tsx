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
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

const TYPE_OPTIONS = [
  { value: "early_leave", label: "انصراف مبكر" },
  { value: "late_arrival", label: "تأخر صباحي" },
  { value: "personal", label: "ظرف شخصي" },
];

const excuseEditSchema = z.object({
  excuseDate: z.string().min(1, "تاريخ الاستئذان مطلوب"),
  excuseType: z.string().min(1, "نوع الاستئذان مطلوب"),
  startTime: z.string(),
  endTime: z.string(),
  estimatedMinutes: z.string(),
  reason: z.string(),
});
type ExcuseEditForm = z.infer<typeof excuseEditSchema>;

const toTimeInput = (v: unknown): string => (v ? String(v).slice(0, 5) : "");

export default function ExcuseEdit() {
  const [, params] = useRoute("/hr/excuse-requests/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: excuse, isLoading, isError, refetch } = useApiQuery<any>(
    ["excuse", String(id ?? "")],
    `/hr/excuse-requests/${id}`,
    { enabled: !!id }
  );

  const handleSave = async (values: ExcuseEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/hr/excuse-requests/${id}`, {
        excuseDate: values.excuseDate || undefined,
        excuseType: values.excuseType,
        startTime: values.startTime || undefined,
        endTime: values.endTime || undefined,
        estimatedMinutes: values.estimatedMinutes !== "" ? Number(values.estimatedMinutes) : undefined,
        reason: values.reason,
      });
      toast({ title: "تم تحديث طلب الاستئذان" });
      qc.invalidateQueries({ queryKey: ["excuse-requests"] });
      qc.invalidateQueries({ queryKey: ["excuse", String(id)] });
      setLocation(`/hr/excuse-requests/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!excuse || !excuse.id) {
    return <div className="text-center py-16 text-muted-foreground">طلب الاستئذان غير موجود</div>;
  }
  if (excuse.status !== "pending") {
    return (
      <CreatePageLayout title="تعذّر التعديل" subtitle="تعديل طلب الاستئذان" backPath={`/hr/excuse-requests/${id}`}>
        <div className="text-center py-16 text-muted-foreground">
          لا يمكن تعديل طلب استئذان بعد اعتماده أو رفضه.
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout
      title={`تعديل طلب الاستئذان — EXC-${id}`}
      subtitle={excuse.employeeName ? `الموظف: ${excuse.employeeName}` : "تعديل بيانات طلب الاستئذان"}
      backPath={`/hr/excuse-requests/${id}`}
    >
      <FormShell
        key={excuse.id}
        schema={excuseEditSchema}
        defaultValues={{
          excuseDate: excuse.excuseDate ? String(excuse.excuseDate).slice(0, 10) : "",
          excuseType: excuse.excuseType || "early_leave",
          startTime: toTimeInput(excuse.startTime),
          endTime: toTimeInput(excuse.endTime),
          estimatedMinutes: excuse.estimatedMinutes != null ? String(excuse.estimatedMinutes) : "",
          reason: excuse.reason || "",
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/hr/excuse-requests/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="excuseDate" label="تاريخ الاستئذان" required />
          <FormSelectField name="excuseType" label="نوع الاستئذان" required options={TYPE_OPTIONS} />
          <FormTextField name="startTime" label="وقت البداية" type="time" />
          <FormTextField name="endTime" label="وقت النهاية" type="time" />
          <FormNumberField name="estimatedMinutes" label="المدة المقدّرة (دقائق)" placeholder="0" />
        </FormGrid>
        <FormTextareaField name="reason" label="سبب الاستئذان" rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
