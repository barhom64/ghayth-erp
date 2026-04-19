import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "governance_audits_create";
const INITIAL = { title: "", status: "planned", auditorName: "", startDate: "", endDate: "", scope: "", findings: "" };

export default function AuditsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, string | Attachment[]>>("/governance/audits", "POST", [["governance-audits"]]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.title) localErrors.title = "يرجى إدخال عنوان التدقيق";
    if (form.startDate && form.endDate && form.endDate < form.startDate) localErrors.endDate = "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      toast({ variant: "destructive", title: localErrors[Object.keys(localErrors)[0]] });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form, ...(attachments.length > 0 ? { attachments } : {}) });
      clearDraft();
      toast({ title: "تم إنشاء التدقيق بنجاح" });
      setLocation("/governance/audits");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التدقيق", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="تدقيق جديد" backPath="/governance/audits">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="عنوان التدقيق" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="عنوان التدقيق" error={fieldErrors.title} />
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">مخطط</SelectItem>
                <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="المدقق" value={form.auditorName} onChange={(v) => setForm((f) => ({ ...f, auditorName: v }))} placeholder="اسم المدقق" />
          <FormFieldWrapper label="تاريخ البدء">
            <DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الانتهاء" error={fieldErrors.endDate}>
            <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="نطاق التدقيق" value={form.scope} onChange={(v) => setForm((f) => ({ ...f, scope: v }))} placeholder="نطاق وأهداف التدقيق..." />
        <TextAreaField label="النتائج" value={form.findings} onChange={(v) => setForm((f) => ({ ...f, findings: v }))} placeholder="نتائج التدقيق..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدقيق" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/audits")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
