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

const DRAFT_KEY = "governance_compliance_create";
const INITIAL = { regulation: "", responsiblePerson: "", status: "compliant", dueDate: "", description: "", notes: "" };

export default function ComplianceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/governance/compliance", "POST", [["governance-compliance"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      regulation: form.regulation ? null : "يرجى إدخال اسم اللائحة أو البند",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({ ...form });
      clearDraft();
      toast({ title: "تم تسجيل بند الامتثال بنجاح" });
      setLocation("/governance/compliance");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل بند الامتثال", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة بند امتثال" backPath="/governance/compliance">
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
          <TextField label="اللائحة / البند" required value={form.regulation} onChange={(v) => setForm((f) => ({ ...f, regulation: v }))} placeholder="اسم اللائحة أو البند" error={fieldErrors.regulation} />
          <TextField label="المسؤول" value={form.responsiblePerson} onChange={(v) => setForm((f) => ({ ...f, responsiblePerson: v }))} placeholder="المسؤول عن الامتثال" />
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compliant">ممتثل</SelectItem>
                <SelectItem value="non_compliant">غير ممتثل</SelectItem>
                <SelectItem value="in_progress">قيد المعالجة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الاستحقاق">
            <DatePicker value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف بند الامتثال..." />
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/compliance")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري التسجيل..." : "تسجيل"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
