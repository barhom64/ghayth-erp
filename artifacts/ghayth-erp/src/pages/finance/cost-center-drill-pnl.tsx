import { useState, useMemo } from "react";
import { useApiQuery } from "@/lib/api";
import { useRoute, Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
import { formatCurrency } from "@/lib/formatters";
import { exportRowsToCsv } from "@/lib/unified-export";
import { InlineSparkline } from "@/components/shared/inline-sparkline";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { TrendingUp, TrendingDown, ScrollText, Network, ArrowLeftRight, Download } from "lucide-react";

/**
 * Per-CC P&L drill — surfaced from the cost-centres tree page via the
 * BarChart3 button per row. Pays off the journal-line enrichment: now
 * that every JE auto-fills costCenterId, this page can answer
 * «ما هي أرباح/خسائر مركز التكلفة X هذا الشهر؟» on the GL itself,
 * without joins back to source documents.
 *
 * The endpoint returns TWO buckets:
 *   - self:   only JEs tagged exactly with this CC (no roll-up)
 *   - rolled: includes ALL descendants in the cost-centre tree
 * Both are useful: 'self' shows direct activity, 'rolled' shows
 * total responsibility (a branch CC's roll-up is the sum of every
 * project/contract/vehicle under it).
 *
 * Recent JEs list is the operator's drill — click through to the
 * journal-entry detail page to see line-by-line.
 */

interface PnlBucket {
  revenue: number;
  expense: number;
  net: number;
  entries: number;
}

interface RecentJE {
  jeId: number;
  ref: string;
  date: string;
  description: string | null;
  debit: number;
  credit: number;
}

interface PnlResponse {
  costCenter: { id: number; code: string | null; name: string };
  dateFrom: string;
  dateTo: string;
  descendantCount: number;
  buckets: { self: PnlBucket; rolled: PnlBucket };
  recentEntries: RecentJE[];
}

interface MonthlyBucket {
  month: string;
  revenue: number;
  expense: number;
  net: number;
  entries: number;
}

interface SeriesResponse {
  costCenter: { id: number; code: string | null; name: string };
  dateFrom: string;
  dateTo: string;
  buckets: MonthlyBucket[];
  totals: { revenue: number; expense: number; net: number; entries: number };
}

interface YoyResponse {
  costCenter: { id: number; code: string | null; name: string };
  current: { dateFrom: string; dateTo: string; bucket: PnlBucket };
  prior:   { dateFrom: string; dateTo: string; bucket: PnlBucket };
  delta: {
    revenue: number;
    expense: number;
    net: number;
    entries: number;
    revenuePct: number | null;
    expensePct: number | null;
    netPct: number | null;
  };
}

function defaultRange(): { from: string; to: string } {
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export default function CostCenterDrillPnlPage() {
  const [, params] = useRoute<{ id: string }>("/finance/cost-centers/:id/pnl");
  const id = params?.id ? Number(params.id) : null;
  const def = useMemo(defaultRange, []);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  const path = id
    ? `/finance/cost-centers/${id}/pnl?dateFrom=${from}&dateTo=${to}`
    : null;
  const { data, isLoading, error, refetch } = useApiQuery<PnlResponse>(
    ["cost-center-pnl", String(id ?? ""), from, to],
    path,
  );

  // Monthly trend and YoY — same pattern as the per-entity drill.
  // Both inherit the date range; both null when id is missing.
  const seriesPath = id
    ? `/finance/cost-centers/${id}/series?dateFrom=${from}&dateTo=${to}`
    : null;
  const { data: series } = useApiQuery<SeriesResponse>(
    ["cost-center-series", String(id ?? ""), from, to],
    seriesPath,
  );
  const yoyPath = id
    ? `/finance/cost-centers/${id}/yoy?dateFrom=${from}&dateTo=${to}`
    : null;
  const { data: yoy } = useApiQuery<YoyResponse>(
    ["cost-center-yoy", String(id ?? ""), from, to],
    yoyPath,
  );

  // P&L breakdown rows for print — the revenue / expense / net lines, each
  // showing both the self (direct) and rolled (incl. descendants) figures so
  // the printed قائمة دخل mirrors the two on-screen bucket cards.
  const pnlRows = useMemo(() => {
    if (!data) return [] as { بند: string; ذاتي: number; تجميعي: number }[];
    return [
      { بند: "الإيرادات", ذاتي: data.buckets.self.revenue, تجميعي: data.buckets.rolled.revenue },
      { بند: "المصروفات", ذاتي: data.buckets.self.expense, تجميعي: data.buckets.rolled.expense },
      { بند: "الصافي", ذاتي: data.buckets.self.net, تجميعي: data.buckets.rolled.net },
    ];
  }, [data]);
  const { sortedRows: printRows } = usePrintRows<{ بند: string; ذاتي: number; تجميعي: number }>(pnlRows);

  return (
    <PageShell
      title={data ? `أرباح وخسائر — ${data.costCenter.name}` : "أرباح وخسائر مركز التكلفة"}
      subtitle={data?.costCenter.code ? `${data.costCenter.code} · ${data.descendantCount} مركز فرعي` : undefined}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/cost-centers/tree", label: "شجرة مراكز التكلفة" },
        { label: "أرباح وخسائر" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {data && id != null && (
            <PrintButton
              entityType="report_finance_cost_center_pnl"
              entityId={String(id)}
              size="icon"
              payload={() => ({
                entity: {
                  title: `أرباح وخسائر — ${data.costCenter.name}`,
                  total: printRows.length,
                },
                items: printRows.map((r) => ({
                  "البند": r.بند,
                  "ذاتي": r.ذاتي,
                  "تجميعي": r.تجميعي,
                })),
              })}
            />
          )}
          {data && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const fname = `cost-center-pnl-${id}`;
                void exportRowsToCsv({
                  entityType: "report_cost_center_pnl",
                  title: fname,
                  rows: [
                    { metric: "إيرادات (ذاتي)",       value: String(data.buckets.self.revenue) },
                    { metric: "مصروفات (ذاتي)",       value: String(data.buckets.self.expense) },
                    { metric: "صافي (ذاتي)",          value: String(data.buckets.self.net) },
                    { metric: "إيرادات (تجميعي)",     value: String(data.buckets.rolled.revenue) },
                    { metric: "مصروفات (تجميعي)",     value: String(data.buckets.rolled.expense) },
                    { metric: "صافي (تجميعي)",        value: String(data.buckets.rolled.net) },
                    { metric: "عدد القيود (تجميعي)", value: String(data.buckets.rolled.entries) },
                    ...(series?.buckets ?? []).map((b) => ({
                      metric: `شهر ${b.month}`,
                      value: `${b.revenue}|${b.expense}|${b.net}|${b.entries}`,
                    })),
                  ],
                  columns: [
                    { key: "metric", label: "البيان" },
                    { key: "value",  label: "القيمة" },
                  ],
                }).catch((err) => console.error("[cost-center-pnl export] failed", err));
              }}
              data-testid="cost-center-pnl-export-csv"
            >
              <Download className="h-4 w-4 ms-1" />
              CSV
            </Button>
          )}
          <Button asChild variant="ghost" data-testid="cost-center-pnl-back"><Link href="/finance/cost-centers/tree">
              <Network className="h-4 w-4 ms-1" />
              رجوع للشجرة
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
            testidPrefix="cost-center-pnl-preset"
            hideAllTime
          />
          <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs text-muted-foreground">من تاريخ</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40 h-8 text-xs"
              data-testid="cost-center-pnl-from"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40 h-8 text-xs"
              data-testid="cost-center-pnl-to"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            data-testid="cost-center-pnl-refresh"
          >
            تحديث
          </Button>
          </div>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <BucketCard
                title="على هذا المركز فقط"
                bucket={data.buckets.self}
                series={series ?? null}
                testid="cost-center-pnl-self"
              />
              <BucketCard
                title={`تجميعي (يشمل ${data.descendantCount} مركز فرعي)`}
                bucket={data.buckets.rolled}
                series={series ?? null}
                testid="cost-center-pnl-rolled"
              />
            </div>

            {yoy && <CcYoyCard yoy={yoy} />}

            {series && series.buckets.length > 0 && (
              <CcTrendCard series={series} />
            )}

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  آخر القيود ({data.recentEntries.length})
                </CardTitle>
                <Button asChild
                    variant="ghost"
                    size="sm"
                    data-testid="cost-center-pnl-all-entries"
                  ><Link href={`/finance/journal?costCenterId=${id}&dateFrom=${from}&dateTo=${to}`}>
                    عرض الكل
                    <ArrowLeftRight className="h-3.5 w-3.5 me-1" />
                  </Link></Button>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentEntries.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    لا توجد قيود في هذه الفترة
                  </div>
                ) : (
                  <div className="divide-y" data-testid="cost-center-pnl-entries-list">
                    {data.recentEntries.map((e) => (
                      <Link
                        key={e.jeId}
                        href={`/finance/journal/${e.jeId}`}
                        data-testid={`cost-center-pnl-entry-${e.jeId}`}
                      >
                        <div className="p-2 flex items-center gap-2 hover:bg-muted/30 cursor-pointer">
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {e.ref}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.date).toLocaleDateString("ar-SA")}
                          </span>
                          <span className="text-sm flex-1 truncate">
                            {e.description ?? "—"}
                          </span>
                          <span className="text-xs font-mono">{formatCurrency(e.debit || e.credit)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}

function BucketCard({
  title, bucket, series, testid,
}: {
  title: string;
  bucket: PnlBucket;
  series: SeriesResponse | null;
  testid: string;
}) {
  const positive = bucket.net >= 0;
  // Both bucket cards (self + rolled) share the SAME series here —
  // CcTrendCard renders the rolled series; the operator's view of
  // the trend on EACH metric is the same regardless of which bucket
  // they're reading. The split would matter only if the backend
  // emitted a per-bucket series, which we'd consider a future PR.
  const revSpark = series?.buckets.slice(-12).map((b) => b.revenue) ?? [];
  const expSpark = series?.buckets.slice(-12).map((b) => b.expense) ?? [];
  const netSpark = series?.buckets.slice(-12).map((b) => b.net) ?? [];
  return (
    <Card data-testid={testid}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm text-muted-foreground font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="الإيرادات" value={bucket.revenue} icon={TrendingUp} tone="success" spark={revSpark} testid={`${testid}-revenue`} />
          <Metric label="المصروفات" value={bucket.expense} icon={TrendingDown} tone="warning" spark={expSpark} testid={`${testid}-expense`} />
          <Metric
            label="الصافي"
            value={bucket.net}
            icon={positive ? TrendingUp : TrendingDown}
            tone={positive ? "success" : "warning"}
            spark={netSpark}
            testid={`${testid}-net`}
            highlight
          />
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {bucket.entries.toLocaleString("ar-SA")} قيد
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label, value, icon: Icon, tone, highlight, spark, testid,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "default";
  highlight?: boolean;
  spark?: number[];
  testid: string;
}) {
  const toneClass =
    tone === "success" ? "text-status-success-foreground"
    : tone === "warning" ? "text-status-warning-foreground"
    : "text-foreground";
  const sparkTone =
    tone === "success" ? "success"
    : tone === "warning" ? "warning"
    : "neutral";
  return (
    <div className="flex flex-col" data-testid={testid}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`${highlight ? "text-xl font-bold" : "text-base font-medium"} ${toneClass}`}>
        {formatCurrency(value)}
      </div>
      {spark && spark.length >= 2 && (
        <InlineSparkline
          values={spark}
          tone={sparkTone}
          testid={`${testid}-spark`}
        />
      )}
    </div>
  );
}

// Mirror of TrendCard from entity-pnl. Kept inline here so the CC
// drill page remains a self-contained file — the visual shape is
// identical, the data type signature differs (rolled buckets only,
// no per-CC split).
function CcTrendCard({ series }: { series: SeriesResponse }) {
  const buckets = series.buckets;
  const max = Math.max(
    1,
    ...buckets.map((b) => Math.max(Math.abs(b.revenue), Math.abs(b.expense))),
  );
  const BAR_GROUP_WIDTH = 40;
  const BAR_WIDTH = 14;
  const CHART_HEIGHT = 140;
  const PADDING_TOP = 8;
  const PADDING_BOTTOM = 28;
  const usableH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = Math.max(BAR_GROUP_WIDTH * buckets.length, 320);

  return (
    <Card className="mb-3" data-testid="cost-center-pnl-trend">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          الاتجاه الشهري ({buckets.length} شهر)
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          الصافي التجميعي: {formatCurrency(series.totals.net)}
        </span>
      </CardHeader>
      <CardContent className="p-3">
        <div className="overflow-x-auto">
          <svg
            width={chartWidth}
            height={CHART_HEIGHT}
            className="block"
            data-testid="cost-center-pnl-trend-chart"
          >
            <line
              x1={0}
              x2={chartWidth}
              y1={CHART_HEIGHT - PADDING_BOTTOM}
              y2={CHART_HEIGHT - PADDING_BOTTOM}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
            {buckets.map((b, i) => {
              const groupX = i * BAR_GROUP_WIDTH;
              const revH = (b.revenue / max) * usableH;
              const expH = (b.expense / max) * usableH;
              const yBase = CHART_HEIGHT - PADDING_BOTTOM;
              return (
                <g key={b.month} data-testid={`cost-center-pnl-trend-bar-${b.month}`}>
                  <rect
                    x={groupX + 4}
                    y={yBase - revH}
                    width={BAR_WIDTH}
                    height={revH}
                    className="fill-status-success-foreground"
                    opacity={0.85}
                  >
                    <title>{`${b.month} · إيراد ${formatCurrency(b.revenue)}`}</title>
                  </rect>
                  <rect
                    x={groupX + 4 + BAR_WIDTH + 2}
                    y={yBase - expH}
                    width={BAR_WIDTH}
                    height={expH}
                    className="fill-status-warning-foreground"
                    opacity={0.85}
                  >
                    <title>{`${b.month} · مصروف ${formatCurrency(b.expense)}`}</title>
                  </rect>
                  <text
                    x={groupX + BAR_GROUP_WIDTH / 2}
                    y={CHART_HEIGHT - 8}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-muted-foreground"
                  >
                    {b.month.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

// Mirror of YoyCard from entity-pnl. 3 delta cells, expense delta
// inverts tone (rising cost = warning, not success).
function CcYoyCard({ yoy }: { yoy: YoyResponse }) {
  return (
    <Card className="mb-3" data-testid="cost-center-pnl-yoy">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          مقارنة سنوية (YoY)
        </CardTitle>
        <div className="text-xs text-muted-foreground mt-1">
          {yoy.current.dateFrom} → {yoy.current.dateTo}
          {" · مقارنة بـ "}
          {yoy.prior.dateFrom} → {yoy.prior.dateTo}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-3 gap-3">
          <CcDeltaCell
            label="الإيرادات"
            current={yoy.current.bucket.revenue}
            prior={yoy.prior.bucket.revenue}
            delta={yoy.delta.revenue}
            pct={yoy.delta.revenuePct}
            higherIsBetter={true}
            testid="cost-center-pnl-yoy-revenue"
          />
          <CcDeltaCell
            label="المصروفات"
            current={yoy.current.bucket.expense}
            prior={yoy.prior.bucket.expense}
            delta={yoy.delta.expense}
            pct={yoy.delta.expensePct}
            higherIsBetter={false}
            testid="cost-center-pnl-yoy-expense"
          />
          <CcDeltaCell
            label="الصافي"
            current={yoy.current.bucket.net}
            prior={yoy.prior.bucket.net}
            delta={yoy.delta.net}
            pct={yoy.delta.netPct}
            higherIsBetter={true}
            testid="cost-center-pnl-yoy-net"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CcDeltaCell({
  label, current, prior, delta, pct, higherIsBetter, testid,
}: {
  label: string;
  current: number;
  prior: number;
  delta: number;
  pct: number | null;
  higherIsBetter: boolean;
  testid: string;
}) {
  const isImprovement = higherIsBetter ? delta > 0 : delta < 0;
  const isDeterioration = higherIsBetter ? delta < 0 : delta > 0;
  const toneClass =
    isImprovement ? "text-status-success-foreground"
    : isDeterioration ? "text-status-warning-foreground"
    : "text-muted-foreground";
  const Arrow = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="flex flex-col" data-testid={testid}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{formatCurrency(current)}</div>
      <div className="text-xs text-muted-foreground">
        السابق: {formatCurrency(prior)}
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium mt-1 ${toneClass}`}>
        <Arrow className="h-3 w-3" />
        <span>{delta >= 0 ? "+" : ""}{formatCurrency(delta)}</span>
        {pct != null && (
          <span className="text-xs">
            ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
          </span>
        )}
        {pct == null && <span className="text-xs text-muted-foreground">(—)</span>}
      </div>
    </div>
  );
}
