import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "fleet_drivers_create";
const INITIAL = { name: "", phone: "", licenseNumber: "", licenseExpiry: "", licenseType: "", employeeId: "", status: "available" };

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/drivers", "POST", [["drivers"]]);
  const { data: employeesData, isLoading, isError } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const employees = employeesData?.data || [];

  const handleEmployeeSelect = (empId: string) => {
    const emp = employees.find((e: any) => String(e.id) === empId);
    if (emp) {
      setForm((f) => ({ ...f, employeeId: empId, name: emp.name || f.name, phone: emp.phone || f.phone }));
    } else {
      setForm((f) => ({ ...f, employeeId: empId }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "اسم السائق مطلوب";
    if (!form.phone.trim()) errs.phone = "رقم الهاتف مطلوب";
    if (!form.licenseNumber.trim()) errs.licenseNumber = "رقم الرخصة مطلوب";
    if (form.licenseExpiry) {
      const expiry = new Date(form.licenseExpiry);
      if (expiry < new Date()) errs.licenseExpiry = "تاريخ انتهاء الرخصة يجب أن يكون في المستقبل";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast({ variant: "destructive", title: "الرجاء تصحيح الأخطاء في النموذج" });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      });
      clearDraft();
      toast({ title: "تم إضافة السائق بنجاح" });
      setLocation("/fleet/drivers");
    } catch (err: any) {
      const apiField = err?.field;
      if (apiField) setFieldErrors((prev) => ({ ...prev, [apiField]: err?.message ?? "خطأ في الحقل" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة السائق", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="إضافة سائق جديد" backPath="/fleet/drivers">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormFieldWrapper label="ربط بموظف">
          <Select value={form.employeeId || "_none"} onValueChange={(v) => handleEmployeeSelect(v === "_none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="— اختر موظف أو أدخل يدوياً —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختر موظف أو أدخل يدوياً —</SelectItem>
              {employees.map((emp: any) => (
                <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || emp.department || ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.employeeId && (
            <div className="mt-3">
              <EmployeeContextCard employeeId={form.employeeId} />
            </div>
          )}
        </FormFieldWrapper>

        <TextField
          label="الاسم"
          required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          error={fieldErrors.name}
        />

        <TextField
          label="الهاتف"
          required
          dir="ltr"
          value={form.phone}
          onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
          error={fieldErrors.phone}
        />

        <TextField
          label="رقم الرخصة"
          required
          value={form.licenseNumber}
          onChange={(v) => setForm((f) => ({ ...f, licenseNumber: v }))}
          error={fieldErrors.licenseNumber}
        />

        <FormFieldWrapper label="نوع الرخصة">
          <Select value={form.licenseType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, licenseType: v === "_none" ? "" : v }))}>
            <SelectTrigger>
              <SelectValue placeholder="اختر النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر النوع</SelectItem>
              <SelectItem value="private">خاصة</SelectItem>
              <SelectItem value="public">عامة</SelectItem>
              <SelectItem value="heavy">ثقيلة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="انتهاء الرخصة" error={fieldErrors.licenseExpiry}>
          <DatePicker value={form.licenseExpiry} onChange={(v) => setForm((f) => ({ ...f, licenseExpiry: v }))} />
        </FormFieldWrapper>

        <FormFieldWrapper label="الحالة">
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">متاح</SelectItem>
              <SelectItem value="on_trip">في رحلة</SelectItem>
              <SelectItem value="off_duty">خارج الخدمة</SelectItem>
              <SelectItem value="suspended">موقوف</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/fleet/drivers")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
