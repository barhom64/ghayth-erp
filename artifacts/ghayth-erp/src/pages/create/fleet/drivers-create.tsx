import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormPhoneField,
  FormSelectField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  name: z.string().min(1, "اسم السائق مطلوب"),
  phone: z.string().min(1, "رقم الهاتف مطلوب"),
  licenseNumber: z.string().min(1, "رقم الرخصة مطلوب"),
  licenseExpiry: z
    .string()
    .optional()
    .refine(
      (v) => !v || new Date(v) >= new Date(),
      "تاريخ انتهاء الرخصة يجب أن يكون في المستقبل",
    ),
  licenseType: z.string().optional(),
  employeeId: z.string().optional(),
  status: z.enum(["available", "on_trip", "off_duty", "suspended"]),
});

const LICENSE_TYPE = [
  { value: "private", label: "خاصة" },
  { value: "public", label: "عامة" },
  { value: "heavy", label: "ثقيلة" },
];

const STATUS = [
  { value: "available", label: "متاح" },
  { value: "on_trip", label: "في رحلة" },
  { value: "off_duty", label: "خارج الخدمة" },
  { value: "suspended", label: "موقوف" },
];

// Auto-populates name + phone from selected employee.
function EmployeeAutoFill({ employees }: { employees: any[] }) {
  const { watch, setValue } = useFormContext();
  const empId = watch("employeeId") as string;
  if (!empId) return null;
  const emp = employees.find((e: any) => String(e.id) === empId);
  if (emp) {
    if (emp.name) setValue("name", emp.name);
    if (emp.phone) setValue("phone", emp.phone);
  }
  return (
    <div className="mt-3">
      <EmployeeContextCard employeeId={empId} />
    </div>
  );
}

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/drivers", "POST", [["drivers"]]);
  const { data: employeesData } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const employees = employeesData?.data || [];
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  return (
    <CreatePageLayout title="إضافة سائق جديد" backPath="/fleet/drivers">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          phone: "",
          licenseNumber: "",
          licenseExpiry: "",
          licenseType: "",
          employeeId: "",
          status: "available",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/fleet/drivers")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            ...values,
            employeeId: values.employeeId ? Number(values.employeeId) : undefined,
          });
          toast({ title: "تم إضافة السائق بنجاح" });
          setLocation("/fleet/drivers");
        }}
      >
        <FormEntitySelect name="employeeId" select={EmployeeSelect} label="ربط بموظف" />
        <EmployeeAutoFill employees={employees} />
        <FormGrid cols={3}>
          <FormTextField name="name" label="الاسم" required />
          <FormPhoneField name="phone" label="الهاتف" required />
          <FormTextField name="licenseNumber" label="رقم الرخصة" required />
          <FormSelectField name="licenseType" label="نوع الرخصة" placeholder="اختر النوع" options={LICENSE_TYPE} />
          <FormDateField name="licenseExpiry" label="انتهاء الرخصة" />
          <FormSelectField name="status" label="الحالة" options={STATUS} />
        </FormGrid>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
