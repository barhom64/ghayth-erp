import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { formatCurrency, roundMoney } from "@/lib/formatters";
import { CreatePageLayout } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function IntercompanyConsolidationCreatePage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data: consolidationData, isLoading: loadingConsolidation, isError } = useApiQuery<any>(
    ["intercompany-consolidation"],
    `/finance/intercompany/consolidation${scopeSuffix}`
  );

  if (loadingConsolidation) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const consolidation = consolidationData;

  return (
    <CreatePageLayout
      title="القوائم المالية الموحدة"
      subtitle="عرض القوائم المالية الموحدة وحذف المعاملات البينية"
      backPath="/finance/intercompany"
    >
      <div dir="rtl">
        <h3 className="text-lg font-semibold mb-3">نتائج التوحيد</h3>
        <div>
          {consolidation ? (
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
                            <td className={`px-3 py-2 font-semibold ${roundMoney(c.revenue) - roundMoney(c.expenses) >= 0 ? "text-green-700" : "text-red-600"}`}>{formatCurrency(roundMoney(roundMoney(c.revenue) - roundMoney(c.expenses)))}</td>
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
        </div>
      </div>
    </CreatePageLayout>
  );
}
