import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
import { ParetoMarker, computeParetoCumulative } from "@/components/shared/pareto-marker";
import { AnomalyBadge } from "@/components/shared/anomaly-badge";
import { exportRowsToCsv } from "@/lib/unified-export";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, ArrowUpDown, ExternalLink, BarChart3, Download, Network } from "lucide-react";

/**
 * Cost-centre ranking — mirror of the per-entity ranking page but for
 * CCs. Answers "which CCs bled the most cash this quarter?" or
 * "which projects have the strongest margin?".
 *
 * Each row aggregates THIS CC + its descendants (recursive CTE on
 * the backend) so the ranking reflects total responsibility. Click a
 * row → drill into /finance/cost-centers/:id/pnl for the full P&L.
 *
 * Linked from the CC tree page (`/finance/cost-centers/tree`) so the
 * operator can pivot from hierarchical view → ranked list with one
 * click.
 */

interface PriorBucket {
  revenue: number;
  expense: number;
  net: number;
  entries: number;
}

interface RankingRow {
  ccId: number;
  ccCode: string | null;
  ccName: string;
  revenue: number;
  expense: number;
  net: number;
  entries: number;
  /** Present only when includePrior=true. */
  prior?: PriorBucket | null;
}

interface RankingResponse {
  metric: string;
  direction: "asc" | "desc";
  dateFrom: string;
  dateTo: string;
  limit: number;
  rootId: number | null;
  includePrior?: boolean;
  rows: RankingRow[];
}

const METRIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "expense", label: "المصروف" },
  { value: "revenue", label: "الإيراد" },
  { value: "net",     label: "الصافي" },
  { value: "entries", label: "عدد القيود" },
];

export default function CostCenterRankingPage() {
  const [metric, setMetric] = useState<string>("expense");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(20);
  const [includePrior, setIncludePrior] = useState(false);

  const qs = new URLSearchParams({
    metric,
    direction,
    limit: String(limit),
    ...(includePrior ? { includePrior: "true" } : {}),
  });
  if (from) qs.set("dateFrom", from);
  if (to) qs.set("dateTo", to);

  const { data, isLoading, error, refetch } = useApiQuery<RankingResponse>(
    ["cc-ranking", metric, direction, from, to, String(limit), String(includePrior)],
    `/finance/cost-centers/ranking?${qs.toString()}`,
  );

  return (
    <PageShell
      title="تصنيف مراكز التكلفة"
      subtitle="ترتيب مراكز التكلفة حسب الإيراد أو المصروف أو الصافي — يجمع كل مركز مع فروعه"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/cost-centers/tree", label: "شجرة مراكز التكلفة" },
        { label: "التصنيف" },
      ]}
      actions={
        <div className="flex gap-2">
          {data && data.rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const fname = `cc-ranking-${metric}-${direction}`;
                void exportRowsToCsv({
                  entityType: "report_cc_ranking",
                  title: fname,
                  rows: data.rows.map((r, idx) => ({
                    rank: String(idx + 1),
                    ccId: String(r.ccId),
                    ccCode: r.ccCode ?? "—",
                    ccName: r.ccName,
                    revenue: String(r.revenue),
                    expense: String(r.expense),
                    net: String(r.net),
                    entries: String(r.entries),
                  })),
                  columns: [
                    { key: "rank",     label: "الترتيب" },
                    { key: "ccId",     label: "المعرف" },
                    { key: "ccCode",   label: "الرمز" },
                    { key: "ccName",   label: "الاسم" },
                    { key: "revenue",  label: "الإيراد" },
                    { key: "expense",  label: "المصروف" },
                    { key: "net",      label: "الصافي" },
                    { key: "entries",  label: "عدد القيود" },
                  ],
                }).catch((err) => console.error("[cc-ranking export] failed", err));
              }}
              data-testid="cc-ranking-export-csv"
            >
              <Download className="h-4 w-4 ms-1" />
              CSV
            </Button>
          )}
          <Button asChild variant="ghost" data-testid="cc-ranking-tree"><Link href="/finance/cost-centers/tree">
              <Network className="h-4 w-4 ms-1" />
              الشجرة
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3 flex flex-col gap-2">
          <DateRangePresets
            value={{ from, to }}
            onChange={(r) => { setFrom(r.from); setTo(r.to); }}
            testidPrefix="cc-ranking-preset"
          />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">المقياس</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-8 text-xs" data-testid="cc-ranking-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">الترتيب</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "desc" | "asc")}>
                <SelectTrigger className="h-8 text-xs" data-testid="cc-ranking-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">الأعلى أولاً</SelectItem>
                  <SelectItem value="asc">الأدنى أولاً</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">من تاريخ</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 text-xs"
                data-testid="cc-ranking-from"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-xs"
                data-testid="cc-ranking-to"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">العدد</Label>
              <Input
                type="number"
                min={5}
                max={100}
                value={limit}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setLimit(Math.max(5, Math.min(100, v)));
                }}
                className="h-8 text-xs"
                data-testid="cc-ranking-limit"
              />
            </div>
          </div>
          <label
            className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer"
            data-testid="cc-ranking-include-prior-toggle"
          >
            <input
              type="checkbox"
              checked={includePrior}
              onChange={(e) => setIncludePrior(e.target.checked)}
              className="h-3 w-3"
            />
            مع المقارنة بالعام السابق
          </label>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                مراكز التكلفة ·{" "}
                {METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? metric}
                {direction === "asc" ? " (تصاعدي)" : " (تنازلي)"}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {data.rows.length.toLocaleString("ar-SA")} من أصل {limit}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {data.rows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  لا توجد بيانات في الفترة المحددة
                </div>
              ) : (
                <RankingList rows={data.rows} metric={metric} />
              )}
            </CardContent>
          </Card>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}

// Same metricValue shape as the entity-ranking page — used by
// AnomalyBadge so prior-period comparison aligns with the ranked metric.
function metricValue(
  row: { revenue: number; expense: number; net: number; entries: number },
  metric: string,
): number {
  switch (metric) {
    case "revenue": return row.revenue;
    case "expense": return row.expense;
    case "net":     return row.net;
    case "entries": return row.entries;
    default:        return 0;
  }
}

function RankingList({ rows, metric }: { rows: RankingRow[]; metric: string }) {
  const maxRev = Math.max(...rows.map((r) => r.revenue), 0);
  const maxExp = Math.max(...rows.map((r) => r.expense), 0);
  const metricValues = rows.map((r) => {
    switch (metric) {
      case "revenue": return r.revenue;
      case "expense": return r.expense;
      case "net":     return r.net;
      case "entries": return r.entries;
      default:        return 0;
    }
  });
  const { cumulativePcts, thresholdIdx } = computeParetoCumulative(metricValues);
  return (
    <div className="divide-y" data-testid="cc-ranking-list">
      {rows.map((r, idx) => {
        const revPct = maxRev > 0 ? Math.round((r.revenue / maxRev) * 100) : 0;
        const expPct = maxExp > 0 ? Math.round((r.expense / maxExp) * 100) : 0;
        const netPositive = r.net >= 0;
        const cumulativePct = cumulativePcts[idx] ?? 0;
        const isThresholdRow = idx === thresholdIdx;
        return (
          <Link
            key={r.ccId}
            href={`/finance/cost-centers/${r.ccId}/pnl`}
            data-testid={`cc-ranking-row-${r.ccId}`}
          >
            <div className={`p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer ${isThresholdRow ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
              <Badge variant="outline" className="text-xs font-mono shrink-0">
                #{idx + 1}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{r.ccName}</span>
                  <ParetoMarker
                    cumulativePct={cumulativePct}
                    isThresholdRow={isThresholdRow}
                    testidPrefix={`cc-ranking-pareto-${r.ccId}`}
                  />
                  {r.ccCode && (
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">{r.ccCode}</span>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {r.entries.toLocaleString("ar-SA")} قيد
                  </Badge>
                  {r.prior !== undefined && (
                    <AnomalyBadge
                      current={metricValue(r, metric)}
                      prior={r.prior ? metricValue(r.prior, metric) : null}
                      metric={metric as "revenue" | "expense" | "net" | "entries"}
                      testidPrefix={`cc-ranking-anomaly-${r.ccId}`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <MetricBar label="إيراد" value={r.revenue} pct={revPct} tone="success" icon={TrendingUp} />
                  <MetricBar label="مصروف" value={r.expense} pct={expPct} tone="warning" icon={TrendingDown} />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {netPositive ? (
                        <TrendingUp className="h-3 w-3 text-status-success-foreground" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-status-warning-foreground" />
                      )}
                      صافي
                    </div>
                    <div
                      className={`text-sm font-bold ${
                        netPositive ? "text-status-success-foreground" : "text-status-warning-foreground"
                      }`}
                    >
                      {formatCurrency(r.net)}
                    </div>
                  </div>
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function MetricBar({
  label, value, pct, tone, icon: Icon,
}: {
  label: string;
  value: number;
  pct: number;
  tone: "success" | "warning";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "success" ? "text-status-success-foreground bg-status-success-surface" : "text-status-warning-foreground bg-status-warning-surface";
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-xs font-medium">{formatCurrency(value)}</div>
      <div className="w-full h-1 bg-muted rounded mt-0.5 overflow-hidden">
        <div className={`h-full rounded ${toneClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
