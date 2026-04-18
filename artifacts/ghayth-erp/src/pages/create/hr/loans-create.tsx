import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { formatCurrency } from "@/lib/formatters";
import { LOAN_TYPES } from "@/lib/hr-type-maps";
import { Banknote, Info, User, Calculator, Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";

const DRAFT_KEY = "hr_loans_create";

export default function LoansCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const createMut = useApiMutation("/hr/loans", "POST", [["hr-loans"]], {
    successMessage: "تم إرسال طلب السلفة بنجاح",
  });

  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList<any>(employeesQ.data);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    assignmentId: "",
    loanType: "salary_advance",
    amount: "",
    installmentCount: "1",
    startDeductionPeriod: "",
    reason: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.activeAssignmentId || e.assignmentId) === form.assignmentId),
    [employees, form.assignmentId]
  );

  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const maxLoan = salary * 3;
  const amount = Number(form.amount || 0);
  const installmentCount = Number(form.installmentCount || 1);
  const installmentAmount = installmentCount > 0 ? Math.round((amount / installmentCount) * 100) / 100 : 0;
  const exceedsMax = maxLoan > 0 && amount > maxLoan;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.assignmentId) localErrors.assignmentId = "يرجى اختيار الموظف";
    if (!form.amount || amount <= 0) localErrors.amount = "يرجى إدخال مبلغ صحيح أكبر من صفر";
    if (form.installmentCount && installmentCount <= 0) localErrors.installmentCount = "عدد الأقساط يجب أن يكون أكبر من صفر";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    if (exceedsMax) {
      toast({ title: `الحد الأقصى ${formatCurrency(maxLoan)} (3 أضعاف الراتب)`, variant: "destructive" });
      return;
    }

    try {
      await createMut.mutateAsync({
        assignmentId: Number(form.assignmentId),
        loanType: form.loanType,
        amount,
        installmentCount,
        startDeductionPeriod: form.startDeductionPeriod || undefined,
        reason: form.reason || undefined,
      });
      clearDraft();
      setLocation("/hr/loans");
    } catch {}
  };

  // حساب فترة بدء الخصم الافتراضية
  const defaultPeriod = useMemo(() => {
    const now = new Date();
    const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, []);

  return (
    <CreatePageLayout
      title="طلب سلفة جديدة"
      backPath="/hr/loans"
      backLabel="سلف الموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      isDirty={Boolean(form.assignmentId || form.amount)}
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-gray-500" />
              الموظف <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.assignmentId}
              onValueChange={(v) => setForm({ ...form, assignmentId: v })}
            >
              <SelectTrigger className={errCls("assignmentId")}>
                <SelectValue placeholder="اختر الموظف..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp: any) => (
                  <SelectItem
                    key={emp.activeAssignmentId || emp.assignmentId || emp.id}
                    value={String(emp.activeAssignmentId || emp.assignmentId || emp.id)}
                  >
                    {emp.name} {emp.empNumber ? `(#${emp.empNumber})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHint field="assignmentId" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-gray-500" />
              نوع السلفة
            </Label>
            <Select
              value={form.loanType}
              onValueChange={(v) => setForm({ ...form, loanType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOAN_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* سياق الموظف: سلف سابقة + خصم شهري + قدرة استيعاب */}
        {selectedEmployee && (
          <EmployeeContextCard
            employeeId={selectedEmployee.id}
            section="loans"
          />
        )}

        {/* مبلغ السلفة والأقساط */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-gray-500" />
              مبلغ السلفة <span className="text-red-500">*</span>
            </Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={cn(exceedsMax && "border-red-300 focus:ring-red-300", errCls("amount"))}
            />
            <FieldHint field="amount" />
            {exceedsMax && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                يتجاوز الحد الأقصى ({formatCurrency(maxLoan)})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>عدد الأقساط <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              min="1"
              max="60"
              value={form.installmentCount}
              onChange={(e) => setForm({ ...form, installmentCount: e.target.value })}
              className={errCls("installmentCount")}
            />
            <FieldHint field="installmentCount" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-gray-500" />
              بدء الخصم
            </Label>
            <Input
              type="month"
              value={form.startDeductionPeriod || defaultPeriod}
              onChange={(e) => setForm({ ...form, startDeductionPeriod: e.target.value })}
            />
            <p className="text-xs text-gray-400">الفترة التي يبدأ فيها خصم الأقساط من الراتب</p>
          </div>
        </div>

        {/* ملخص الأقساط */}
        {amount > 0 && installmentCount > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700">ملخص الأقساط</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(amount)}</p>
                  <p className="text-xs text-gray-500">إجمالي السلفة</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{installmentCount}</p>
                  <p className="text-xs text-gray-500">عدد الأقساط</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(installmentAmount)}</p>
                  <p className="text-xs text-gray-500">القسط الشهري</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* السبب */}
        <div className="space-y-2">
          <Label>سبب الطلب (اختياري)</Label>
          <Textarea
            rows={3}
            placeholder="اكتب سبب طلب السلفة..."
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>

        {/* أزرار الإرسال */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button type="submit" disabled={createMut.isPending} className="gap-1.5">
            <Banknote className="h-4 w-4" />
            {createMut.isPending ? "جاري الإرسال..." : "إرسال طلب السلفة"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/loans")}>
            إلغاء
          </Button>
        </div>
      </form>
    </CreatePageLayout>
  );
}
