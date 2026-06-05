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
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, ScrollText, Network, ArrowLeftRight } from "lucide-react";

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
        <Link href="/finance/cost-centers/tree">
          <Button variant="ghost" data-testid="cost-center-pnl-back">
            <Network className="h-4 w-4 ms-1" />
            رجوع للشجرة
          </Button>
        </Link>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3 flex items-end gap-2 flex-wrap">
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
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <BucketCard
                title="على هذا المركز فقط"
                bucket={data.buckets.self}
                testid="cost-center-pnl-self"
              />
              <BucketCard
                title={`تجميعي (يشمل ${data.descendantCount} مركز فرعي)`}
                bucket={data.buckets.rolled}
                testid="cost-center-pnl-rolled"
              />
            </div>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  آخر القيود ({data.recentEntries.length})
                </CardTitle>
                <Link href={`/finance/journal?costCenterId=${id}&dateFrom=${from}&dateTo=${to}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="cost-center-pnl-all-entries"
                  >
                    عرض الكل
                    <ArrowLeftRight className="h-3.5 w-3.5 me-1" />
                  </Button>
                </Link>
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
  title, bucket, testid,
}: {
  title: string;
  bucket: PnlBucket;
  testid: string;
}) {
  const positive = bucket.net >= 0;
  return (
    <Card data-testid={testid}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm text-muted-foreground font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="الإيرادات" value={bucket.revenue} icon={TrendingUp} tone="success" testid={`${testid}-revenue`} />
          <Metric label="المصروفات" value={bucket.expense} icon={TrendingDown} tone="warning" testid={`${testid}-expense`} />
          <Metric
            label="الصافي"
            value={bucket.net}
            icon={positive ? TrendingUp : TrendingDown}
            tone={positive ? "success" : "warning"}
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
  label, value, icon: Icon, tone, highlight, testid,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "default";
  highlight?: boolean;
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
      <div className={`${highlight ? "text-xl font-bold" : "text-base font-medium"} ${toneClass}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
