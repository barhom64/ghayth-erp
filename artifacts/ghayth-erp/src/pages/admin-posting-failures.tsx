import { PageShell } from "@/components/page-shell";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateAr } from "@/lib/formatters";
import { useState } from "react";
import {
  RefreshCw, AlertTriangle, CheckCircle, XCircle,
} from "lucide-react";

export default function AdminPostingFailures() {
  const [showResolved, setShowResolved] = useState(false);
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["posting-failures", String(showResolved)],
    `/finance-hardening/posting-failures?resolved=${showResolved}`
  );
  const resolveMutation = useApiMutation<any, any>(
    (id: any) => `/finance-hardening/posting-failures/${id}/resolve`,
    "PATCH",
    [["posting-failures"]],
  );

  const rows = data?.data ?? [];

  return (
    <PageShell
      title="فشل القيود المالية"
      subtitle="عمليات القيد في دفتر الأستاذ التي فشلت وتحتاج معالجة"
      loading={isLoading}
      actions={
        <div className="flex gap-2">
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? "المحلولة" : "المفتوحة"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 me-1" />تحديث
          </Button>
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className={rows.length > 0 && !showResolved ? "bg-red-50/50" : "bg-green-50/50"}>
              <CardContent className="p-4 flex items-center gap-3">
                {rows.length > 0 && !showResolved ? (
                  <XCircle className="w-8 h-8 text-red-600" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                )}
                <div>
                  <p className="text-2xl font-bold">{rows.length}</p>
                  <p className="text-xs text-gray-500">{showResolved ? "فشل محلول" : "فشل مفتوح"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600">
                  عندما تفشل عملية ترحيل مالي (خطأ في القيد، حساب مغلق، فترة مغلقة)، يتم تسجيلها هنا.
                  إذا تجاوز العدد 10، يمنع حاكم النظام تنفيذ عمليات مالية جديدة.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                السجلات ({rows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 sticky top-0">
                      <th className="p-2 text-start">#</th>
                      <th className="p-2 text-start">العملية</th>
                      <th className="p-2 text-start">الكيان</th>
                      <th className="p-2 text-start">الخطأ</th>
                      <th className="p-2 text-start">التاريخ</th>
                      <th className="p-2 text-start">الحالة</th>
                      {!showResolved && <th className="p-2 text-start">إجراء</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row: any) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-xs">{row.id}</td>
                        <td className="p-2 font-mono text-xs">{row.operation || row.action || "—"}</td>
                        <td className="p-2 text-xs">{row.entity || "—"} {row.entityId ? `#${row.entityId}` : ""}</td>
                        <td className="p-2 text-xs text-red-600 max-w-[300px] truncate">{row.error || row.errorMessage || "—"}</td>
                        <td className="p-2 text-xs">{formatDateAr(row.createdAt)}</td>
                        <td className="p-2">
                          {row.resolved ? (
                            <Badge className="bg-green-100 text-green-800">محلول</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800">مفتوح</Badge>
                          )}
                        </td>
                        {!showResolved && (
                          <td className="p-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={resolveMutation.isPending}
                              onClick={() => resolveMutation.mutate(row.id)}
                            >
                              حل
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={showResolved ? 6 : 7} className="p-6 text-center text-gray-400">
                          {showResolved ? "لا توجد سجلات محلولة" : "لا توجد أعطال — النظام يعمل بشكل طبيعي"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
