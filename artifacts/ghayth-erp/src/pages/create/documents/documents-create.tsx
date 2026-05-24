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
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان المستند"),
  category: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]),
  description: z.string().optional(),
});

const CATEGORY_OPTIONS = [
  { value: "contract", label: "عقد" },
  { value: "report", label: "تقرير" },
  { value: "policy", label: "سياسة" },
  { value: "template", label: "قالب" },
  { value: "invoice", label: "فاتورة" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانوني" },
  { value: "other", label: "أخرى" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "active", label: "نشط" },
  { value: "archived", label: "مؤرشف" },
];

export default function DocumentsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[] | undefined>>(
    "/documents",
    "POST",
    [["documents"]],
  );

  return (
    <CreatePageLayout title="إضافة مستند جديد" backPath="/documents">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ title: "", category: "", status: "draft", description: "" }}
        submitLabel={createMut.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/documents")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            title: values.title,
            category: values.category || undefined,
            status: values.status,
            description: values.description || undefined,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إضافة المستند بنجاح" });
          setLocation("/documents");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان المستند" required placeholder="عنوان المستند" />
          <FormSelectField name="category" label="التصنيف" placeholder="بدون تصنيف" options={CATEGORY_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" placeholder="وصف المستند..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="رفع الملفات" />
      </FormShell>
    </CreatePageLayout>
  );
}
