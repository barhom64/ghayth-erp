import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "governance_risks_create";
const INITIAL = {
  title: "", category: "operational", severity: "medium",
  likelihood: "medium", impact: "medium", status: "identified",
  assignedTo: "", description: "", mitigationPlan: "",
};

export default function RisksCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation("/governance/risks", "POST", [["governance-risks"]]);
  const { data: employeesData, isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = employeesData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    const firstError = validate({
      title: form.title ? null : "عنوان الخطر مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined,
      });
      clearDraft();
      toast({ title: "تم تسجيل الخطر بنجاح" });
      setLocation("/governance/risks");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل الخطر", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="تسجيل خطر جديد" backPath="/governance/risks">
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
          <TextField label="عنوان الخطر" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} error={fieldErrors.title} />
          <FormFieldWrapper label="الفئة">
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operational">تشغيلي</SelectItem>
                <SelectItem value="financial">مالي</SelectItem>
                <SelectItem value="strategic">استراتيجي</SelectItem>
                <SelectItem value="compliance">امتثال</SelectItem>
                <SelectItem value="technology">تقني</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الخطورة">
            <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="critical">حرجة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="مستوى الاحتمالية">
            <Select value={form.likelihood} onValueChange={(v) => setForm((f) => ({ ...f, likelihood: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفض</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="high">عالي</SelectItem>
                <SelectItem value="critical">حرج</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="مستوى التأثير">
            <Select value={form.impact} onValueChange={(v) => setForm((f) => ({ ...f, impact: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفض</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="high">عالي</SelectItem>
                <SelectItem value="critical">حرج</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="identified">محدد</SelectItem>
                <SelectItem value="mitigating">قيد المعالجة</SelectItem>
                <SelectItem value="resolved">تم الحل</SelectItem>
                <SelectItem value="accepted">مقبول</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="المسؤول عن المعالجة">
            <Select value={form.assignedTo ? String(form.assignedTo) : "_none"} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختياري —</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || emp.department || ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف الخطر..." />
        <TextAreaField label="خطة المعالجة" value={form.mitigationPlan} onChange={(v) => setForm((f) => ({ ...f, mitigationPlan: v }))} placeholder="إجراءات المعالجة..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/governance/risks")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري التسجيل..." : "تسجيل"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
