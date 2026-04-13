import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { ArrowRight } from "lucide-react";

export default function IntercompanyConsolidationCreatePage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data: consolidationData, isLoading: loadingConsolidation } = useApiQuery<any>(
    ["intercompany-consolidation"],
    `/finance/intercompany/consolidation${scopeSuffix}`
  );

  const consolidation = consolidationData;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Link href="/finance/intercompany">
          <Button variant="ghost">
            <ArrowRight className="h-4 w-4 me-1" />
            العودة
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">القوائم المالية الموحدة</h2>
          <p className="text-sm text-gray-500 mt-1">عرض القوائم المالية الموحدة وحذف المعاملات البينية</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>نتائج التوحيد</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingConsolidation ? (
            <div className="text-center py-8 text-gray-500">جاري تحميل البيانات...</div>
          ) : consolidation ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-blue-50 p-4 text-center">
                  <div className="text-sm text-gray-500">إجمالي الأصول الموحد</div>
                  <div className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalAssets ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-red-50 p-4 text-center">
                  <div className="text-sm text-gray-500">إجمالي الالتزامات الموحد</div>
                  <div className="text-xl font-bold text-red-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalLiabilities ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-green-50 p-4 text-center">
                  <div className="text-sm text-gray-500">حقوق الملكية الموحدة</div>
                  <div className="text-xl font-bold text-green-700 mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalEquity ?? 0)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm">
                <span className="font-semibold">مطلوب حذفه من التوحيد: </span>
                <span className="font-mono font-bold text-yellow-800">{formatCurrency(consolidation.intercompanyElimination ?? 0)}</span>
                <span className="text-yellow-700 mr-2">— مجموع المعاملات البينية التي تُحذف عند التوحيد</span>
              </div>

              {consolidation.byCompany?.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 text-gray-700">الأداء حسب الشركة</div>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-right">الشركة</th>
                          <th className="px-3 py-2 text-right">الإيرادات</th>
                          <th className="px-3 py-2 text-right">المصروفات</th>
                          <th className="px-3 py-2 text-right">صافي الربح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidation.byCompany.map((c: any) => (
                          <tr key={c.companyId} className="border-t">
                            <td className="px-3 py-2 font-medium">{c.companyName}</td>
                            <td className="px-3 py-2 text-green-700">{formatCurrency(c.revenue)}</td>
                            <td className="px-3 py-2 text-red-600">{formatCurrency(c.expenses)}</td>
                            <td className={`px-3 py-2 font-semibold ${c.revenue - c.expenses >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(c.revenue - c.expenses)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">لا توجد بيانات توحيد متاحة</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
