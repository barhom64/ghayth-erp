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
import { DatePicker } from "@/components/ui/date-picker";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "governance_policies_create";
const INITIAL = { title: "", category: "general", status: "draft", effectiveDate: "", expiryDate: "", description: "" };

export default function PoliciesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>("/governance/policies", "POST", [["governance-policies"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      title: form.title ? null : "عنوان السياسة مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, ...(attachments.length > 0 ? { attachments } : {}) });
      clearDraft();
      toast({ title: "تم إضافة السياسة بنجاح" });
      setLocation("/governance/policies");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة السياسة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة سياسة جديدة" backPath="/governance/policies">
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
          <TextField label="عنوان السياسة" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="عنوان السياسة" error={fieldErrors.title} />
          <FormFieldWrapper label="الفئة">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">عامة</SelectItem>
                <SelectItem value="hr">موارد بشرية</SelectItem>
                <SelectItem value="finance">مالية</SelectItem>
                <SelectItem value="it">تقنية معلومات</SelectItem>
                <SelectItem value="security">أمن وسلامة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="active">سارية</SelectItem>
                <SelectItem value="archived">مؤرشفة</SelectItem>
                <SelectItem value="under_review">قيد المراجعة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ السريان">
            <DatePicker value={form.effectiveDate} onChange={(v) => setForm((f) => ({ ...f, effectiveDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الانتهاء">
            <DatePicker value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="محتوى السياسة" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="نص السياسة..." rows={5} />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات السياسة" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/policies")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
