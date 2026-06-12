import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { formatCurrency, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  TrendingUp, TrendingDown, Crown, Frown, Download,
  Layers, ChevronRight,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ParetoMarker, computeParetoCumulative } from "@/components/shared/pareto-marker";
import { DateRangePresets } from "@/components/shared/date-range-presets";

/**
 * Cost Center P&L Comparison
 *
 * Real CFO question: "أي مركز تكلفة هو الرابح / الخاسر هذا الشهر؟"
 *
 * For each cost center, shows: revenue + expense + net + margin% + rank.
 * Sortable by any column. Heatmap-style bars for visual comparison.
 *
 * Backend: GET /finance/cost-center-report (already returns per-CC totals)
 */

interface CcReportRow {
  costCenter: string | null;
  entryCount: number | string;
  totalDebit: number | string;
  totalCredit: number | string;
  totalExpenses: number | string;
  totalRevenue: number | string;
}

interface PnlRow {
  costCenter: string;
  revenue: number;
  expense: number;
  net: number;
  margin: number;        // net / revenue * 100
  entryCount: number;
  share: number;         // % of total net (if positive)
}

function monthRangeDefaults(): { start: string; end: string } {
  const y = currentYearRiyadh();
  const m = Number(currentMonthPaddedRiyadh());
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function CostCenterPnlPage() {
  const def = monthRangeDefaults();
  const [startDate, setStartDate] = useState<string>(def.start);
  const [endDate, setEndDate] = useState<string>(def.end);

  const qs = `?startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading } = useApiQuery<{ data: CcReportRow[]; total?: number }>(
    ["cc-pnl", startDate, endDate],
    `/finance/cost-center-report${qs}`,
  );

  const rows: PnlRow[] = useMemo(() => {
    const src: CcReportRow[] = data?.data ?? [];
    const totalNet = src.reduce((s, r) => {
      const net = Number(r.totalRevenue) - Number(r.totalExpenses);
      return s + (net > 0 ? net : 0);
    }, 0);
    return src
      .map((r) => {
        const revenue = Number(r.totalRevenue ?? 0);
        const expense = Number(r.totalExpenses ?? 0);
        const net = revenue - expense;
        const margin = revenue > 0 ? (net / revenue) * 100 : 0;
        const share = totalNet > 0 && net > 0 ? (net / totalNet) * 100 : 0;
        return {
          costCenter: r.costCenter ?? "— غير محدد —",
          revenue, expense, net, margin,
          entryCount: Number(r.entryCount ?? 0),
          share,
        };
      })
      .filter((r) => r.revenue !== 0 || r.expense !== 0)
      .sort((a, b) => b.net - a.net);
  }, [data]);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const totalNet = totalRevenue - totalExpense;
  const profitCount = rows.filter((r) => r.net > 0).length;

  // Pareto cumulative on |net| — `rows` is already net-DESC, so each
  // step adds the absolute contribution to the running total. Crown
  // marks the first row crossing 80% — "these N centres drive 80%
  // of the profit magnitude; the rest is long tail."
  const { cumulativePcts, thresholdIdx } = computeParetoCumulative(
    rows.map((r) => r.net),
    80,
  );
  const lossCount = rows.filter((r) => r.net < 0).length;
  const breakEvenCount = rows.filter((r) => r.net === 0).length;

  const topProfit = rows.find((r) => r.net > 0);
  const topLoss = [...rows].filter((r) => r.net < 0).sort((a, b) => a.net - b.net)[0];

  const maxAbs = Math.max(
    ...rows.map((r) => Math.max(Math.abs(r.revenue), Math.abs(r.expense), Math.abs(r.net))),
    1,
  );

  const exportCsv = () => {
    const headers = ["مركز التكلفة", "الإيراد", "المصروف", "الصافي", "% الهامش", "% من الأرباح", "عدد القيود"];
    const lines = [
      headers.join(","),
      ...rows.map((r) => [
        r.costCenter,
        r.revenue.toFixed(2),
        r.expense.toFixed(2),
        r.net.toFixed(2),
        r.margin.toFixed(2),
        r.share.toFixed(2),
        r.entryCount,
      ].join(",")),
    ];
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
        entityType: "report_cost_center_pnl",
        title: String(`cost-center-pnl-${startDate}-to-${endDate}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  const cols: DataTableColumn<PnlRow>[] = [
    {
      key: "_rank",
      header: "الترتيب",
      render: (r) => {
        const idx = rows.indexOf(r);
        if (idx === 0 && r.net > 0) {
          return <Badge className="bg-amber-100 text-amber-800 text-[10px]"><Crown className="h-2.5 w-2.5 me-0.5" /> الأعلى</Badge>;
        }
        if (idx === rows.length - 1 && r.net < 0) {
          return <Badge className="bg-red-100 text-red-800 text-[10px]"><Frown className="h-2.5 w-2.5 me-0.5" /> الأسوأ</Badge>;
        }
        return <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>;
      },
    },
    {
      key: "costCenter",
      header: "مركز التكلفة",
      render: (r) => <span className="text-xs font-medium">{r.costCenter}</span>,
    },
    {
      key: "revenue",
      header: "الإيراد",
      sortable: true,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span className="font-mono text-xs font-semibold text-emerald-700">
            {r.revenue === 0 ? "—" : formatCurrency(r.revenue)}
          </span>
          {r.revenue > 0 && (
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${(r.revenue / maxAbs) * 100}%` }} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "expense",
      header: "المصروف",
      sortable: true,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span className="font-mono text-xs font-semibold text-red-700">
            {r.expense === 0 ? "—" : formatCurrency(r.expense)}
          </span>
          {r.expense > 0 && (
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-red-500" style={{ width: `${(r.expense / maxAbs) * 100}%` }} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "net",
      header: "الصافي",
      sortable: true,
      render: (r) => {
        const positive = r.net > 0;
        return (
          <div className="flex items-center gap-2 justify-end">
            {positive ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
            <span className={`font-mono text-xs font-bold ${positive ? "text-emerald-700" : "text-red-700"}`}>
              {positive ? "+" : ""}{formatCurrency(r.net)}
            </span>
          </div>
        );
      },
    },
    {
      key: "margin",
      header: "% الهامش",
      sortable: true,
      render: (r) => {
        if (r.revenue === 0) return <span className="text-muted-foreground italic text-xs">—</span>;
        const color = r.margin >= 20 ? "text-emerald-700 font-bold"
          : r.margin >= 10 ? "text-emerald-700"
          : r.margin >= 0 ? "text-amber-700"
          : "text-red-700 font-bold";
        return <span className={`font-mono text-xs ${color}`}>{r.margin.toFixed(1)}%</span>;
      },
    },
    {
      key: "share",
      header: "% من الأرباح",
      render: (r) => {
        if (r.share === 0) return <span className="text-muted-foreground italic text-xs">—</span>;
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{r.share.toFixed(1)}%</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px] max-w-[60px]">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(r.share, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "_pareto",
      header: "حصة تراكمية",
      render: (r) => {
        const idx = rows.indexOf(r);
        return (
          <ParetoMarker
            cumulativePct={cumulativePcts[idx] ?? 0}
            isThresholdRow={idx === thresholdIdx}
            testidPrefix={`cc-pnl-pareto-${idx}`}
          />
        );
      },
    },
    {
      key: "entryCount",
      header: "قيود",
      render: (r) => <Badge variant="outline" className="text-[10px] font-mono">{formatNumber(r.entryCount)}</Badge>,
    },
    {
      key: "_actions",
      header: "تفاصيل",
      render: (r) => (
        <Link href={`/finance/journal?costCenter=${encodeURIComponent(r.costCenter)}&startDate=${startDate}&endDate=${endDate}`}>
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            القيود <ChevronRight className="h-3 w-3 ms-1" />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <PageShell
      title="مقارنة ربحية مراكز التكلفة"
      subtitle="قائمة دخل لكل مركز تكلفة في فترة واحدة — أي مركز رابح / خاسر / يحتاج تدخل"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/cost-centers", label: "مراكز التكلفة" },
        { label: "مقارنة الربحية" },
      ]}
      actions={
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">من</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-xs">إلى</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-36" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 me-1" /> CSV
          </Button>
          <PrintButton
            entityType="report_cost_center_pnl"
            entityId={`${startDate}..${endDate}`}
            payload={() => ({
              entity: {
                title: "ربحية مراكز التكلفة",
                startDate, endDate,
                centerCount: rows.length,
              },
              items: printRows.map((r) => ({
                "مركز التكلفة": r.costCenter,
                "الإيراد": r.revenue,
                "المصروف": r.expense,
                "الصافي": r.net,
                "هامش %": Number(r.margin ?? 0).toFixed(2),
                "عدد القيود": r.entryCount,
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3">
          <DateRangePresets
            value={{ from: startDate, to: endDate }}
            onChange={(r) => { setStartDate(r.from); setEndDate(r.to); }}
            testidPrefix="cc-pnl-preset"
            hideAllTime
          />
        </CardContent>
      </Card>

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Layers className="h-4 w-4" /> الرابحون والخاسرون
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            لكل مركز تكلفة، الصفحة تحسب: <strong>إيراد - مصروف = صافي</strong>،
            + % الهامش (net / revenue) + % مساهمته في إجمالي الأرباح. أرز شامل
            بالـ DataTable + شريط بصري لكل رقم لمقارنة سريعة. مفتاح اتخاذ قرار
            "أي مركز ندعم؟ أي مركز نراجع تكاليفه؟".
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مراكز نشطة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الإيراد</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المصروف</p>
            <p className="text-lg font-bold font-mono text-red-700">{formatCurrency(totalExpense)}</p>
          </CardContent>
        </Card>
        <Card className={totalNet < 0 ? "border-red-400 bg-red-50/30" : "border-emerald-400 bg-emerald-50/30"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">الصافي الكلي</p>
            <p className={`text-lg font-bold font-mono ${totalNet < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {totalNet > 0 ? "+" : ""}{formatCurrency(totalNet)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">رابحة / خاسرة</p>
            <p className="text-lg font-bold font-mono">
              <span className="text-emerald-700">{profitCount}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-red-700">{lossCount}</span>
              {breakEvenCount > 0 && <span className="text-muted-foreground text-xs"> · {breakEvenCount} تعادل</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {(topProfit || topLoss) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {topProfit && (
            <Card className="border-emerald-300 bg-emerald-50/30">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Crown className="h-3 w-3 text-amber-600" /> الأكثر ربحاً
                </p>
                <p className="text-sm font-semibold">{topProfit.costCenter}</p>
                <p className="font-mono text-xs mt-1">
                  <span className="text-emerald-700 font-bold">+{formatCurrency(topProfit.net)}</span>
                  <span className="text-muted-foreground"> · هامش {topProfit.margin.toFixed(1)}%</span>
                </p>
              </CardContent>
            </Card>
          )}
          {topLoss && (
            <Card className="border-red-300 bg-red-50/30">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Frown className="h-3 w-3 text-red-600" /> الأكثر خسارة
                </p>
                <p className="text-sm font-semibold">{topLoss.costCenter}</p>
                <p className="font-mono text-xs mt-1">
                  <span className="text-red-700 font-bold">{formatCurrency(topLoss.net)}</span>
                  {topLoss.revenue > 0 && (
                    <span className="text-muted-foreground"> · هامش {topLoss.margin.toFixed(1)}%</span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            مراكز التكلفة ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا توجد بيانات لمراكز التكلفة في هذي الفترة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
