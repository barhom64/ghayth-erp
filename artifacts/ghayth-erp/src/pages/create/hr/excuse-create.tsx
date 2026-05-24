import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { LogOut } from "lucide-react";

const schema = z
  .object({
    excuseDate: z.string().min(1, "تاريخ الاستئذان مطلوب"),
    excuseType: z.enum(["early_leave", "late_arrival", "personal"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    estimatedMinutes: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine(
    (v) => !v.startTime || !v.endTime || v.endTime > v.startTime,
    { message: "وقت الانتهاء يجب أن يكون بعد وقت البدء", path: ["endTime"] },
  );

const EXCUSE_TYPE_OPTIONS = [
  { value: "early_leave", label: "خروج مبكر" },
  { value: "late_arrival", label: "تأخر عن الحضور" },
  { value: "personal", label: "استئذان شخصي" },
];

export default function ExcuseCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const createMut = useApiMutation("/hr/excuse-requests", "POST", [["excuse-requests"]], {
    successMessage: "تم تقديم طلب الاستئذان بنجاح",
  });

  return (
    <CreatePageLayout title="طلب استئذان" backPath="/hr/excuse-requests">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
      </div>

      <h3 className="text-sm font-semibold text-status-neutral-foreground mb-3 flex items-center gap-2">
        <LogOut className="w-4 h-4" /> تفاصيل الاستئذان
      </h3>
      <FormShell
        schema={schema}
        defaultValues={{
          excuseDate: "",
          excuseType: "early_leave",
          startTime: "",
          endTime: "",
          estimatedMinutes: "",
          reason: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإرسال..." : "تقديم الطلب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/excuse-requests")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                excuseDate: values.excuseDate,
                excuseType: values.excuseType,
                startTime: values.startTime || undefined,
                endTime: values.endTime || undefined,
                estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
                reason: values.reason || undefined,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/excuse-requests");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="excuseDate" label="تاريخ الاستئذان" required />
          <FormSelectField name="excuseType" label="نوع الاستئذان" options={EXCUSE_TYPE_OPTIONS} />
          <FormTextField name="startTime" label="وقت البدء" type="time" />
          <FormTextField name="endTime" label="وقت الانتهاء" type="time" />
          <FormNumberField name="estimatedMinutes" label="المدة التقديرية (دقائق)" placeholder="60" min="0" />
        </FormGrid>
        <FormTextareaField name="reason" label="السبب" placeholder="سبب طلب الاستئذان..." />
      </FormShell>
    </CreatePageLayout>
  );
}
