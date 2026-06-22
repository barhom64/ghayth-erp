import { useCallback, useEffect, useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/shared/print-button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  TrendingUp, TrendingDown, Download, BarChart3, ChevronRight,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";

/**
 * Income Statement Trend — last N months side-by-side
 *
 * Real CFO board-pack tool: revenue vs expense for each of the last 6
 * (or 12) months as columns, with one row per account + totals. Reveals:
 *  - Which expense lines are creeping up
 *  - Which revenue streams are declining
 *  - Trend at a glance via per-row bar + month-over-month %
 *
 * Calls /finance/reports/income-statement N times in parallel.
 */

interface IncomeStatementResp {
  revenues: Array<{ code: string; name: string; amount: number | string }>;
  expenses: Array<{ code: string; name: string; amount: number | string }>;
  summary: { totalRevenue: number; totalExpenses: number; netIncome: number };
}

interface MonthBucket {
  key: string;       // YYYY-MM
  label: string;     // "أبريل 2026"
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  data: IncomeStatementResp | null;
  loading: boolean;
}

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function buildMonthsFromCurrent(count: number): Array<{ year: number; month: number }> {
  const cy = currentYearRiyadh();
  const cm = Number(currentMonthPaddedRiyadh());
  const months: Array<{ year: number; month: number }> = [];
  let y = cy, m = cm;
  for (let i = 0; i < count; i++) {
    months.unshift({ year: y, month: m });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return months;
}

function monthRange(year: number, month: number): { start: string; end: string; key: string; label: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  // Last day of month (utc-ok: pure calendar arithmetic, no business-period anchor)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    start, end,
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: `${MONTHS_AR[month - 1]} ${year}`,
  };
}

function MonthQuery({ year, month, onData }: { year: number; month: number; onData: (key: string, d: IncomeStatementResp | null, loading: boolean) => void }) {
  const r = monthRange(year, month);
  const { data, isLoading } = useApiQuery<IncomeStatementResp>(
    ["is-month", r.key],
    `/finance/reports/income-statement?startDate=${r.start}&endDate=${r.end}`,
  );
  // Side effects (pushing query results up to the parent) MUST live in
  // useEffect, never useMemo. A setState inside useMemo re-fires on every
  // render and — with an unstable callback + a new-array setState — produces
  // an infinite render loop that wedges the whole tab.
  useEffect(() => { onData(r.key, data ?? null, isLoading); }, [r.key, data, isLoading, onData]);
  return null;
}

export default function IncomeStatementTrendPage() {
  const [monthCount, setMonthCount] = useState<number>(6);

  const monthDefs = useMemo(() => buildMonthsFromCurrent(monthCount), [monthCount]);

  // Build query keys and call once each (we use a single useApiQuery hook per bucket via children)
  const [buckets, setBuckets] = useState<MonthBucket[]>(() =>
    monthDefs.map((m) => {
      const r = monthRange(m.year, m.month);
      return { key: r.key, label: r.label, startDate: r.start, endDate: r.end, data: null, loading: true };
    })
  );

  // Re-sync buckets when monthCount changes. MUST be useEffect — a setState
  // inside useMemo is a render-phase side effect.
  useEffect(() => {
    setBuckets(monthDefs.map((m) => {
      const r = monthRange(m.year, m.month);
      return { key: r.key, label: r.label, startDate: r.start, endDate: r.end, data: null, loading: true };
    }));
  }, [monthDefs]);

  // Stable callback (deps: none — only uses the stable setBuckets) so the
  // off-screen MonthQuery children's effect deps don't change every render.
  // Bail out (return prev) when nothing actually changed so we don't spawn a
  // new array reference and re-render forever.
  const onMonthData = useCallback((key: string, d: IncomeStatementResp | null, loading: boolean) => {
    setBuckets((prev) => {
      const idx = prev.findIndex((b) => b.key === key);
      if (idx === -1) return prev;
      const b = prev[idx];
      if (b.data === d && b.loading === loading) return prev;
      const next = prev.slice();
      next[idx] = { ...b, data: d, loading };
      return next;
    });
  }, []);

  // ── Build the merged row map: account code → amount[] per month
  const { revenueRows, expenseRows, totalsRow, netRow, allLoaded } = useMemo(() => {
    const rev = new Map<string, { code: string; name: string; amounts: number[] }>();
    const exp = new Map<string, { code: string; name: string; amounts: number[] }>();
    const totRev: number[] = new Array(buckets.length).fill(0);
    const totExp: number[] = new Array(buckets.length).fill(0);

    let allDone = true;
    buckets.forEach((b, idx) => {
      if (b.loading) allDone = false;
      const d = b.data;
      if (!d) return;
      for (const r of d.revenues ?? []) {
        const amt = Number(r.amount ?? 0);
        const key = r.code;
        const cur = rev.get(key) ?? { code: r.code, name: r.name, amounts: new Array(buckets.length).fill(0) };
        cur.amounts[idx] = amt;
        rev.set(key, cur);
        totRev[idx] += amt;
      }
      for (const e of d.expenses ?? []) {
        const amt = Number(e.amount ?? 0);
        const key = e.code;
        const cur = exp.get(key) ?? { code: e.code, name: e.name, amounts: new Array(buckets.length).fill(0) };
        cur.amounts[idx] = amt;
        exp.set(key, cur);
        totExp[idx] += amt;
      }
    });

    const revRows = Array.from(rev.values())
      .filter((r) => r.amounts.some((a) => Math.abs(a) > 0.005))
      .sort((a, b) => {
        const sa = a.amounts.reduce((s, x) => s + x, 0);
        const sb = b.amounts.reduce((s, x) => s + x, 0);
        return sb - sa;
      });
    const expRows = Array.from(exp.values())
      .filter((r) => r.amounts.some((a) => Math.abs(a) > 0.005))
      .sort((a, b) => {
        const sa = a.amounts.reduce((s, x) => s + x, 0);
        const sb = b.amounts.reduce((s, x) => s + x, 0);
        return sb - sa;
      });

    const net = totRev.map((r, i) => r - totExp[i]);

    return {
      revenueRows: revRows,
      expenseRows: expRows,
      totalsRow: { totRev, totExp },
      netRow: net,
      allLoaded: allDone,
    };
  }, [buckets]);

  const monthOverMonth = (amounts: number[]): { last: number; prev: number; pct: number } => {
    const last = amounts[amounts.length - 1] ?? 0;
    const prev = amounts[amounts.length - 2] ?? 0;
    const pct = prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : (last !== 0 ? 100 : 0);
    return { last, prev, pct };
  };

  const exportCsv = () => {
    const headers = ["نوع", "رمز", "اسم الحساب", ...buckets.map((b) => b.label)];
    const lines = [headers.join(",")];
    for (const r of revenueRows) lines.push(["إيراد", r.code, r.name, ...r.amounts.map((a) => a.toFixed(2))].join(","));
    for (const r of expenseRows) lines.push(["مصروف", r.code, r.name, ...r.amounts.map((a) => a.toFixed(2))].join(","));
    lines.push(["مجموع الإيرادات", "", "", ...totalsRow.totRev.map((a) => a.toFixed(2))].join(","));
    lines.push(["مجموع المصروفات", "", "", ...totalsRow.totExp.map((a) => a.toFixed(2))].join(","));
    lines.push(["صافي الربح", "", "", ...netRow.map((a) => a.toFixed(2))].join(","));
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
        entityType: "report_income_statement_trend",
        title: String(`income-statement-trend-${buckets[0]?.key}-to-${buckets[buckets.length - 1]?.key}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  const renderTrendCell = (amounts: number[]) => {
    const mom = monthOverMonth(amounts);
    const arrow = mom.pct > 5 ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                : mom.pct < -5 ? <TrendingDown className="h-3 w-3 text-red-600" />
                : <span className="h-3 w-3 inline-block" />;
    // Trend-at-a-glance: the FULL N-month trajectory beside the MoM
    // number. The arrow + % is the headline; the spark is the shape
    // (e.g. "+3%" could be steady creep OR a recent jump after flat
    // months — only the spark distinguishes them).
    const sparkTone: "success" | "warning" | "muted" =
      mom.pct > 5 ? "success" : mom.pct < -5 ? "warning" : "muted";
    return (
      <div className="inline-flex items-center gap-1 text-[10px]">
        <InlineSparkline values={amounts} tone={sparkTone} width={48} height={16} />
        {arrow}
        <span className={`font-mono ${mom.pct > 5 ? "text-emerald-700" : mom.pct < -5 ? "text-red-700" : "text-muted-foreground"}`}>
          {mom.pct > 0 ? "+" : ""}{mom.pct.toFixed(0)}%
        </span>
      </div>
    );
  };

  const max = Math.max(
    ...revenueRows.map((r) => Math.max(...r.amounts.map((a) => Math.abs(a)))),
    ...expenseRows.map((r) => Math.max(...r.amounts.map((a) => Math.abs(a)))),
    1,
  );

  // Flatten the two sections into one grouped dataset so the statement renders
  // through the canonical DataTable: groupBy "_section" → الإيرادات/المصروفات
  // section headers; per-column `groupFooter` → column-aligned section subtotals
  // (إجمالي الإيرادات/المصروفات under each month); `footer` → the net-profit
  // row. Same amounts/bars/trend/links as before; sticky first column is the
  // one delta of adopting the shared component.
  type IsRow = { code: string; name: string; amounts: number[]; _section: "revenue" | "expense" };
  const isRows: IsRow[] = [
    ...revenueRows.map((r) => ({ ...r, _section: "revenue" as const })),
    ...expenseRows.map((r) => ({ ...r, _section: "expense" as const })),
  ];
  const isColumns: DataTableColumn<IsRow>[] = [
    {
      key: "account",
      header: "الحساب",
      sortable: false,
      className: "w-64",
      render: (r) => (
        <Link href={`/finance/ledger/${r.code}`} className="flex flex-col hover:text-status-info-foreground">
          <span className="font-mono text-[10px]">{r.code}</span>
          <span className="text-[11px]">{r.name}</span>
        </Link>
      ),
      groupFooter: (_rows, gv) => (gv === "revenue" ? "إجمالي الإيرادات" : "إجمالي المصروفات"),
      footer: () => "صافي الربح",
    },
    ...buckets.map((b, i): DataTableColumn<IsRow> => ({
      key: b.key,
      header: b.label,
      align: "end",
      sortable: false,
      className: "whitespace-nowrap",
      render: (r) => {
        const amt = r.amounts[i] ?? 0;
        if (Math.abs(amt) < 0.01) return <span className="text-muted-foreground italic">—</span>;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[11px]">{formatCurrency(amt)}</span>
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${r._section === "revenue" ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${(Math.abs(amt) / max) * 100}%` }}
              />
            </div>
          </div>
        );
      },
      groupFooter: (rows, gv) => {
        const sum = rows.reduce((s, r) => s + (r.amounts[i] ?? 0), 0);
        return (
          <span className={`font-mono ${gv === "revenue" ? "text-emerald-700" : "text-red-700"}`}>
            {formatCurrency(sum)}
          </span>
        );
      },
      footer: () => {
        const amt = netRow[i] ?? 0;
        return (
          <span className={`font-mono ${amt < 0 ? "text-red-700" : "text-emerald-700"}`}>
            {amt < 0 ? "−" : ""}{formatCurrency(Math.abs(amt))}
          </span>
        );
      },
    })),
    {
      key: "mom",
      header: "M-o-M",
      align: "end",
      sortable: false,
      className: "whitespace-nowrap",
      render: (r) => renderTrendCell(r.amounts),
      groupFooter: (rows) => renderTrendCell(buckets.map((_, i) => rows.reduce((s, r) => s + (r.amounts[i] ?? 0), 0))),
      footer: () => renderTrendCell(netRow),
    },
  ];

  return (
    <PageShell
      title="قائمة الدخل — اتجاه شهري متعدد الفترات"
      subtitle="آخر N شهر جنباً إلى جنب، مع month-over-month % لكل بند — لاكتشاف الاتجاهات والقفزات غير الطبيعية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "اتجاه قائمة الدخل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">عدد الأشهر:</Label>
          <Select value={String(monthCount)} onValueChange={(v) => setMonthCount(Number(v))}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="6">6</SelectItem>
              <SelectItem value="9">9</SelectItem>
              <SelectItem value="12">12</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!allLoaded}>
            <Download className="h-4 w-4 me-1" /> CSV
          </Button>
          <PrintButton
            entityType="report_income_trend"
            entityId={`${buckets[0]?.key ?? ""}..${buckets[buckets.length - 1]?.key ?? ""}`}
            payload={{
              entity: {
                title: "اتجاه قائمة الدخل (شهري)",
                from: buckets[0]?.label,
                to: buckets[buckets.length - 1]?.label,
                monthCount: buckets.length,
              },
              items: [
                ...revenueRows.map((r) => ({ "النوع": "إيراد", "الكود": r.code, "اسم الحساب": r.name, ...Object.fromEntries(buckets.map((b, i) => [b.label, Number(r.amounts[i] ?? 0)])) })),
                ...expenseRows.map((r) => ({ "النوع": "مصروف", "الكود": r.code, "اسم الحساب": r.name, ...Object.fromEntries(buckets.map((b, i) => [b.label, Number(r.amounts[i] ?? 0)])) })),
              ],
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Off-screen children — one useApiQuery per month, results pushed via onData */}
      <div style={{ display: "none" }}>
        {monthDefs.map((m) => (
          <MonthQuery key={`${m.year}-${m.month}`} year={m.year} month={m.month} onData={onMonthData} />
        ))}
      </div>

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> board-pack صفحة واحدة
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            هذا التقرير يستبدل العمل اليدوي بتفتيح Excel وحساب الفروقات الشهرية.
            كل صف يعرض حركة الحساب على الأشهر + شريط مرئي للحجم + الفرق
            month-over-month مع سهم اتجاه. اكتشف بسرعة:
            <strong> أي بند مصاريف يقفز شهرياً؟ أي إيراد يتراجع؟</strong>
          </p>
        </CardContent>
      </Card>

      {!allLoaded ? <LoadingSpinner /> : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {buckets[0]?.label} → {buckets[buckets.length - 1]?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={isColumns}
              data={isRows}
              rowKey={(r) => `${r._section}-${r.code}`}
              groupBy="_section"
              renderGroupHeader={(gv) => (gv === "revenue" ? "الإيرادات" : "المصروفات")}
              noToolbar
              pageSize={0}
            />
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
          <ChevronRight className="h-3 w-3" />
          <span>كل رمز حساب في العمود الأول هو deep-link لـ <code className="bg-white border px-1 rounded">/finance/ledger/:code</code>
          — لتحقيق سبب القفزة في شهر محدد بفتح القيود المرتبطة بالحساب.</span>
        </CardContent>
      </Card>
    </PageShell>
  );
}
