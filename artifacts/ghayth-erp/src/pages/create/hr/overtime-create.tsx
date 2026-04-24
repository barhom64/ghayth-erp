import { useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency } from "@/lib/formatters";
import { OVERTIME_MULTIPLIERS } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { Clock, User, Calculator, Info } from "lucide-react";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "hr_overtime_create";

export default function OvertimeCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/overtime", "POST", [["hr-overtime"]], {
    successMessage: "تم إرسال طلب الوقت الإضافي بنجاح",
  });

  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    assignmentId: "",
    overtimeDate: "",
    startTime: "",
    endTime: "",
    hours: "",
    multiplier: "1.50",
    reason: "",
  });

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.activeAssignmentId || e.assignmentId) === form.assignmentId),
    [employees, form.assignmentId]
  );

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState onRetry={() => window.location.reload()} />;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const firstError = validate({
      assignmentId: form.assignmentId ? null : "يرجى اختيار الموظف",
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

    try {
      await createMut.mutateAsync({
        assignmentId: Number(form.assignmentId),
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
      isDirty={Boolean(form.assignmentId || form.overtimeDate)}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <CreationDateField />
        {hasDraft && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>تم استعادة مسودة سابقة</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearDraft} className="mr-auto text-xs">
              مسح المسودة
            </Button>
          </div>
        )}

        {/* الموظف والتاريخ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmployeeSelect
            value={form.assignmentId}
            onChange={(v) => setForm({ ...form, assignmentId: v })}
            label="الموظف"
            required
            error={fieldErrors.assignmentId}
          />

          <FormFieldWrapper label="تاريخ الوقت الإضافي" required error={fieldErrors.overtimeDate}>
            <DatePicker
              value={form.overtimeDate}
              onChange={(v) => setForm({ ...form, overtimeDate: v })}
              maxDate={new Date()}
            />
          </FormFieldWrapper>
        </div>

        {/* سياق الموظف: ساعات إضافية هذا الشهر + تنبيهات */}
        {selectedEmployee && (
          <EmployeeContextCard
            employeeId={selectedEmployee.id}
            section="overtime"
          />
        )}

        {/* الأوقات والساعات */}
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

        {/* ملخص التكلفة */}
        {hours > 0 && hourlyRate > 0 && (
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700">ملخص التكلفة</span>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-purple-700">{formatCurrency(hourlyRate)}</p>
                  <p className="text-xs text-gray-500">سعر الساعة</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-700">×{multiplier.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">المعامل</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-purple-700">{hours}</p>
                  <p className="text-xs text-gray-500">ساعات</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(totalAmount)}</p>
                  <p className="text-xs text-gray-500">الإجمالي</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* السبب */}
        <TextAreaField
          label="سبب الطلب (اختياري)"
          rows={3}
          placeholder="سبب العمل الإضافي..."
          value={form.reason}
          onChange={(v) => setForm({ ...form, reason: v })}
        />

        {/* أزرار الإرسال */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" disabled={createMut.isPending} className="gap-1.5">
            <Clock className="h-4 w-4" />
            {createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/overtime")}>
            إلغاء
          </Button>
        </div>
      </form>
    </CreatePageLayout>
  );
}
