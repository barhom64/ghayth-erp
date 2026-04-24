import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, CheckCircle,
} from "lucide-react";

export default function AdminSystemGovernor() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["system-guards"], "/admin/governance/system-guards"
  );

  const allowed = data?.allowed ?? true;
  const violations = data?.violations ?? [];

  return (
    <PageShell
      title="حاكم النظام"
      subtitle="الحراسات المركزية التي تتحكم في تشغيل العمليات"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />فحص
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <Card className={allowed ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}>
            <CardContent className="p-6 flex items-center gap-4">
              {allowed ? (
                <ShieldCheck className="w-12 h-12 text-green-600" />
              ) : (
                <ShieldAlert className="w-12 h-12 text-red-600" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {allowed ? "جميع الحراسات ناجحة — النظام يعمل بشكل طبيعي" : `${violations.length} حراسة فاشلة — بعض العمليات محظورة`}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  حاكم النظام يفحص: حالة الشركة، الفترة المالية، حدود التجربة، فشل القيود، المخالفات المفتوحة
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: "company_active", label: "حالة الشركة", desc: "هل الشركة نشطة أم موقوفة" },
              { name: "financial_period", label: "الفترة المالية", desc: "هل الفترة المالية مفتوحة لتاريخ اليوم" },
              { name: "trial_limits", label: "حدود التجربة", desc: "هل تم تجاوز حدود الباقة التجريبية" },
              { name: "posting_failures_threshold", label: "عتبة فشل القيود", desc: "هل يوجد أكثر من 10 قيود فاشلة" },
              { name: "audit_violations", label: "المخالفات المفتوحة", desc: "هل يوجد مخالفات عاجلة غير محلولة" },
            ].map((guard) => {
              const violation = violations.find((v: any) => v.guardName === guard.name);
              const passed = !violation;
              return (
                <Card key={guard.name} className={passed ? "border-green-100" : "border-red-200 bg-red-50/20"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {passed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                      {guard.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500">{guard.desc}</p>
                    {violation && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700">
                        {violation.reason}
                      </div>
                    )}
                    {passed && (
                      <Badge variant="outline" className="mt-2 text-green-700 border-green-300">ناجح</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                آلية العمل
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>حاكم النظام هو طبقة حماية مركزية تمنع تنفيذ العمليات الحساسة عند وجود مشاكل هيكلية.</p>
              <p>كل حراسة (Guard) تُفحص تلقائياً قبل العمليات المالية والإدارية. إذا فشلت أي حراسة، يُمنع التنفيذ ويظهر سبب المنع للمستخدم.</p>
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
