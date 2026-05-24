import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
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
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z
  .object({
    title: z.string().min(1, "يرجى إدخال عنوان التدقيق"),
    status: z.enum(["planned", "in_progress", "completed"]),
    auditorName: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    scope: z.string().optional(),
    findings: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

const STATUS_OPTIONS = [
  { value: "planned", label: "مخطط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "completed", label: "مكتمل" },
];

export default function AuditsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>(
    "/governance/audits",
    "POST",
    [["governance-audits"]],
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="تدقيق جديد" backPath="/governance/audits">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          status: "planned",
          auditorName: "",
          startDate: "",
          endDate: "",
          scope: "",
          findings: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/governance/audits")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إنشاء التدقيق بنجاح" });
          setLocation("/governance/audits");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان التدقيق" required placeholder="عنوان التدقيق" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormTextField name="auditorName" label="المدقق" placeholder="اسم المدقق" />
          <FormDateField name="startDate" label="تاريخ البدء" />
          <FormDateField name="endDate" label="تاريخ الانتهاء" />
        </FormGrid>
        <FormTextareaField name="scope" label="نطاق التدقيق" placeholder="نطاق وأهداف التدقيق..." />
        <FormTextareaField name="findings" label="النتائج" placeholder="نتائج التدقيق..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدقيق" />
      </FormShell>
    </CreatePageLayout>
  );
}
