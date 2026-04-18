import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, DollarSign, Calendar, User } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { TERMINATION_TYPES } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function GratuityPage() {
  const [form, setForm] = useState({ employeeId: "", terminationType: "end_of_service", terminationDate: new Date().toISOString().split("T")[0] });
  const [calcUrl, setCalcUrl] = useState<string>("");

  const { data: employees, isLoading: employeesLoading, isError: employeesError } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const employeeList = asList(employees?.data || employees);

  const { data: result, isLoading, error } = useApiQuery<any>(
    ["gratuity", calcUrl],
    calcUrl || "",
    { enabled: !!calcUrl }
  );

  if (employeesLoading) return <LoadingSpinner />;
  if (employeesError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleCalc = () => {
    if (!form.employeeId) return;
    setCalcUrl(`/hr/gratuity/${form.employeeId}?terminationType=${form.terminationType}&terminationDate=${form.terminationDate}`);
  };

  const fmt = (n: number) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(n);

  return (
    <PageShell
      title="حساب مكافأة نهاية الخدمة"
      subtitle="وفق نظام العمل السعودي — المادة 84"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "حساب مكافأة نهاية الخدمة" }]}
      loading={isLoading}
      contentClassName="space-y-4 max-w-3xl mx-auto"
    >
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">بيانات الحساب</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>الموظف *</Label>
            <Select value={form.employeeId} onValueChange={(v) => { setForm({ ...form, employeeId: v }); setCalcUrl(""); }}>
              <SelectTrigger><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
              <SelectContent>
                {employeeList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>نوع إنهاء الخدمة</Label>
            <Select value={form.terminationType} onValueChange={(v) => setForm({ ...form, terminationType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TERMINATION_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>تاريخ إنهاء الخدمة</Label>
            <DatePicker value={form.terminationDate} onChange={(v) => setForm({ ...form, terminationDate: v })} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleCalc} className="w-full" disabled={!form.employeeId || isLoading}>
              <Calculator className="w-4 h-4 me-1" /> {isLoading ? "جاري الحساب..." : "احسب المكافأة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-red-600 text-sm">خطأ في الحساب — تأكد من وجود عقد نشط للموظف</CardContent>
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
                  <div className="text-sm text-gray-500">{result.jobTitle}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Calendar className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                  <div className="text-sm font-medium">{result.yearsOfService} سنة</div>
                  <div className="text-xs text-gray-500">مدة الخدمة</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <DollarSign className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                  <div className="text-sm font-medium">{fmt(result.monthlySalary)}</div>
                  <div className="text-xs text-gray-500">الراتب الشهري</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-400">{TERMINATION_TYPES[result.terminationType] || result.terminationType}</span>
                  <div className="text-xs text-gray-500 mt-1">نوع الإنهاء</div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-sm font-medium">تفصيل الحساب</div>
                <div className="divide-y">
                  <div className="flex justify-between px-4 py-2 text-sm">
                    <span>أول 5 سنوات (نصف شهر/سنة)</span>
                    <span className="font-medium">{fmt(result.breakdown?.first5Years || 0)}</span>
                  </div>
                  {result.yearsOfService > 5 && (
                    <div className="flex justify-between px-4 py-2 text-sm">
                      <span>ما زاد عن 5 سنوات (شهر كامل/سنة)</span>
                      <span className="font-medium">{fmt(result.breakdown?.above5Years || 0)}</span>
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
                    <span className="text-lg">{fmt(result.finalGratuity)}</span>
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

      <Card className="bg-gray-50 border-dashed">
        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-2">ملاحظات نظام العمل السعودي:</h3>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
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
