import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DollarSign, TrendingUp, TrendingDown, FileText, Loader2, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatAmount(v: any): string {
  return Number(v ?? 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyPayslip() {
  const today = new Date();
  const [period, setPeriod] = useState(today.toISOString().slice(0, 7));

  const { data, isLoading } = useApiQuery<any>(
    ["my-payslip", period],
    `/my-space/payslip?period=${period}`
  );

  const payslip = data?.data ?? data;
  const hasData = payslip && (payslip.netSalary || payslip.baseSalary);

  return (
    <PageShell
      title="كشف راتبي"
      subtitle="عرض مفصّل لراتبك الشهري"
      actions={
        hasData && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer size={14} />
            طباعة
          </Button>
        )
      }
    >
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">الفترة:</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا يتوفر كشف راتب لهذه الفترة</p>
            <p className="text-sm mt-1">تحقق من اختيار الشهر الصحيح</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-6">
              <p className="text-sm text-gray-500 mb-1">صافي الراتب</p>
              <p className="text-3xl font-bold text-primary">{formatAmount(payslip.netSalary)} <span className="text-lg font-normal">ر.س</span></p>
              <p className="text-xs text-gray-400 mt-2">فترة: {period}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-green-600" />
                  <span className="text-sm font-medium text-gray-700">الإضافات</span>
                </div>
                {[
                  { label: "الراتب الأساسي", value: payslip.baseSalary },
                  { label: "بدل السكن", value: payslip.housingAllowance },
                  { label: "بدل النقل", value: payslip.transportAllowance },
                  { label: "بدلات أخرى", value: payslip.otherAllowances },
                  { label: "ساعات إضافية", value: payslip.overtimePay },
                ].filter((item) => Number(item.value) > 0).map((item) => (
                  <div key={item.label} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-medium text-green-700">{formatAmount(item.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 font-semibold">
                  <span className="text-gray-700">الإجمالي</span>
                  <span className="text-green-700">{formatAmount(payslip.grossSalary ?? payslip.baseSalary)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown size={16} className="text-red-600" />
                  <span className="text-sm font-medium text-gray-700">الاستقطاعات</span>
                </div>
                {[
                  { label: "التأمينات", value: payslip.gosi },
                  { label: "سلف الراتب", value: payslip.advanceDeduction },
                  { label: "غياب", value: payslip.absenceDeduction },
                  { label: "تأخير", value: payslip.lateDeduction },
                  { label: "استقطاعات أخرى", value: payslip.otherDeductions },
                ].filter((item) => Number(item.value) > 0).map((item) => (
                  <div key={item.label} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-medium text-red-600">{formatAmount(item.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 font-semibold">
                  <span className="text-gray-700">الإجمالي</span>
                  <span className="text-red-600">{formatAmount(payslip.totalDeductions)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
