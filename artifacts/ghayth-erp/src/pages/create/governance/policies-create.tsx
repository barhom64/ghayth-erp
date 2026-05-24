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
  title: z.string().min(1, "عنوان السياسة مطلوب"),
  category: z.enum(["general", "hr", "finance", "it", "security"]),
  status: z.enum(["draft", "active", "archived", "under_review"]),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  description: z.string().optional(),
});

const CATEGORY_OPTIONS = [
  { value: "general", label: "عامة" },
  { value: "hr", label: "موارد بشرية" },
  { value: "finance", label: "مالية" },
  { value: "it", label: "تقنية معلومات" },
  { value: "security", label: "أمن وسلامة" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "active", label: "سارية" },
  { value: "archived", label: "مؤرشفة" },
  { value: "under_review", label: "قيد المراجعة" },
];

export default function PoliciesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>(
    "/governance/policies",
    "POST",
    [["governance-policies"]],
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة سياسة جديدة" backPath="/governance/policies">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          category: "general",
          status: "draft",
          effectiveDate: "",
          expiryDate: "",
          description: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/governance/policies")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إضافة السياسة بنجاح" });
          setLocation("/governance/policies");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان السياسة" required placeholder="عنوان السياسة" />
          <FormSelectField name="category" label="الفئة" options={CATEGORY_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormDateField name="effectiveDate" label="تاريخ السريان" />
          <FormDateField name="expiryDate" label="تاريخ الانتهاء" />
        </FormGrid>
        <FormTextareaField name="description" label="محتوى السياسة" placeholder="نص السياسة..." rows={5} />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات السياسة" />
      </FormShell>
    </CreatePageLayout>
  );
}
