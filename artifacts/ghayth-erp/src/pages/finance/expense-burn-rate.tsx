import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";
import { PrintButton } from "@/components/shared/print-button";
import {
  TrendingDown, TrendingUp, Flame, Calendar, AlertTriangle,
  Banknote, Clock, Download, BarChart3,
} from "lucide-react";
import {
  formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * Expense Burn Rate & Runway Tracker
 *
 * Tracks monthly net burn (cash out − cash in from operations) over the
 * last 6 months, computes the average burn rate, and projects runway in
 * months given current cash position.
 *
 * Endpoints:
 *   /reports/income-statement?startDate&endDate (× 6 months parallel)
 *   /reports/balance-sheet?endDate (× 1 for current cash)
 */

interface PnlResp {
  revenue?: { total: number };
  cogs?: { total: number };
  operatingExpenses?: { total: number };
  netIncome?: number;
}

interface BsResp {
  assets?: { current: { total: number } };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  // month 1-12
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export default function ExpenseBurnRatePage() {
  const today = todayLocal();
  const [currentYear, setCurrentYear] = useState(currentYearRiyadh());
  const [currentMonth, setCurrentMonth] = useState(Number(currentMonthPaddedRiyadh()));

  // Build last 6 months ending at (currentYear, currentMonth)
  const months = useMemo(() => {
    const out: Array<{ year: number; month: number; label: string; startDate: string; endDate: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const { year, month } = shiftMonth(currentYear, currentMonth, -i);
      const lastDay = daysInMonth(year, month);
      out.push({
        year,
        month,
        label: `${year}-${String(month).padStart(2, "0")}`,
        startDate: `${year}-${String(month).padStart(2, "0")}-01`,
        endDate: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      });
    }
    return out;
  }, [currentYear, currentMonth]);

  const q0 = useApiQuery<PnlResp>(["burn", months[0]!.label], `/finance/reports/income-statement?startDate=${months[0]!.startDate}&endDate=${months[0]!.endDate}`);
  const q1 = useApiQuery<PnlResp>(["burn", months[1]!.label], `/finance/reports/income-statement?startDate=${months[1]!.startDate}&endDate=${months[1]!.endDate}`);
  const q2 = useApiQuery<PnlResp>(["burn", months[2]!.label], `/finance/reports/income-statement?startDate=${months[2]!.startDate}&endDate=${months[2]!.endDate}`);
  const q3 = useApiQuery<PnlResp>(["burn", months[3]!.label], `/finance/reports/income-statement?startDate=${months[3]!.startDate}&endDate=${months[3]!.endDate}`);
  const q4 = useApiQuery<PnlResp>(["burn", months[4]!.label], `/finance/reports/income-statement?startDate=${months[4]!.startDate}&endDate=${months[4]!.endDate}`);
  const q5 = useApiQuery<PnlResp>(["burn", months[5]!.label], `/finance/reports/income-statement?startDate=${months[5]!.startDate}&endDate=${months[5]!.endDate}`);

  const bs = useApiQuery<BsResp>(
    ["burn-bs", months[5]!.endDate],
    `/finance/reports/balance-sheet?endDate=${months[5]!.endDate}`,
  );

  const queries = [q0, q1, q2, q3, q4, q5];
  const isLoading = queries.some(q => q.isLoading) || bs.isLoading;

  const monthlyStats = useMemo(() => {
    return months.map((m, i) => {
      const d = queries[i]?.data;
      const revenue = d?.revenue?.total ?? 0;
      const expenses = (d?.cogs?.total ?? 0) + (d?.operatingExpenses?.total ?? 0);
      const netIncome = d?.netIncome ?? (revenue - expenses);
      // Burn = positive amount when losing money (cash outflow)
      const burn = -netIncome;
      return {
        ...m,
        revenue,
        expenses,
        netIncome,
        burn,
        isBurning: burn > 0,
      };
    });
  }, [months, ...queries.map(q => q.data)]);

  const currentCash = bs.data?.assets?.current?.total ?? 0;

  const avgBurn = useMemo(() => {
    const burning = monthlyStats.filter(m => m.burn > 0);
    if (burning.length === 0) return 0;
    return burning.reduce((s, m) => s + m.burn, 0) / burning.length;
  }, [monthlyStats]);

  const runwayMonths = avgBurn > 0 ? currentCash / avgBurn : Infinity;

  const burnTrend = useMemo(() => {
    if (monthlyStats.length < 2) return 0;
    const recent = monthlyStats.slice(-3).reduce((s, m) => s + m.burn, 0) / 3;
    const prior = monthlyStats.slice(0, 3).reduce((s, m) => s + m.burn, 0) / 3;
    return recent - prior;
  }, [monthlyStats]);

  const maxBurn = Math.max(...monthlyStats.map(m => Math.abs(m.burn)), 1);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push("الشهر,الإيرادات,المصاريف,صافي الدخل,معدل الحرق");
    for (const m of monthlyStats) {
      lines.push([
        m.label,
        m.revenue.toFixed(2),
        m.expenses.toFixed(2),
        m.netIncome.toFixed(2),
        m.burn.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push(`متوسط الحرق الشهري,${avgBurn.toFixed(2)}`);
    lines.push(`النقدية الحالية,${currentCash.toFixed(2)}`);
    lines.push(`فترة البقاء (شهر),${runwayMonths === Infinity ? "∞" : runwayMonths.toFixed(1)}`);

    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_expense_burn_rate",
        title: String(`burn-rate-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="معدل الحرق وفترة البقاء"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "معدل الحرق وفترة البقاء" },
      ]}
      subtitle="6 أشهر من معدل صافي الحرق + توقع فترة البقاء بناءً على السيولة الحالية"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-position-calculator">
              <Banknote className="h-3.5 w-3.5 ml-1" />
              مركز السيولة
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-13week">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              توقع 13 أسبوع
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/expense-bulk-approvals">
              <BarChart3 className="h-3.5 w-3.5 ml-1" />
              اعتماد المصاريف
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">انتهاء الفترة</label>
            <div className="flex gap-2">
              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {[currentYearRiyadh(), currentYearRiyadh() - 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={isLoading}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_expense_burn_rate"
            entityId="all"
            payload={{ entity: { title: "معدل حرق المصاريف" }, items: [] }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className={avgBurn > 0 ? "border-status-danger-foreground border-2" : "border-status-success-foreground"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Flame className={`w-3 h-3 ${avgBurn > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`} />
                  متوسط الحرق الشهري
                </div>
                <div className={`text-2xl font-bold tabular-nums ${avgBurn > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                  {avgBurn > 0 ? formatCurrency(avgBurn) : "ربح صافي"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  معدل آخر 6 أشهر
                </div>
                <InlineSparkline
                  values={monthlyStats.map((m) => m.burn)}
                  tone={avgBurn > 0 ? "warning" : "success"}
                  testid="burn-rate-avg-spark"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Banknote className="w-3 h-3" />
                  النقدية الحالية
                </div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(currentCash)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  أصول متداولة كما في {months[5]!.endDate}
                </div>
              </CardContent>
            </Card>
            <Card className={runwayMonths < 6 ? "border-status-danger-foreground border-2" : runwayMonths < 12 ? "border-status-warning-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className={`w-3 h-3 ${runwayMonths < 6 ? "text-status-danger-foreground" : runwayMonths < 12 ? "text-status-warning-foreground" : "text-status-success-foreground"}`} />
                  فترة البقاء
                </div>
                <div className={`text-2xl font-bold tabular-nums ${runwayMonths < 6 ? "text-status-danger-foreground" : runwayMonths < 12 ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                  {runwayMonths === Infinity ? "∞" : `${runwayMonths.toFixed(1)} شهر`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {runwayMonths === Infinity ? "ربحية!" : runwayMonths < 6 ? "حرج" : runwayMonths < 12 ? "تحذير" : "آمن"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {burnTrend > 0 ? <TrendingUp className="w-3 h-3 text-status-danger-foreground" /> : <TrendingDown className="w-3 h-3 text-status-success-foreground" />}
                  اتجاه الحرق
                </div>
                <div className={`text-2xl font-bold tabular-nums ${burnTrend > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                  {burnTrend > 0 ? "+" : ""}{formatCurrency(burnTrend)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  آخر 3 أشهر مقابل سابقها
                </div>
                <InlineSparkline
                  values={monthlyStats.map((m) => m.burn)}
                  tone={burnTrend > 0 ? "warning" : "success"}
                  testid="burn-rate-trend-spark"
                />
              </CardContent>
            </Card>
          </div>

          {/* Alerts */}
          {runwayMonths < 6 && runwayMonths !== Infinity && (
            <Card className="mb-4 border-status-danger-foreground bg-status-danger-surface">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-status-danger-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-status-danger-foreground">تنبيه: فترة البقاء أقل من 6 أشهر!</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      بمعدل الحرق الحالي ستنفد السيولة خلال {runwayMonths.toFixed(1)} شهر فقط. خطط فوراً لإحدى الإجراءات:
                      تخفيض المصاريف، تسريع التحصيل، تأخير المدفوعات، أو زيادة التمويل.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly bars */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                معدل الحرق الشهري — 6 أشهر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monthlyStats.map(m => {
                  const pct = (Math.abs(m.burn) / maxBurn) * 100;
                  return (
                    <div key={m.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{m.label}</span>
                          <span className="text-muted-foreground">
                            (إيرادات {formatCurrency(m.revenue)} − مصاريف {formatCurrency(m.expenses)})
                          </span>
                        </div>
                        <div className={`font-bold tabular-nums ${m.isBurning ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                          {m.isBurning ? "حرق " : "ربح "}{formatCurrency(Math.abs(m.burn))}
                        </div>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden relative">
                        <div
                          className={`h-full ${m.isBurning ? "bg-status-danger-foreground" : "bg-status-success-foreground"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Detail table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الجدول التفصيلي</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2 px-2">الشهر</th>
                    <th className="text-end py-2 px-2">الإيرادات</th>
                    <th className="text-end py-2 px-2">المصاريف</th>
                    <th className="text-end py-2 px-2">صافي الدخل</th>
                    <th className="text-end py-2 px-2">الحرق/الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyStats.map(m => (
                    <tr key={m.label} className="border-b">
                      <td className="py-2 px-2 font-mono text-xs">{m.label}</td>
                      <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(m.revenue)}</td>
                      <td className="py-2 px-2 text-end tabular-nums text-status-danger-foreground">
                        {formatCurrency(m.expenses)}
                      </td>
                      <td className={`py-2 px-2 text-end tabular-nums font-semibold ${m.netIncome >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                        {m.netIncome >= 0 ? "+" : ""}{formatCurrency(m.netIncome)}
                      </td>
                      <td className="py-2 px-2 text-end">
                        <Badge variant="outline" className={`text-[10px] ${m.isBurning ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                          {m.isBurning ? "حرق" : "ربح"} {formatCurrency(Math.abs(m.burn))}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-muted/40 border-t-2">
                    <td className="py-2 px-2">المتوسط</td>
                    <td className="py-2 px-2 text-end tabular-nums">
                      {formatCurrency(monthlyStats.reduce((s, m) => s + m.revenue, 0) / 6)}
                    </td>
                    <td className="py-2 px-2 text-end tabular-nums text-status-danger-foreground">
                      {formatCurrency(monthlyStats.reduce((s, m) => s + m.expenses, 0) / 6)}
                    </td>
                    <td className={`py-2 px-2 text-end tabular-nums ${(monthlyStats.reduce((s, m) => s + m.netIncome, 0) / 6) >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                      {formatCurrency(monthlyStats.reduce((s, m) => s + m.netIncome, 0) / 6)}
                    </td>
                    <td className="py-2 px-2 text-end font-bold">
                      {formatCurrency(avgBurn)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
