import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { formatDateAr } from "@/lib/formatters";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, ChevronLeft,
  BarChart3, ArrowUpRight, ArrowDownRight, Wallet, Receipt,
  Target, Activity, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatCurrency(val: number | string | undefined): string {
  const n = Number(val) || 0;
  return n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-gray-100">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CashflowDashboard() {
  const { scopeQueryString } = useAppContext();
  const qstr = scopeQueryString ? `?${scopeQueryString}` : "";
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useApiQuery<any>(
    ["finance-summary", scopeQueryString, period],
    `/finance/summary?period=${period}${qstr ? "&" + scopeQueryString : ""}`
  );

  const { data: budgetData, isLoading: budgetLoading } = useApiQuery<any>(
    ["budget-actual", scopeQueryString, period],
    `/finance/budget-vs-actual?period=${period}${qstr ? "&" + scopeQueryString : ""}`
  );

  const { data: invoicesData } = useApiQuery<any>(
    ["finance-invoices-pending"],
    `/finance/invoices?status=pending&limit=5${qstr ? "&" + scopeQueryString : ""}`
  );

  const { data: expensesData } = useApiQuery<any>(
    ["finance-expenses-recent"],
    `/finance/expenses?limit=5${qstr ? "&" + scopeQueryString : ""}`
  );

  const summary = summaryData?.data || summaryData || {};
  const budget = budgetData?.data || budgetData || {};
  const pendingInvoices: any[] = invoicesData?.data || [];
  const recentExpenses: any[] = expensesData?.data || [];

  const totalIncome = Number(summary.totalIncome || summary.income || 0);
  const totalExpenses = Number(summary.totalExpenses || summary.expenses || 0);
  const netCashflow = totalIncome - totalExpenses;
  const isPositive = netCashflow >= 0;

  const budgetItems: any[] = Array.isArray(budget) ? budget : (budget.items || budget.categories || []);

  const periodLabels: Record<string, string> = { month: "الشهر الحالي", quarter: "الربع الحالي", year: "العام الحالي" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-emerald-600" />
            لوحة التدفق النقدي
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">مراقبة التدفقات المالية ومقارنة الميزانية بالفعلي</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchSummary()}><RefreshCw className="h-3.5 w-3.5 me-1" />تحديث</Button>
          <Link href="/finance">
            <Button variant="outline" size="sm" className="gap-1">الوحدة المالية <ArrowUpRight className="w-3 h-3" /></Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2">
        {(["month", "quarter", "year"] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all border",
              period === p ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {summaryLoading ? (
        <div className="text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-emerald-600 font-medium">الإيرادات</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalIncome)}</p>
                <p className="text-xs text-emerald-500 mt-0.5">ر.س</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownRight className="w-4 h-4 text-red-600" />
                  <span className="text-xs text-red-600 font-medium">المصروفات</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(totalExpenses)}</p>
                <p className="text-xs text-red-500 mt-0.5">ر.س</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className={cn("p-4 rounded-lg", isPositive ? "bg-blue-50" : "bg-orange-50")}>
                <div className="flex items-center gap-2 mb-2">
                  {isPositive ? <TrendingUp className="w-4 h-4 text-blue-600" /> : <TrendingDown className="w-4 h-4 text-orange-600" />}
                  <span className={cn("text-xs font-medium", isPositive ? "text-blue-600" : "text-orange-600")}>صافي التدفق</span>
                </div>
                <p className={cn("text-2xl font-bold", isPositive ? "text-blue-700" : "text-orange-700")}>
                  {isPositive ? "" : "-"}{formatCurrency(Math.abs(netCashflow))}
                </p>
                <p className={cn("text-xs mt-0.5", isPositive ? "text-blue-500" : "text-orange-500")}>ر.س</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span className="text-xs text-amber-600 font-medium">فواتير معلقة</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">{pendingInvoices.length}</p>
                <p className="text-xs text-amber-500 mt-0.5">فاتورة</p>
              </CardContent>
            </Card>
          </div>

          {totalIncome > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  نسبة الإنفاق من الإيرادات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    const spendPct = totalIncome > 0 ? Math.min(100, Math.round((totalExpenses / totalIncome) * 100)) : 0;
                    const isHealthy = spendPct <= 70;
                    const isWarning = spendPct > 70 && spendPct <= 90;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">الإنفاق مقابل الإيرادات</span>
                          <span className={cn("font-bold text-base", isHealthy ? "text-emerald-600" : isWarning ? "text-amber-600" : "text-red-600")}>
                            {spendPct}%
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all duration-700",
                            isHealthy ? "bg-emerald-500" : isWarning ? "bg-amber-400" : "bg-red-500")}
                            style={{ width: `${spendPct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>0</span>
                          <span className={cn("font-medium", isHealthy ? "text-emerald-600" : isWarning ? "text-amber-600" : "text-red-600")}>
                            {spendPct <= 70 ? "نسبة صحية" : spendPct <= 90 ? "تحتاج مراقبة" : "خطر! الإنفاق مرتفع"}
                          </span>
                          <span>100%</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {budgetItems.length > 0 && (() => {
        const budgetAlerts = budgetItems.filter((item: any) => {
          const ba = Number(item.budget || item.budgetAmount || 0);
          const aa = Number(item.actual || item.actualAmount || 0);
          const p = ba > 0 ? (aa / ba) * 100 : 0;
          return p >= 80;
        });
        const criticalAlerts = budgetAlerts.filter((item: any) => {
          const ba = Number(item.budget || item.budgetAmount || 0);
          const aa = Number(item.actual || item.actualAmount || 0);
          return ba > 0 && (aa / ba) * 100 >= 95;
        });
        return (
          <>
            {budgetAlerts.length > 0 && (
              <div className="space-y-2">
                {criticalAlerts.length > 0 && (
                  <Card className="border-red-200 bg-red-50 border-s-4 border-s-red-500">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <span className="font-semibold text-red-700 text-sm">تنبيه حرج — الميزانية على وشك النفاد (95%+)</span>
                      </div>
                      <div className="space-y-1">
                        {criticalAlerts.map((item: any, i: number) => {
                          const ba = Number(item.budget || item.budgetAmount || 0);
                          const aa = Number(item.actual || item.actualAmount || 0);
                          const p = ba > 0 ? Math.round((aa / ba) * 100) : 0;
                          return (
                            <p key={i} className="text-xs text-red-700">
                              <span className="font-medium">{item.category || item.name || `بند ${i + 1}`}:</span> استُنفد {p}% من الميزانية ({formatCurrency(aa)} من {formatCurrency(ba)} ر.س)
                            </p>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {budgetAlerts.filter((item: any) => {
                  const ba = Number(item.budget || item.budgetAmount || 0);
                  const aa = Number(item.actual || item.actualAmount || 0);
                  const p = ba > 0 ? (aa / ba) * 100 : 0;
                  return p >= 80 && p < 95;
                }).length > 0 && (
                  <Card className="border-amber-200 bg-amber-50 border-s-4 border-s-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="font-semibold text-amber-700 text-sm">تنبيه — اقتراب من حد الميزانية (80%+)</span>
                      </div>
                      <div className="space-y-1">
                        {budgetAlerts.filter((item: any) => {
                          const ba = Number(item.budget || item.budgetAmount || 0);
                          const aa = Number(item.actual || item.actualAmount || 0);
                          const p = ba > 0 ? (aa / ba) * 100 : 0;
                          return p >= 80 && p < 95;
                        }).map((item: any, i: number) => {
                          const ba = Number(item.budget || item.budgetAmount || 0);
                          const aa = Number(item.actual || item.actualAmount || 0);
                          const p = ba > 0 ? Math.round((aa / ba) * 100) : 0;
                          return (
                            <p key={i} className="text-xs text-amber-700">
                              <span className="font-medium">{item.category || item.name || `بند ${i + 1}`}:</span> استُنفد {p}% ({formatCurrency(aa)} من {formatCurrency(ba)} ر.س) — متبقي {formatCurrency(ba - aa)} ر.س
                            </p>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-500" />
                  الميزانية مقابل الفعلي
                </CardTitle>
              </CardHeader>
              <CardContent>
                {budgetLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">جاري التحميل...</p>
                ) : (
                  <div className="space-y-4">
                    {budgetItems.slice(0, 8).map((item: any, i: number) => {
                      const budget_amount = Number(item.budget || item.budgetAmount || 0);
                      const actual_amount = Number(item.actual || item.actualAmount || 0);
                      const pct = budget_amount > 0 ? Math.min(120, Math.round((actual_amount / budget_amount) * 100)) : 0;
                      const isOver = pct > 100;
                      const isCritical = pct >= 95 && pct <= 100;
                      const isHigh = pct >= 80 && pct < 95;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">{item.category || item.name || item.label || `بند ${i + 1}`}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{formatCurrency(actual_amount)} / {formatCurrency(budget_amount)}</span>
                              {isOver && <Badge className="text-[10px] bg-red-100 text-red-700">تجاوز!</Badge>}
                              {isCritical && <Badge className="text-[10px] bg-orange-100 text-orange-700">95%+ حرج</Badge>}
                              {isHigh && <Badge className="text-[10px] bg-amber-100 text-amber-700">80%+ تنبيه</Badge>}
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500",
                                isOver ? "bg-red-500" : isCritical ? "bg-orange-500" : isHigh ? "bg-amber-400" : "bg-emerald-500")}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>الفعلي: {formatCurrency(actual_amount)} ر.س</span>
                            <span className={cn(isOver ? "text-red-600 font-medium" : isCritical ? "text-orange-600 font-medium" : isHigh ? "text-amber-600 font-medium" : "")}>{pct}% من الميزانية</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              الفواتير المعلقة
            </CardTitle>
            <Link href="/finance/invoices">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض الكل <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {pendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد فواتير معلقة</p>
            ) : (
              <div className="space-y-2">
                {pendingInvoices.map((inv: any) => {
                  const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                  const isOverdue = dueDate && dueDate < new Date();
                  return (
                    <div key={inv.id} className={cn("flex items-center justify-between p-2.5 rounded-lg", isOverdue ? "bg-red-50" : "bg-gray-50")}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{inv.clientName || inv.vendor || `فاتورة #${inv.id}`}</p>
                        <p className="text-xs text-gray-400">{dueDate ? `مستحق: ${formatDateAr(dueDate.toISOString())}` : "—"}</p>
                      </div>
                      <div className="text-end">
                        <p className={cn("text-sm font-bold", isOverdue ? "text-red-700" : "text-gray-800")}>{formatCurrency(inv.amount)} ر.س</p>
                        {isOverdue && <Badge className="text-[10px] bg-red-100 text-red-700">متأخر</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-500" />
              أحدث المصروفات
            </CardTitle>
            <Link href="/finance/expenses">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض الكل <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">لا توجد مصروفات</p>
            ) : (
              <div className="space-y-2">
                {recentExpenses.map((exp: any) => (
                  <div key={exp.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{exp.description || exp.category || `مصروف #${exp.id}`}</p>
                      <p className="text-xs text-gray-400">{exp.employeeName || exp.submittedBy || "—"} — {exp.date ? formatDateAr(exp.date) : ""}</p>
                    </div>
                    <Badge className={cn("text-xs shrink-0 ms-2",
                      exp.status === "approved" ? "bg-green-100 text-green-700" :
                      exp.status === "rejected" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    )}>
                      {formatCurrency(exp.amount)} ر.س
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(summary.alerts || summary.warnings || []).length > 0 && (
        <Card className="border-0 shadow-sm border-s-4 border-s-amber-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              تنبيهات مالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(summary.alerts || summary.warnings || []).map((alert: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-800">{alert.message || alert}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
