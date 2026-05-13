import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function DocumentsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("documents_create", {
    title: "", category: "", status: "draft", description: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[] | undefined>>("/documents", "POST", [["documents"]]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = () => {
    const firstError = validate({
      title: form.title ? null : "يرجى إدخال عنوان المستند",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      title: form.title,
      category: form.category || undefined,
      status: form.status,
      description: form.description || undefined,
      ...(attachments.length > 0 ? { attachments } : {}),
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إضافة المستند بنجاح" }); setLocation("/documents"); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة المستند", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="إضافة مستند جديد" backPath="/documents">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="عنوان المستند" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="عنوان المستند" error={fieldErrors.title} />
          <FormFieldWrapper label="التصنيف">
            <Select value={form.category || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون تصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون تصنيف</SelectItem>
                <SelectItem value="contract">عقد</SelectItem>
                <SelectItem value="report">تقرير</SelectItem>
                <SelectItem value="policy">سياسة</SelectItem>
                <SelectItem value="template">قالب</SelectItem>
                <SelectItem value="invoice">فاتورة</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="legal">قانوني</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="archived">مؤرشف</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف المستند..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="رفع الملفات" />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/documents")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
