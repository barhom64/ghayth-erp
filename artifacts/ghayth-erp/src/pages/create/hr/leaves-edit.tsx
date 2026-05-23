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
  FormTextareaField,
} from "@workspace/ui-core";
import { formatDateAr } from "@/lib/formatters";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "إجازة سنوية",
  sick: "إجازة مرضية",
  emergency: "إجازة طارئة",
  unpaid: "إجازة بدون راتب",
  maternity: "إجازة أمومة",
  paternity: "إجازة أبوة",
  compassionate: "إجازة عزاء",
  hajj: "إجازة حج",
};

// Only the request reason is editable. Dates / leave type are intentionally
// not — changing them would require re-running the balance reservation
// performed by POST /hr/leave-requests, which is out of scope for an edit.
const leaveEditSchema = z.object({
  reason: z.string(),
});
type LeaveEditForm = z.infer<typeof leaveEditSchema>;

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <span className="text-sm text-status-neutral-foreground">{value || "-"}</span>
    </div>
  );
}

export default function LeavesEdit() {
  const [, params] = useRoute("/hr/leaves/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: leave, isLoading, isError, refetch } = useApiQuery<any>(
    ["leave", String(id ?? "")],
    `/hr/leaves/${id}`,
    { enabled: !!id }
  );

  const handleSave = async (values: LeaveEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/hr/leave-requests/${id}`, { reason: values.reason });
      toast({ title: "تم تحديث الإجازة" });
      qc.invalidateQueries({ queryKey: ["leaves"] });
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      qc.invalidateQueries({ queryKey: ["leave", String(id)] });
      setLocation(`/hr/leaves/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!leave || !leave.id) {
    return <div className="text-center py-16 text-muted-foreground">طلب الإجازة غير موجود</div>;
  }
  if (!["pending", "returned"].includes(leave.status)) {
    return (
      <CreatePageLayout title="تعذّر التعديل" subtitle="تعديل الإجازة" backPath={`/hr/leaves/${id}`}>
        <div className="text-center py-16 text-muted-foreground">
          لا يمكن تعديل إجازة بعد اعتمادها أو رفضها أو إلغائها.
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout
      title={`تعديل الإجازة — ${leave.ref || `LV-${id}`}`}
      subtitle={leave.employeeName ? `الموظف: ${leave.employeeName}` : "تعديل سبب طلب الإجازة"}
      backPath={`/hr/leaves/${id}`}
    >
      <FormShell
        key={leave.id}
        schema={leaveEditSchema}
        defaultValues={{ reason: leave.reason || leave.description || "" }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/hr/leaves/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/30 p-3">
          <ReadonlyField label="الموظف" value={leave.employeeName} />
          <ReadonlyField label="نوع الإجازة" value={LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType} />
          <ReadonlyField label="تاريخ البداية" value={formatDateAr(leave.startDate)} />
          <ReadonlyField label="تاريخ النهاية" value={formatDateAr(leave.endDate)} />
        </div>
        <FormTextareaField name="reason" label="سبب الإجازة" rows={4} />
      </FormShell>
    </CreatePageLayout>
  );
}
