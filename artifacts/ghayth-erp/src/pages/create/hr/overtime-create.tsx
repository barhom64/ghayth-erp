import { useEffect } from "react";
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
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { OVERTIME_MULTIPLIERS } from "@/lib/hr-type-maps";
import { Calculator } from "lucide-react";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  overtimeDate: z.string().min(1, "تاريخ الوقت الإضافي مطلوب"),
  startTime: z.string().min(1, "وقت البدء مطلوب"),
  endTime: z.string().min(1, "وقت الانتهاء مطلوب"),
  hours: z
    .string()
    .refine(
      (v) => Number(v) > 0,
      "عدد الساعات يجب أن يكون أكبر من صفر",
    )
    .refine(
      (v) => Number(v) <= 12,
      "لا يمكن تسجيل أكثر من 12 ساعة في اليوم",
    ),
  multiplier: z.string(),
  reason: z.string().optional(),
});

const MULTIPLIER_OPTIONS = OVERTIME_MULTIPLIERS.map((m) => ({
  value: m.value,
  label: m.label,
}));

function calcHours(start: string, end: string) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // crosses midnight
  return (diff / 60).toFixed(2);
}

function AutoComputeHours() {
  const { watch, setValue } = useFormContext();
  const startTime = watch("startTime") as string;
  const endTime = watch("endTime") as string;
  useEffect(() => {
    if (startTime && endTime) {
      setValue("hours", calcHours(startTime, endTime), { shouldValidate: false });
    }
  }, [startTime, endTime, setValue]);
  return null;
}

function EmployeeContext({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  if (!selectedEmployee) return null;
  return <EmployeeContextCard employeeId={selectedEmployee.id} section="overtime" />;
}

function CostSummary({ employees }: { employees: any[] }) {
  const { watch } = useFormContext();
  const assignmentId = watch("assignmentId") as string;
  const hours = Number(watch("hours") || 0);
  const multiplier = Number(watch("multiplier") || 1.5);
  const selectedEmployee = employees.find(
    (e: any) => String(e.activeAssignmentId || e.assignmentId) === assignmentId,
  );
  const salary = Number(selectedEmployee?.salary || selectedEmployee?.basicSalary || 0);
  const hourlyRate = salary > 0 ? Math.round((salary / 30 / 8) * 100) / 100 : 0;
  const totalAmount = Math.round(hourlyRate * multiplier * hours * 100) / 100;
  if (hours <= 0 || hourlyRate <= 0) return null;
  return (
    <Card className="border-purple-200 bg-purple-50/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-semibold text-purple-700">ملخص التكلفة</span>
        </div>
        <div className="grid grid-cols-4 gap-4 text-center">
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
  );
}

export default function OvertimeCreate() {
  const [, setLocation] = useLocation();
  const createMut = useApiMutation("/hr/overtime", "POST", [["hr-overtime"]], {
    successMessage: "تم إرسال طلب الوقت الإضافي بنجاح",
  });
  const employeesQ = useApiQuery<any>(["employees-list"], "/employees?limit=500");

  if (employeesQ.isLoading) return <LoadingSpinner />;
  if (employeesQ.isError) return <ErrorState />;

  const employees = asList<any>(employeesQ.data);

  return (
    <CreatePageLayout
      title="طلب وقت إضافي"
      backPath="/hr/overtime"
      backLabel="الوقت الإضافي"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          assignmentId: "",
          overtimeDate: "",
          startTime: "",
          endTime: "",
          hours: "",
          multiplier: "1.50",
          reason: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/overtime")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            assignmentId: Number(values.assignmentId),
            overtimeDate: values.overtimeDate,
            startTime: values.startTime,
            endTime: values.endTime,
            hours: Number(values.hours),
            multiplier: Number(values.multiplier),
            reason: values.reason || undefined,
          });
          setLocation("/hr/overtime");
        }}
      >
        <AutoComputeHours />
        <FormGrid cols={2}>
          <FormEntitySelect name="assignmentId" select={EmployeeSelect} label="الموظف" required />
          <FormDateField name="overtimeDate" label="تاريخ الوقت الإضافي" required />
        </FormGrid>

        <EmployeeContext employees={employees} />

        <FormGrid cols={4}>
          <FormTextField name="startTime" label="وقت البداية" type="time" required />
          <FormTextField name="endTime" label="وقت النهاية" type="time" required />
          <FormNumberField name="hours" label="عدد الساعات" step="0.25" min="0.25" max="12" />
          <FormSelectField name="multiplier" label="معامل الضرب" options={MULTIPLIER_OPTIONS} />
        </FormGrid>

        <CostSummary employees={employees} />

        <FormTextareaField
          name="reason"
          label="سبب الطلب (اختياري)"
          rows={3}
          placeholder="سبب العمل الإضافي..."
        />
      </FormShell>
    </CreatePageLayout>
  );
}
