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
import { formatCurrency } from "@/lib/formatters";
import { OVERTIME_MULTIPLIERS } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { Calculator, Info } from "lucide-react";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { HrCreateScaffold } from "@/components/shared/hr-create-scaffold";

const DRAFT_KEY = "hr_overtime_create";

export default function OvertimeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/overtime", "POST", [["hr-overtime"]], {
    successMessage: "تم إرسال طلب الوقت الإضافي بنجاح",
  });

  // Wave-1/B refactor: form.employeeId now holds the EMPLOYEE id; the
  // assignmentId is derived from the selected employee's
  // activeAssignmentId at submit time (mirrors the loans-create pattern).
  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    employeeId: "",
    overtimeDate: "",
    startTime: "",
    endTime: "",
    hours: "",
    multiplier: "1.50",
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

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const hourlyRate = salary > 0 ? Math.round((salary / 30 / 8) * 100) / 100 : 0;
  const hours = Number(form.hours || 0);
  const multiplier = Number(form.multiplier || 1.5);
  const totalAmount = Math.round(hourlyRate * multiplier * hours * 100) / 100;

  // حساب الساعات تلقائياً من وقت البداية والنهاية
  const calcHours = (start: string, end: string) => {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // يمتد لليوم التالي
    return (diff / 60).toFixed(2);
  };

  const handleTimeChange = (field: "startTime" | "endTime", value: string) => {
    const updated = { ...form, [field]: value };
    const start = field === "startTime" ? value : form.startTime;
    const end = field === "endTime" ? value : form.endTime;
    if (start && end) {
      updated.hours = calcHours(start, end);
    }
    setForm(updated);
  };

  const handleSubmit = async () => {
    const firstError = validate({
      employeeId: form.employeeId ? null : "يرجى اختيار الموظف",
      overtimeDate: form.overtimeDate ? null : "تاريخ الوقت الإضافي مطلوب",
      startTime: form.startTime ? null : "وقت البدء مطلوب",
      endTime: form.endTime ? null : "وقت الانتهاء مطلوب",
      hours: hours <= 0
        ? "عدد الساعات يجب أن يكون أكبر من صفر"
        : hours > 12
          ? "لا يمكن تسجيل أكثر من 12 ساعة في اليوم"
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
        overtimeDate: form.overtimeDate,
        startTime: form.startTime,
        endTime: form.endTime,
        hours,
        multiplier,
        reason: form.reason || undefined,
      });
      clearDraft();
      setLocation("/hr/overtime");
    } catch (err: any) {
      setApiError(err);
    }
  };

  return (
    <CreatePageLayout
      title="طلب وقت إضافي"
      backPath="/hr/overtime"
      backLabel="الوقت الإضافي"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      isDirty={Boolean(form.employeeId || form.overtimeDate)}
    >
      {hasDraft && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-status-info-surface border border-status-info-surface rounded-lg text-sm text-status-info-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>تم استعادة مسودة سابقة</span>
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
        contextSection="overtime"
        selectedEmployee={selectedEmployee}
        detailsSlot={
          <div className="space-y-4">
            <FormFieldWrapper label="تاريخ الوقت الإضافي" required error={fieldErrors.overtimeDate}>
              <DatePicker
                value={form.overtimeDate}
                onChange={(v) => setForm({ ...form, overtimeDate: v })}
                maxDate={new Date()}
              />
            </FormFieldWrapper>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormFieldWrapper label="وقت البداية" required>
                <Input type="time" value={form.startTime} onChange={(e) => handleTimeChange("startTime", e.target.value)} />
              </FormFieldWrapper>
              <FormFieldWrapper label="وقت النهاية" required>
                <Input type="time" value={form.endTime} onChange={(e) => handleTimeChange("endTime", e.target.value)} />
              </FormFieldWrapper>
              <NumberField
                label="عدد الساعات"
                value={form.hours}
                onChange={(v) => setForm({ ...form, hours: v })}
                step={0.25}
                min={0.25}
                max={12}
                error={fieldErrors.hours}
              />
              <FormFieldWrapper label="معامل الضرب">
                <Select value={form.multiplier} onValueChange={(v) => setForm({ ...form, multiplier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OVERTIME_MULTIPLIERS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
            </div>

            <TextAreaField
              label="سبب الطلب (اختياري)"
              rows={3}
              placeholder="سبب العمل الإضافي..."
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v })}
            />
          </div>
        }
        impactPreviewSlot={
          hours > 0 && hourlyRate > 0 ? (
            <Card className="border-purple-200 bg-purple-50/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-700">ملخص التكلفة (الأثر المالي)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-purple-700">{formatCurrency(hourlyRate)}</p>
                    <p className="text-xs text-muted-foreground">سعر الساعة</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-purple-700">×{multiplier.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">المعامل</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-purple-700">{hours}</p>
                    <p className="text-xs text-muted-foreground">ساعات</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">الإجمالي</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null
        }
        onSubmit={handleSubmit}
        saving={createMut.isPending}
        saveLabel="إرسال الطلب"
        isDirty={Boolean(form.employeeId || form.overtimeDate)}
      />
    </CreatePageLayout>
  );
}
