import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  TrendingDown, Download, BarChart3, Layers, PieChart,
  Building2, Users, Receipt,
} from "lucide-react";
import {
  formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Expense Mix Analyzer
 *
 * Same data, three lenses: by account / by branch / by employee.
 * Top 10 contributors per lens, concentration ratio, full table with
 * CSV export. Server-side groupBy parameter.
 *
 * Endpoint: GET /finance/reports/expenses-analysis?startDate&endDate&groupBy=account|branch|employee
 */

interface Row {
  key: string | number;
  label: string;
  amount: number | string;
  entryCount: number | string;
}
interface Resp {
  data: Row[];
  summary: { total: number; count: number; groupBy: string };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const LENSES: Array<{ id: "account" | "branch" | "employee"; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "account", label: "حسب الحساب", icon: Receipt },
  { id: "branch", label: "حسب الفرع", icon: Building2 },
  { id: "employee", label: "حسب الموظف", icon: Users },
];

export default function ExpenseMixAnalyzerPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [scope, setScope] = useState<"month" | "quarter" | "ytd">("ytd");
  const [lens, setLens] = useState<"account" | "branch" | "employee">("account");

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

  const { data, isLoading } = useApiQuery<Resp>(
    ["exp-mix", String(year), month, scope, lens],
    `/finance/reports/expenses-analysis?startDate=${startDate}&endDate=${endDate}&groupBy=${lens}`,
  );

  const total = data?.summary?.total ?? 0;
  const rows = data?.data ?? [];

  const top3Share = useMemo(() => {
    if (rows.length === 0 || total === 0) return 0;
    const top3 = rows.slice(0, 3).reduce((s, r) => s + Number(r.amount), 0);
    return (top3 / total) * 100;
  }, [rows, total]);

  const maxAmount = Math.max(...rows.map(r => Number(r.amount)), 1);

  // Full-list table columns. Leading label columns are CONDITIONAL on `lens`:
  // when lens==="account" there are 3 leading cols (#, الرمز, الاسم), else 2
  // (#, الاسم) — so the array is built dynamically. The footer total row is
  // expressed column-aligned via `footer` (الإجمالي under #, total under المبلغ,
  // 100% under %). Rows are rank-ordered (bars) → every column sortable:false.
  const fullTableColumns = useMemo<DataTableColumn<Row>[]>(() => {
    const cols: DataTableColumn<Row>[] = [];
    cols.push({
      key: "rank",
      header: "#",
      sortable: false,
      width: "3rem",
      className: "py-1.5 px-2 text-muted-foreground",
      render: (_r, idx) => idx + 1,
      footer: () => "الإجمالي",
    });
    if (lens === "account") {
      cols.push({
        key: "code",
        header: "الرمز",
        sortable: false,
        width: "6rem",
        className: "py-1.5 px-2 font-mono text-xs",
        render: (r) => r.key,
      });
    }
    cols.push({
      key: "label",
      header: "الاسم",
      sortable: false,
      className: "py-1.5 px-2",
      render: (r) => r.label,
    });
    cols.push({
      key: "amount",
      header: "المبلغ",
      sortable: false,
      align: "end",
      className: "py-1.5 px-2 text-end tabular-nums font-semibold",
      render: (r) => formatCurrency(Number(r.amount)),
      footer: () => formatCurrency(total),
    });
    cols.push({
      key: "percent",
      header: "%",
      sortable: false,
      align: "end",
      width: "5rem",
      className: "py-1.5 px-2 text-end tabular-nums text-muted-foreground",
      render: (r) => `${(total > 0 ? (Number(r.amount) / total) * 100 : 0).toFixed(1)}%`,
      footer: () => "100%",
    });
    cols.push({
      key: "entryCount",
      header: "قيود",
      sortable: false,
      align: "end",
      width: "5rem",
      className: "py-1.5 px-2 text-end tabular-nums",
      render: (r) => String(r.entryCount),
    });
    return cols;
  }, [lens, total]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`تحليل المصاريف — ${label} — حسب ${LENSES.find(l => l.id === lens)?.label}`);
    lines.push("");
    lines.push("الرتبة,المفتاح,الاسم,المبلغ,%,عدد القيود");
    rows.forEach((r, i) => {
      const pct = total > 0 ? (Number(r.amount) / total) * 100 : 0;
      lines.push([
        String(i + 1),
        String(r.key),
        (r.label ?? "").replace(/,/g, "،"),
        Number(r.amount).toFixed(2),
        `${pct.toFixed(1)}%`,
        String(r.entryCount),
      ].join(","));
    });
    lines.push("");
    lines.push(`الإجمالي,,,${total.toFixed(2)},100%`);

    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-mix-${lens}-${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="محلل مزيج المصاريف"
      subtitle="نفس البيانات بـ 3 عدسات: حساب / فرع / موظف"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العدسة</label>
              <div className="flex gap-1">
                {LENSES.map(l => {
                  const Icon = l.icon;
                  return (
                    <Button
                      key={l.id}
                      variant={lens === l.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLens(l.id)}
                    >
                      <Icon className="w-3 h-3 ml-1" />
                      {l.label}
                    </Button>
                  );
                })}
              </div>
            </div>
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
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
          </div>
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
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  إجمالي المصاريف
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(total)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  عدد البنود
                </div>
                <div className="text-2xl font-bold tabular-nums">{data?.summary?.count ?? 0}</div>
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
                  {top3Share > 80 ? "تركّز عالٍ" : "تنويع"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">المتوسط لكل بند</div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(rows.length > 0 ? total / rows.length : 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top 10 bars */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                أعلى 10 — {LENSES.find(l => l.id === lens)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">لا مصاريف في هذه الفترة</div>
              ) : (
                <div className="space-y-2">
                  {rows.slice(0, 10).map((r, idx) => {
                    const value = Number(r.amount);
                    const pct = total > 0 ? (value / total) * 100 : 0;
                    const barPct = (value / maxAmount) * 100;
                    return (
                      <div key={String(r.key)}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="font-mono text-[10px]">{idx + 1}</Badge>
                            {lens === "account" && (
                              <span className="font-mono text-[10px] text-muted-foreground">{r.key}</span>
                            )}
                            <span className="truncate max-w-64">{r.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold tabular-nums">{formatCurrency(value)}</span>
                            <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div
                            className="bg-status-danger-foreground h-full"
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

          {/* Full table */}
          {rows.length > 10 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">القائمة الكاملة ({rows.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={fullTableColumns}
                  data={rows}
                  rowKey={(r) => String(r.key)}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
