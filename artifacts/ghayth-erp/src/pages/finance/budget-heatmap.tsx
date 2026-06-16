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
import { PrintButton } from "@/components/shared/print-button";
import {
  Grid3x3, Download, TrendingUp, TrendingDown, AlertTriangle, Info,
} from "lucide-react";
import { formatCurrency, currentYearRiyadh } from "@/lib/formatters";

/**
 * Budget Variance Heatmap (Monthly × Account)
 *
 * 12-month × account matrix where each cell shows actual/budget ratio with
 * a color (green ≤80% / amber 80-100% / red >100%). Hover for exact numbers,
 * click for drill-down to the source budget.
 *
 * Endpoint: GET /finance/reports/budget-variance?period=YYYY-MM (called 12×)
 */

interface BudgetRow {
  accountCode: string;
  accountName: string;
  type: string;
  budget: number | string;
  actual: number | string;
  variance: number | string;
  usagePct: number | string;
}

interface BudgetResp {
  data: BudgetRow[];
  summary: { totalBudget: number; totalActual: number; totalVariance: number };
}

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function colorFor(pct: number): { bg: string; text: string; label: string } {
  if (pct <= 0) return { bg: "bg-muted", text: "text-muted-foreground", label: "بلا حركة" };
  if (pct <= 50) return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-status-success-foreground", label: "هادئ" };
  if (pct <= 80) return { bg: "bg-green-200 dark:bg-green-800/40", text: "text-status-success-foreground", label: "ضمن المعدّل" };
  if (pct <= 100) return { bg: "bg-amber-200 dark:bg-amber-800/40", text: "text-status-warning-foreground", label: "اقترب من الحد" };
  if (pct <= 120) return { bg: "bg-orange-300 dark:bg-orange-800/50", text: "text-status-danger-foreground", label: "تجاوز خفيف" };
  return { bg: "bg-red-400 dark:bg-red-700/60", text: "text-white", label: "تجاوز فادح" };
}

export default function BudgetHeatmapPage() {
  const [year, setYear] = useState(currentYearRiyadh());

  const periods = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`),
  [year]);

  const q1 = useApiQuery<BudgetResp>(["bh", String(year), "1"], `/finance/reports/budget-variance?period=${periods[0]}`);
  const q2 = useApiQuery<BudgetResp>(["bh", String(year), "2"], `/finance/reports/budget-variance?period=${periods[1]}`);
  const q3 = useApiQuery<BudgetResp>(["bh", String(year), "3"], `/finance/reports/budget-variance?period=${periods[2]}`);
  const q4 = useApiQuery<BudgetResp>(["bh", String(year), "4"], `/finance/reports/budget-variance?period=${periods[3]}`);
  const q5 = useApiQuery<BudgetResp>(["bh", String(year), "5"], `/finance/reports/budget-variance?period=${periods[4]}`);
  const q6 = useApiQuery<BudgetResp>(["bh", String(year), "6"], `/finance/reports/budget-variance?period=${periods[5]}`);
  const q7 = useApiQuery<BudgetResp>(["bh", String(year), "7"], `/finance/reports/budget-variance?period=${periods[6]}`);
  const q8 = useApiQuery<BudgetResp>(["bh", String(year), "8"], `/finance/reports/budget-variance?period=${periods[7]}`);
  const q9 = useApiQuery<BudgetResp>(["bh", String(year), "9"], `/finance/reports/budget-variance?period=${periods[8]}`);
  const q10 = useApiQuery<BudgetResp>(["bh", String(year), "10"], `/finance/reports/budget-variance?period=${periods[9]}`);
  const q11 = useApiQuery<BudgetResp>(["bh", String(year), "11"], `/finance/reports/budget-variance?period=${periods[10]}`);
  const q12 = useApiQuery<BudgetResp>(["bh", String(year), "12"], `/finance/reports/budget-variance?period=${periods[11]}`);

  const monthly = [q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11, q12];
  const isLoading = monthly.some(q => q.isLoading);

  // Build account map: code → { name, type, perMonth: number[12] of {budget, actual, pct} }
  const accountMap = useMemo(() => {
    const map = new Map<string, {
      code: string;
      name: string;
      type: string;
      months: Array<{ budget: number; actual: number; pct: number }>;
      totalBudget: number;
      totalActual: number;
    }>();
    monthly.forEach((q, i) => {
      const data = q.data?.data ?? [];
      for (const r of data) {
        if (!map.has(r.accountCode)) {
          map.set(r.accountCode, {
            code: r.accountCode,
            name: r.accountName,
            type: r.type,
            months: Array.from({ length: 12 }, () => ({ budget: 0, actual: 0, pct: 0 })),
            totalBudget: 0,
            totalActual: 0,
          });
        }
        const acct = map.get(r.accountCode)!;
        acct.months[i] = {
          budget: Number(r.budget),
          actual: Number(r.actual),
          pct: Number(r.usagePct),
        };
        acct.totalBudget += Number(r.budget);
        acct.totalActual += Number(r.actual);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [...monthly.map(q => q.data)]);

  const totalBudget = accountMap.reduce((s, a) => s + a.totalBudget, 0);
  const totalActual = accountMap.reduce((s, a) => s + a.totalActual, 0);
  const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const overrunCount = accountMap.reduce((s, a) => {
    return s + a.months.filter(m => m.pct > 100).length;
  }, 0);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`خريطة حرارية للميزانية ${year}`);
    lines.push("");
    lines.push(["الحساب", "الاسم", ...MONTHS_AR, "إجمالي الميزانية", "إجمالي الفعلي", "%"].join(","));
    for (const a of accountMap) {
      const row = [
        a.code,
        (a.name ?? "").replace(/,/g, "،"),
        ...a.months.map(m => m.budget > 0 ? `${m.pct.toFixed(0)}%` : "—"),
        a.totalBudget.toFixed(2),
        a.totalActual.toFixed(2),
        a.totalBudget > 0 ? `${((a.totalActual / a.totalBudget) * 100).toFixed(0)}%` : "—",
      ];
      lines.push(row.join(","));
    }
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
        entityType: "report_budget_heatmap",
        title: String(`budget-heatmap-${year}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="خريطة حرارية للميزانية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "خريطة حرارية للميزانية" },
      ]}
      subtitle="استخدام الميزانية شهرياً × بنداً — ألوان فورية تكشف نقاط الانفجار"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/is-vs-budget">
              <TrendingUp className="h-3.5 w-3.5 ml-1" />
              P&L vs Budget
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-variance">
              <TrendingDown className="h-3.5 w-3.5 ml-1" />
              انحرافات الميزانية
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-approvals">
              <AlertTriangle className="h-3.5 w-3.5 ml-1" />
              اعتماد الميزانية
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            >
              {[currentYearRiyadh(), currentYearRiyadh() - 1, currentYearRiyadh() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={isLoading}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_budget_heatmap"
            entityId={String(year)}
            payload={{
              entity: {
                title: "خريطة حرارية للموازنة",
                year: String(year),
                accountCount: accountMap.length,
                totalBudget,
                totalActual,
                overrunCount,
              },
              items: accountMap.map((a) => ({
                "الحساب": a.code,
                "اسم الحساب": a.name,
                "إجمالي الموازنة": a.totalBudget,
                "إجمالي الفعلي": a.totalActual,
                "الفارق": a.totalBudget - a.totalActual,
                "% الاستخدام": a.totalBudget > 0 ? Math.round((a.totalActual / a.totalBudget) * 100) : 0,
              })),
            }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي الميزانية السنوية</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(totalBudget)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{accountMap.length} بند</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الفعلي حتى الآن</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(totalActual)}</div>
              </CardContent>
            </Card>
            <Card className={totalPct > 100 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {totalPct > 100 ? (
                    <TrendingUp className="w-3 h-3 text-status-danger-foreground" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-status-success-foreground" />
                  )}
                  نسبة الاستهلاك
                </div>
                <div className={`text-xl font-bold tabular-nums ${totalPct > 100 ? "text-status-danger-foreground" : ""}`}>
                  {totalPct.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card className={overrunCount > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-warning-foreground" />
                  خلايا تجاوزت 100%
                </div>
                <div className={`text-xl font-bold tabular-nums ${overrunCount > 0 ? "text-status-warning-foreground" : ""}`}>
                  {overrunCount}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">من {accountMap.length * 12} خلية</div>
              </CardContent>
            </Card>
          </div>

          {/* Legend */}
          <Card className="mb-4">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">دليل الألوان:</span>
                {[0, 50, 80, 100, 120, 150].slice(0, 5).map((p, i) => {
                  const c = colorFor(p + 1);
                  const next = [50, 80, 100, 120, 150][i];
                  return (
                    <div key={p} className="flex items-center gap-1">
                      <span className={`inline-block w-4 h-4 rounded ${c.bg}`} />
                      <span>{p}-{next}%</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1">
                  <span className="inline-block w-4 h-4 rounded bg-red-400" />
                  <span>+150%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Heatmap */}
          {accountMap.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد ميزانية معتمدة لسنة {year}. أنشئ ميزانية من قائمة الميزانية.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Grid3x3 className="w-4 h-4" />
                  المصفوفة — {accountMap.length} بند × 12 شهر
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="text-start py-2 px-2 sticky right-0 bg-background z-20 w-48 min-w-48">الحساب</th>
                        {MONTHS_AR.map((m, i) => (
                          <th key={i} className="text-center py-2 px-1 w-14 min-w-14 text-[11px] font-medium text-muted-foreground">
                            {m.slice(0, 4)}
                          </th>
                        ))}
                        <th className="text-end py-2 px-2 w-28">إجمالي الفعلي</th>
                        <th className="text-end py-2 px-2 w-14">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountMap.map(a => {
                        const yearPct = a.totalBudget > 0 ? (a.totalActual / a.totalBudget) * 100 : 0;
                        const yearColor = colorFor(yearPct);
                        return (
                          <tr key={a.code} className="border-b hover:bg-muted/20">
                            <td className="py-1.5 px-2 sticky right-0 bg-background z-10">
                              <div className="font-mono text-[11px] text-muted-foreground">{a.code}</div>
                              <div className="text-xs font-medium truncate max-w-44" title={a.name}>{a.name}</div>
                            </td>
                            {a.months.map((m, i) => {
                              const c = colorFor(m.pct);
                              const tooltip = m.budget > 0
                                ? `${MONTHS_AR[i]} ${year}\nالميزانية: ${formatCurrency(m.budget)}\nالفعلي: ${formatCurrency(m.actual)}\nالاستخدام: ${m.pct.toFixed(0)}%`
                                : `${MONTHS_AR[i]}: لا ميزانية`;
                              return (
                                <td
                                  key={i}
                                  className={`text-center py-1.5 px-1 ${c.bg}`}
                                  title={tooltip}
                                >
                                  <span className={`text-[11px] font-semibold tabular-nums ${c.text}`}>
                                    {m.budget > 0 ? `${m.pct.toFixed(0)}%` : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-2 text-end tabular-nums font-semibold">
                              {formatCurrency(a.totalActual)}
                            </td>
                            <td className={`py-1.5 px-2 text-end tabular-nums font-bold ${yearColor.text} ${yearColor.bg}`}>
                              {yearPct.toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-muted/40 border-t-2">
                        <td className="py-2 px-2 sticky right-0 bg-muted/40 z-10">الإجمالي</td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const monthBudget = accountMap.reduce((s, a) => s + a.months[i].budget, 0);
                          const monthActual = accountMap.reduce((s, a) => s + a.months[i].actual, 0);
                          const pct = monthBudget > 0 ? (monthActual / monthBudget) * 100 : 0;
                          const c = colorFor(pct);
                          return (
                            <td key={i} className={`text-center py-2 px-1 ${c.bg}`}>
                              <span className={`text-[11px] font-bold ${c.text}`}>
                                {monthBudget > 0 ? `${pct.toFixed(0)}%` : "—"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(totalActual)}</td>
                        <td className="py-2 px-2 text-end tabular-nums">{totalPct.toFixed(0)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
