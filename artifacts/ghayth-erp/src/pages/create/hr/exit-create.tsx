import { useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { EXIT_TYPES } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { Info, DollarSign, AlertTriangle } from "lucide-react";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { HrCreateScaffold } from "@/components/shared/hr-create-scaffold";

const DRAFT_KEY = "hr_exit_create";

export default function ExitCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/exit", "POST", [["hr-exit"]], {
    successMessage: "تم إنشاء طلب نهاية الخدمة بنجاح",
  });

  // Wave-1/B group 2: form.employeeId holds the EMPLOYEE id; the
  // assignmentId is derived from the selected employee's
  // activeAssignmentId at submit time (same fix as group 1 — the old
  // form stored employee.id under the name `assignmentId`).
  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    employeeId: "",
    exitType: "resignation",
    lastWorkingDay: "",
    exitReason: "",
    otherDeductions: "0",
  });

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.id) === form.employeeId),
    [employees, form.employeeId]
  );
  const assignmentId = selectedEmployee?.activeAssignmentId
    ?? selectedEmployee?.assignmentId
    ?? null;

  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const hireDate = selectedEmployee?.hireDate || selectedEmployee?.joinDate;
  const yearsOfService = hireDate
    ? (new Date().getTime() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    : 0;

  // تقدير مبدئي لمكافأة نهاية الخدمة وفق نظام العمل السعودي — المادة 84 و 85
  // الحساب الدقيق يتم في الخادم
  const estimatedGratuity = useMemo(() => {
    if (!salary || !yearsOfService) return 0;
    const first5 = Math.min(yearsOfService, 5);
    const above5 = Math.max(yearsOfService - 5, 0);
    let g = (salary / 2) * first5 + salary * above5;

    if (form.exitType === "resignation") {
      // المادة 85: تخفيض المكافأة عند الاستقالة
      if (yearsOfService < 2) g = 0;
      else if (yearsOfService < 5) g = (salary / 2) * first5 / 3;
      else if (yearsOfService < 10) {
        g = ((salary / 2) * first5 * 2) / 3 + (salary * above5 * 2) / 3;
      }
      // 10+ سنوات: المكافأة كاملة
    }
    return Math.round(g * 100) / 100;
  }, [salary, yearsOfService, form.exitType]);

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const handleSubmit = async () => {
    const today = todayLocal();
    const firstError = validate({
      employeeId: form.employeeId ? null : "يرجى اختيار الموظف",
      exitType: form.exitType ? null : "نوع نهاية الخدمة مطلوب",
      lastWorkingDay: !form.lastWorkingDay
        ? "آخر يوم عمل مطلوب"
        : form.lastWorkingDay < today
          ? "آخر يوم عمل يجب أن يكون اليوم أو في المستقبل"
          : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (!assignmentId) {
      toast({ variant: "destructive", title: "لا يوجد تعيين فعّال لهذا الموظف" });
      return;
    }

    try {
      await createMut.mutateAsync({
        assignmentId: Number(assignmentId),
        exitType: form.exitType,
        lastWorkingDay: form.lastWorkingDay || undefined,
        exitReason: form.exitReason || undefined,
        otherDeductions: Number(form.otherDeductions || 0),
      });
      clearDraft();
      setLocation("/hr/exit");
    } catch (err: any) {
      setApiError(err);
    }
  };

  return (
    <CreatePageLayout
      title="طلب نهاية خدمة"
      backPath="/hr/exit"
      backLabel="نهاية الخدمة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      isDirty={Boolean(form.employeeId)}
    >
      {hasDraft && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-status-info-surface border border-status-info-surface rounded-lg text-sm text-status-info-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>تم استعادة مسودة سابقة — يمكنك متابعة التعبئة أو مسحها</span>
          <Button type="button" size="sm" variant="ghost" onClick={clearDraft} className="mr-auto text-xs">
            مسح المسودة
          </Button>
        </div>
      )}

      <HrCreateScaffold
        follows="assignment"
        employeeId={form.employeeId}
        onEmployeeChange={(v) => setForm({ ...form, employeeId: v })}
        assignmentId={assignmentId ? String(assignmentId) : undefined}
        // End-of-service carries the settlement estimate (gratuity +
        // deductions → a financial movement once approved). Sensitive —
        // the whole scaffold body hides behind hr.exit:create. Backend
        // authorize() still enforces.
        sensitivePerm="hr.exit:create"
        contextSection="loans"
        selectedEmployee={selectedEmployee}
        detailsSlot={
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormFieldWrapper label="نوع نهاية الخدمة" required error={fieldErrors.exitType}>
                <Select value={form.exitType} onValueChange={(v) => setForm({ ...form, exitType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXIT_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>

              <FormFieldWrapper label="آخر يوم عمل" required error={fieldErrors.lastWorkingDay}>
                <DatePicker value={form.lastWorkingDay} onChange={(v) => setForm({ ...form, lastWorkingDay: v })} />
              </FormFieldWrapper>

              <NumberField
                label="خصومات أخرى"
                value={form.otherDeductions}
                onChange={(v) => setForm({ ...form, otherDeductions: v })}
                step={0.01}
                min={0}
              />
            </div>

            {form.exitType === "termination" && (
              <div className="flex items-center gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-lg text-sm text-status-error-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>حالة فصل — يرجى التأكد من استكمال الإجراءات التأديبية قبل المتابعة</span>
              </div>
            )}

            <TextAreaField
              label="سبب نهاية الخدمة"
              rows={3}
              placeholder="سبب طلب إنهاء الخدمة..."
              value={form.exitReason}
              onChange={(v) => setForm({ ...form, exitReason: v })}
            />
          </div>
        }
        impactPreviewSlot={
          selectedEmployee && salary > 0 ? (
            <Card className="border-status-error-surface bg-status-error-surface">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-status-error-foreground" />
                  <span className="text-sm font-semibold text-status-error-foreground">تقدير مبدئي للمستحقات (المخالصة)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(estimatedGratuity)}</p>
                    <p className="text-xs text-muted-foreground">مكافأة نهاية الخدمة</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-info-foreground">{yearsOfService.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">سنوات الخدمة</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-warning-foreground">{EXIT_TYPES[form.exitType] || form.exitType}</p>
                    <p className="text-xs text-muted-foreground">نوع الإنهاء</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(Number(form.otherDeductions || 0))}</p>
                    <p className="text-xs text-muted-foreground">خصومات أخرى</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  هذا تقدير مبدئي — الحساب الدقيق يشمل رصيد الإجازات وخصم السلف المتبقية
                </p>
              </CardContent>
            </Card>
          ) : null
        }
        onSubmit={handleSubmit}
        saving={createMut.isPending}
        saveLabel="إنشاء طلب نهاية الخدمة"
        isDirty={Boolean(form.employeeId)}
      />
    </CreatePageLayout>
  );
}
