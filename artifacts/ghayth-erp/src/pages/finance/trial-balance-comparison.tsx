import { useMemo, useState } from "react";
import { ACCOUNT_TYPES } from "@/lib/finance-type-maps";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  ArrowLeftRight, TrendingUp, TrendingDown, ChevronRight, Download,
  RefreshCw, Search,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";

/**
 * Trial Balance Comparison — side-by-side TB for two periods with
 * variance per account. Critical for audit and month-end review:
 * "did salaries jump unexpectedly?" / "did revenue drop in segment X?"
 *
 * Calls /finance/reports/trial-balance twice with different date ranges
 * and joins by accountCode.
 */

interface TbRow {
  id: number;
  code: string;
  name: string;
  type: string;
  totalDebit: number | string;
  totalCredit: number | string;
  balance: number | string;
  allowPosting: boolean;
}

interface TbResp {
  rows: TbRow[];
  totalDebit: number;
  totalCredit: number;
}

interface CompareRow {
  code: string;
  name: string;
  type: string;
  currentBalance: number;
  priorBalance: number;
  variance: number;
  variancePct: number;
}

const TYPE_LABEL = ACCOUNT_TYPES;

const TYPE_COLOR: Record<string, string> = {
  asset: "bg-blue-100 text-blue-800",
  liability: "bg-orange-100 text-orange-800",
  equity: "bg-purple-100 text-purple-800",
  revenue: "bg-emerald-100 text-emerald-800",
  expense: "bg-red-100 text-red-800",
};

function lastDayOfMonth(y: number, m: number): string {
  // utc-ok: building YYYY-MM-DD string with no time component
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export default function TbComparisonPage() {
  const thisYear = currentYearRiyadh();
  const thisMonth = Number(currentMonthPaddedRiyadh());
  const prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
  const prevYear = thisMonth === 1 ? thisYear - 1 : thisYear;

  const [curStart, setCurStart] = useState<string>(startOfMonth(thisYear, thisMonth));
  const [curEnd, setCurEnd] = useState<string>(lastDayOfMonth(thisYear, thisMonth));
  const [priorStart, setPriorStart] = useState<string>(startOfMonth(prevYear, prevMonth));
  const [priorEnd, setPriorEnd] = useState<string>(lastDayOfMonth(prevYear, prevMonth));
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [varianceOnly, setVarianceOnly] = useState<boolean>(false);

  const qCurrent = useApiQuery<TbResp>(
    ["tb-current", curStart, curEnd],
    `/finance/reports/trial-balance?startDate=${curStart}&endDate=${curEnd}`,
  );
  const qPrior = useApiQuery<TbResp>(
    ["tb-prior", priorStart, priorEnd],
    `/finance/reports/trial-balance?startDate=${priorStart}&endDate=${priorEnd}`,
  );

  const compareRows: CompareRow[] = useMemo(() => {
    const cur = qCurrent.data?.rows ?? [];
    const pri = qPrior.data?.rows ?? [];
    const priMap = new Map(pri.map((r) => [r.code, Number(r.balance)]));
    return cur.map((c) => {
      const curBal = Number(c.balance);
      const priBal = priMap.get(c.code) ?? 0;
      const variance = curBal - priBal;
      const variancePct = priBal !== 0 ? (variance / Math.abs(priBal)) * 100 : (curBal !== 0 ? 100 : 0);
      return {
        code: c.code,
        name: c.name,
        type: c.type,
        currentBalance: curBal,
        priorBalance: priBal,
        variance,
        variancePct,
      };
    }).filter((r) => r.currentBalance !== 0 || r.priorBalance !== 0);
  }, [qCurrent.data, qPrior.data]);

  const filtered = useMemo(() => {
    let rows = compareRows;
    if (typeFilter) rows = rows.filter((r) => r.type === typeFilter);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) =>
        r.code.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)
      );
    }
    if (varianceOnly) rows = rows.filter((r) => Math.abs(r.variance) > 0.01);
    return rows;
  }, [compareRows, typeFilter, search, varianceOnly]);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const significantChanges = compareRows.filter((r) => Math.abs(r.variancePct) >= 25 && Math.abs(r.variance) > 100).length;
  const totalCurrent = compareRows.reduce((s, r) => s + Math.abs(r.currentBalance), 0);
  const totalPrior = compareRows.reduce((s, r) => s + Math.abs(r.priorBalance), 0);

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ["الرمز", "الحساب", "النوع", "الرصيد الحالي", "الرصيد السابق", "الفرق", "نسبة الفرق %"];
    const lines = [
      headers.join(","),
      ...filtered.map((r) =>
        [r.code, r.name, TYPE_LABEL[r.type] ?? r.type, r.currentBalance, r.priorBalance, r.variance, r.variancePct.toFixed(2)].join(",")
      ),
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
        entityType: "report_trial_balance_comparison",
        title: String(`tb-comparison-${curStart}_${curEnd}-vs-${priorStart}_${priorEnd}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  if (qCurrent.isLoading || qPrior.isLoading) return <LoadingSpinner />;

  const cols: DataTableColumn<CompareRow>[] = [
    {
      key: "code",
      header: "الحساب",
      sortable: true,
      render: (r) => (
        <Link href={`/finance/ledger/${r.code}`} className="text-status-info-foreground hover:underline">
          <div className="flex flex-col">
            <span className="font-mono text-xs">{r.code}</span>
            <span className="text-[10px] text-muted-foreground">{r.name}</span>
          </div>
        </Link>
      ),
    },
    {
      key: "type",
      header: "النوع",
      render: (r) => (
        <Badge className={`text-[10px] ${TYPE_COLOR[r.type] ?? ""}`}>
          {TYPE_LABEL[r.type] ?? r.type}
        </Badge>
      ),
    },
    {
      key: "priorBalance",
      header: "الفترة السابقة",
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.priorBalance === 0 ? "—" : formatCurrency(r.priorBalance)}
        </span>
      ),
    },
    {
      key: "currentBalance",
      header: "الفترة الحالية",
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs font-semibold">
          {r.currentBalance === 0 ? "—" : formatCurrency(r.currentBalance)}
        </span>
      ),
    },
    {
      key: "variance",
      header: "الفرق",
      sortable: true,
      render: (r) => {
        if (Math.abs(r.variance) < 0.01) {
          return <span className="text-muted-foreground italic text-xs">—</span>;
        }
        const up = r.variance > 0;
        return (
          <span className={`font-mono text-xs font-semibold inline-flex items-center gap-1 ${up ? "text-emerald-700" : "text-red-700"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}{formatCurrency(r.variance)}
          </span>
        );
      },
    },
    {
      key: "variancePct",
      header: "% الفرق",
      sortable: true,
      render: (r) => {
        if (Math.abs(r.variance) < 0.01) return <span className="text-muted-foreground italic text-xs">—</span>;
        const significant = Math.abs(r.variancePct) >= 25;
        return (
          <span className={`font-mono text-xs ${significant ? "font-bold" : ""} ${r.variancePct > 0 ? "text-emerald-700" : "text-red-700"}`}>
            {r.variancePct > 0 ? "+" : ""}{r.variancePct.toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: "_drilldown",
      header: "تفاصيل",
      render: (r) => (
        <Button asChild variant="ghost" size="sm" className="h-6 text-xs"><Link href={`/finance/ledger/${r.code}`}>
            ledger <ChevronRight className="h-3 w-3 ms-1" />
          </Link></Button>
      ),
    },
  ];

  return (
    <PageShell
      title="مقارنة ميزان المراجعة"
      subtitle="مقارنة جنباً إلى جنب بين فترتين — لكل حساب: الرصيد الحالي vs السابق + الفرق ونسبته"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "مقارنة TB" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 me-1" /> CSV
          </Button>
          <PrintButton
            entityType="report_trial_balance_comparison"
            entityId={`${curStart}..${curEnd}_vs_${priorStart}..${priorEnd}`}
            payload={() => ({
              entity: {
                title: "ميزان مراجعة — مقارنة فترتين",
                currentPeriod: `${curStart} → ${curEnd}`,
                priorPeriod: `${priorStart} → ${priorEnd}`,
                accountCount: filtered.length,
              },
              items: printRows.map((r) => ({
                "الكود": r.code,
                "اسم الحساب": r.name,
                "النوع": r.type,
                "الرصيد الحالي": Number(r.currentBalance ?? 0),
                "الرصيد السابق": Number(r.priorBalance ?? 0),
                "الفارق": Number(r.variance ?? 0),
                "%": Number(r.variancePct ?? 0).toFixed(2),
              })),
            })}
          />
          <Button variant="outline" size="sm" onClick={() => { qCurrent.refetch(); qPrior.refetch(); }}>
            <RefreshCw className="h-4 w-4 me-1" /> تحديث
          </Button>
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> ليش هذا التقرير؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            مقارنة الفترات هي الأداة الأولى للمراجع: "هل ارتفعت المصاريف هذا الشهر
            بشكل غير مبرر؟ هل انخفض الإيراد في قطاع معين؟". الصفحة تجلب TB لفترتين
            وتعرض الفرق لكل حساب. حسابات بانحراف ≥25% + مبلغ &gt;100 ر.س
            تُعتبر تغييرات جوهرية تحتاج تفسيراً.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <Badge variant="outline">الفترة الحالية</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <DateRangePresets
              value={{ from: curStart, to: curEnd }}
              onChange={(r) => { setCurStart(r.from); setCurEnd(r.to); }}
              testidPrefix="tb-comparison-cur-preset"
              hideAllTime
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-xs">من</Label>
                <Input type="date" value={curStart} onChange={(e) => setCurStart(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input type="date" value={curEnd} onChange={(e) => setCurEnd(e.target.value)} className="h-8" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">
              مجموع الأرصدة المطلقة: {formatCurrency(totalCurrent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <Badge variant="outline">الفترة المقارَنة</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">من</Label>
                <Input type="date" value={priorStart} onChange={(e) => setPriorStart(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input type="date" value={priorEnd} onChange={(e) => setPriorEnd(e.target.value)} className="h-8" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">
              مجموع الأرصدة المطلقة: {formatCurrency(totalPrior)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حسابات معروضة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(filtered.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي مع حركة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(compareRows.length)}</p>
          </CardContent>
        </Card>
        <Card className={significantChanges > 0 ? "border-amber-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">تغييرات جوهرية (≥25%)</p>
            <p className={`text-lg font-bold font-mono ${significantChanges > 0 ? "text-amber-700" : ""}`}>
              {formatNumber(significantChanges)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">حسابات بدون فرق</p>
            <p className="text-lg font-bold font-mono">
              {formatNumber(compareRows.filter((r) => Math.abs(r.variance) < 0.01).length)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs flex items-center gap-1">
              <Search className="h-3 w-3" /> ابحث (رمز أو اسم)
            </Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          </div>
          <div className="w-44">
            <Label className="text-xs">نوع الحساب</Label>
            <Select value={typeFilter || "_all"} onValueChange={(v) => setTypeFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">الكل</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant={varianceOnly ? "default" : "outline"} size="sm"
            onClick={() => setVarianceOnly(!varianceOnly)}
            className="h-8"
          >
            {varianceOnly ? "✓ " : ""}مع فرق فقط
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">المقارنة ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا توجد حسابات بهذي الفلاتر"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
