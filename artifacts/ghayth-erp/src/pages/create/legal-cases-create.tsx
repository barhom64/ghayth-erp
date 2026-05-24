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
  FormDateField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان القضية"),
  caseNumber: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Za-z0-9\-\/]+$/.test(v),
      "رقم القضية يجب أن يحتوي على أحرف وأرقام وشرطات فقط",
    ),
  caseType: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  court: z.string().optional(),
  opposingParty: z.string().optional(),
  lawyerName: z.string().optional(),
  filingDate: z.string().optional(),
  status: z.enum(["open", "in_progress", "judgment", "execution", "closed"]),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const CASE_TYPE_OPTIONS = [
  { value: "labor", label: "عمالية" },
  { value: "commercial", label: "تجارية" },
  { value: "civil", label: "مدنية" },
  { value: "criminal", label: "جزائية" },
  { value: "administrative", label: "إدارية" },
  { value: "other", label: "أخرى" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
];
const STATUS_OPTIONS = [
  { value: "open", label: "مفتوحة" },
  { value: "in_progress", label: "جارية" },
  { value: "judgment", label: "حكم" },
  { value: "execution", label: "تنفيذ" },
  { value: "closed", label: "مغلقة" },
];

export default function LegalCasesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addCase = useApiMutation("/legal/cases", "POST", [["legal-cases"], ["legal-stats"]]);
  const { data: employeesData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const employees = employeesData?.data || [];
  const lawyerOptions = employees.map((emp: any) => ({
    value: emp.name,
    label: `${emp.name} - ${emp.jobTitle || emp.role}`,
  }));

  return (
    <CreatePageLayout title="قضية جديدة" backPath="/legal">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          caseNumber: "",
          caseType: "",
          priority: "medium",
          court: "",
          opposingParty: "",
          lawyerName: "",
          filingDate: "",
          status: "open",
          description: "",
          notes: "",
        }}
        submitLabel={addCase.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/legal")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addCase.mutateAsync({
            ...values,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تمت إضافة القضية بنجاح" });
          setLocation("/legal");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان القضية" required />
          <FormTextField name="caseNumber" label="رقم القضية" />
          <FormSelectField name="caseType" label="نوع القضية" options={CASE_TYPE_OPTIONS} placeholder="اختر النوع" />
          <FormSelectField name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormTextField name="court" label="المحكمة" placeholder="اسم المحكمة" />
          <FormTextField name="opposingParty" label="الخصم" placeholder="اسم الخصم" />
          <FormSelectField name="lawyerName" label="المحامي المسؤول" options={lawyerOptions} placeholder="— اختر من الموظفين —" />
          <FormDateField name="filingDate" label="تاريخ الإيداع" />
        </FormGrid>
        <FormTextareaField name="description" label="وصف القضية" placeholder="تفاصيل القضية..." />
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات القضية" />
      </FormShell>
    </CreatePageLayout>
  );
}
