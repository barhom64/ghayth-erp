import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Home, TrendingUp, TrendingDown, Download, BarChart3,
  ExternalLink, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { formatCurrency, currentYearRiyadh } from "@/lib/formatters";

/**
 * Property Portfolio Dashboard
 *
 * Third member of the portfolio trio (projects, vehicles, properties).
 * Lists every property building with revenue/cost/margin and occupancy
 * from the buildings list + per-property profitability endpoint.
 *
 * Endpoints:
 *   GET /properties/buildings
 *   GET /finance/reports/profitability/property/:id (×12 max)
 */

interface Building {
  id: number;
  name: string;
  address?: string;
  city?: string;
  totalUnits?: number;
  rentedUnits?: number;
  availableUnits?: number;
  totalRevenue?: number | string;
}
interface BuildingsResp { data: Building[] }

interface ProfitabilityResp {
  propertyId: number;
  summary: { totalRevenue: number; totalExpense: number; netProfit: number };
}

export default function PropertyPortfolioDashboardPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data: buildingsData, isLoading: bLoading } = useApiQuery<BuildingsResp>(
    ["prop-portfolio-list"],
    `/properties/buildings`,
  );

  const buildings = (buildingsData?.data ?? []).slice(0, 12);
  const ids = buildings.map(b => b.id);

  const q0 = useApiQuery<ProfitabilityResp>(["pr", String(ids[0] ?? ""), String(year)], ids[0] ? `/finance/reports/profitability/property/${ids[0]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q1 = useApiQuery<ProfitabilityResp>(["pr", String(ids[1] ?? ""), String(year)], ids[1] ? `/finance/reports/profitability/property/${ids[1]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q2 = useApiQuery<ProfitabilityResp>(["pr", String(ids[2] ?? ""), String(year)], ids[2] ? `/finance/reports/profitability/property/${ids[2]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q3 = useApiQuery<ProfitabilityResp>(["pr", String(ids[3] ?? ""), String(year)], ids[3] ? `/finance/reports/profitability/property/${ids[3]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q4 = useApiQuery<ProfitabilityResp>(["pr", String(ids[4] ?? ""), String(year)], ids[4] ? `/finance/reports/profitability/property/${ids[4]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q5 = useApiQuery<ProfitabilityResp>(["pr", String(ids[5] ?? ""), String(year)], ids[5] ? `/finance/reports/profitability/property/${ids[5]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q6 = useApiQuery<ProfitabilityResp>(["pr", String(ids[6] ?? ""), String(year)], ids[6] ? `/finance/reports/profitability/property/${ids[6]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q7 = useApiQuery<ProfitabilityResp>(["pr", String(ids[7] ?? ""), String(year)], ids[7] ? `/finance/reports/profitability/property/${ids[7]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q8 = useApiQuery<ProfitabilityResp>(["pr", String(ids[8] ?? ""), String(year)], ids[8] ? `/finance/reports/profitability/property/${ids[8]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q9 = useApiQuery<ProfitabilityResp>(["pr", String(ids[9] ?? ""), String(year)], ids[9] ? `/finance/reports/profitability/property/${ids[9]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q10 = useApiQuery<ProfitabilityResp>(["pr", String(ids[10] ?? ""), String(year)], ids[10] ? `/finance/reports/profitability/property/${ids[10]}?startDate=${startDate}&endDate=${endDate}` : null);
  const q11 = useApiQuery<ProfitabilityResp>(["pr", String(ids[11] ?? ""), String(year)], ids[11] ? `/finance/reports/profitability/property/${ids[11]}?startDate=${startDate}&endDate=${endDate}` : null);

  const queries = [q0, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11];
  const isLoading = bLoading || queries.some(q => q.isLoading);

  const portfolio = useMemo(() => {
    return buildings.map((b, i) => {
      const d = queries[i]?.data;
      const revenue = d?.summary?.totalRevenue ?? 0;
      const expense = d?.summary?.totalExpense ?? 0;
      const profit = revenue - expense;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const occRate = (b.totalUnits ?? 0) > 0
        ? ((Number(b.rentedUnits ?? 0)) / Number(b.totalUnits ?? 1)) * 100
        : 0;
      return { ...b, revenue, expense, profit, margin, occRate };
    });
  }, [buildings, ...queries.map(q => q.data)]);

  const totals = useMemo(() => portfolio.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      expense: acc.expense + p.expense,
      profit: acc.profit + p.profit,
      totalUnits: acc.totalUnits + Number(p.totalUnits ?? 0),
      rentedUnits: acc.rentedUnits + Number(p.rentedUnits ?? 0),
    }),
    { revenue: 0, expense: 0, profit: 0, totalUnits: 0, rentedUnits: 0 }
  ), [portfolio]);

  const portfolioMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const portfolioOccRate = totals.totalUnits > 0 ? (totals.rentedUnits / totals.totalUnits) * 100 : 0;
  const winners = portfolio.filter(p => p.profit > 0).length;
  const losers = portfolio.filter(p => p.profit < 0).length;
  const sorted = portfolio.slice().sort((a, b) => b.profit - a.profit);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const maxAbsProfit = Math.max(...portfolio.map(p => Math.abs(p.profit)), 1);

  // Detail-table rows: carry the profit-DESC rank so "#" stays the portfolio
  // rank regardless of any header re-sort.
  const tableRows = sorted.map((p, idx) => ({ ...p, rank: idx + 1 }));

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`محفظة العقارات — ${year}`);
    lines.push("");
    lines.push("العقار,العنوان,المدينة,إجمالي وحدات,مؤجرة,نسبة إشغال,الإيرادات,المصاريف,الربح,الهامش %");
    for (const p of sorted) {
      lines.push([
        p.name.replace(/,/g, "،"),
        (p.address ?? "").replace(/,/g, "،"),
        p.city ?? "",
        String(p.totalUnits ?? 0),
        String(p.rentedUnits ?? 0),
        `${p.occRate.toFixed(1)}%`,
        p.revenue.toFixed(2),
        p.expense.toFixed(2),
        p.profit.toFixed(2),
        `${p.margin.toFixed(1)}%`,
      ].join(","));
    }
    lines.push("");
    lines.push(`الإجمالي,,,${totals.totalUnits},${totals.rentedUnits},${portfolioOccRate.toFixed(1)}%,${totals.revenue.toFixed(2)},${totals.expense.toFixed(2)},${totals.profit.toFixed(2)},${portfolioMargin.toFixed(1)}%`);
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `property-portfolio-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="لوحة محفظة العقارات"
      subtitle={`ربحية كل عقار في ${year} — إيرادات إيجار، صيانة، إشغال`}
    >
      <FinanceTabsNav />

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
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : buildings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لا عقارات (عرض أعلى 12).
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  عقارات
                </div>
                <div className="text-2xl font-bold tabular-nums">{portfolio.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {winners} رابح • {losers} خاسر
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-status-success-foreground" />
                  إيرادات
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
                  مصاريف
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(totals.expense)}
                </div>
              </CardContent>
            </Card>
            <Card className={portfolioOccRate >= 80 ? "border-status-success-foreground" : portfolioOccRate >= 50 ? "border-status-warning-foreground" : "border-status-danger-foreground"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />
                  نسبة الإشغال
                </div>
                <div className={`text-2xl font-bold tabular-nums ${portfolioOccRate >= 80 ? "text-status-success-foreground" : portfolioOccRate >= 50 ? "text-status-warning-foreground" : "text-status-danger-foreground"}`}>
                  {portfolioOccRate.toFixed(1)}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {totals.rentedUnits} / {totals.totalUnits} وحدة
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
                    أفضل عقار
                  </div>
                  <div className="font-semibold">{best.name}</div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-muted-foreground">{best.city ?? ""}</span>
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
                      أسوأ عقار
                    </div>
                    <div className="font-semibold">{worst.name}</div>
                    <div className="flex items-center justify-between mt-1 text-sm">
                      <span className="text-muted-foreground">{worst.city ?? ""}</span>
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
                ربح/خسارة كل عقار
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
                          <Home className="w-3 h-3 text-muted-foreground" />
                          <span className="truncate font-medium">{p.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {p.rentedUnits}/{p.totalUnits}
                          </Badge>
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
                pageSize={0}
                columns={[
                  {
                    key: "rank",
                    header: "#",
                    width: "3rem",
                    sortable: false,
                    render: (p) => <span className="text-muted-foreground">{p.rank}</span>,
                  },
                  {
                    key: "name",
                    header: "العقار",
                    render: (p) => <span className="font-medium">{p.name}</span>,
                    footer: () => "الإجمالي",
                  },
                  {
                    key: "city",
                    header: "المدينة",
                    className: "text-xs text-muted-foreground",
                    render: (p) => p.city ?? "—",
                  },
                  {
                    key: "occRate",
                    header: "إشغال",
                    align: "end",
                    width: "5rem",
                    ltr: true,
                    className: "tabular-nums",
                    render: (p) => (p.totalUnits ? `${p.rentedUnits ?? 0}/${p.totalUnits}` : "—"),
                    footer: () => `${totals.rentedUnits}/${totals.totalUnits}`,
                  },
                  {
                    key: "revenue",
                    header: "الإيرادات",
                    align: "end",
                    ltr: true,
                    className: "tabular-nums",
                    render: (p) => formatCurrency(p.revenue),
                    footer: () => formatCurrency(totals.revenue),
                  },
                  {
                    key: "expense",
                    header: "المصاريف",
                    align: "end",
                    ltr: true,
                    className: "tabular-nums text-status-danger-foreground",
                    render: (p) => formatCurrency(p.expense),
                    footer: () => formatCurrency(totals.expense),
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
                    footer: () => (
                      <span className={totals.profit >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}>
                        {totals.profit >= 0 ? "+" : ""}{formatCurrency(totals.profit)}
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
                    footer: () => `${portfolioMargin.toFixed(1)}%`,
                  },
                  {
                    key: "_actions",
                    header: "",
                    width: "2rem",
                    sortable: false,
                    render: (p) => (
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                        <Link href={`/properties/buildings/${p.id}`}>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </Button>
                    ),
                  },
                ] satisfies DataTableColumn<typeof tableRows[number]>[]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
