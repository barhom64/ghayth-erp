/**
 * Group / Agent Profitability Report — §11 stub conversion (#1870)
 *
 * Shared component driving two routes:
 *   /umrah/reports/group-profitability  → dimension='group'
 *   /umrah/reports/agent-profitability   → dimension='agent'
 *
 * One row per group/agent with revenue – cost = netProfit + a
 * margin percent. Sorted by netProfit desc so the operator sees the
 * worst losses + best margins at the top of the table.
 *
 * The page used to be a stub in the §11 reports catalog; with the
 * API endpoint /umrah/reports/profitability available the catalog
 * entry can flip to "available".
 */
import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ProfitabilityRow {
  // group dimension
  groupId?: number;
  nuskGroupNumber?: string | null;
  mutamerCount?: number;
  // agent dimension
  agentId?: number;
  groupCount?: number;
  // shared
  name: string | null;
  revenue: number | string;
  cost: number | string;
  netProfit: number | string;
  marginPercent: number | string | null;
}

interface ProfitabilityResp {
  data: ProfitabilityRow[];
  dimension: "group" | "agent";
  totals: { revenue: number; cost: number; netProfit: number };
}

interface SeasonOpt { id: number; title: string }

export function ProfitabilityReport({ dimension }: { dimension: "group" | "agent" }) {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const qs = seasonFilter !== "all" ? `&seasonId=${seasonFilter}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<ProfitabilityResp>(
    ["umrah-profitability", dimension, seasonFilter],
    `/umrah/reports/profitability?dimension=${dimension}${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const seasons = seasonsResp?.data ?? [];
  const rows = data?.data ?? [];

  const title = dimension === "group" ? "تقرير ربحية المجموعة" : "تقرير ربحية الوكيل";
  const idColumn = dimension === "group" ? "groupId" : "agentId";
  const subColumnLabel = dimension === "group" ? "رقم نسك" : "عدد المجموعات";
  const subColumnValue = (r: ProfitabilityRow) => dimension === "group"
    ? (r.nuskGroupNumber ?? "—")
    : String(r.groupCount ?? 0);

  // KPI tiles — totalRevenue / totalCost / totalNetProfit / averageMargin.
  const headlineMargin = useMemo(() => {
    const rev = data?.totals.revenue ?? 0;
    const np = data?.totals.netProfit ?? 0;
    if (!rev) return null;
    return Math.round((np / rev) * 10000) / 100;
  }, [data]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <PageShell
      title={title}
      subtitle="الإيراد × التكلفة × صافي الربح. مرتب من الأعلى ربحية إلى الأقل."
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: title },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[220px]" data-testid="profitability-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="الإيراد الإجمالي" value={data?.totals.revenue ?? 0} testid="kpi-revenue" />
        <KpiCard label="التكلفة الإجمالية" value={data?.totals.cost ?? 0} testid="kpi-cost" />
        <KpiCard
          label="صافي الربح"
          value={data?.totals.netProfit ?? 0}
          testid="kpi-net-profit"
          tone={(data?.totals.netProfit ?? 0) >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="هامش الربح %"
          value={headlineMargin ?? 0}
          testid="kpi-margin"
          suffix="%"
          tone={headlineMargin == null ? undefined : headlineMargin >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="profitability-empty">
              لا بيانات للموسم المحدد.
            </p>
          )}
          <DataTable
            data={rows}
            rowKey={(r) => { const rowKey = (r as any)[idColumn] ?? `${r.name}`; return String(rowKey); }}
            noToolbar
            pageSize={0}
            emptyMessage=""
            columns={[
              { key: "name", header: "الاسم", render: (r) => { const rowKey = (r as any)[idColumn] ?? r.name; return <span data-testid={`profitability-row-${rowKey}`} className="font-medium">{r.name ?? "—"}</span>; } },
              { key: "nuskGroupNumber", header: subColumnLabel, render: (r) => <span className="text-muted-foreground">{subColumnValue(r)}</span> },
              { key: "revenue", header: "الإيراد", align: "end" as const, render: (r) => <span className="font-mono">{formatCurrency(Number(r.revenue) || 0)}</span> },
              { key: "cost", header: "التكلفة", align: "end" as const, render: (r) => <span className="font-mono">{formatCurrency(Number(r.cost) || 0)}</span> },
              { key: "netProfit", header: "صافي الربح", align: "end" as const, render: (r) => { const np = Number(r.netProfit) || 0; const isNeg = np < 0; return <span className={`font-mono ${isNeg ? "text-status-error-foreground" : "text-status-success-foreground"}`}>{formatCurrency(np)}</span>; } },
              { key: "marginPercent", header: "الهامش %", align: "end" as const, render: (r) => { const margin = r.marginPercent == null ? null : Number(r.marginPercent); return <span className="font-mono">{margin == null ? "—" : `${margin}%`}</span>; } },
            ] satisfies DataTableColumn<ProfitabilityRow>[]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function KpiCard({
  label, value, testid, suffix = "", tone,
}: {
  label: string;
  value: number;
  testid: string;
  suffix?: string;
  tone?: "positive" | "negative";
}) {
  const cls = tone === "positive" ? "text-status-success-foreground"
            : tone === "negative" ? "text-status-error-foreground"
            : "";
  const Icon = tone === "positive" ? TrendingUp : tone === "negative" ? TrendingDown : null;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${cls}`} data-testid={`${testid}-value`}>
          {suffix ? `${value}${suffix}` : formatCurrency(value)}
          {Icon && <Icon className="inline-block ms-2 h-4 w-4" />}
        </p>
      </CardContent>
    </Card>
  );
}

export default function GroupProfitabilityPage() {
  return <ProfitabilityReport dimension="group" />;
}