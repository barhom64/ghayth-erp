import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  TrendingUp, TrendingDown, Download, BarChart3, Activity,
  Layers, PieChart, ChevronRight, Briefcase,
} from "lucide-react";
import {
  formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Revenue Mix Analyzer
 *
 * Combines two endpoints to give a full picture of revenue composition:
 *   1. By account (revenue line items, e.g. "Vehicle Rental Revenue")
 *   2. By activity type (transport / property / umrah / other)
 *
 * Shows top contributors, concentration risk (top 3 share), trend
 * (collected vs invoiced by month).
 *
 * Endpoints:
 *   GET /finance/reports/revenue-analysis?startDate&endDate
 *   GET /finance/reports/revenue-by-activity-type?startDate&endDate
 */

interface ByAccountRow {
  code: string;
  name: string;
  amount: number | string;
  entryCount: number | string;
}
interface ByMonthRow {
  period: string;
  collected: number | string;
  invoiced: number | string;
  invoiceCount: number | string;
}
interface RevenueAnalysisResp {
  byAccount: ByAccountRow[];
  byMonth: ByMonthRow[];
  summary: { totalRevenue: number; accountCount: number };
}

interface ActivityRow {
  activityType: string;
  revenue: number | string;
  entryCount: number | string;
}
interface ActivityResp {
  rows: ActivityRow[];
  summary: { totalRevenue: number };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const ACTIVITY_COLORS: Record<string, string> = {
  transport: "bg-status-info-foreground",
  property: "bg-status-success-foreground",
  umrah: "bg-status-warning-foreground",
  other: "bg-muted-foreground",
};
const ACTIVITY_LABELS: Record<string, string> = {
  transport: "نقل",
  property: "عقارات",
  umrah: "عمرة",
  other: "أخرى",
};

export default function RevenueMixAnalyzerPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [scope, setScope] = useState<"month" | "quarter" | "ytd">("ytd");

  const { startDate, endDate, label } = useMemo(() => {
    const m = Number(month);
    const lastDay = daysInMonth(year, m);
    const ed = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    if (scope === "month") return { startDate: `${year}-${month}-01`, endDate: ed, label: `${month}/${year}` };
    if (scope === "quarter") {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { startDate: `${year}-${String(qStart).padStart(2, "0")}-01`, endDate: ed, label: `Q${Math.floor((m - 1) / 3) + 1} ${year}` };
    }
    return { startDate: `${year}-01-01`, endDate: ed, label: `${year} حتى ${month}` };
  }, [year, month, scope]);

  const ra = useApiQuery<RevenueAnalysisResp>(
    ["rev-mix-acc", String(year), month, scope],
    `/finance/reports/revenue-analysis?startDate=${startDate}&endDate=${endDate}`,
  );

  const act = useApiQuery<ActivityResp>(
    ["rev-mix-act", String(year), month, scope],
    `/finance/reports/revenue-by-activity-type?startDate=${startDate}&endDate=${endDate}`,
  );

  const totalRevenue = ra.data?.summary?.totalRevenue ?? 0;
  const accountCount = ra.data?.summary?.accountCount ?? 0;

  const top3Share = useMemo(() => {
    const rows = ra.data?.byAccount ?? [];
    if (rows.length === 0 || totalRevenue === 0) return 0;
    const top3 = rows.slice(0, 3).reduce((s, r) => s + Number(r.amount), 0);
    return (top3 / totalRevenue) * 100;
  }, [ra.data, totalRevenue]);

  const collectionRate = useMemo(() => {
    const months = ra.data?.byMonth ?? [];
    const totInvoiced = months.reduce((s, m) => s + Number(m.invoiced), 0);
    const totCollected = months.reduce((s, m) => s + Number(m.collected), 0);
    return totInvoiced > 0 ? (totCollected / totInvoiced) * 100 : 0;
  }, [ra.data]);

  const exportCSV = () => {
    if (!ra.data) return;
    const lines: string[] = [];
    lines.push(`تحليل مزيج الإيرادات — ${label}`);
    lines.push("");
    lines.push("حسب الحساب");
    lines.push("الرمز,الاسم,المبلغ,%,عدد القيود");
    for (const r of ra.data.byAccount ?? []) {
      const pct = totalRevenue > 0 ? (Number(r.amount) / totalRevenue) * 100 : 0;
      lines.push([
        r.code,
        (r.name ?? "").replace(/,/g, "،"),
        Number(r.amount).toFixed(2),
        `${pct.toFixed(1)}%`,
        String(r.entryCount),
      ].join(","));
    }
    lines.push("");
    lines.push("حسب النشاط");
    lines.push("النشاط,الإيرادات,%");
    for (const a of act.data?.rows ?? []) {
      const pct = (act.data?.summary.totalRevenue ?? 0) > 0
        ? (Number(a.revenue) / (act.data?.summary.totalRevenue ?? 1)) * 100
        : 0;
      lines.push([
        ACTIVITY_LABELS[a.activityType] ?? a.activityType,
        Number(a.revenue).toFixed(2),
        `${pct.toFixed(1)}%`,
      ].join(","));
    }

    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-mix-${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxAccount = Math.max(...(ra.data?.byAccount ?? []).map(r => Number(r.amount)), 1);
  const maxMonth = Math.max(...(ra.data?.byMonth ?? []).map(m => Number(m.invoiced)), 1);

  return (
    <PageShell
      title="محلل مزيج الإيرادات"
      subtitle="من أين يأتي دخلنا؟ تركيز / تنويع / مسار التحصيل"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
            <div className="flex gap-1">
              <Button variant={scope === "month" ? "default" : "outline"} size="sm" onClick={() => setScope("month")}>شهر</Button>
              <Button variant={scope === "quarter" ? "default" : "outline"} size="sm" onClick={() => setScope("quarter")}>ربع</Button>
              <Button variant={scope === "ytd" ? "default" : "outline"} size="sm" onClick={() => setScope("ytd")}>حتى تاريخه</Button>
            </div>
          </div>
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
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            >
              {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!ra.data}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
        </CardContent>
      </Card>

      {ra.isLoading || act.isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-status-success-foreground" />
                  إجمالي الإيرادات
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-success-foreground">
                  {formatCurrency(totalRevenue)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  حسابات نشطة
                </div>
                <div className="text-2xl font-bold tabular-nums">{accountCount}</div>
                <div className="text-[11px] text-muted-foreground mt-1">مصادر دخل</div>
              </CardContent>
            </Card>
            <Card className={top3Share > 80 ? "border-status-warning-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <PieChart className={`w-3 h-3 ${top3Share > 80 ? "text-status-warning-foreground" : ""}`} />
                  تركّز أعلى 3
                </div>
                <div className={`text-2xl font-bold tabular-nums ${top3Share > 80 ? "text-status-warning-foreground" : ""}`}>
                  {top3Share.toFixed(0)}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {top3Share > 80 ? "تركّز عالٍ" : "تنويع جيد"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  معدل التحصيل
                </div>
                <div className="text-2xl font-bold tabular-nums">{collectionRate.toFixed(1)}%</div>
                <div className="text-[11px] text-muted-foreground mt-1">مُحصَّل من المُفوتر</div>
              </CardContent>
            </Card>
          </div>

          {/* Activity mix */}
          {(act.data?.rows ?? []).length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  المزيج حسب النشاط
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Stacked bar */}
                <div className="flex h-8 rounded overflow-hidden text-[11px] text-white mb-3">
                  {(act.data?.rows ?? []).map(a => {
                    const value = Number(a.revenue);
                    const totalAct = act.data?.summary?.totalRevenue ?? 1;
                    const pct = (value / totalAct) * 100;
                    if (value <= 0 || pct < 0.1) return null;
                    return (
                      <div
                        key={a.activityType}
                        className={`${ACTIVITY_COLORS[a.activityType] ?? "bg-muted-foreground"} flex items-center justify-center px-2`}
                        style={{ width: `${pct}%` }}
                        title={`${ACTIVITY_LABELS[a.activityType] ?? a.activityType}: ${formatCurrency(value)} (${pct.toFixed(1)}%)`}
                      >
                        {pct > 8 && (
                          <span>{ACTIVITY_LABELS[a.activityType] ?? a.activityType} {pct.toFixed(0)}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(act.data?.rows ?? []).map(a => {
                    const value = Number(a.revenue);
                    const totalAct = act.data?.summary?.totalRevenue ?? 1;
                    const pct = (value / totalAct) * 100;
                    return (
                      <div key={a.activityType} className="border rounded p-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <span className={`inline-block w-2 h-2 rounded ${ACTIVITY_COLORS[a.activityType] ?? "bg-muted-foreground"}`} />
                          {ACTIVITY_LABELS[a.activityType] ?? a.activityType}
                        </div>
                        <div className="font-bold tabular-nums">{formatCurrency(value)}</div>
                        <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* By account */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  أعلى مصادر الإيرادات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(ra.data?.byAccount ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">لا إيرادات</div>
                ) : (
                  <div className="space-y-2">
                    {(ra.data?.byAccount ?? []).slice(0, 10).map((r, idx) => {
                      const value = Number(r.amount);
                      const pct = totalRevenue > 0 ? (value / totalRevenue) * 100 : 0;
                      const barPct = (value / maxAccount) * 100;
                      return (
                        <div key={r.code}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="font-mono text-[10px]">{idx + 1}</Badge>
                              <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span>
                              <span className="truncate max-w-48">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold tabular-nums">{formatCurrency(value)}</span>
                              <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded overflow-hidden">
                            <div
                              className="bg-status-success-foreground h-full"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By month trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  الفواتير والتحصيل شهرياً
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(ra.data?.byMonth ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">لا بيانات شهرية</div>
                ) : (
                  <div className="space-y-2">
                    {(ra.data?.byMonth ?? []).slice(-12).map(m => {
                      const invoiced = Number(m.invoiced);
                      const collected = Number(m.collected);
                      const colRate = invoiced > 0 ? (collected / invoiced) * 100 : 0;
                      const barPct = (invoiced / maxMonth) * 100;
                      return (
                        <div key={m.period}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-mono">{m.period}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{m.invoiceCount} فاتورة</span>
                              <span className="tabular-nums">{formatCurrency(invoiced)}</span>
                              <Badge variant="outline" className={`text-[10px] ${colRate >= 80 ? "text-status-success-foreground" : colRate >= 50 ? "text-status-warning-foreground" : "text-status-danger-foreground"}`}>
                                {colRate.toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                          <div className="h-3 bg-muted rounded overflow-hidden relative">
                            <div
                              className="bg-status-info-foreground absolute top-0 left-0 h-full opacity-30"
                              style={{ width: `${barPct}%` }}
                            />
                            <div
                              className="bg-status-success-foreground absolute top-0 left-0 h-full"
                              style={{ width: `${(collected / maxMonth) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Full account table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">كامل قائمة الحسابات الإيرادية</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={ra.data?.byAccount ?? []}
                rowKey={(r) => r.code}
                columns={[
                  {
                    key: "_idx", header: "#", width: "3rem", sortable: false,
                    render: (_r, idx) => <span className="text-muted-foreground">{idx + 1}</span>,
                    footer: () => "الإجمالي",
                  },
                  {
                    key: "code", header: "الرمز", width: "6rem", searchable: true, ltr: true,
                    render: (r) => <span className="font-mono text-xs">{r.code}</span>,
                  },
                  { key: "name", header: "الاسم", searchable: true },
                  {
                    key: "amount", header: "المبلغ", align: "end",
                    render: (r) => (
                      <span className="tabular-nums font-semibold">{formatCurrency(Number(r.amount))}</span>
                    ),
                    footer: () => <span className="tabular-nums">{formatCurrency(totalRevenue)}</span>,
                  },
                  {
                    key: "_pct", header: "%", align: "end", width: "5rem", sortable: false,
                    render: (r) => {
                      const pct = totalRevenue > 0 ? (Number(r.amount) / totalRevenue) * 100 : 0;
                      return <span className="tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>;
                    },
                    footer: () => "100%",
                  },
                  {
                    key: "entryCount", header: "قيود", align: "end", width: "5rem",
                    render: (r) => <span className="tabular-nums">{String(r.entryCount)}</span>,
                  },
                ] satisfies DataTableColumn<ByAccountRow>[]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
