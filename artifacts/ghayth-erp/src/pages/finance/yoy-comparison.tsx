import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatNumber, currentYearRiyadh } from "@/lib/formatters";
import {
  TrendingUp, TrendingDown, Download, BarChart3, Trophy,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Year-over-Year Comparison
 *
 * The standard board question every year: "هل نمنا أم تقهقرنا مقارنة بنفس
 * الفترة السنة الماضية؟". Calls income-statement endpoint TWICE — once
 * for YTD this year, once for same YTD window last year — and shows
 * line-by-line YoY % per account + summary.
 *
 * Different from trial-balance-comparison (any-vs-any periods): this is
 * specifically YTD-vs-prior-YTD, the standard board metric.
 */

interface IncomeStatementResp {
  revenues: Array<{ code: string; name: string; amount: number | string }>;
  expenses: Array<{ code: string; name: string; amount: number | string }>;
  summary: { totalRevenue: number; totalExpenses: number; netIncome: number };
}

interface ComparisonRow {
  code: string;
  name: string;
  type: "revenue" | "expense";
  current: number;
  prior: number;
  variance: number;
  variancePct: number;
}

const MONTHS = [
  { value: 1, label: "يناير" }, { value: 2, label: "فبراير" }, { value: 3, label: "مارس" },
  { value: 4, label: "أبريل" }, { value: 5, label: "مايو" }, { value: 6, label: "يونيو" },
  { value: 7, label: "يوليو" }, { value: 8, label: "أغسطس" }, { value: 9, label: "سبتمبر" },
  { value: 10, label: "أكتوبر" }, { value: 11, label: "نوفمبر" }, { value: 12, label: "ديسمبر" },
];

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export default function YoyComparisonPage() {
  const thisYear = currentYearRiyadh();
  const [year, setYear] = useState<number>(thisYear);
  const [throughMonth, setThroughMonth] = useState<number>(12);

  // YTD this year: Jan 1 to end of selected month
  const ytdStart = `${year}-01-01`;
  const ytdEnd = `${year}-${String(throughMonth).padStart(2, "0")}-${String(lastDayOfMonth(year, throughMonth)).padStart(2, "0")}`;

  // Same YTD window last year
  const priorStart = `${year - 1}-01-01`;
  const priorEnd = `${year - 1}-${String(throughMonth).padStart(2, "0")}-${String(lastDayOfMonth(year - 1, throughMonth)).padStart(2, "0")}`;

  const qCur = useApiQuery<IncomeStatementResp>(
    ["yoy-current", String(year), String(throughMonth)],
    `/finance/reports/income-statement?startDate=${ytdStart}&endDate=${ytdEnd}`,
  );
  const qPrior = useApiQuery<IncomeStatementResp>(
    ["yoy-prior", String(year), String(throughMonth)],
    `/finance/reports/income-statement?startDate=${priorStart}&endDate=${priorEnd}`,
  );

  const rows: ComparisonRow[] = useMemo(() => {
    const cur = qCur.data;
    const pri = qPrior.data;
    const map = new Map<string, ComparisonRow>();

    const seed = (arr: Array<{ code: string; name: string; amount: number | string }>, type: "revenue" | "expense", side: "current" | "prior") => {
      for (const r of arr ?? []) {
        const key = `${type}:${r.code}`;
        const ex = map.get(key) ?? { code: r.code, name: r.name, type, current: 0, prior: 0, variance: 0, variancePct: 0 };
        if (side === "current") ex.current = Number(r.amount);
        else ex.prior = Number(r.amount);
        map.set(key, ex);
      }
    };

    if (cur) {
      seed(cur.revenues, "revenue", "current");
      seed(cur.expenses, "expense", "current");
    }
    if (pri) {
      seed(pri.revenues, "revenue", "prior");
      seed(pri.expenses, "expense", "prior");
    }

    return Array.from(map.values())
      .map((r) => {
        const variance = r.current - r.prior;
        const variancePct = r.prior !== 0 ? (variance / Math.abs(r.prior)) * 100 : (r.current !== 0 ? 100 : 0);
        return { ...r, variance, variancePct };
      })
      .filter((r) => Math.abs(r.current) > 0.005 || Math.abs(r.prior) > 0.005)
      .sort((a, b) => {
        // Sort revenues first, then by absolute change
        if (a.type !== b.type) return a.type === "revenue" ? -1 : 1;
        return Math.abs(b.variance) - Math.abs(a.variance);
      });
  }, [qCur.data, qPrior.data]);

  const revenues = rows.filter((r) => r.type === "revenue");
  const expenses = rows.filter((r) => r.type === "expense");

  const totalCurRevenue = revenues.reduce((s, r) => s + r.current, 0);
  const totalPriorRevenue = revenues.reduce((s, r) => s + r.prior, 0);
  const revVariance = totalCurRevenue - totalPriorRevenue;
  const revVariancePct = totalPriorRevenue !== 0 ? (revVariance / Math.abs(totalPriorRevenue)) * 100 : 0;

  const totalCurExpense = expenses.reduce((s, r) => s + r.current, 0);
  const totalPriorExpense = expenses.reduce((s, r) => s + r.prior, 0);
  const expVariance = totalCurExpense - totalPriorExpense;
  const expVariancePct = totalPriorExpense !== 0 ? (expVariance / Math.abs(totalPriorExpense)) * 100 : 0;

  const curNet = totalCurRevenue - totalCurExpense;
  const priorNet = totalPriorRevenue - totalPriorExpense;
  const netVariance = curNet - priorNet;
  const netVariancePct = priorNet !== 0 ? (netVariance / Math.abs(priorNet)) * 100 : 0;

  // Top movers
  const topGrowers = [...rows].filter((r) => r.type === "revenue" && r.variance > 0)
    .sort((a, b) => b.variance - a.variance).slice(0, 3);
  const topDecliners = [...rows].filter((r) => r.type === "revenue" && r.variance < 0)
    .sort((a, b) => a.variance - b.variance).slice(0, 3);
  const topExpenseUp = [...rows].filter((r) => r.type === "expense" && r.variance > 0)
    .sort((a, b) => b.variance - a.variance).slice(0, 3);

  const exportCsv = () => {
    const monthLabel = MONTHS.find((m) => m.value === throughMonth)?.label ?? throughMonth;
    const headers = ["النوع", "رمز", "اسم الحساب", `${year} (YTD حتى ${monthLabel})`, `${year - 1} (YTD)`, "الفرق", "% النمو"];
    const lines = [headers.join(",")];
    for (const r of revenues) lines.push(["إيراد", r.code, r.name, r.current.toFixed(2), r.prior.toFixed(2), r.variance.toFixed(2), r.variancePct.toFixed(2)].join(","));
    for (const r of expenses) lines.push(["مصروف", r.code, r.name, r.current.toFixed(2), r.prior.toFixed(2), r.variance.toFixed(2), r.variancePct.toFixed(2)].join(","));
    lines.push(["", "", "إجمالي الإيرادات", totalCurRevenue.toFixed(2), totalPriorRevenue.toFixed(2), revVariance.toFixed(2), revVariancePct.toFixed(2)].join(","));
    lines.push(["", "", "إجمالي المصروفات", totalCurExpense.toFixed(2), totalPriorExpense.toFixed(2), expVariance.toFixed(2), expVariancePct.toFixed(2)].join(","));
    lines.push(["", "", "صافي الربح", curNet.toFixed(2), priorNet.toFixed(2), netVariance.toFixed(2), netVariancePct.toFixed(2)].join(","));
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
        entityType: "report_yoy_comparison",
        title: String(`yoy-${year}-vs-${year - 1}-ytd-${throughMonth}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  if (qCur.isLoading || qPrior.isLoading) return <LoadingSpinner />;

  const monthLabel = MONTHS.find((m) => m.value === throughMonth)?.label ?? throughMonth;
  const renderPct = (pct: number, positive: boolean) => {
    if (Math.abs(pct) < 0.01) return <span className="text-muted-foreground italic">—</span>;
    const isGood = positive ? pct > 0 : pct < 0;
    return (
      <span className={`font-mono inline-flex items-center gap-1 ${isGood ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}`}>
        {pct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
    );
  };

  return (
    <PageShell
      title="مقارنة منذ بداية السنة (YTD) سنة بسنة"
      subtitle="هل نمت الإيرادات؟ هل تضخمت المصروفات؟ مقارنة من-بداية-السنة حتى شهر معيّن، عبر سنتين"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "مقارنة منذ بداية السنة" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Label className="text-xs">السنة:</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="text-xs">حتى شهر:</Label>
          <Select value={String(throughMonth)} onValueChange={(v) => setThroughMonth(Number(v))}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 me-1" /> CSV
          </Button>
          <PrintButton
            entityType="report_yoy_comparison"
            entityId="all"
            payload={{
              entity: { title: "مقارنة سنة على سنة (YoY)", count: rows.length },
              items: rows,
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> السؤال الجوهري لمجلس الإدارة
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عند انتهاء كل ربع، السؤال الأول للمجلس: <strong>"هل نمنا مقارنة بالعام
            الماضي في نفس الفترة؟"</strong>. هذا التقرير يجاوب على ذلك تلقائياً
            بدون فتح Excel. YTD حتى شهر {monthLabel} {year} مقابل YTD حتى نفس
            الشهر من {year - 1}.
          </p>
        </CardContent>
      </Card>

      {/* ── Summary KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className={revVariancePct >= 0 ? "border-emerald-300 bg-emerald-50/30" : "border-red-300 bg-red-50/30"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الإيرادات YTD</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalCurRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              vs <span className="font-mono">{formatCurrency(totalPriorRevenue)}</span> · {year - 1}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {renderPct(revVariancePct, true)}
              <span className="text-xs text-muted-foreground">
                ({revVariance > 0 ? "+" : ""}{formatCurrency(revVariance)})
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className={expVariancePct >= 10 ? "border-red-300 bg-red-50/30" : "border-emerald-300 bg-emerald-50/30"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي المصروفات YTD</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(totalCurExpense)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              vs <span className="font-mono">{formatCurrency(totalPriorExpense)}</span> · {year - 1}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {renderPct(expVariancePct, false)}
              <span className="text-xs text-muted-foreground">
                ({expVariance > 0 ? "+" : ""}{formatCurrency(expVariance)})
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className={netVariancePct >= 0 ? "border-emerald-400 bg-emerald-50/30" : "border-red-400 bg-red-50/30"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">صافي الربح YTD</p>
            <p className={`text-2xl font-bold font-mono ${curNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {curNet >= 0 ? "+" : ""}{formatCurrency(curNet)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              vs <span className="font-mono">{formatCurrency(priorNet)}</span> · {year - 1}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {renderPct(netVariancePct, true)}
              <span className="text-xs text-muted-foreground">
                ({netVariance > 0 ? "+" : ""}{formatCurrency(netVariance)})
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Movers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-emerald-700">
              <Trophy className="h-3 w-3" /> أعلى نمو إيرادات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {topGrowers.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-2">لا يوجد</p>
              : topGrowers.map((r) => (
                <div key={r.code} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name}</span>
                    <span className="font-mono text-emerald-700 font-bold">+{r.variancePct.toFixed(0)}%</span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">+{formatCurrency(r.variance)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-red-700">
              <TrendingDown className="h-3 w-3" /> تراجع إيرادات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {topDecliners.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-2">لا يوجد تراجع</p>
              : topDecliners.map((r) => (
                <div key={r.code} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name}</span>
                    <span className="font-mono text-red-700 font-bold">{r.variancePct.toFixed(0)}%</span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">{formatCurrency(r.variance)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-amber-700">
              <TrendingUp className="h-3 w-3" /> أعلى زيادة مصروفات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {topExpenseUp.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-2">لا يوجد</p>
              : topExpenseUp.map((r) => (
                <div key={r.code} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name}</span>
                    <span className="font-mono text-amber-700 font-bold">+{r.variancePct.toFixed(0)}%</span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">+{formatCurrency(r.variance)}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Detail Table ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            تفصيل الحسابات ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <DataTable
            data={rows}
            rowKey={(r) => `${r.type}-${r.code}`}
            noToolbar
            pageSize={0}
            className="text-xs"
            groupBy="type"
            columns={[
              {
                key: "account", header: "الحساب", sortable: false,
                render: (r) => (
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px]">{r.code}</span>
                    <span>{r.name}</span>
                  </div>
                ),
                footer: () => <span className="text-status-info-foreground">صافي الربح</span>,
              },
              {
                key: "current", header: `${year} YTD`, align: "end", sortable: false,
                render: (r) => <span className="font-mono">{r.current === 0 ? "—" : formatCurrency(r.current)}</span>,
                footer: () => (
                  <span className={`font-mono ${curNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatCurrency(curNet)}
                  </span>
                ),
              },
              {
                key: "prior", header: `${year - 1} YTD`, align: "end", sortable: false,
                render: (r) => <span className="font-mono text-muted-foreground">{r.prior === 0 ? "—" : formatCurrency(r.prior)}</span>,
                footer: () => (
                  <span className={`font-mono ${priorNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatCurrency(priorNet)}
                  </span>
                ),
              },
              {
                key: "variance", header: "الفرق", align: "end", sortable: false,
                render: (r) => (
                  <span className={`font-mono ${r.type === "revenue"
                    ? (r.variance > 0 ? "text-emerald-700" : r.variance < 0 ? "text-red-700" : "")
                    : (r.variance > 0 ? "text-red-700" : r.variance < 0 ? "text-emerald-700" : "")}`}>
                    {Math.abs(r.variance) < 0.005 ? "—" : (r.variance > 0 ? "+" : "") + formatCurrency(r.variance)}
                  </span>
                ),
                footer: () => (
                  <span className={`font-mono ${netVariance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {netVariance > 0 ? "+" : ""}{formatCurrency(netVariance)}
                  </span>
                ),
              },
              {
                key: "variancePct", header: "% النمو", align: "end", sortable: false,
                render: (r) => renderPct(r.variancePct, r.type === "revenue"),
                footer: () => renderPct(netVariancePct, true),
              },
            ] satisfies DataTableColumn<ComparisonRow>[]}
            renderGroupHeader={(groupValue) => (
              groupValue === "revenue" ? "الإيرادات" : "المصروفات"
            )}
            renderGroupSubtotal={(groupValue) => (
              groupValue === "revenue" ? (
                <tr className="bg-emerald-100/60 font-bold">
                  <td className="p-2">إجمالي الإيرادات</td>
                  <td className="p-2 text-end font-mono">{formatCurrency(totalCurRevenue)}</td>
                  <td className="p-2 text-end font-mono">{formatCurrency(totalPriorRevenue)}</td>
                  <td className={`p-2 text-end font-mono ${revVariance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {revVariance > 0 ? "+" : ""}{formatCurrency(revVariance)}
                  </td>
                  <td className="p-2 text-end">{renderPct(revVariancePct, true)}</td>
                </tr>
              ) : (
                <tr className="bg-red-100/60 font-bold">
                  <td className="p-2">إجمالي المصروفات</td>
                  <td className="p-2 text-end font-mono">{formatCurrency(totalCurExpense)}</td>
                  <td className="p-2 text-end font-mono">{formatCurrency(totalPriorExpense)}</td>
                  <td className={`p-2 text-end font-mono ${expVariance <= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {expVariance > 0 ? "+" : ""}{formatCurrency(expVariance)}
                  </td>
                  <td className="p-2 text-end">{renderPct(expVariancePct, false)}</td>
                </tr>
              )
            )}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
