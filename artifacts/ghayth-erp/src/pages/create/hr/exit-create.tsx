import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { EXIT_TYPES } from "@/lib/hr-type-maps";
import { Info, DollarSign, AlertTriangle } from "lucide-react";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  exitType: z.string().min(1, "نوع نهاية الخدمة مطلوب"),
  lastWorkingDay: z
    .string()
    .min(1, "آخر يوم عمل مطلوب")
    .refine(
      (v) => v >= todayLocal(),
      "آخر يوم عمل يجب أن يكون اليوم أو في المستقبل",
    ),
  exitReason: z.string().optional(),
  otherDeductions: z.string(),
});

const EXIT_TYPE_OPTIONS = Object.entries(EXIT_TYPES).map(([k, v]) => ({
  value: k,
  label: v,
}));

function computeEstimatedGratuity(salary: number, yearsOfService: number, exitType: string): number {
  if (!salary || !yearsOfService) return 0;
  const first5 = Math.min(yearsOfService, 5);
  const above5 = Math.max(yearsOfService - 5, 0);
  let g = (salary / 2) * first5 + salary * above5;
  if (exitType === "resignation") {
    if (yearsOfService < 2) g = 0;
    else if (yearsOfService < 5) g = ((salary / 2) * first5) / 3;
    else if (yearsOfService < 10) {
      g = ((salary / 2) * first5 * 2) / 3 + (salary * above5 * 2) / 3;
    }
  }
  return Math.round(g * 100) / 100;
}

function EmployeeContext({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  if (!selectedEmployee) return null;
  return <EmployeeContextCard employeeId={selectedEmployee.id} section="loans" />;
}

function GratuityEstimate({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const exitType = watch("exitType") as string;
  const otherDeductions = watch("otherDeductions") as string;
  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  if (!selectedEmployee) return null;
  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  if (salary <= 0) return null;
  const hireDate = selectedEmployee?.hireDate || selectedEmployee?.joinDate;
  const yearsOfService = hireDate
    ? (new Date().getTime() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    : 0;
  const estimatedGratuity = computeEstimatedGratuity(salary, yearsOfService, exitType);
  return (
    <Card className="border-status-error-surface bg-status-error-surface">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 text-status-error-foreground" />
          <span className="text-sm font-semibold text-status-error-foreground">تقدير مبدئي للمستحقات</span>
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
            <p className="text-lg font-bold text-status-warning-foreground">{EXIT_TYPES[exitType] || exitType}</p>
            <p className="text-xs text-muted-foreground">نوع الإنهاء</p>
          </div>
          <div>
            <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(Number(otherDeductions || 0))}</p>
            <p className="text-xs text-muted-foreground">خصومات أخرى</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <Info className="h-3 w-3" />
          هذا تقدير مبدئي — الحساب الدقيق يشمل رصيد الإجازات وخصم السلف المتبقية
        </p>
      </CardContent>
    </Card>
  );
}

function TerminationWarning() {
  const { watch } = useFormContext();
  const exitType = watch("exitType") as string;
  if (exitType !== "termination") return null;
  return (
    <div className="flex items-center gap-2 p-3 bg-status-error-surface border border-status-error-surface rounded-lg text-sm text-status-error-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>حالة فصل — يرجى التأكد من استكمال الإجراءات التأديبية قبل المتابعة</span>
    </div>
  );
}

export default function ExitCreate() {
  const [, setLocation] = useLocation();

  const createMut = useApiMutation("/hr/exit", "POST", [["hr-exit"]], {
    successMessage: "تم إنشاء طلب نهاية الخدمة بنجاح",
  });

  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const employees = asList<any>(employeesQ.data);

  return (
    <CreatePageLayout
      title="طلب نهاية خدمة"
      backPath="/hr/exit"
      backLabel="نهاية الخدمة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          assignmentId: "",
          exitType: "resignation",
          lastWorkingDay: "",
          exitReason: "",
          otherDeductions: "0",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء طلب نهاية الخدمة"}
        submitVariant="destructive"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/exit")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            assignmentId: Number(values.assignmentId),
            exitType: values.exitType,
            lastWorkingDay: values.lastWorkingDay || undefined,
            exitReason: values.exitReason || undefined,
            otherDeductions: Number(values.otherDeductions || 0),
          });
          setLocation("/hr/exit");
        }}
      >
        <FormGrid cols={2}>
          <FormEntitySelect name="assignmentId" select={EmployeeSelect} label="الموظف" required />
          <FormSelectField name="exitType" label="نوع نهاية الخدمة" required options={EXIT_TYPE_OPTIONS} />
        </FormGrid>
        <FormGrid cols={2}>
          <FormDateField name="lastWorkingDay" label="آخر يوم عمل" required />
          <FormNumberField name="otherDeductions" label="خصومات أخرى" step="0.01" min="0" />
        </FormGrid>

        <EmployeeContext employees={employees} />
        <GratuityEstimate employees={employees} />
        <TerminationWarning />

        <FormTextareaField
          name="exitReason"
          label="سبب نهاية الخدمة"
          rows={3}
          placeholder="سبب طلب إنهاء الخدمة..."
        />
      </FormShell>
    </CreatePageLayout>
  );
}
