import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function LegalCasesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addCase = useApiMutation("/legal/cases", "POST", [["legal-cases"], ["legal-stats"]]);
  const { data: employeesData, isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = employeesData?.data || [];
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("legal_cases_create", {
    title: "", caseNumber: "", caseType: "", priority: "medium",
    court: "", opposingParty: "", lawyerName: "", filingDate: "",
    status: "open", description: "", notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.title) localErrors.title = "يرجى إدخال عنوان القضية";
    if (form.caseNumber && !/^[A-Za-z0-9\-\/]+$/.test(form.caseNumber)) localErrors.caseNumber = "رقم القضية يجب أن يحتوي على أحرف وأرقام وشرطات فقط";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await addCase.mutateAsync({
        ...form,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
      toast({ title: "تمت إضافة القضية بنجاح" });
      setLocation("/legal");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة القضية", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="قضية جديدة" backPath="/legal">
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
          <TextField label="عنوان القضية" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} error={fieldErrors.title} />
          <TextField label="رقم القضية" dir="ltr" value={form.caseNumber} onChange={(v) => setForm((f) => ({ ...f, caseNumber: v }))} error={fieldErrors.caseNumber} />
          <FormFieldWrapper label="نوع القضية">
            <Select value={form.caseType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, caseType: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر النوع</SelectItem>
                <SelectItem value="labor">عمالية</SelectItem>
                <SelectItem value="commercial">تجارية</SelectItem>
                <SelectItem value="civil">مدنية</SelectItem>
                <SelectItem value="criminal">جزائية</SelectItem>
                <SelectItem value="administrative">إدارية</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الأولوية">
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="urgent">عاجلة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">مفتوحة</SelectItem>
                <SelectItem value="in_progress">جارية</SelectItem>
                <SelectItem value="hearing">جلسة</SelectItem>
                <SelectItem value="appeal">استئناف</SelectItem>
                <SelectItem value="closed">مغلقة</SelectItem>
                <SelectItem value="won">فوز</SelectItem>
                <SelectItem value="lost">خسارة</SelectItem>
                <SelectItem value="settled">تسوية</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="المحكمة" value={form.court} onChange={(v) => setForm((f) => ({ ...f, court: v }))} placeholder="اسم المحكمة" />
          <TextField label="الخصم" value={form.opposingParty} onChange={(v) => setForm((f) => ({ ...f, opposingParty: v }))} placeholder="اسم الخصم" />
          <FormFieldWrapper label="المحامي المسؤول">
            <Select value={form.lawyerName || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, lawyerName: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختر من الموظفين أو أدخل يدوياً —</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.name}>{emp.name} - {emp.jobTitle || emp.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الإيداع">
            <DatePicker value={form.filingDate} onChange={(v) => setForm((f) => ({ ...f, filingDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="وصف القضية" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="تفاصيل القضية..." />
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات القضية" />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/legal")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addCase.isPending}>{addCase.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
