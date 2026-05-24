import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
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
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DollarSign, Users, Building2, CheckCircle2, Info } from "lucide-react";

const schema = z.object({
  month: z.string().min(1, "الشهر مطلوب"),
  reference: z.string().optional(),
  notes: z.string().optional(),
  scope: z.string(),
});

function MonthLabelCard() {
  const { watch } = useFormContext();
  const month = watch("month") as string;
  const label = month ? formatDateAr(month + "-01") : "-";
  return (
    <Card className="border-orange-100 bg-orange-50/30">
      <CardContent className="p-3 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-orange-600" />
        <div>
          <p className="text-xl font-bold">{label}</p>
          <p className="text-xs text-muted-foreground">الشهر المحدد</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferencePlaceholder() {
  const { watch, register } = useFormContext();
  const month = watch("month") as string;
  // We use register to bind the input but provide a dynamic placeholder
  // that reflects the currently-selected month.
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">مرجع الدفعة</label>
      <input
        {...register("reference")}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        placeholder={`PAY-${month?.replace("-", "")}`}
      />
      <p className="text-xs text-muted-foreground">رقم مرجعي للتتبع (اختياري)</p>
    </div>
  );
}

export default function PayrollCreate() {
  const [, setLocation] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const createMut = useApiMutation("/hr/payroll", "POST", [["payroll"]], {
    successMessage: "تم تشغيل مسير الرواتب بنجاح",
  });
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: empData, isLoading: loadingEmp, isError: errorEmp } = useApiQuery<any>(
    ["employees-list"],
    `/employees${scopeSuffix}`,
  );
  const { data: branchData, isLoading: loadingBranch, isError: errorBranch } = useApiQuery<any>(
    ["branches"],
    "/settings/branches",
  );

  if (loadingEmp || loadingBranch) return <LoadingSpinner />;
  if (errorEmp || errorBranch) return <ErrorState />;

  const employees = empData?.data || [];
  const activeEmployees = employees.filter((e: any) => e.status === "active" || !e.status);
  const totalSalaries = activeEmployees.reduce((sum: number, e: any) => sum + Number(e.salary || 0), 0);
  const branches = branchData?.data || [];

  const scopeOptions = [
    { value: "all", label: "جميع الموظفين" },
    ...branches.map((b: any) => ({ value: `branch:${b.id}`, label: b.name })),
  ];

  return (
    <CreatePageLayout title="تشغيل مسير الرواتب" backPath="/hr/payroll">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          month: defaultMonth,
          reference: "",
          notes: "",
          scope: "all",
        }}
        submitLabel={createMut.isPending ? "جاري التشغيل..." : "تشغيل مسير الرواتب"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/hr/payroll")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await new Promise<void>((resolve, reject) =>
            createMut.mutate(
              {
                month: values.month,
                reference: values.reference || undefined,
                notes: values.notes || undefined,
                scope: values.scope,
              },
              {
                onSuccess: () => {
                  setLocation("/hr/payroll");
                  resolve();
                },
                onError: (err) => reject(err),
              },
            ),
          );
        }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-status-info-surface bg-status-info-surface">
            <CardContent className="p-3 flex items-center gap-3">
              <Users className="w-8 h-8 text-status-info-foreground" />
              <div>
                <p className="text-xl font-bold">{activeEmployees.length}</p>
                <p className="text-xs text-muted-foreground">موظفين نشطين</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-status-success-surface bg-status-success-surface">
            <CardContent className="p-3 flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-status-success-foreground" />
              <div>
                <p className="text-xl font-bold">{formatCurrency(totalSalaries)}</p>
                <p className="text-xs text-muted-foreground">إجمالي الرواتب (تقديري)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-100 bg-purple-50/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Building2 className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-xl font-bold">{branches.length || 1}</p>
                <p className="text-xs text-muted-foreground">فروع</p>
              </div>
            </CardContent>
          </Card>
          <MonthLabelCard />
        </div>

        <h3 className="text-sm font-semibold text-status-neutral-foreground flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> بيانات المسير
        </h3>
        <FormGrid cols={3}>
          <FormTextField name="month" label="الشهر" type="month" required />
          <ReferencePlaceholder />
          <FormSelectField
            name="scope"
            label="النطاق"
            options={scopeOptions}
            description="حدد الفرع أو اختر الجميع"
          />
        </FormGrid>

        <FormTextareaField
          name="notes"
          label="ملاحظات"
          placeholder="ملاحظات إضافية حول هذا المسير..."
          rows={3}
        />

        <div className="bg-status-warning-surface border border-status-warning-surface rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-status-warning-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-status-warning-foreground space-y-1">
              <p className="font-medium">ملاحظات مهمة قبل التشغيل:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>سيتم احتساب الرواتب لجميع الموظفين النشطين تلقائياً</li>
                <li>يشمل الحساب: الراتب الأساسي + البدلات - الخصومات - اشتراكات التأمينات</li>
                <li>سيتم خصم أيام الغياب والمخالفات المسجلة خلال الشهر</li>
                <li>تأكد من اكتمال سجلات الحضور والإجازات قبل تشغيل المسير</li>
              </ul>
            </div>
          </div>
        </div>
      </FormShell>
    </CreatePageLayout>
  );
}
