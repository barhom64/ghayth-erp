import { useState } from "react";
import { z } from "zod";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreatePageLayout,
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";

const STATUS_OPTIONS = [
  { value: "present", label: "حاضر" },
  { value: "absent", label: "غائب" },
  { value: "late", label: "متأخر" },
  { value: "early_leave", label: "انصراف مبكر" },
  { value: "excused", label: "مستأذن" },
  { value: "on_leave", label: "في إجازة" },
];

// HR manual correction of an attendance record. Late/overtime minutes are
// edited explicitly because the server does NOT recompute them from the
// punch times — this is an override tool, not an auto-calculator.
const attendanceEditSchema = z.object({
  status: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  lateMinutes: z.string(),
  earlyLeaveMinutes: z.string(),
  overtimeMinutes: z.string(),
  notes: z.string(),
});
type AttendanceEditForm = z.infer<typeof attendanceEditSchema>;

const toLocalInput = (v: unknown): string => (v ? String(v).slice(0, 16) : "");
const toMinutes = (v: string): number | undefined => (v !== "" ? Number(v) : undefined);

export default function AttendanceEdit() {
  const [, params] = useRoute("/hr/attendance/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: record, isLoading, isError, refetch } = useApiQuery<any>(
    ["attendance", String(id ?? "")],
    `/hr/attendance/${id}`,
    { enabled: !!id }
  );

  const handleSave = async (values: AttendanceEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/hr/attendance/${id}`, {
        status: values.status || undefined,
        checkIn: values.checkIn || undefined,
        checkOut: values.checkOut || undefined,
        lateMinutes: toMinutes(values.lateMinutes),
        earlyLeaveMinutes: toMinutes(values.earlyLeaveMinutes),
        overtimeMinutes: toMinutes(values.overtimeMinutes),
        notes: values.notes,
      });
      toast({ title: "تم تحديث سجل الحضور" });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setLocation(`/hr/attendance/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!record || !record.id) {
    return <div className="text-center py-16 text-muted-foreground">سجل الحضور غير موجود</div>;
  }

  return (
    <CreatePageLayout
      title={`تعديل سجل الحضور — ATT-${id}`}
      subtitle={record.employeeName ? `الموظف: ${record.employeeName}` : "تصحيح يدوي لسجل الحضور"}
      backPath={`/hr/attendance/${id}`}
    >
      <FormShell
        key={record.id}
        schema={attendanceEditSchema}
        defaultValues={{
          status: record.status || "present",
          checkIn: toLocalInput(record.checkIn),
          checkOut: toLocalInput(record.checkOut),
          lateMinutes: record.lateMinutes != null ? String(record.lateMinutes) : "",
          earlyLeaveMinutes: record.earlyLeaveMinutes != null ? String(record.earlyLeaveMinutes) : "",
          overtimeMinutes: record.overtimeMinutes != null ? String(record.overtimeMinutes) : "",
          notes: record.notes || "",
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/hr/attendance/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormTextField name="checkIn" label="وقت الحضور" type="datetime-local" />
          <FormTextField name="checkOut" label="وقت الانصراف" type="datetime-local" />
        </FormGrid>
        <FormGrid cols={3}>
          <FormNumberField name="lateMinutes" label="دقائق التأخير" placeholder="0" />
          <FormNumberField name="earlyLeaveMinutes" label="دقائق الانصراف المبكر" placeholder="0" />
          <FormNumberField name="overtimeMinutes" label="دقائق العمل الإضافي" placeholder="0" />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" rows={3} />
      </FormShell>
    </CreatePageLayout>
  );
}
