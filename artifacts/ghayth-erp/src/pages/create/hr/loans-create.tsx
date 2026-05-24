import { useMemo } from "react";
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
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { LOAN_TYPES } from "@/lib/hr-type-maps";
import { Calculator, AlertTriangle } from "lucide-react";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  loanType: z.string(),
  amount: z
    .string()
    .min(1, "يرجى إدخال مبلغ صحيح أكبر من صفر")
    .refine((v) => Number(v) > 0, "يرجى إدخال مبلغ صحيح أكبر من صفر"),
  installmentCount: z
    .string()
    .refine((v) => Number(v) > 0, "عدد الأقساط يجب أن يكون أكبر من صفر"),
  startDeductionPeriod: z.string().optional(),
  reason: z.string().optional(),
});

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k, v]) => ({
  value: k,
  label: v,
}));

function EmployeeContext({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  if (!selectedEmployee) return null;
  return (
    <EmployeeContextCard
      employeeId={selectedEmployee.id}
      section="loans"
    />
  );
}

function LoanSummary({ employees }: { employees: any[] }) {
  const { watch, setError, clearErrors } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const amount = Number(watch("amount") || 0);
  const installmentCount = Number(watch("installmentCount") || 1);

  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const maxLoan = salary * 3;
  const exceedsMax = maxLoan > 0 && amount > maxLoan;
  const installmentAmount =
    installmentCount > 0 ? Math.round((amount / installmentCount) * 100) / 100 : 0;

  useMemo(() => {
    if (exceedsMax) {
      setError("amount", {
        type: "manual",
        message: `يتجاوز الحد الأقصى (${formatCurrency(maxLoan)})`,
      });
    } else {
      clearErrors("amount");
    }
  }, [exceedsMax, maxLoan, setError, clearErrors]);

  if (amount <= 0 || installmentCount <= 0) return null;

  return (
    <>
      {exceedsMax && (
        <div className="text-xs text-status-error-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {`يتجاوز الحد الأقصى (${formatCurrency(maxLoan)} — 3 أضعاف الراتب)`}
        </div>
      )}
      <Card className="border-status-info-surface bg-status-info-surface">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-status-info-foreground" />
            <span className="text-sm font-semibold text-status-info-foreground">ملخص الأقساط</span>
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
        </CardContent>
      </Card>
    </>
  );
}

export default function LoansCreate() {
  const [, setLocation] = useLocation();

  const createMut = useApiMutation("/hr/loans", "POST", [["hr-loans"]], {
    successMessage: "تم إرسال طلب السلفة بنجاح",
  });

  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const employees = asList<any>(employeesQ.data);

  const defaultPeriod = (() => {
    const now = new Date();
    const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    return `${y}-${String(m).padStart(2, "0")}`;
  })();

  return (
    <CreatePageLayout
      title="طلب سلفة جديدة"
      backPath="/hr/loans"
      backLabel="سلف الموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          assignmentId: "",
          loanType: "salary_advance",
          amount: "",
          installmentCount: "1",
          startDeductionPeriod: defaultPeriod,
          reason: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإرسال..." : "إرسال طلب السلفة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/loans")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            assignmentId: Number(values.assignmentId),
            loanType: values.loanType,
            amount: Number(values.amount),
            installmentCount: Number(values.installmentCount),
            startDeductionPeriod: values.startDeductionPeriod || undefined,
            reason: values.reason || undefined,
          });
          setLocation("/hr/loans");
        }}
      >
        <FormGrid cols={2}>
          <FormEntitySelect name="assignmentId" select={EmployeeSelect} label="الموظف" required />
          <FormSelectField name="loanType" label="نوع السلفة" options={LOAN_TYPE_OPTIONS} />
        </FormGrid>

        <EmployeeContext employees={employees} />

        <FormGrid cols={3}>
          <FormNumberField name="amount" label="مبلغ السلفة" required placeholder="0.00" step="0.01" min="1" />
          <FormNumberField name="installmentCount" label="عدد الأقساط" required min="1" max="60" />
          <FormTextField
            name="startDeductionPeriod"
            label="بدء الخصم"
            type="month"
            description="الفترة التي يبدأ فيها خصم الأقساط من الراتب"
          />
        </FormGrid>

        <LoanSummary employees={employees} />

        <FormTextareaField
          name="reason"
          label="سبب الطلب (اختياري)"
          rows={3}
          placeholder="اكتب سبب طلب السلفة..."
        />
      </FormShell>
    </CreatePageLayout>
  );
}
