import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { useIdempotencyKey } from "@/lib/idempotency";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Info, CalendarClock } from "lucide-react";
import { formatCurrency, currentPeriodRiyadh } from "@/lib/formatters";

function currentMonth(): string {
  return currentPeriodRiyadh();
}

/**
 * Monthly HR accruals — posts leave + EOS gratuity liabilities for a period.
 *
 * Submits POST /hr/accruals/monthly. This is one of the 11 idempotency-
 * guarded financial endpoints — a double-click would otherwise risk
 * duplicate GL postings for the same period (the server also defends with
 * a `HR-ACCRUAL-<period>` ref check, but the idempotency key short-circuits
 * before hitting the conflict). `idem.reset()` runs on success so a follow-
 * up run for a different month creates a NEW record.
 */
export default function HrAccrualsMonthly() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(currentMonth());
  const [result, setResult] = useState<any | null>(null);

  const runIdem = useIdempotencyKey();
  const runMut = useApiMutation<any, { period: string }>(
    "/hr/accruals/monthly",
    "POST",
    [["payroll"], ["journal"]],
    {
      successMessage: false,
      headers: () => runIdem.headers,
      onSuccess: (data) => {
        runIdem.reset();
        setResult(data);
        toast({ title: "تم تسجيل استحقاقات الشهر بنجاح" });
      },
    },
  );

  const handleRun = () => {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast({ variant: "destructive", title: "صيغة الفترة غير صحيحة (YYYY-MM)" });
      return;
    }
    runMut.mutate({ period });
  };

  return (
    <PageShell
      title="استحقاقات الموارد البشرية الشهرية"
      subtitle="إقفالات الإجازات ومكافأة نهاية الخدمة"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { label: "الاستحقاقات الشهرية" },
      ]}
    >
      <HrTabsNav />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-gray-500" />
            تشغيل احتساب الشهر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="accrual-period">الفترة <span className="text-red-600">*</span></Label>
              <Input
                id="accrual-period"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 space-y-1">
                <p className="font-medium">يقوم هذا الإجراء بتسجيل قيدين محاسبيين لكل شهر:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>استحقاق أيام الإجازات بالأجر اليومي للموظف</li>
                  <li>استحقاق مكافأة نهاية الخدمة (1/24 من الراتب لأول 5 سنوات، ثم 1/12)</li>
                  <li>القيد فريد لكل فترة (HR-ACCRUAL-YYYY-MM) — لا يمكن تكراره</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <GuardedButton
              perm="hr:approve"
              size="lg"
              onClick={handleRun}
              disabled={runMut.isPending}
              rateLimitAware
            >
              {runMut.isPending ? "جارٍ الاحتساب..." : "تشغيل الاستحقاقات"}
            </GuardedButton>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">نتيجة آخر تشغيل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span>الفترة</span>
              <span className="font-mono">{result.period || period}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد الموظفين</span>
              <span className="font-medium">{result.employeeCount ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span>إجمالي استحقاق الإجازات</span>
              <span className="font-bold text-blue-600">
                {formatCurrency(Number(result.totalLeaveAccrual || 0))}
              </span>
            </div>
            <div className="flex justify-between">
              <span>إجمالي استحقاق نهاية الخدمة</span>
              <span className="font-bold text-purple-600">
                {formatCurrency(Number(result.totalEosAccrual || 0))}
              </span>
            </div>
            {result.journalId && (
              <div className="flex justify-between border-t pt-2">
                <span>رقم القيد</span>
                <span className="font-mono text-green-600">#{result.journalId}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
