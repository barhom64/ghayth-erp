import { useState } from "react";
import { z } from "zod";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { VISA_TYPES, IQAMA_STATUS } from "@/lib/hr-type-maps";
import {
  CreatePageLayout,
  FormShell,
  FormSection,
  FormGrid,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormDateField,
  FormSelectField,
  type FormSelectOption,
} from "@workspace/ui-core";

const mapToOptions = (map: Record<string, string>): FormSelectOption[] =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

const VISA_TYPE_OPTIONS = mapToOptions(VISA_TYPES);
const IQAMA_STATUS_OPTIONS = mapToOptions(IQAMA_STATUS);

// Mirrors the fields the server PATCH /employees/:id accepts. `status`
// (lifecycle) and `role` (RBAC) are intentionally excluded — both have
// dedicated flows on the detail page (lifecycle tab + roles management).
const employeeEditSchema = z.object({
  name: z.string().min(1, "اسم الموظف مطلوب"),
  phone: z.string(),
  email: z.string(),
  nationalId: z.string(),
  jobTitleId: z.string(),
  salary: z.string(),
  branchId: z.string(),
  departmentId: z.string(),
  managerId: z.string(),
  iqamaNumber: z.string(),
  iqamaExpiry: z.string(),
  iqamaStatus: z.string(),
  passportNumber: z.string(),
  passportExpiry: z.string(),
  borderNumber: z.string(),
  visaNumber: z.string(),
  visaType: z.string(),
  visaExpiry: z.string(),
  sponsorNumber: z.string(),
  workPermitNumber: z.string(),
  workPermitExpiry: z.string(),
});
type EmployeeEditForm = z.infer<typeof employeeEditSchema>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const day = (v: unknown): string => (v ? String(v).slice(0, 10) : "");
const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);

export default function EmployeeEdit() {
  const [, params] = useRoute("/employees/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const id = params?.id;

  const { data: employee, isLoading, isError, refetch } = useApiQuery<any>(
    ["employee", str(id)],
    `/employees/${id}`,
    !!id,
  );
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: jobTitlesData } = useApiQuery<{ data: any[] }>(["job-titles-list"], "/employees/job-titles");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list-for-manager"], "/employees?limit=200");

  const branchOptions: FormSelectOption[] = (branchesData?.data || []).map((b) => ({ value: String(b.id), label: b.name }));
  const departmentOptions: FormSelectOption[] = (departmentsData?.data || []).map((d) => ({ value: String(d.id), label: d.name }));
  const jobTitleOptions: FormSelectOption[] = (jobTitlesData?.data || []).map((jt) => ({ value: String(jt.id), label: jt.name }));
  const managerOptions: FormSelectOption[] = [
    { value: "", label: "— بدون مدير —" },
    ...(employeesData?.data || [])
      .filter((e) => String(e.id) !== str(id))
      .map((e) => ({ value: String(e.id), label: e.name })),
  ];

  const handleSave = async (values: EmployeeEditForm) => {
    setSaving(true);
    try {
      await apiPatch(`/employees/${id}`, {
        name: values.name.trim(),
        phone: nullable(values.phone),
        email: nullable(values.email),
        nationalId: nullable(values.nationalId),
        jobTitleId: values.jobTitleId ? Number(values.jobTitleId) : undefined,
        salary: values.salary ? Number(values.salary) : undefined,
        branchId: values.branchId ? Number(values.branchId) : undefined,
        departmentId: values.departmentId ? Number(values.departmentId) : undefined,
        managerId: values.managerId ? Number(values.managerId) : null,
        iqamaNumber: nullable(values.iqamaNumber),
        iqamaExpiry: nullable(values.iqamaExpiry),
        iqamaStatus: nullable(values.iqamaStatus),
        passportNumber: nullable(values.passportNumber),
        passportExpiry: nullable(values.passportExpiry),
        borderNumber: nullable(values.borderNumber),
        visaNumber: nullable(values.visaNumber),
        visaType: nullable(values.visaType),
        visaExpiry: nullable(values.visaExpiry),
        sponsorNumber: nullable(values.sponsorNumber),
        workPermitNumber: nullable(values.workPermitNumber),
        workPermitExpiry: nullable(values.workPermitExpiry),
      });
      toast({ title: "تم حفظ بيانات الموظف" });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee", str(id)] });
      setLocation(`/employees/${id}`);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر حفظ التعديلات",
        description: err?.fix ?? err?.message ?? "حدث خطأ غير متوقع",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!employee || !employee.id) {
    return <div className="text-center py-16 text-muted-foreground">الموظف غير موجود</div>;
  }

  return (
    <CreatePageLayout
      title={`تعديل بيانات الموظف — ${employee.name || ""}`}
      subtitle={employee.empNumber ? `الرقم الوظيفي: ${employee.empNumber}` : "تعديل كامل بيانات الموظف"}
      backPath={`/employees/${id}`}
    >
      <FormShell
        key={employee.id}
        schema={employeeEditSchema}
        defaultValues={{
          name: str(employee.name),
          phone: str(employee.phone),
          email: str(employee.email),
          nationalId: str(employee.nationalId),
          jobTitleId: employee.jobTitleId != null ? String(employee.jobTitleId) : "",
          salary: employee.salary != null ? String(employee.salary) : "",
          branchId: employee.branchId != null ? String(employee.branchId) : "",
          departmentId: employee.departmentId != null ? String(employee.departmentId) : "",
          managerId: employee.managerId != null ? String(employee.managerId) : "",
          iqamaNumber: str(employee.iqamaNumber),
          iqamaExpiry: day(employee.iqamaExpiry),
          iqamaStatus: str(employee.iqamaStatus),
          passportNumber: str(employee.passportNumber),
          passportExpiry: day(employee.passportExpiry),
          borderNumber: str(employee.borderNumber),
          visaNumber: str(employee.visaNumber),
          visaType: str(employee.visaType),
          visaExpiry: day(employee.visaExpiry),
          sponsorNumber: str(employee.sponsorNumber),
          workPermitNumber: str(employee.workPermitNumber),
          workPermitExpiry: day(employee.workPermitExpiry),
        }}
        submitLabel={saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation(`/employees/${id}`)}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        <FormSection title="المعلومات الأساسية">
          <FormGrid cols={2}>
            <FormTextField name="name" label="اسم الموظف" required />
            <FormPhoneField name="phone" label="رقم الجوال" />
            <FormEmailField name="email" label="البريد الإلكتروني" />
            <FormTextField name="nationalId" label="رقم الهوية / الإقامة" />
          </FormGrid>
        </FormSection>

        <FormSection title="البيانات الوظيفية">
          <FormGrid cols={2}>
            <FormSelectField name="jobTitleId" label="المسمى الوظيفي" placeholder="اختر المسمى" options={jobTitleOptions} />
            <FormNumberField name="salary" label="الراتب الأساسي" placeholder="0.00" />
            <FormSelectField name="branchId" label="الفرع" placeholder="اختر الفرع" options={branchOptions} />
            <FormSelectField name="departmentId" label="القسم" placeholder="اختر القسم" options={departmentOptions} />
            <FormSelectField name="managerId" label="المدير المباشر" options={managerOptions} />
          </FormGrid>
        </FormSection>

        <FormSection title="البيانات الحكومية والوثائق">
          <FormGrid cols={2}>
            <FormTextField name="iqamaNumber" label="رقم الإقامة" />
            <FormDateField name="iqamaExpiry" label="انتهاء الإقامة" />
            <FormSelectField name="iqamaStatus" label="حالة الإقامة" placeholder="اختر الحالة" options={IQAMA_STATUS_OPTIONS} />
            <FormTextField name="passportNumber" label="رقم الجواز" />
            <FormDateField name="passportExpiry" label="انتهاء الجواز" />
            <FormTextField name="borderNumber" label="رقم الحدود" />
            <FormTextField name="visaNumber" label="رقم التأشيرة" />
            <FormSelectField name="visaType" label="نوع التأشيرة" placeholder="اختر النوع" options={VISA_TYPE_OPTIONS} />
            <FormDateField name="visaExpiry" label="انتهاء التأشيرة" />
            <FormTextField name="sponsorNumber" label="رقم الكفيل" />
            <FormTextField name="workPermitNumber" label="رقم رخصة العمل" />
            <FormDateField name="workPermitExpiry" label="انتهاء رخصة العمل" />
          </FormGrid>
        </FormSection>
      </FormShell>
    </CreatePageLayout>
  );
}
