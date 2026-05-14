import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, TrendingUp, TrendingDown, DollarSign, Calendar, Hash } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

interface EntityFinancialProfileProps {
  entityType: "vehicle" | "employee" | "property" | "project" | "contract" | "product" | "vendor" | "client" | "driver";
  entityId: string | number;
}

export function EntityFinancialProfile({ entityType, entityId }: EntityFinancialProfileProps) {
  const { data, isLoading } = useApiQuery<any>(
    ["entity-financial-profile", entityType, String(entityId)],
    `/finance/entity-financial-profile?entityType=${entityType}&entityId=${entityId}`,
    !!entityId
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, costBreakdown, subsidiaryAccounts, recentTransactions } = data;
  const journalCount = Number(summary?.journalCount || 0);

  if (journalCount === 0 && (!subsidiaryAccounts || subsidiaryAccounts.length === 0)) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p>لا توجد بيانات مالية مرتبطة بهذا الكيان</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Hash className="h-4 w-4 text-status-info-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">عدد القيود</p>
            <p className="text-lg font-bold">{journalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 text-status-success-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي المدين</p>
            <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(Number(summary?.totalDebit || 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingDown className="h-4 w-4 text-status-error-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
            <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(Number(summary?.totalCredit || 0))}</p>
          </CardContent>
        </Card>
        {summary?.firstTransaction && (
          <Card>
            <CardContent className="p-3 text-center">
              <Calendar className="h-4 w-4 text-purple-600 mx-auto mb-1" />
              <p className="text-xs text-muted-foreground">أول معاملة</p>
              <p className="text-sm font-medium">{formatDateAr(summary.firstTransaction)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {subsidiaryAccounts && subsidiaryAccounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">الحسابات الفرعية المرتبطة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {subsidiaryAccounts.map((acc: any) => (
                <div key={acc.accountId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-status-info-foreground">{acc.accountCode}</span>
                    <Badge variant="outline" className="text-[10px]">{acc.accountType}</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">{acc.accountName}</p>
                  <p className={`text-base font-bold mt-1 ${Number(acc.balance) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
                    {formatCurrency(Number(acc.balance || 0))}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {costBreakdown && costBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">توزيع التكاليف حسب الحساب</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {costBreakdown.map((item: any, i: number) => {
                const maxVal = Math.max(...costBreakdown.map((c: any) => Math.abs(Number(c.netAmount || 0))));
                const pct = maxVal > 0 ? (Math.abs(Number(item.netAmount || 0)) / maxVal) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{item.code}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate">{item.name || item.code}</span>
                        <span className="font-medium shrink-0 ms-2">{formatCurrency(Math.abs(Number(item.netAmount || 0)))}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-status-info-surface0 rounded-full"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{item.transactionCount}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {recentTransactions && recentTransactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">آخر المعاملات المالية</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-subtle">
                    <th className="p-2 text-start text-xs">التاريخ</th>
                    <th className="p-2 text-start text-xs">المرجع</th>
                    <th className="p-2 text-start text-xs">الوصف</th>
                    <th className="p-2 text-start text-xs">الحساب</th>
                    <th className="p-2 text-start text-xs">مدين</th>
                    <th className="p-2 text-start text-xs">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.slice(0, 20).map((t: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-surface-subtle">
                      <td className="p-2 text-muted-foreground text-xs whitespace-nowrap">{t.createdAt ? formatDateAr(t.createdAt) : "—"}</td>
                      <td className="p-2 font-mono text-status-info-foreground text-xs">{t.ref || "—"}</td>
                      <td className="p-2 text-xs max-w-[200px] truncate">{t.description || "—"}</td>
                      <td className="p-2 text-xs">
                        <span className="font-mono text-muted-foreground">{t.accountCode}</span>
                        {t.accountName && <span className="text-muted-foreground ms-1 text-[10px]">{t.accountName}</span>}
                      </td>
                      <td className="p-2 text-status-success-foreground font-medium text-xs">
                        {Number(t.debit || 0) > 0 ? formatCurrency(Number(t.debit)) : "—"}
                      </td>
                      <td className="p-2 text-status-error-foreground font-medium text-xs">
                        {Number(t.credit || 0) > 0 ? formatCurrency(Number(t.credit)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
