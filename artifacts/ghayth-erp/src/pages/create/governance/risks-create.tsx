import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  title: z.string().min(1, "عنوان الخطر مطلوب"),
  category: z.enum(["operational", "financial", "strategic", "compliance", "technology"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  likelihood: z.enum(["low", "medium", "high", "critical"]),
  impact: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["identified", "mitigating", "resolved", "accepted"]),
  assignedTo: z.string().optional(),
  description: z.string().optional(),
  mitigationPlan: z.string().optional(),
});

const CATEGORY = [
  { value: "operational", label: "تشغيلي" },
  { value: "financial", label: "مالي" },
  { value: "strategic", label: "استراتيجي" },
  { value: "compliance", label: "امتثال" },
  { value: "technology", label: "تقني" },
];

const LEVEL = [
  { value: "low", label: "منخفض" },
  { value: "medium", label: "متوسط" },
  { value: "high", label: "عالي" },
  { value: "critical", label: "حرج" },
];

const SEVERITY = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "critical", label: "حرجة" },
];

const STATUS = [
  { value: "identified", label: "محدد" },
  { value: "mitigating", label: "قيد المعالجة" },
  { value: "resolved", label: "تم الحل" },
  { value: "accepted", label: "مقبول" },
];

export default function RisksCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation("/governance/risks", "POST", [["governance-risks"]]);
  const { data: employeesData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const employees = employeesData?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const employeeOptions = employees.map((emp: any) => ({
    value: String(emp.id),
    label: `${emp.name} - ${emp.jobTitle || emp.department || ""}`,
  }));

  return (
    <CreatePageLayout title="تسجيل خطر جديد" backPath="/governance/risks">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          category: "operational",
          severity: "medium",
          likelihood: "medium",
          impact: "medium",
          status: "identified",
          assignedTo: "",
          description: "",
          mitigationPlan: "",
        }}
        submitLabel={createMut.isPending ? "جاري التسجيل..." : "تسجيل"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/governance/risks")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            assignedTo: values.assignedTo ? Number(values.assignedTo) : undefined,
          });
          toast({ title: "تم تسجيل الخطر بنجاح" });
          setLocation("/governance/risks");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان الخطر" required />
          <FormSelectField name="category" label="الفئة" options={CATEGORY} />
          <FormSelectField name="severity" label="الخطورة" options={SEVERITY} />
          <FormSelectField name="likelihood" label="مستوى الاحتمالية" options={LEVEL} />
          <FormSelectField name="impact" label="مستوى التأثير" options={LEVEL} />
          <FormSelectField name="status" label="الحالة" options={STATUS} />
          <FormSelectField
            name="assignedTo"
            label="المسؤول عن المعالجة"
            placeholder="— اختياري —"
            options={employeeOptions}
          />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف الخطر..." />
        <FormTextareaField name="mitigationPlan" label="خطة المعالجة" placeholder="إجراءات المعالجة..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
