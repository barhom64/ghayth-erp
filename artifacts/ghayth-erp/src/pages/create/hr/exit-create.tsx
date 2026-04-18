import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { formatCurrency } from "@/lib/formatters";
import { EXIT_TYPES } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { LogOut, User, Calendar, Info, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";

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

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => String(e.activeAssignmentId || e.assignmentId) === form.assignmentId),
    [employees, form.assignmentId]
  );

  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const hireDate = selectedEmployee?.hireDate || selectedEmployee?.joinDate;
  const yearsOfService = hireDate
    ? (new Date().getTime() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    : 0;

  // تقدير مبدئي لمكافأة نهاية الخدمة (الحساب الدقيق يتم في الخادم)
  const estimatedGratuity = useMemo(() => {
    if (!salary || !yearsOfService) return 0;
    let g = 0;
    if (yearsOfService <= 5) {
      g = (salary / 2) * yearsOfService;
    } else {
      g = (salary / 2) * 5 + salary * (yearsOfService - 5);
    }
    if (form.exitType === "resignation") {
      if (yearsOfService < 2) g = 0;
      else if (yearsOfService < 5) g = g / 3;
      else if (yearsOfService < 10) g = (g * 2) / 3;
    }
    return Math.round(g * 100) / 100;
  }, [salary, yearsOfService, form.exitType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assignmentId) {
      toast({ title: "يرجى اختيار الموظف", variant: "destructive" });
      return;
    }
    if (!form.exitType) {
      toast({ title: "نوع نهاية الخدمة مطلوب", variant: "destructive" });
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
    } catch {}
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
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-gray-500" />
              الموظف <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.assignmentId}
              onValueChange={(v) => setForm({ ...form, assignmentId: v })}
            >
              <SelectTrigger>
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
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <LogOut className="h-4 w-4 text-gray-500" />
              نوع نهاية الخدمة <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.exitType}
              onValueChange={(v) => setForm({ ...form, exitType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXIT_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-gray-500" />
              آخر يوم عمل
            </Label>
            <DatePicker
              value={form.lastWorkingDay}
              onChange={(v) => setForm({ ...form, lastWorkingDay: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>خصومات أخرى</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.otherDeductions}
              onChange={(e) => setForm({ ...form, otherDeductions: e.target.value })}
            />
          </div>
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
        <div className="space-y-2">
          <Label>سبب نهاية الخدمة</Label>
          <Textarea
            rows={3}
            placeholder="سبب طلب إنهاء الخدمة..."
            value={form.exitReason}
            onChange={(e) => setForm({ ...form, exitReason: e.target.value })}
          />
        </div>

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
