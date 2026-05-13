import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { DatePicker } from "@/components/ui/date-picker";

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("contracts_create", {
    employeeId: "", assignmentId: "", contractType: "full_time", startDate: "", endDate: "",
    probationEndDate: "", salary: "", housingAllowance: "", transportAllowance: "", notes: "",
  });

  const createMut = useApiMutation<unknown, Record<string, any>>("/hr/contracts", "POST", [["contracts"]]);
  const { data: empRes, isLoading } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees?limit=500");
  const employees = empRes?.data || [];

  const { fieldErrors, validate } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;

  const selectedEmp = employees.find((e: any) => String(e.id) === form.employeeId);

  const handleSubmit = () => {
    const firstError = validate({
      employeeId: form.employeeId ? null : "يرجى اختيار الموظف",
      contractType: form.contractType ? null : "يرجى اختيار نوع العقد",
      startDate: form.startDate ? null : "يرجى إدخال تاريخ البداية",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      employeeId: Number(form.employeeId),
      assignmentId: selectedEmp?.assignmentId || Number(form.assignmentId || form.employeeId),
      contractType: form.contractType,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      probationEndDate: form.probationEndDate || undefined,
      salary: form.salary ? Number(form.salary) : undefined,
      housingAllowance: form.housingAllowance ? Number(form.housingAllowance) : undefined,
      transportAllowance: form.transportAllowance ? Number(form.transportAllowance) : undefined,
      notes: form.notes || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء العقد بنجاح" }); setLocation("/hr/contracts"); },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء العقد", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="عقد موظف جديد" backPath="/hr/contracts">
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
          <EmployeeSelect
            value={form.employeeId}
            onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
            label="الموظف"
            required
            error={fieldErrors.employeeId}
          />
          <FormFieldWrapper label="نوع العقد" required error={fieldErrors.contractType}>
            <Select value={form.contractType} onValueChange={(v) => setForm((f) => ({ ...f, contractType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">دوام كامل</SelectItem>
                <SelectItem value="part_time">دوام جزئي</SelectItem>
                <SelectItem value="contract">عقد مؤقت</SelectItem>
                <SelectItem value="probation">فترة تجربة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ البداية" required error={fieldErrors.startDate}>
            <DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ النهاية">
            <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="نهاية فترة التجربة">
            <DatePicker value={form.probationEndDate} onChange={(v) => setForm((f) => ({ ...f, probationEndDate: v }))} />
          </FormFieldWrapper>
          <NumberField label="الراتب الأساسي" value={form.salary} onChange={(v) => setForm((f) => ({ ...f, salary: v }))} placeholder="0.00" />
          <NumberField label="بدل السكن" value={form.housingAllowance} onChange={(v) => setForm((f) => ({ ...f, housingAllowance: v }))} placeholder="0.00" />
          <NumberField label="بدل النقل" value={form.transportAllowance} onChange={(v) => setForm((f) => ({ ...f, transportAllowance: v }))} placeholder="0.00" />
        </div>
        <TextAreaField label="ملاحظات" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="ملاحظات إضافية..." />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/contracts")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء العقد"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
