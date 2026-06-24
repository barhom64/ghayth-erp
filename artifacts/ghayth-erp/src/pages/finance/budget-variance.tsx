import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import { TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface VarianceLine {
  accountCode: string;
  accountName: string | null;
  accountType: string | null;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  utilizationPct: number;
  status: "over_budget" | "near_limit" | "within_budget" | "no_budget";
}

interface VarianceResponse {
  period: string;
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  lines: VarianceLine[];
}

const STATUS_LABEL: Record<VarianceLine["status"], string> = {
  over_budget:   "تجاوز الميزانية",
  near_limit:    "اقترب من السقف",
  within_budget: "ضمن الميزانية",
  no_budget:     "بدون ميزانية",
};

const STATUS_BADGE: Record<VarianceLine["status"], string> = {
  over_budget:   "bg-red-100 text-status-error-foreground",
  near_limit:    "bg-amber-100 text-status-warning-foreground",
  within_budget: "bg-emerald-100 text-emerald-800",
  no_budget:     "bg-gray-100 text-gray-700",
};

export default function BudgetVariancePage() {
  const defaultPeriod = `${currentYearRiyadh()}-${currentMonthPaddedRiyadh()}`;
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [filters, setFilters] = useFilters();

  const { data, isLoading, isError } = useApiQuery<VarianceResponse>(
    ["budget-variance", period],
    `/finance/budget/variance?period=${encodeURIComponent(period)}`,
  );

  const lines = data?.lines ?? [];
  const filtered = applyFilters(lines, filters, {
    searchFields: ["accountCode", "accountName"],
    statusField: "status",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;

  if (isError || !data) return <ErrorState />;


  const overCount = lines.filter((l) => l.status === "over_budget").length;

  const cols: DataTableColumn<VarianceLine>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      render: (l) => (
        <div className="flex flex-col">
          <Link href={`/finance/accounts/${l.accountCode}`}
            className="font-mono text-xs text-status-info-foreground hover:underline">
            {l.accountCode}
          </Link>
          {l.accountName && <span className="text-[10px] text-muted-foreground">{l.accountName}</span>}
        </div>
      ),
    },
    {
      key: "accountType",
      header: "النوع",
      render: (l) => l.accountType
        ? <Badge variant="outline" className="text-[10px]">{l.accountType}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "budgetAmount",
      header: "الميزانية",
      render: (l) => <span className="font-mono text-xs">{formatCurrency(l.budgetAmount)}</span>,
    },
    {
      key: "actualAmount",
      header: "الفعلي",
      render: (l) => <span className="font-mono text-xs">{formatCurrency(l.actualAmount)}</span>,
    },
    {
      key: "variance",
      header: "الفرق",
      render: (l) => {
        const v = l.variance;
        return (
          <span className={`font-mono text-xs font-semibold
            ${v < 0 ? "text-status-error-foreground" : v > 0 ? "text-emerald-700" : ""}`}>
            {v > 0 ? "+" : ""}{formatCurrency(v)}
          </span>
        );
      },
    },
    {
      key: "utilizationPct",
      header: "% الاستخدام",
      render: (l) => {
        const pct = l.utilizationPct;
        if (l.budgetAmount === 0) return <span className="text-muted-foreground italic text-xs">—</span>;
        const barColor = pct > 100 ? "bg-status-error-surface0" : pct > 90 ? "bg-status-warning-surface0" : "bg-emerald-500";
        return (
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs font-semibold w-12 text-end
              ${pct > 100 ? "text-status-error-foreground" : pct > 90 ? "text-status-warning-foreground" : "text-emerald-700"}`}>
              {pct.toFixed(0)}%
            </span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-[60px]">
              <div className={`h-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "الحالة",
      render: (l) => (
        <Badge className={`text-[10px] ${STATUS_BADGE[l.status]}`}>
          {STATUS_LABEL[l.status]}
        </Badge>
      ),
    },
  ];

  return (
    <PageShell
      title="تقرير انحراف الميزانية"
      subtitle="انحراف الموازنة — لكل حساب: المخطط مقابل الفعلي خلال الفترة، مع تمييز التجاوزات والاقتراب من السقف"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/budget", label: "الميزانية" },
        { label: "الانحراف" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">الفترة:</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-8 w-36 text-xs font-mono"
          />
          <PrintButton
            entityType="report_finance_budget_variance"
            entityId={period}
            size="icon"
            payload={() => ({
              entity: { title: `انحراف الميزانية — ${period}`, total: printRows.length },
              items: printRows.map((l) => ({
                "الحساب": l.accountCode,
                "الاسم": l.accountName || "—",
                "النوع": l.accountType || "—",
                "الميزانية": Number(l.budgetAmount || 0),
                "الفعلي": Number(l.actualAmount || 0),
                "الانحراف": Number(l.variance || 0),
                "%": Number(l.variancePct || 0).toFixed(1),
                "% الاستخدام": Number(l.utilizationPct || 0).toFixed(1),
                "الحالة": STATUS_LABEL[l.status as keyof typeof STATUS_LABEL] || l.status,
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> ما هو تقرير الانحراف؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            لكل حساب فيه ميزانية مدخلة للفترة المختارة، يقارن المقرر بالفعلي المحسوب
            من قيود الـ GL. الفرق + النسبة مع تصنيف تلقائي: تجاوز (أحمر) /
            اقتراب من السقف ≥90% (كهرماني) / ضمن الميزانية (أخضر). تستخدم للتدخل
            المبكر قبل نهاية الشهر.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الميزانية</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(data.totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الفعلي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(data.totalActual)}</p>
          </CardContent>
        </Card>
        <Card className={data.totalVariance < 0 ? "border-red-400" : "border-emerald-400"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> الفرق الكلي
            </p>
            <p className={`text-lg font-bold font-mono ${data.totalVariance < 0 ? "text-status-error-foreground" : "text-emerald-700"}`}>
              {data.totalVariance > 0 ? "+" : ""}{formatCurrency(data.totalVariance)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> تجاوز الميزانية
            </p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{overCount}</p>
          </CardContent>
        </Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برمز أو اسم الحساب...",
          statuses: [
            { value: "over_budget", label: "تجاوز الميزانية" },
            { value: "near_limit", label: "اقترب من السقف" },
            { value: "within_budget", label: "ضمن الميزانية" },
            { value: "no_budget", label: "بدون ميزانية" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            البنود · {data.period} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            noToolbar
            emptyMessage={
              filters.status
                ? `لا توجد بنود بحالة "${STATUS_LABEL[filters.status as VarianceLine["status"]]}"`
                : "ما في ميزانية مُعرّفة لهذه الفترة — افتح /finance/budget لإضافة بنود"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
