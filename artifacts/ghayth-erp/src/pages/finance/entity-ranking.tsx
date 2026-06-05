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
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, BarChart3, ArrowUpDown, ExternalLink } from "lucide-react";

/**
 * Entity ranking — answers "top customers by revenue", "top vendors
 * by spend", "top vehicles by maintenance cost", etc., across the 9
 * routable entity types the system enriches.
 *
 * Same closed allowlist of types as the per-entity P&L drill — both
 * pages drive off the same backend map (drift alarm in the smoke).
 *
 * Each row deep-links to /finance/entity-pnl/:entityType/:entityId so
 * the operator can click through to the per-entity drill.
 */

interface RankingRow {
  entityId: number;
  entityName: string | null;
  revenue: number;
  expense: number;
  net: number;
  entries: number;
}

interface RankingResponse {
  entityType: string;
  metric: string;
  direction: "asc" | "desc";
  dateFrom: string;
  dateTo: string;
  limit: number;
  rows: RankingRow[];
}

const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "client",        label: "العملاء" },
  { value: "vendor",        label: "الموردون" },
  { value: "employee",      label: "الموظفون" },
  { value: "vehicle",       label: "المركبات" },
  { value: "driver",        label: "السائقون" },
  { value: "project",       label: "المشاريع" },
  { value: "contract",      label: "العقود" },
  { value: "umrah_agent",   label: "وكلاء العمرة" },
  { value: "umrah_season",  label: "مواسم العمرة" },
];

const METRIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "revenue", label: "الإيراد" },
  { value: "expense", label: "المصروف" },
  { value: "net",     label: "الصافي" },
  { value: "entries", label: "عدد القيود" },
];

const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  ENTITY_OPTIONS.map((o) => [o.value, o.label]),
);

export default function EntityRankingPage() {
  const [entityType, setEntityType] = useState<string>("client");
  const [metric, setMetric] = useState<string>("revenue");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(20);

  const qs = new URLSearchParams({
    entityType,
    metric,
    direction,
    limit: String(limit),
  });
  if (from) qs.set("dateFrom", from);
  if (to) qs.set("dateTo", to);
  const path = `/finance/entity-ranking?${qs.toString()}`;

  const { data, isLoading, error, refetch } = useApiQuery<RankingResponse>(
    ["entity-ranking", entityType, metric, direction, from, to, String(limit)],
    path,
  );

  return (
    <PageShell
      title="تصنيف الكيانات"
      subtitle="ترتيب أفضل/أسوأ الكيانات حسب الإيراد أو المصروف أو الصافي — مبني على نفس البُعد المُؤصَّل في القيود"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "تصنيف الكيانات" },
      ]}
      actions={
        <Link href="/finance/dimensional-routing">
          <Button variant="ghost" data-testid="entity-ranking-back">
            <BarChart3 className="h-4 w-4 ms-1" />
            التأصيل المالي
          </Button>
        </Link>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">نوع الكيان</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-8 text-xs" data-testid="entity-ranking-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">المقياس</Label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="h-8 text-xs" data-testid="entity-ranking-metric">
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
              <SelectTrigger className="h-8 text-xs" data-testid="entity-ranking-direction">
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
              data-testid="entity-ranking-from"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs"
              data-testid="entity-ranking-to"
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
              data-testid="entity-ranking-limit"
            />
          </div>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                {ENTITY_LABEL[entityType] ?? entityType} ·{" "}
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
                <RankingTable rows={data.rows} entityType={entityType} />
              )}
            </CardContent>
          </Card>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}

function RankingTable({
  rows,
  entityType,
}: {
  rows: RankingRow[];
  entityType: string;
}) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 0);
  const maxExpense = Math.max(...rows.map((r) => r.expense), 0);
  return (
    <div className="divide-y" data-testid="entity-ranking-list">
      {rows.map((r, idx) => {
        const revPct = maxRevenue > 0 ? Math.round((r.revenue / maxRevenue) * 100) : 0;
        const expPct = maxExpense > 0 ? Math.round((r.expense / maxExpense) * 100) : 0;
        const netPositive = r.net >= 0;
        return (
          <Link
            key={r.entityId}
            href={`/finance/entity-pnl/${entityType}/${r.entityId}`}
            data-testid={`entity-ranking-row-${r.entityId}`}
          >
            <div className="p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer">
              <Badge variant="outline" className="text-xs font-mono shrink-0">
                #{idx + 1}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {r.entityName ?? `#${r.entityId}`}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {r.entries.toLocaleString("ar-SA")} قيد
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <MetricBar
                    label="إيراد"
                    value={r.revenue}
                    pct={revPct}
                    tone="success"
                    icon={TrendingUp}
                  />
                  <MetricBar
                    label="مصروف"
                    value={r.expense}
                    pct={expPct}
                    tone="warning"
                    icon={TrendingDown}
                  />
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
  label,
  value,
  pct,
  tone,
  icon: Icon,
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
        <div
          className={`h-full rounded ${toneClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
