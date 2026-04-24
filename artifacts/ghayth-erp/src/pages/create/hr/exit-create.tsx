import { useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency , todayLocal } from "@/lib/formatters";
import { EXIT_TYPES } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { LogOut, Info, DollarSign, AlertTriangle } from "lucide-react";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "hr_exit_create";

export default function ExitCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/exit", "POST", [["hr-exit"]], {
    successMessage: "تم إنشاء طلب نهاية الخدمة بنجاح",
  });

  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    assignmentId: "",
    exitType: "resignation",
    lastWorkingDay: "",
    exitReason: "",
    otherDeductions: "0",
  });

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.activeAssignmentId || e.assignmentId) === form.assignmentId),
    [employees, form.assignmentId]
  );

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState onRetry={() => window.location.reload()} />;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const today = todayLocal();
    const firstError = validate({
      assignmentId: form.assignmentId ? null : "يرجى اختيار الموظف",
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

    try {
      await createMut.mutateAsync({
        assignmentId: Number(form.assignmentId),
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
      isDirty={Boolean(form.assignmentId)}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <CreationDateField />
        {hasDraft && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>تم استعادة مسودة سابقة — يمكنك متابعة التعبئة أو مسحها</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearDraft} className="mr-auto text-xs">
              مسح المسودة
            </Button>
          </div>
        )}

        {/* بيانات الموظف */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EmployeeSelect
            value={form.assignmentId}
            onChange={(v) => setForm({ ...form, assignmentId: v })}
            label="الموظف"
            required
            error={fieldErrors.assignmentId}
          />

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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* سياق الموظف: سلف نشطة + مخالفات + إجازات مستحقة */}
        {selectedEmployee && (
          <EmployeeContextCard employeeId={selectedEmployee.id} section="loans" />
        )}

        {/* تقدير المستحقات */}
        {selectedEmployee && salary > 0 && (
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-red-600" />
                <span className="text-sm font-semibold text-red-700">تقدير مبدئي للمستحقات</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(estimatedGratuity)}</p>
                  <p className="text-xs text-gray-500">مكافأة نهاية الخدمة</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{yearsOfService.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">سنوات الخدمة</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-700">{EXIT_TYPES[form.exitType] || form.exitType}</p>
                  <p className="text-xs text-gray-500">نوع الإنهاء</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-700">{formatCurrency(Number(form.otherDeductions || 0))}</p>
                  <p className="text-xs text-gray-500">خصومات أخرى</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                <Info className="h-3 w-3" />
                هذا تقدير مبدئي — الحساب الدقيق يشمل رصيد الإجازات وخصم السلف المتبقية
              </p>
            </CardContent>
          </Card>
        )}

        {form.exitType === "termination" && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>حالة فصل — يرجى التأكد من استكمال الإجراءات التأديبية قبل المتابعة</span>
          </div>
        )}

        {/* السبب */}
        <TextAreaField
          label="سبب نهاية الخدمة"
          rows={3}
          placeholder="سبب طلب إنهاء الخدمة..."
          value={form.exitReason}
          onChange={(v) => setForm({ ...form, exitReason: v })}
        />

        {/* أزرار الإرسال */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" disabled={createMut.isPending} className="gap-1.5 bg-red-600 hover:bg-red-700">
            <LogOut className="h-4 w-4" />
            {createMut.isPending ? "جاري الإنشاء..." : "إنشاء طلب نهاية الخدمة"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/exit")}>
            إلغاء
          </Button>
        </div>
      </form>
    </CreatePageLayout>
  );
}
