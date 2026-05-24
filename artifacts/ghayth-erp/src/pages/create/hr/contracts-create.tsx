import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  employeeId: z.string().min(1, "يرجى اختيار الموظف"),
  assignmentId: z.string().optional(),
  contractType: z.enum(["full_time", "part_time", "contract", "probation"]),
  startDate: z.string().min(1, "يرجى إدخال تاريخ البداية"),
  endDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  salary: z.string().optional(),
  housingAllowance: z.string().optional(),
  transportAllowance: z.string().optional(),
  notes: z.string().optional(),
});

const TYPE_OPTIONS = [
  { value: "full_time", label: "دوام كامل" },
  { value: "part_time", label: "دوام جزئي" },
  { value: "contract", label: "عقد مؤقت" },
  { value: "probation", label: "فترة تجربة" },
];

export default function ContractsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation<unknown, Record<string, any>>(
    "/hr/contracts",
    "POST",
    [["contracts"]],
  );
  const { data: empRes, isLoading } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees?limit=500",
  );

  if (isLoading) return <LoadingSpinner />;

  const employees = empRes?.data || [];

  return (
    <CreatePageLayout title="عقد موظف جديد" backPath="/hr/contracts">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          employeeId: "",
          assignmentId: "",
          contractType: "full_time",
          startDate: "",
          endDate: "",
          probationEndDate: "",
          salary: "",
          housingAllowance: "",
          transportAllowance: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء العقد"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/contracts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const selectedEmp = employees.find((e: any) => String(e.id) === values.employeeId);
          await createMut.mutateAsync({
            employeeId: Number(values.employeeId),
            assignmentId: selectedEmp?.assignmentId || Number(values.assignmentId || values.employeeId),
            contractType: values.contractType,
            startDate: values.startDate,
            endDate: values.endDate || undefined,
            probationEndDate: values.probationEndDate || undefined,
            salary: values.salary ? Number(values.salary) : undefined,
            housingAllowance: values.housingAllowance ? Number(values.housingAllowance) : undefined,
            transportAllowance: values.transportAllowance ? Number(values.transportAllowance) : undefined,
            notes: values.notes || undefined,
          });
          toast({ title: "تم إنشاء العقد بنجاح" });
          setLocation("/hr/contracts");
        }}
      >
        <FormGrid cols={2}>
          <FormEntitySelect name="employeeId" select={EmployeeSelect} label="الموظف" required />
          <FormSelectField name="contractType" label="نوع العقد" required options={TYPE_OPTIONS} />
          <FormDateField name="startDate" label="تاريخ البداية" required />
          <FormDateField name="endDate" label="تاريخ النهاية" />
          <FormDateField name="probationEndDate" label="نهاية فترة التجربة" />
          <FormNumberField name="salary" label="الراتب الأساسي" placeholder="0.00" />
          <FormNumberField name="housingAllowance" label="بدل السكن" placeholder="0.00" />
          <FormNumberField name="transportAllowance" label="بدل النقل" placeholder="0.00" />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية..." />
      </FormShell>
    </CreatePageLayout>
  );
}
