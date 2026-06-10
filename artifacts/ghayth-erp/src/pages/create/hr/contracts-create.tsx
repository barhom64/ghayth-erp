import { useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { HrCreateScaffold } from "@/components/shared/hr-create-scaffold";
import { DatePicker } from "@/components/ui/date-picker";
import { AlertTriangle } from "lucide-react";

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("contracts_create", {
    employeeId: "",
    contractType: "full_time",
    startDate: "",
    endDate: "",
    probationEndDate: "",
    salary: "",
    housingAllowance: "",
    transportAllowance: "",
    notes: "",
  });

  const createMut = useApiMutation<unknown, Record<string, any>>("/hr/contracts", "POST", [["contracts"]]);
  const { data: empRes, isLoading } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees?limit=500");
  const employees = empRes?.data || [];

  const { fieldErrors, validate } = useFieldErrors();

  const selectedEmp = useMemo(
    () => employees.find((e: any) => String(e.id) === form.employeeId),
    [employees, form.employeeId],
  );
  const assignmentId = selectedEmp?.activeAssignmentId
    ?? selectedEmp?.assignmentId
    ?? null;

  if (isLoading) return <LoadingSpinner />;

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
    if (!assignmentId) {
      toast({ variant: "destructive", title: "لا يوجد تعيين فعّال لهذا الموظف" });
      return;
    }
    createMut.mutate(
      {
        employeeId: Number(form.employeeId),
        assignmentId: Number(assignmentId),
        contractType: form.contractType,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        probationEndDate: form.probationEndDate || undefined,
        salary: form.salary ? Number(form.salary) : undefined,
        housingAllowance: form.housingAllowance ? Number(form.housingAllowance) : undefined,
        transportAllowance: form.transportAllowance ? Number(form.transportAllowance) : undefined,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          toast({ title: "تم إنشاء العقد بنجاح" });
          setLocation("/hr/contracts");
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء العقد", description: err?.fix ?? err?.message });
        },
      },
    );
  };

  return (
    <CreatePageLayout title="عقد موظف جديد" backPath="/hr/contracts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}

      <HrCreateScaffold
        follows="assignment"
        employeeId={form.employeeId}
        onEmployeeChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
        assignmentId={assignmentId ? String(assignmentId) : undefined}
        // Contracts carry the salary line which is sensitive — guard
        // the whole scaffold body behind hr.contracts:create. Backend
        // authorize() still enforces.
        sensitivePerm="hr.contracts:create"
        assignmentSelectorSlot={<AssignmentReadOnlyBadge employee={selectedEmp} />}
        detailsSlot={
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <TextAreaField
              label="ملاحظات"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="ملاحظات إضافية..."
            />
          </div>
        }
        onSubmit={handleSubmit}
        saving={createMut.isPending}
        saveLabel="إنشاء العقد"
        isDirty={Boolean(form.employeeId || form.salary)}
      />
    </CreatePageLayout>
  );
}

/**
 * Same auto-bind badge as loans/overtime. Single-assignment shops
 * surface the bound assignmentId so the operator sees where the
 * contract attaches; no active assignment → block.
 */
function AssignmentReadOnlyBadge({ employee }: { employee: any }) {
  if (!employee) return null;
  const id = employee.activeAssignmentId ?? employee.assignmentId;
  if (!id) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>لا يوجد تعيين فعّال — لا يمكن إنشاء العقد.</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
      <span>تعيين #{id}</span>
      {employee.branchName && <span>· فرع: {employee.branchName}</span>}
      {employee.jobTitle && <span>· {employee.jobTitle}</span>}
      <span className="ms-auto text-emerald-600">مُحدَّد تلقائياً</span>
    </div>
  );
}
