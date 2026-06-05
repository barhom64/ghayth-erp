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
import { TrendingUp, TrendingDown, ScrollText, ArrowLeftRight, User } from "lucide-react";

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

  const backHref = BACK_LINK[entityType] ?? "/finance";

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
        <Link href={backHref}>
          <Button variant="ghost" data-testid="entity-pnl-back">
            <User className="h-4 w-4 ms-1" />
            رجوع
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
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <BucketCard bucket={data.bucket} />

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  آخر القيود ({data.recentEntries.length})
                </CardTitle>
                <Link href={`/finance/journal?${entityType}Id=${entityId}${qs ? "&" + qs : ""}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="entity-pnl-all-entries"
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

function BucketCard({ bucket }: { bucket: PnlBucket }) {
  const positive = bucket.net >= 0;
  return (
    <Card className="mb-3" data-testid="entity-pnl-bucket">
      <CardContent className="p-3">
        <div className="grid grid-cols-3 gap-3">
          <Metric
            label="الإيرادات"
            value={bucket.revenue}
            icon={TrendingUp}
            tone="success"
            testid="entity-pnl-revenue"
          />
          <Metric
            label="المصروفات"
            value={bucket.expense}
            icon={TrendingDown}
            tone="warning"
            testid="entity-pnl-expense"
          />
          <Metric
            label="الصافي"
            value={bucket.net}
            icon={positive ? TrendingUp : TrendingDown}
            tone={positive ? "success" : "warning"}
            highlight
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
      <div className={`${highlight ? "text-2xl font-bold" : "text-base font-medium"} ${toneClass}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}
