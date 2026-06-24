import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { formatCurrency, roundMoney } from "@/lib/formatters";
import { CreatePageLayout } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function IntercompanyConsolidationPage() {
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
                <div className="rounded-xl border bg-status-info-surface p-4 text-center">
                  <div className="text-sm text-muted-foreground">إجمالي الأصول الموحد</div>
                  <div className="text-xl font-bold text-status-info-foreground mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalAssets ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-status-error-surface p-4 text-center">
                  <div className="text-sm text-muted-foreground">إجمالي الالتزامات الموحد</div>
                  <div className="text-xl font-bold text-status-error-foreground mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalLiabilities ?? 0)}</div>
                </div>
                <div className="rounded-xl border bg-status-success-surface p-4 text-center">
                  <div className="text-sm text-muted-foreground">حقوق الملكية الموحدة</div>
                  <div className="text-xl font-bold text-status-success-foreground mt-1">{formatCurrency(consolidation.consolidatedBalance?.totalEquity ?? 0)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-status-warning-surface bg-status-warning-surface p-3 text-sm">
                <span className="font-semibold">مطلوب حذفه من التوحيد: </span>
                <span className="font-mono font-bold text-yellow-800">{formatCurrency(consolidation.intercompanyElimination ?? 0)}</span>
                <span className="text-status-warning-foreground mr-2">— مجموع المعاملات البينية التي تُحذف عند التوحيد</span>
              </div>

              {consolidation.byCompany?.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2 text-status-neutral-foreground">الأداء حسب الشركة</div>
                  <DataTable
                    noToolbar
                    pageSize={0}
                    data={consolidation.byCompany as any[]}
                    rowKey={(c) => c.companyId}
                    columns={[
                      {
                        key: "companyName", header: "الشركة", className: "font-medium",
                        render: (c) => c.companyName,
                      },
                      {
                        key: "revenue", header: "الإيرادات", className: "text-status-success-foreground",
                        render: (c) => formatCurrency(c.revenue),
                      },
                      {
                        key: "expenses", header: "المصروفات", className: "text-status-error-foreground",
                        render: (c) => formatCurrency(c.expenses),
                      },
                      {
                        key: "netProfit", header: "صافي الربح", className: "font-semibold",
                        render: (c) => (
                          <span className={roundMoney(c.revenue) - roundMoney(c.expenses) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}>
                            {formatCurrency(roundMoney(roundMoney(c.revenue) - roundMoney(c.expenses)))}
                          </span>
                        ),
                        exportValue: (c) => roundMoney(roundMoney(c.revenue) - roundMoney(c.expenses)),
                      },
                    ] satisfies DataTableColumn<any>[]}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">لا توجد بيانات توحيد متاحة</div>
          )}
        </div>
      </div>
    </CreatePageLayout>
  );
}
