import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Award, Trophy, AlertCircle, ShieldAlert, Sparkles,
  AlertOctagon, Bot, Calendar, User, TrendingDown, Search,
} from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { FleetTelematicsTabsNav } from "@/components/shared/fleet-telematics-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface LeaderboardRow {
  driverId: number;
  driverName: string;
  licenseNumber: string | null;
  totalAlerts: number;
  rawPenalty: number;
  safetyScore: number;
  adasCount: number;
  dmsCount: number;
  bsdCount: number;
  severeCount: number;
  lastAlertAt: string | null;
}

interface LeaderboardResponse {
  data: LeaderboardRow[];
  meta?: {
    window: { from: string; to: string };
    weights: Record<string, number>;
    maxScore: number;
  };
}

function scoreTone(score: number): string {
  if (score >= 90) return "bg-status-success-surface text-status-success-foreground";
  if (score >= 70) return "bg-status-info-surface text-status-info-foreground";
  if (score >= 50) return "bg-status-warning-surface text-status-warning-foreground";
  return "bg-rose-100 text-rose-700";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "ممتاز";
  if (score >= 70) return "جيد";
  if (score >= 50) return "متوسط";
  if (score >= 25) return "ضعيف";
  return "خطر عالٍ";
}

function defaultWindowFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 16);
}

function defaultWindowTo(): string {
  return new Date().toISOString().slice(0, 16);
}

export default function FleetTelematicsScorecard() {
  const [from, setFrom] = useState<string>(defaultWindowFrom());
  const [to, setTo] = useState<string>(defaultWindowTo());
  const [drillDriverId, setDrillDriverId] = useState<number | null>(null);

  const qs = new URLSearchParams();
  if (from) qs.set("from", new Date(from).toISOString());
  if (to) qs.set("to", new Date(to).toISOString());

  const { data, isLoading, isError, refetch } = useApiQuery<LeaderboardResponse>(
    ["fleet-telematics-scorecard-leaderboard", from, to],
    `/fleet/telematics/drivers/scorecard-leaderboard?${qs.toString()}`,
  );
  const rows = asList(data) as LeaderboardRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);
  const meta = data?.meta;

  const drillQs = new URLSearchParams();
  if (from) drillQs.set("from", new Date(from).toISOString());
  if (to) drillQs.set("to", new Date(to).toISOString());
  const { data: drillData } = useApiQuery<{ data: {
    driver: { id: number; name: string; licenseNumber: string | null };
    aggregate: { totalAlerts: number; safetyScore: number; rawPenalty: number;
      adasCount: number; dmsCount: number; bsdCount: number;
      infoCount: number; lowCount: number; mediumCount: number; highCount: number; criticalCount: number };
    topAlertTypes: Array<{ alertType: string; category: string; count: number }>;
  } }>(
    ["fleet-telematics-driver-scorecard", String(drillDriverId ?? 0), from, to],
    `/fleet/telematics/drivers/${drillDriverId}/scorecard?${drillQs.toString()}`,
    drillDriverId !== null,
  );
  const drill = drillData?.data;

  const driversWithAlerts = rows.filter((r) => r.totalAlerts > 0);
  const avgScore = driversWithAlerts.length > 0
    ? Math.round(driversWithAlerts.reduce((s, r) => s + r.safetyScore, 0) / driversWithAlerts.length)
    : 100;
  const topRisk = [...rows]
    .filter((r) => r.totalAlerts > 0)
    .sort((a, b) => a.safetyScore - b.safetyScore)
    .slice(0, 3);

  const columns: DataTableColumn<LeaderboardRow>[] = [
    {
      key: "rank",
      header: "الترتيب",
      width: "60px",
      render: (_r, idx) => {
        const rank = (idx ?? 0) + 1;
        if (rank === 1) return <Trophy className="h-5 w-5 text-amber-500" />;
        if (rank === 2) return <Award className="h-5 w-5 text-slate-400" />;
        if (rank === 3) return <Award className="h-5 w-5 text-orange-600" />;
        return <span className="text-xs text-muted-foreground">{rank}</span>;
      },
    },
    {
      key: "safetyScore",
      header: "النقاط",
      sortable: true,
      render: (r) => (
        <Badge variant="outline" className={`${scoreTone(r.safetyScore)} text-base font-bold px-3 py-1`}>
          {r.safetyScore} / 100
        </Badge>
      ),
    },
    {
      key: "driverName",
      header: "السائق",
      sortable: true,
      searchable: true,
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDrillDriverId(r.driverId); }}
          className="flex flex-col items-start text-start hover:underline"
        >
          <span className="font-medium inline-flex items-center gap-1">
            <Search className="h-3 w-3 opacity-60" />
            {r.driverName}
          </span>
          {r.licenseNumber && (
            <span className="text-xs text-muted-foreground">{r.licenseNumber}</span>
          )}
        </button>
      ),
    },
    {
      key: "totalAlerts",
      header: "تنبيهات",
      sortable: true,
    },
    {
      key: "severeCount",
      header: "حادة (high/critical)",
      sortable: true,
      render: (r) =>
        r.severeCount > 0 ? (
          <Badge variant="outline" className="bg-rose-100 text-rose-700">
            {r.severeCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "adasCount",
      header: "ADAS",
      render: (r) =>
        r.adasCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-status-warning-foreground" />
            {r.adasCount}
          </span>
        ) : "—",
    },
    {
      key: "dmsCount",
      header: "DMS",
      render: (r) =>
        r.dmsCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-purple-600" />
            {r.dmsCount}
          </span>
        ) : "—",
    },
    {
      key: "bsdCount",
      header: "BSD",
      render: (r) =>
        r.bsdCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <AlertOctagon className="h-3 w-3 text-status-info-foreground" />
            {r.bsdCount}
          </span>
        ) : "—",
    },
    {
      key: "lastAlertAt",
      header: "آخر تنبيه",
      sortable: true,
      render: (r) =>
        r.lastAlertAt ? new Date(r.lastAlertAt).toLocaleString("ar-SA") : (
          <Badge variant="outline" className="bg-status-success-surface text-status-success-foreground">
            نظيف
          </Badge>
        ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="بطاقة أداء السلامة للسائقين"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/telematics/live-map", label: "التتبع المباشر" },
        { label: "بطاقة الأداء" },
      ]}
      actions={
        <PrintButton
          entityType="report_fleet_driver_scorecard"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "بطاقة أداء السلامة للسائقين", total: printRows.length },
            items: printRows.map((r: any, i: number) => ({
              "الترتيب": i + 1,
              "السائق": r.driverName,
              "النقاط": `${r.safetyScore} / 100`,
              "تنبيهات": r.totalAlerts,
              "حادة": r.severeCount,
              "آخر تنبيه": r.lastAlertAt ? new Date(r.lastAlertAt).toLocaleString("ar-SA") : "نظيف",
            })),
          })}
        />
      }
    >
      <FleetTabsNav />
      <FleetTelematicsTabsNav />

      <KpiGrid
        items={[
          { label: "إجمالي السائقين", value: rows.length, icon: User, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "بدون تنبيهات", value: rows.length - driversWithAlerts.length, icon: Award, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "متوسط النقاط", value: `${avgScore}/100`, icon: TrendingDown, color: scoreTone(avgScore) },
          { label: "في الخطر (< 50)", value: rows.filter((r) => r.safetyScore < 50).length, icon: AlertCircle, color: "text-rose-700 bg-rose-50" },
        ]}
      />

      {topRisk.length > 0 && (
        <Card className="mt-4 border-rose-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="h-5 w-5" />
              أعلى 3 سائقين بالمخاطر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topRisk.map((r, i) => (
                <div key={r.driverId} className="border rounded-lg p-3 bg-rose-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">رقم {i + 1}</span>
                    <Badge variant="outline" className={`${scoreTone(r.safetyScore)} font-bold`}>
                      {r.safetyScore}/100
                    </Badge>
                  </div>
                  <div className="font-medium">{r.driverName}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.totalAlerts} تنبيه · {r.severeCount} حاد
                  </div>
                  <Badge variant="outline" className={`${scoreTone(r.safetyScore)} text-xs mt-2`}>
                    {scoreLabel(r.safetyScore)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                من
              </Label>
              <Input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                إلى
              </Label>
              <Input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <button
              onClick={() => refetch()}
              className="px-3 py-2 text-sm rounded-md border hover:bg-surface-subtle"
            >
              تحديث
            </button>
          </div>
          {meta && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Bot className="h-3 w-3" />
              نقاط السلامة = 100 −
              (info×{meta.weights.info} + low×{meta.weights.low} +
              medium×{meta.weights.medium} + high×{meta.weights.high} +
              critical×{meta.weights.critical}) — أدنى صفر، أعلى 100.
            </p>
          )}
          <DataTable
            columns={columns}
            data={rows}
            onSortedDataChange={setPrintRows}
            searchPlaceholder="ابحث عن سائق…"
            emptyMessage="لا سائقين في النطاق الحالي"
          />
        </CardContent>
      </Card>

      <Dialog open={drillDriverId !== null} onOpenChange={(o) => !o && setDrillDriverId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {drill?.driver.name || "تفاصيل السائق"}
            </DialogTitle>
          </DialogHeader>
          {!drill ? (
            <p className="text-center text-muted-foreground py-8">جاري التحميل…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">النقاط</p>
                  <Badge variant="outline" className={`${scoreTone(drill.aggregate.safetyScore)} text-base font-bold mt-1`}>
                    {drill.aggregate.safetyScore} / 100
                  </Badge>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">الإجمالي</p>
                  <p className="text-lg font-bold">{drill.aggregate.totalAlerts}</p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">ADAS / DMS / BSD</p>
                  <p className="text-sm font-mono">{drill.aggregate.adasCount} · {drill.aggregate.dmsCount} · {drill.aggregate.bsdCount}</p>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">حادة (high/crit)</p>
                  <p className="text-lg font-bold text-rose-700">{drill.aggregate.highCount + drill.aggregate.criticalCount}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">أكثر أنواع التنبيهات</p>
                {drill.topAlertTypes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">لا تنبيهات في النطاق المحدد</p>
                ) : (
                  <div className="space-y-1">
                    {drill.topAlertTypes.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border-b py-1">
                        <span><Badge variant="outline" className="me-2">{t.category}</Badge>{t.alertType}</span>
                        <span className="font-mono">{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrillDriverId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
