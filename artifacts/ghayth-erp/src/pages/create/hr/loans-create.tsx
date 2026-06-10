import { useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import { LOAN_TYPES } from "@/lib/hr-type-maps";
import { Info, Calculator, AlertTriangle } from "lucide-react";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { HrCreateScaffold } from "@/components/shared/hr-create-scaffold";

const DRAFT_KEY = "hr_loans_create";

export default function LoansCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/loans", "POST", [["hr-loans"]], {
    successMessage: "تم إرسال طلب السلفة بنجاح",
  });

  // Wave-1/B refactor: form.employeeId now holds the EMPLOYEE id (not
  // the assignment id as the old form did under a misleading variable
  // name). The assignmentId is derived at submit time from the selected
  // employee's activeAssignmentId — preserves the existing single-
  // assignment behaviour while making the data model honest.
  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    employeeId: "",
    loanType: "salary_advance",
    amount: "",
    installmentCount: "1",
    startDeductionPeriod: "",
    reason: "",
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
  const maxLoan = salary * 3;
  const amount = Number(form.amount || 0);
  const installmentCount = Number(form.installmentCount || 1);
  const installmentAmount = installmentCount > 0 ? Math.round((amount / installmentCount) * 100) / 100 : 0;
  const exceedsMax = maxLoan > 0 && amount > maxLoan;

  // حساب فترة بدء الخصم الافتراضية — الشهر التالي بتقويم الرياض
  const defaultPeriod = useMemo(() => {
    const currentMonth = Number(currentMonthPaddedRiyadh());
    const currentYear = currentYearRiyadh();
    const isDec = currentMonth === 12;
    const y = isDec ? currentYear + 1 : currentYear;
    const m = isDec ? 1 : currentMonth + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, []);

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      employeeId: form.employeeId ? null : "يرجى اختيار الموظف",
      amount: !form.amount || amount <= 0 ? "يرجى إدخال مبلغ صحيح أكبر من صفر" : null,
      installmentCount: form.installmentCount && installmentCount <= 0 ? "عدد الأقساط يجب أن يكون أكبر من صفر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (exceedsMax) {
      toast({ title: `الحد الأقصى ${formatCurrency(maxLoan)} (3 أضعاف الراتب)`, variant: "destructive" });
      return;
    }
    if (!assignmentId) {
      toast({ variant: "destructive", title: "لا يوجد تعيين فعّال لهذا الموظف" });
      return;
    }

    try {
      await createMut.mutateAsync({
        assignmentId: Number(assignmentId),
        loanType: form.loanType,
        amount,
        installmentCount,
        startDeductionPeriod: form.startDeductionPeriod || undefined,
        reason: form.reason || undefined,
      });
      clearDraft();
      setLocation("/hr/loans");
    } catch (err: any) {
      setApiError(err);
    }
  };

  return (
    <CreatePageLayout
      title="طلب سلفة جديدة"
      backPath="/hr/loans"
      backLabel="سلف الموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      isDirty={Boolean(form.employeeId || form.amount)}
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
        contextSection="loans"
        selectedEmployee={selectedEmployee}
        detailsSlot={
          <div className="space-y-4">
            <FormFieldWrapper label="نوع السلفة">
              <Select value={form.loanType} onValueChange={(v) => setForm({ ...form, loanType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LOAN_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <NumberField
                label="مبلغ السلفة"
                required
                value={form.amount}
                onChange={(v) => setForm({ ...form, amount: v })}
                placeholder="0.00"
                step={0.01}
                min={1}
                error={fieldErrors.amount || (exceedsMax ? `يتجاوز الحد الأقصى (${formatCurrency(maxLoan)})` : undefined)}
              />
              <NumberField
                label="عدد الأقساط"
                required
                value={form.installmentCount}
                onChange={(v) => setForm({ ...form, installmentCount: v })}
                min={1}
                max={60}
                error={fieldErrors.installmentCount}
              />
              <FormFieldWrapper label="بدء الخصم" hint="الفترة التي يبدأ فيها خصم الأقساط من الراتب">
                <Input
                  type="month"
                  value={form.startDeductionPeriod || defaultPeriod}
                  onChange={(e) => setForm({ ...form, startDeductionPeriod: e.target.value })}
                />
              </FormFieldWrapper>
            </div>

            <TextAreaField
              label="سبب الطلب (اختياري)"
              rows={3}
              placeholder="اكتب سبب طلب السلفة..."
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v })}
            />
          </div>
        }
        impactPreviewSlot={
          amount > 0 && installmentCount > 0 ? (
            <Card className="border-status-info-surface bg-status-info-surface">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-4 w-4 text-status-info-foreground" />
                  <span className="text-sm font-semibold text-status-info-foreground">ملخص الأقساط (الأثر على الراتب)</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-status-info-foreground">{formatCurrency(amount)}</p>
                    <p className="text-xs text-muted-foreground">إجمالي السلفة</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-info-foreground">{installmentCount}</p>
                    <p className="text-xs text-muted-foreground">عدد الأقساط</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(installmentAmount)}</p>
                    <p className="text-xs text-muted-foreground">القسط الشهري</p>
                  </div>
                </div>
                {exceedsMax && (
                  <div className="mt-3 text-xs text-status-error-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {`يتجاوز الحد الأقصى (${formatCurrency(maxLoan)} — 3 أضعاف الراتب)`}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null
        }
        onSubmit={handleSubmit}
        saving={createMut.isPending}
        saveLabel="إرسال طلب السلفة"
        isDirty={Boolean(form.employeeId || form.amount)}
      />
    </CreatePageLayout>
  );
}
