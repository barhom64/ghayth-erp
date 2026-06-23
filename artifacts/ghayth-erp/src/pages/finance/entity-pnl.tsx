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
import { TrendingUp, TrendingDown, ScrollText, ArrowLeftRight, User, Download } from "lucide-react";

/**
 * Per-entity P&L drill — pays off the journal-line dimensional
 * enrichment. For any of the 9 routable entities (client, vendor,
 * employee, vehicle, driver, project, contract, umrah_agent,
 * umrah_season), this page renders the lifetime (or date-ranged)
 * P&L computed straight from journal_lines.
 *
 * Routed via /finance/entity-pnl/:entityType/:entityId so any entity
 * detail page can link directly. Endpoint: GET
 * /finance/entity-pnl/:entityType/:entityId?dateFrom=&dateTo=
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
  entity: { type: string; id: number; name: string };
  dateFrom: string;
  dateTo: string;
  bucket: PnlBucket;
  recentEntries: RecentJE[];
}

interface MonthlyBucket {
  month: string; // YYYY-MM
  revenue: number;
  expense: number;
  net: number;
  entries: number;
}

interface SeriesResponse {
  entityType: string;
  entityId: number;
  dateFrom: string;
  dateTo: string;
  buckets: MonthlyBucket[];
  totals: { revenue: number; expense: number; net: number; entries: number };
}

interface YoyResponse {
  entityType: string;
  entityId: number;
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

const TYPE_LABEL: Record<string, string> = {
  client: "عميل",
  vendor: "مورد",
  employee: "موظف",
  vehicle: "مركبة",
  driver: "سائق",
  project: "مشروع",
  contract: "عقد",
  umrah_agent: "وكيل عمرة",
  umrah_season: "موسم عمرة",
};

const BACK_LINK: Record<string, string> = {
  client: "/finance/customers",
  vendor: "/finance/vendors",
  employee: "/hr/employees",
  vehicle: "/fleet/vehicles",
  driver: "/fleet/drivers",
  project: "/projects",
  contract: "/legal/contracts",
  umrah_agent: "/umrah/agents",
  umrah_season: "/umrah/seasons",
};

export default function EntityPnlPage() {
  const [, params] = useRoute<{ entityType: string; entityId: string }>(
    "/finance/entity-pnl/:entityType/:entityId",
  );
  const entityType = params?.entityType ?? "";
  const entityId = params?.entityId ? Number(params.entityId) : null;
  // Default to all-time; the operator can narrow with the date inputs.
  const def = useMemo(() => ({ from: "", to: "" }), []);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  const qs = [
    from ? `dateFrom=${from}` : null,
    to ? `dateTo=${to}` : null,
  ].filter(Boolean).join("&");
  const path = entityId
    ? `/finance/entity-pnl/${entityType}/${entityId}${qs ? "?" + qs : ""}`
    : null;
  const { data, isLoading, error, refetch } = useApiQuery<PnlResponse>(
    ["entity-pnl", entityType, String(entityId ?? ""), from, to],
    path,
  );

  // Monthly time-series for the trend chart. Defaults to last 12
  // months at the backend, but inherits the date filter when the
  // operator narrows. Falls back to lifetime if from/to are blank
  // — same defaulting logic the backend uses.
  const seriesPath = entityId
    ? `/finance/entity-pnl/${entityType}/${entityId}/series${qs ? "?" + qs : ""}`
    : null;
  const { data: series } = useApiQuery<SeriesResponse>(
    ["entity-pnl-series", entityType, String(entityId ?? ""), from, to],
    seriesPath,
  );

  // YoY — current YTD vs same period last year. Inherits the date
  // filter; defaults to year-to-date when blank. Independent of the
  // monthly series so the operator can frame "this month vs same month
  // last year" with one input change.
  const yoyPath = entityId
    ? `/finance/entity-pnl/${entityType}/${entityId}/yoy${qs ? "?" + qs : ""}`
    : null;
  const { data: yoy } = useApiQuery<YoyResponse>(
    ["entity-pnl-yoy", entityType, String(entityId ?? ""), from, to],
    yoyPath,
  );

  const backHref = BACK_LINK[entityType] ?? "/finance";

  // P&L breakdown rows for print — the revenue / expense / net lines of
  // the lifetime (or date-ranged) bucket. One line per row so the printed
  // قائمة دخل mirrors the on-screen cards.
  const pnlRows = useMemo(() => {
    if (!data) return [] as { بند: string; المبلغ: number }[];
    return [
      { بند: "الإيرادات", المبلغ: data.bucket.revenue },
      { بند: "المصروفات", المبلغ: data.bucket.expense },
      { بند: "الصافي", المبلغ: data.bucket.net },
    ];
  }, [data]);
  const { sortedRows: printRows } = usePrintRows<{ بند: string; المبلغ: number }>(pnlRows);

  return (
    <PageShell
      title={data ? `أرباح وخسائر — ${data.entity.name}` : "أرباح وخسائر الكيان"}
      subtitle={data ? `${TYPE_LABEL[entityType] ?? entityType} · ${data.bucket.entries.toLocaleString("ar-SA")} قيد` : undefined}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: backHref, label: TYPE_LABEL[entityType] ?? "الكيانات" },
        { label: "أرباح وخسائر" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {data && entityId != null && (
            <PrintButton
              entityType="report_finance_entity_pnl"
              entityId={String(entityId)}
              size="icon"
              payload={() => ({
                entity: {
                  title: `أرباح وخسائر — ${data.entity.name}`,
                  total: printRows.length,
                },
                items: printRows.map((r) => ({
                  "البند": r.بند,
                  "المبلغ": r.المبلغ,
                })),
              })}
            />
          )}
          {data && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const fname = `entity-pnl-${entityType}-${entityId}`;
                void exportRowsToCsv({
                  entityType: "report_entity_pnl",
                  title: fname,
                  rows: [
                    { metric: "الإيرادات", value: String(data.bucket.revenue) },
                    { metric: "المصروفات", value: String(data.bucket.expense) },
                    { metric: "الصافي", value: String(data.bucket.net) },
                    { metric: "عدد القيود", value: String(data.bucket.entries) },
                    ...(series?.buckets ?? []).map((b) => ({
                      metric: `شهر ${b.month}`,
                      value: `${b.revenue}|${b.expense}|${b.net}|${b.entries}`,
                    })),
                  ],
                  columns: [
                    { key: "metric", label: "البيان" },
                    { key: "value",  label: "القيمة" },
                  ],
                }).catch((err) => console.error("[entity-pnl export] failed", err));
              }}
              data-testid="entity-pnl-export-csv"
            >
              <Download className="h-4 w-4 ms-1" />
              CSV
            </Button>
          )}
          <Button asChild variant="ghost" data-testid="entity-pnl-back"><Link href={backHref}>
              <User className="h-4 w-4 ms-1" />
              رجوع
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
            testidPrefix="entity-pnl-preset"
          />
          <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs text-muted-foreground">من تاريخ</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40 h-8 text-xs"
              data-testid="entity-pnl-from"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40 h-8 text-xs"
              data-testid="entity-pnl-to"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            data-testid="entity-pnl-refresh"
          >
            تحديث
          </Button>
          <span className="text-xs text-muted-foreground ms-auto">
            {from || to ? `الفترة: ${from || "البداية"} → ${to || "اليوم"}` : "كامل العمر"}
          </span>
          </div>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <BucketCard bucket={data.bucket} series={series ?? null} />

            {yoy && <YoyCard yoy={yoy} />}

            {series && series.buckets.length > 0 && (
              <TrendCard series={series} />
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
                    data-testid="entity-pnl-all-entries"
                  ><Link href={`/finance/journal?${entityType}Id=${entityId}${qs ? "&" + qs : ""}`}>
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
                  <div className="divide-y" data-testid="entity-pnl-entries-list">
                    {data.recentEntries.map((e) => (
                      <Link
                        key={e.jeId}
                        href={`/finance/journal/${e.jeId}`}
                        data-testid={`entity-pnl-entry-${e.jeId}`}
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

function BucketCard({ bucket, series }: { bucket: PnlBucket; series: SeriesResponse | null }) {
  const positive = bucket.net >= 0;
  // Tail sparkline series — last 12 buckets is plenty for an inline
  // "where am I trending?" signal. Each metric pulls its own column.
  const revSpark = series?.buckets.slice(-12).map((b) => b.revenue) ?? [];
  const expSpark = series?.buckets.slice(-12).map((b) => b.expense) ?? [];
  const netSpark = series?.buckets.slice(-12).map((b) => b.net) ?? [];
  return (
    <Card className="mb-3" data-testid="entity-pnl-bucket">
      <CardContent className="p-3">
        <div className="grid grid-cols-3 gap-3">
          <Metric
            label="الإيرادات"
            value={bucket.revenue}
            icon={TrendingUp}
            tone="success"
            spark={revSpark}
            testid="entity-pnl-revenue"
          />
          <Metric
            label="المصروفات"
            value={bucket.expense}
            icon={TrendingDown}
            tone="warning"
            spark={expSpark}
            testid="entity-pnl-expense"
          />
          <Metric
            label="الصافي"
            value={bucket.net}
            icon={positive ? TrendingUp : TrendingDown}
            tone={positive ? "success" : "warning"}
            highlight
            spark={netSpark}
            testid="entity-pnl-net"
          />
        </div>
        {bucket.entries > 0 && (
          <div className="text-xs text-muted-foreground mt-2">
            <Badge variant="outline" className="text-xs">{bucket.entries.toLocaleString("ar-SA")} قيد</Badge>
          </div>
        )}
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
  return (
    <div className="flex flex-col" data-testid={testid}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`${highlight ? "text-2xl font-bold" : "text-base font-medium"} ${toneClass}`}>
        {formatCurrency(value)}
      </div>
      {spark && spark.length >= 2 && (
        <InlineSparkline
          values={spark}
          tone={tone === "default" ? "neutral" : tone}
          testid={`${testid}-spark`}
        />
      )}
    </div>
  );
}

// Monthly trend — small bar chart with revenue + expense + net line.
// Each bucket renders as a vertical pair of bars (revenue green,
// expense red) plus a dot above the bar pair showing the net. The
// chart is hand-rolled SVG to avoid pulling in a charting dep.
function TrendCard({ series }: { series: SeriesResponse }) {
  const buckets = series.buckets;
  const max = Math.max(
    1,
    ...buckets.map((b) => Math.max(Math.abs(b.revenue), Math.abs(b.expense))),
  );
  // Chart geometry — wide enough for 12 months at ~40px each.
  const BAR_GROUP_WIDTH = 40;
  const BAR_WIDTH = 14;
  const CHART_HEIGHT = 140;
  const PADDING_TOP = 8;
  const PADDING_BOTTOM = 28;
  const usableH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = Math.max(BAR_GROUP_WIDTH * buckets.length, 320);

  return (
    <Card className="mb-3" data-testid="entity-pnl-trend">
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
            data-testid="entity-pnl-trend-chart"
          >
            {/* baseline */}
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
                <g key={b.month} data-testid={`entity-pnl-trend-bar-${b.month}`}>
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

// YoY comparison card — current period vs prior-year same period.
// Three deltas (revenue / expense / net) each with arrow + Arabic
// percent + colour reflecting direction. Expense ↓ is good, expense ↑
// is bad (inverted vs revenue): the tone helper handles the flip.
function YoyCard({ yoy }: { yoy: YoyResponse }) {
  return (
    <Card className="mb-3" data-testid="entity-pnl-yoy">
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
          <DeltaCell
            label="الإيرادات"
            current={yoy.current.bucket.revenue}
            prior={yoy.prior.bucket.revenue}
            delta={yoy.delta.revenue}
            pct={yoy.delta.revenuePct}
            higherIsBetter={true}
            testid="entity-pnl-yoy-revenue"
          />
          <DeltaCell
            label="المصروفات"
            current={yoy.current.bucket.expense}
            prior={yoy.prior.bucket.expense}
            delta={yoy.delta.expense}
            pct={yoy.delta.expensePct}
            higherIsBetter={false}
            testid="entity-pnl-yoy-expense"
          />
          <DeltaCell
            label="الصافي"
            current={yoy.current.bucket.net}
            prior={yoy.prior.bucket.net}
            delta={yoy.delta.net}
            pct={yoy.delta.netPct}
            higherIsBetter={true}
            testid="entity-pnl-yoy-net"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaCell({
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
  // Tone flip: for revenue/net, up is good; for expense, down is good.
  // We compare delta sign against higherIsBetter to pick the colour.
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
