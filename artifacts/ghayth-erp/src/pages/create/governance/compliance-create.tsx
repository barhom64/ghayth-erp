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

const schema = z.object({
  regulation: z.string().min(1, "يرجى إدخال اسم اللائحة أو البند"),
  responsiblePerson: z.string().optional(),
  status: z.enum(["compliant", "non_compliant", "in_progress"]),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const STATUS_OPTIONS = [
  { value: "compliant", label: "ممتثل" },
  { value: "non_compliant", label: "غير ممتثل" },
  { value: "in_progress", label: "قيد المعالجة" },
];

export default function ComplianceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>(
    "/governance/compliance",
    "POST",
    [["governance-compliance"]],
  );

  return (
    <CreatePageLayout title="إضافة بند امتثال" backPath="/governance/compliance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          regulation: "",
          responsiblePerson: "",
          status: "compliant",
          dueDate: "",
          description: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري التسجيل..." : "تسجيل"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/governance/compliance")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({ ...values });
          toast({ title: "تم تسجيل بند الامتثال بنجاح" });
          setLocation("/governance/compliance");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="regulation" label="اللائحة / البند" required placeholder="اسم اللائحة أو البند" />
          <FormTextField name="responsiblePerson" label="المسؤول" placeholder="المسؤول عن الامتثال" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف بند الامتثال..." />
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
