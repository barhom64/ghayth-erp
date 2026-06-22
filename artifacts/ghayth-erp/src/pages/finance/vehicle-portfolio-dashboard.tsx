import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ParetoMarker, computeParetoCumulative } from "@/components/shared/pareto-marker";
import {
  Car, TrendingUp, TrendingDown, Download, BarChart3,
  ExternalLink, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { formatCurrency, currentYearRiyadh } from "@/lib/formatters";

/**
 * Vehicle Portfolio Dashboard
 *
 * Mirror of Project Portfolio but for fleet vehicles. Lists every
 * active vehicle with revenue/cost/margin from the per-vehicle
 * profitability endpoint. CFO sees which trucks are making money and
 * which are burning it.
 *
 * Endpoints:
 *   GET /fleet/vehicles?status=active
 *   GET /finance/reports/profitability/vehicle/:id (×12 max)
 */

interface Vehicle {
  id: number;
  plateNumber?: string;
  make?: string;
  model?: string;
  status?: string;
  driverName?: string | null;
}
interface VehiclesResp { data: Vehicle[] }

interface ProfitabilityResp {
  vehicleId: number;
  summary: { totalRevenue: number; totalExpense: number; netProfit: number };
}

function vehicleLabel(v: Vehicle): string {
  const parts = [v.plateNumber, v.make, v.model].filter(Boolean);
  return parts.join(" - ") || `مركبة #${v.id}`;
}

export default function VehiclePortfolioDashboardPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: vehiclesData, isLoading: vLoading } = useApiQuery<VehiclesResp>(
    ["veh-portfolio-list"],
    `/fleet/vehicles?status=active`,
  );

  const vehicles = (vehiclesData?.data ?? []).slice(0, 12);
  const ids = vehicles.map(v => v.id);

  const q0 = useApiQuery<ProfitabilityResp>(["vp", String(ids[0] ?? ""), String(year)], ids[0] ? `/finance/reports/profitability/vehicle/${ids[0]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q1 = useApiQuery<ProfitabilityResp>(["vp", String(ids[1] ?? ""), String(year)], ids[1] ? `/finance/reports/profitability/vehicle/${ids[1]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q2 = useApiQuery<ProfitabilityResp>(["vp", String(ids[2] ?? ""), String(year)], ids[2] ? `/finance/reports/profitability/vehicle/${ids[2]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q3 = useApiQuery<ProfitabilityResp>(["vp", String(ids[3] ?? ""), String(year)], ids[3] ? `/finance/reports/profitability/vehicle/${ids[3]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q4 = useApiQuery<ProfitabilityResp>(["vp", String(ids[4] ?? ""), String(year)], ids[4] ? `/finance/reports/profitability/vehicle/${ids[4]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q5 = useApiQuery<ProfitabilityResp>(["vp", String(ids[5] ?? ""), String(year)], ids[5] ? `/finance/reports/profitability/vehicle/${ids[5]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q6 = useApiQuery<ProfitabilityResp>(["vp", String(ids[6] ?? ""), String(year)], ids[6] ? `/finance/reports/profitability/vehicle/${ids[6]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q7 = useApiQuery<ProfitabilityResp>(["vp", String(ids[7] ?? ""), String(year)], ids[7] ? `/finance/reports/profitability/vehicle/${ids[7]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q8 = useApiQuery<ProfitabilityResp>(["vp", String(ids[8] ?? ""), String(year)], ids[8] ? `/finance/reports/profitability/vehicle/${ids[8]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q9 = useApiQuery<ProfitabilityResp>(["vp", String(ids[9] ?? ""), String(year)], ids[9] ? `/finance/reports/profitability/vehicle/${ids[9]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q10 = useApiQuery<ProfitabilityResp>(["vp", String(ids[10] ?? ""), String(year)], ids[10] ? `/finance/reports/profitability/vehicle/${ids[10]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q11 = useApiQuery<ProfitabilityResp>(["vp", String(ids[11] ?? ""), String(year)], ids[11] ? `/finance/reports/profitability/vehicle/${ids[11]}?startDate=${startDate}&endDate=${endDate}` : null);

  const queries = [q0, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11];
  const isLoading = vLoading || queries.some(q => q.isLoading);

  const portfolio = useMemo(() => {
    return vehicles.map((v, i) => {
      const d = queries[i]?.data;
      const revenue = d?.summary?.totalRevenue ?? 0;
      const expense = d?.summary?.totalExpense ?? 0;
      const profit = revenue - expense;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { ...v, revenue, expense, profit, margin, label: vehicleLabel(v) };
    });
  }, [vehicles, ...queries.map(q => q.data)]);

  const totals = useMemo(() => portfolio.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      expense: acc.expense + p.expense,
      profit: acc.profit + p.profit,
    }),
    { revenue: 0, expense: 0, profit: 0 }
  ), [portfolio]);

  const portfolioMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const winners = portfolio.filter(p => p.profit > 0).length;
  const losers = portfolio.filter(p => p.profit < 0).length;
  const sorted = portfolio.slice().sort((a, b) => b.profit - a.profit);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const maxAbsProfit = Math.max(...portfolio.map(p => Math.abs(p.profit)), 1);

  // Pareto cumulative on |profit| — the sorted list is profit-DESC, so
  // the first row's cumulative is its share alone; each subsequent row
  // adds its absolute contribution to the running total. The crown
  // marks the FIRST row that crosses 80% — the operational insight is
  // "this row + everything above accounts for 80% of total profit
  // magnitude; the rest is the long tail."
  const { cumulativePcts, thresholdIdx } = computeParetoCumulative(
    sorted.map((p) => p.profit),
    80,
  );

  // Detail-table rows: carry the profit-DESC rank and the precomputed Pareto
  // cumulative on each row so the "#" and "حصة تراكمية" columns stay correct
  // regardless of any header re-sort; constant group key enables the
  // grand-total footer row in DataTable.
  const tableRows = sorted.map((p, idx) => ({
    ...p,
    rank: idx + 1,
    cumulativePct: cumulativePcts[idx] ?? 0,
    isThresholdRow: idx === thresholdIdx,
  }));

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`محفظة المركبات — ${year}`);
    lines.push("");
    lines.push("اللوحة,الصنف,السائق,الإيرادات,المصاريف,الربح,الهامش %");
    for (const p of sorted) {
      lines.push([
        p.plateNumber ?? "",
        `${p.make ?? ""} ${p.model ?? ""}`.trim().replace(/,/g, "،"),
        (p.driverName ?? "").replace(/,/g, "،"),
        p.revenue.toFixed(2),
        p.expense.toFixed(2),
        p.profit.toFixed(2),
        `${p.margin.toFixed(1)}%`,
      ].join(","));
    }
    lines.push("");
    lines.push(`الإجمالي,,,${totals.revenue.toFixed(2)},${totals.expense.toFixed(2)},${totals.profit.toFixed(2)},${portfolioMargin.toFixed(1)}%`);
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
        entityType: "report_vehicle_portfolio_dashboard",
        title: String(`vehicle-portfolio-${year}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="لوحة محفظة المركبات"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "لوحة محفظة المركبات" },
      ]}
      subtitle={`ربحية كل مركبة نشطة في ${year} — حدد المركبات الرابحة من الخاسرة`}
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-end gap-3">
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
            entityType="report_vehicle_portfolio"
            entityId="all"
            payload={{
              entity: {
                title: "محفظة الأسطول — لوحة التحكم",
                vehicleCount: vehicles.length,
              },
              items: vehicles,
            }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا مركبات نشطة (عرض أعلى 12).
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Car className="w-3 h-3" />
                  مركبات نشطة
                </div>
                <div className="text-2xl font-bold tabular-nums">{portfolio.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {winners} رابحة • {losers} خاسرة
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-status-success-foreground" />
                  إيرادات الأسطول
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-success-foreground">
                  {formatCurrency(totals.revenue)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  مصاريف الأسطول
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(totals.expense)}
                </div>
              </CardContent>
            </Card>
            <Card className={portfolioMargin >= 0 ? "border-status-success-foreground" : "border-status-danger-foreground border-2"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <BarChart3 className={`w-3 h-3 ${portfolioMargin >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`} />
                  هامش الأسطول
                </div>
                <div className={`text-2xl font-bold tabular-nums ${portfolioMargin >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                  {portfolioMargin.toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  ربح {formatCurrency(totals.profit)}
                </div>
              </CardContent>
            </Card>
          </div>

          {best && worst && best.id !== worst.id && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <Card className="border-status-success-foreground">
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-status-success-foreground" />
                    أفضل مركبة
                  </div>
                  <div className="font-semibold">{best.label}</div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-muted-foreground">{best.driverName ?? "—"}</span>
                    <span className="text-status-success-foreground font-bold tabular-nums">
                      {best.margin.toFixed(1)}% • +{formatCurrency(best.profit)}
                    </span>
                  </div>
                </CardContent>
              </Card>
              {worst.profit < 0 && (
                <Card className="border-status-danger-foreground">
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                      أسوأ مركبة
                    </div>
                    <div className="font-semibold">{worst.label}</div>
                    <div className="flex items-center justify-between mt-1 text-sm">
                      <span className="text-muted-foreground">{worst.driverName ?? "—"}</span>
                      <span className="text-status-danger-foreground font-bold tabular-nums">
                        {worst.margin.toFixed(1)}% • {formatCurrency(worst.profit)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                ربح/خسارة كل مركبة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sorted.map(p => {
                  const barPct = (Math.abs(p.profit) / maxAbsProfit) * 100;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <Car className="w-3 h-3 text-muted-foreground" />
                          <span className="truncate font-medium">{p.label}</span>
                          {p.driverName && (
                            <span className="text-muted-foreground truncate text-[10px]">— {p.driverName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`tabular-nums ${p.profit >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                            {p.profit >= 0 ? "+" : ""}{formatCurrency(p.profit)}
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${p.margin >= 20 ? "text-status-success-foreground" : p.margin >= 0 ? "text-status-info-foreground" : "text-status-danger-foreground"}`}>
                            {p.margin.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div
                          className={p.profit >= 0 ? "bg-status-success-foreground h-full" : "bg-status-danger-foreground h-full"}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الجدول التفصيلي ({portfolio.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                data={tableRows}
                rowKey={(p) => p.id}
                noToolbar
                pageSize={0}                columns={[
                  {
                    key: "rank",
                    header: "#",
                    width: "3rem",
                    sortable: false,
                    render: (p) => <span className="text-muted-foreground">{p.rank}</span>,
                  },
                  {
                    key: "label",
                    header: "المركبة",
                    render: (p) => <span className="font-medium">{p.label}</span>,
                  },
                  {
                    key: "driverName",
                    header: "السائق",
                    className: "text-xs text-muted-foreground",
                    render: (p) => p.driverName ?? "—",
                  },
                  {
                    key: "revenue",
                    header: "الإيرادات",
                    align: "end",
                    ltr: true,
                    className: "tabular-nums",
                    render: (p) => formatCurrency(p.revenue),
                  },
                  {
                    key: "expense",
                    header: "المصاريف",
                    align: "end",
                    ltr: true,
                    className: "tabular-nums text-status-danger-foreground",
                    render: (p) => formatCurrency(p.expense),
                  },
                  {
                    key: "profit",
                    header: "الربح",
                    align: "end",
                    ltr: true,
                    className: "tabular-nums font-semibold",
                    render: (p) => (
                      <span className={p.profit >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}>
                        {p.profit >= 0 ? "+" : ""}{formatCurrency(p.profit)}
                      </span>
                    ),
                  },
                  {
                    key: "margin",
                    header: "الهامش",
                    align: "end",
                    width: "5rem",
                    ltr: true,
                    className: "tabular-nums font-bold",
                    render: (p) => (
                      <span className={p.margin >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}>
                        {p.margin.toFixed(1)}%
                      </span>
                    ),
                  },
                  {
                    key: "cumulativePct",
                    header: "حصة تراكمية",
                    width: "6rem",
                    sortable: false,
                    render: (p) => (
                      <ParetoMarker
                        cumulativePct={p.cumulativePct}
                        isThresholdRow={p.isThresholdRow}
                        testidPrefix={`vehicle-portfolio-pareto-${p.id}`}
                      />
                    ),
                  },
                  {
                    key: "_actions",
                    header: "",
                    width: "2rem",
                    sortable: false,
                    render: (p) => (
                      <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7">
                        <Link href={`/fleet/${p.id}`}><ExternalLink className="w-3 h-3" /></Link>
                      </Button>
                    ),
                  },
                ] satisfies DataTableColumn<typeof tableRows[number]>[]}
                renderGrandTotal={() => (
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td colSpan={3} className="py-0 px-2">الإجمالي</td>
                        <td className="py-0 px-2 text-end tabular-nums" dir="ltr">{formatCurrency(totals.revenue)}</td>
                        <td className="py-0 px-2 text-end tabular-nums text-status-danger-foreground" dir="ltr">{formatCurrency(totals.expense)}</td>
                        <td className={`py-0 px-2 text-end tabular-nums ${totals.profit >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`} dir="ltr">
                          {totals.profit >= 0 ? "+" : ""}{formatCurrency(totals.profit)}
                        </td>
                        <td className="py-0 px-2 text-end tabular-nums" dir="ltr">{portfolioMargin.toFixed(1)}%</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
