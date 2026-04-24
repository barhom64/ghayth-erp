import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateAr } from "@/lib/formatters";
import {
  RefreshCw, CheckCircle, AlertTriangle, Scale,
} from "lucide-react";

function formatAmount(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export default function AdminGlReconciliation() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["gl-reconciliation"], "/admin/governance/gl-reconciliation"
  );

  const healthy = data?.healthy ?? true;
  const driftCount = data?.driftCount ?? 0;
  const mismatches = data?.mismatches ?? [];

  return (
    <PageShell
      title="مطابقة دفتر الأستاذ"
      subtitle="مقارنة الأرصدة المخزنة بالأرصدة المحسوبة من القيود"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />فحص
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <Card className={healthy ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}>
            <CardContent className="p-6 flex items-center gap-4">
              {healthy ? (
                <CheckCircle className="w-12 h-12 text-green-600" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-red-600" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {healthy
                    ? "جميع الحسابات متطابقة — لا يوجد انحراف"
                    : `${driftCount} حساب بانحراف في الرصيد`}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  يقارن الرصيد الحالي (currentBalance) بمجموع قيود اليومية (مدين − دائن) لكل حساب
                </p>
              </div>
            </CardContent>
          </Card>

          {mismatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                  <Scale className="w-4 h-4" />
                  حسابات بانحراف ({mismatches.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 sticky top-0">
                        <th className="p-2 text-start">الكود</th>
                        <th className="p-2 text-start">اسم الحساب</th>
                        <th className="p-2 text-start">الرصيد المخزن</th>
                        <th className="p-2 text-start">الرصيد المحسوب</th>
                        <th className="p-2 text-start">الانحراف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mismatches.map((row: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">{row.code}</td>
                          <td className="p-2 text-xs">{row.name}</td>
                          <td className="p-2 text-xs font-mono">{formatAmount(row.stored_balance)}</td>
                          <td className="p-2 text-xs font-mono">{formatAmount(row.computed_balance)}</td>
                          <td className="p-2">
                            <Badge className={Number(row.drift) > 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
                              {formatAmount(row.drift)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {healthy && data && (
            <Card className="border-green-200">
              <CardContent className="p-8 text-center">
                <Scale className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-bold text-green-700">مطابقة تامة</p>
                <p className="text-sm text-gray-500 mt-1">
                  جميع الأرصدة المخزنة تتطابق مع مجاميع قيود اليومية بفارق أقل من 0.01
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
