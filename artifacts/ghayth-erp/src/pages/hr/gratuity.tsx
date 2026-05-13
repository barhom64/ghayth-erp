import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, DollarSign, Calendar, User } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { TERMINATION_TYPES } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import {
  FormShell, FormSelectField, FormDateField, FormGrid,
} from "@/components/form-shell";

// Calculation form (no POST) — submit builds the query URL the
// gratuity endpoint reads. employeeId required; the rest have safe
// defaults. terminationType uses TERMINATION_TYPES keys verbatim
// (server already validates the enum).
const gratuitySchema = z.object({
  employeeId: z.string().min(1, "الموظف مطلوب"),
  terminationType: z.string().min(1),
  terminationDate: z.string().min(1),
});
type GratuityForm = z.infer<typeof gratuitySchema>;

export default function GratuityPage() {
  const [calcUrl, setCalcUrl] = useState<string>("");

  const { data: employees, isLoading: employeesLoading, isError: employeesError } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const employeeList = asList(employees?.data || employees);

  const { data: result, isLoading, error } = useApiQuery<any>(
    ["gratuity", calcUrl],
    calcUrl || "",
    { enabled: !!calcUrl }
  );

  if (employeesLoading) return <LoadingSpinner />;
  if (employeesError) return <ErrorState />;

  const handleCalc = (values: GratuityForm) => {
    setCalcUrl(`/hr/gratuity/${values.employeeId}?terminationType=${values.terminationType}&terminationDate=${values.terminationDate}`);
  };


  return (
    <PageShell
      title="حساب مكافأة نهاية الخدمة"
      subtitle="وفق نظام العمل السعودي — المادة 84"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "حساب مكافأة نهاية الخدمة" }]}
      loading={isLoading}
      contentClassName="space-y-4 max-w-3xl mx-auto"
    >
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">بيانات الحساب</CardTitle></CardHeader>
        <CardContent>
          <FormShell
            schema={gratuitySchema}
            defaultValues={{
              employeeId: "",
              terminationType: "end_of_service",
              terminationDate: todayLocal(),
            }}
            submitLabel="احسب المكافأة"
            onSubmit={(values) => {
              handleCalc(values);
            }}
          >
            <FormGrid cols={2}>
              <FormSelectField
                name="employeeId"
                label="الموظف"
                required
                options={[
                  { value: "", label: "اختر موظفاً" },
                  ...employeeList.map((e: any) => ({ value: String(e.id), label: e.name })),
                ]}
              />
              <FormSelectField
                name="terminationType"
                label="نوع إنهاء الخدمة"
                required
                options={Object.entries(TERMINATION_TYPES).map(([value, label]) => ({ value, label }))}
              />
              <FormDateField name="terminationDate" label="تاريخ إنهاء الخدمة" required />
            </FormGrid>
          </FormShell>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardContent className="p-4 text-status-error-foreground text-sm">خطأ في الحساب — تأكد من وجود عقد نشط للموظف</CardContent>
        </Card>
      )}

      {result && !error && (
        <div className="space-y-4">
          <Card className="border-2 border-primary/20">
            <CardHeader><CardTitle>نتيجة الحساب</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg">
                <User className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-semibold text-lg">{result.employeeName}</div>
                  <div className="text-sm text-muted-foreground">{result.jobTitle}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-surface-subtle rounded-lg">
                  <Calendar className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-sm font-medium">{result.yearsOfService} سنة</div>
                  <div className="text-xs text-muted-foreground">مدة الخدمة</div>
                </div>
                <div className="text-center p-3 bg-surface-subtle rounded-lg">
                  <DollarSign className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-sm font-medium">{formatCurrency(result.monthlySalary)}</div>
                  <div className="text-xs text-muted-foreground">الراتب الشهري</div>
                </div>
                <div className="text-center p-3 bg-surface-subtle rounded-lg">
                  <span className="text-xs text-muted-foreground">{TERMINATION_TYPES[result.terminationType] || result.terminationType}</span>
                  <div className="text-xs text-muted-foreground mt-1">نوع الإنهاء</div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-surface-subtle px-4 py-2 text-sm font-medium">تفصيل الحساب</div>
                <div className="divide-y">
                  <div className="flex justify-between px-4 py-2 text-sm">
                    <span>أول 5 سنوات (نصف شهر/سنة)</span>
                    <span className="font-medium">{formatCurrency(result.breakdown?.first5Years || 0)}</span>
                  </div>
                  {result.yearsOfService > 5 && (
                    <div className="flex justify-between px-4 py-2 text-sm">
                      <span>ما زاد عن 5 سنوات (شهر كامل/سنة)</span>
                      <span className="font-medium">{formatCurrency(result.breakdown?.above5Years || 0)}</span>
                    </div>
                  )}
                  {result.reductionFactor < 1 && (
                    <div className="flex justify-between px-4 py-2 text-sm text-orange-600">
                      <span>نسبة الاستحقاق (استقالة)</span>
                      <span className="font-medium">{Math.round(result.reductionFactor * 100)}%</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3 font-bold text-primary bg-primary/5">
                    <span>إجمالي المكافأة المستحقة</span>
                    <span className="text-lg">{formatCurrency(result.finalGratuity)}</span>
                  </div>
                </div>
              </div>

              {result.yearsOfService < 2 && result.terminationType === "resignation" && (
                <p className="text-xs text-orange-600 bg-orange-50 p-3 rounded">
                  تنبيه: الموظف الذي أتم أقل من سنتين ويستقيل لا يستحق مكافأة نهاية خدمة وفق نظام العمل السعودي.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="bg-surface-subtle border-dashed">
        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-2">ملاحظات نظام العمل السعودي:</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>أول 5 سنوات: نصف أجر شهري عن كل سنة</li>
            <li>ما زاد عن 5 سنوات: أجر شهري كامل عن كل سنة</li>
            <li>الاستقالة بعد سنتين وقبل 5 سنوات: ثلث المكافأة</li>
            <li>الاستقالة بعد 5 سنوات وقبل 10 سنوات: ثلثا المكافأة</li>
            <li>الاستقالة بعد 10 سنوات: مكافأة كاملة</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
