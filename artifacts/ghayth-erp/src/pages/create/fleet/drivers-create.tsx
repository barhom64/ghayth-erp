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
      (v) => !v || new Date(v) >= new Date(new Date().toDateString()),
      "تاريخ انتهاء الرخصة يجب أن يكون في المستقبل",
    ),
  licenseType: z.string().optional(),
  employeeId: z.string().optional(),
  status: z.enum(["available", "on_trip", "off_duty", "suspended"]),
});

const LICENSE_TYPE_OPTIONS = [
  { value: "private", label: "خاصة" },
  { value: "public", label: "عامة" },
  { value: "heavy", label: "ثقيلة" },
];

const STATUS_OPTIONS = [
  { value: "available", label: "متاح" },
  { value: "on_trip", label: "في رحلة" },
  { value: "off_duty", label: "خارج الخدمة" },
  { value: "suspended", label: "موقوف" },
];

function EmployeeBlock({ employees }: { employees: any[] }) {
  const { watch, setValue } = useFormContext();
  const employeeId = watch("employeeId") as string;
  return (
    <div>
      <EmployeeSelect
        value={employeeId}
        onChange={(v) => {
          setValue("employeeId", v);
          const emp = employees.find((e: any) => String(e.id) === v);
          if (emp) {
            if (emp.name) setValue("name", emp.name);
            if (emp.phone) setValue("phone", emp.phone);
          }
        }}
        label="ربط بموظف"
        allowCreate={false}
      />
      {employeeId && (
        <div className="mt-3">
          <EmployeeContextCard employeeId={employeeId} />
        </div>
      )}
    </div>
  );
}

export default function DriversCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/fleet/drivers", "POST", [["drivers"]]);
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const employees = employeesData?.data || [];

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
        <FormGrid cols={3}>
          <EmployeeBlock employees={employees} />
          <FormTextField name="name" label="الاسم" required />
          <FormPhoneField name="phone" label="الهاتف" required />
          <FormTextField name="licenseNumber" label="رقم الرخصة" required />
          <FormSelectField name="licenseType" label="نوع الرخصة" options={LICENSE_TYPE_OPTIONS} placeholder="اختر النوع" />
          <FormDateField name="licenseExpiry" label="انتهاء الرخصة" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
