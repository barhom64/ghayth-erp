/**
 * TA-GAP-09 Phase 2 — Maps Quota Usage Dashboard (SPA).
 *
 * Reads the per-day, per-provider, per-apiSurface counters that
 * Phase 1 (#2439) records when MapsService calls a real provider
 * (currently `google_maps`), and renders them as a 30-day table.
 *
 * Why a table (and not a chart) for Phase 2: cheaper, fits on a
 * narrow screen, and the operator's questions are mostly
 * "how many requests today vs yesterday" / "did errors spike" —
 * answered fine by a sortable table. A chart can land in a later
 * iteration if needed.
 *
 * Backend: GET /transport/maps-usage?days=30 (RBAC fleet.bookings:view).
 */

import { useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Activity, AlertCircle } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

interface UsageRow {
  callDate: string;
  provider: string;
  apiSurface: string;
  callCount: number;
  errorCount: number;
}

interface UsageResponse {
  data: {
    rows: UsageRow[];
    windowDays: number;
  };
}

// TA-GAP-09 Phase 3 — operator-set thresholds (daily/monthly caps).
interface ThresholdRow {
  id: number;
  period: "daily" | "monthly";
  callCountThreshold: number;
  warningPct: number;
  isActive: boolean;
  notes: string | null;
}
interface ThresholdsResponse {
  data: { rows: ThresholdRow[] };
}

const WINDOW_CHOICES = [7, 14, 30, 60, 90] as const;

export default function MapsUsagePage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, refetch } = useApiQuery<UsageResponse>(
    ["fleet-maps-usage", String(days)],
    `/transport/maps-usage?days=${days}`,
  );
  // TA-GAP-09 Phase 3 — fetch + edit caps.
  const { data: thrData, refetch: refetchThr } = useApiQuery<ThresholdsResponse>(
    ["fleet-maps-thresholds"],
    `/transport/maps-usage/thresholds`,
  );
  const upsertMut = useApiMutation<unknown, { period: "daily" | "monthly"; callCountThreshold: number; warningPct?: number }>(
    `/transport/maps-usage/thresholds`,
    "PUT",
    [["fleet-maps-thresholds"]],
    { successMessage: "تم حفظ العتبة" },
  );
  const [editDaily, setEditDaily] = useState<string>("");
  const [editMonthly, setEditMonthly] = useState<string>("");

  const rows = data?.data?.rows ?? [];
  const thresholds = thrData?.data?.rows ?? [];
  const dailyCap   = thresholds.find((t) => t.period === "daily");
  const monthlyCap = thresholds.find((t) => t.period === "monthly");

  // Aggregate per-day totals across all (provider, apiSurface) pairs
  // for the header "Total in window" cards.
  const summary = useMemo(() => {
    let totalCalls = 0;
    let totalErrors = 0;
    const daysSeen = new Set<string>();
    const providersSeen = new Set<string>();
    for (const r of rows) {
      totalCalls += Number(r.callCount);
      totalErrors += Number(r.errorCount);
      daysSeen.add(r.callDate);
      providersSeen.add(r.provider);
    }
    const errorRate = totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0;
    return {
      totalCalls,
      totalErrors,
      errorRate,
      daysWithActivity: daysSeen.size,
      providers: Array.from(providersSeen).sort(),
    };
  }, [rows]);

  return (
    <PageShell
      title="استهلاك واجهة الخرائط"
      subtitle="عدد الاتصالات اليومية بمزوّد الخرائط لكل واجهة (TA-GAP-09)"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "استهلاك الخرائط" }]}
    >
      <FleetTabsNav />

      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">نافذة:</span>
          {WINDOW_CHOICES.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => setDays(n)}
            >
              {n} يوم
            </Button>
          ))}
        </div>
        <RefreshAction onRefresh={() => refetch()} disabled={isLoading} />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">إجمالي الاتصالات</div>
            <div className="text-2xl font-bold mt-1">{summary.totalCalls.toLocaleString("ar-SA")}</div>
            <div className="text-xs text-muted-foreground mt-1">خلال {days} يوم</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">اتصالات فاشلة</div>
            <div className="text-2xl font-bold mt-1 text-rose-600">
              {summary.totalErrors.toLocaleString("ar-SA")}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {summary.errorRate.toFixed(1)}% نسبة الفشل
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">أيام بنشاط</div>
            <div className="text-2xl font-bold mt-1">{summary.daysWithActivity}</div>
            <div className="text-xs text-muted-foreground mt-1">من أصل {days}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">المزوّدون</div>
            <div className="text-sm font-medium mt-2">
              {summary.providers.length > 0 ? summary.providers.join("، ") : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TA-GAP-09 Phase 3 — operator-set caps + alert state */}
      <Card className="mt-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <div className="font-medium text-sm">حدود الاستهلاك والتنبيهات</div>
          </div>
          <div className="text-xs text-muted-foreground">
            عند تجاوز الاستهلاك للنسبة المحدّدة (افتراضيًّا 80%) يُطلق تنبيه «warning»،
            وعند بلوغ السقف 100% يُطلق تنبيه «critical». الـcron يفحص كل 15 دقيقة.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Daily cap */}
            <div className="border rounded p-3 space-y-2">
              <div className="text-xs text-muted-foreground">سقف يومي (call/day)</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  placeholder={dailyCap ? String(dailyCap.callCountThreshold) : "مثال: 1000"}
                  value={editDaily}
                  onChange={(e) => setEditDaily(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const n = Number(editDaily);
                    if (!n || n < 1) return;
                    upsertMut.mutate(
                      { period: "daily", callCountThreshold: n },
                      { onSuccess: () => { setEditDaily(""); refetchThr(); } },
                    );
                  }}
                  disabled={upsertMut.isPending || !editDaily}
                >
                  حفظ
                </Button>
              </div>
              {dailyCap && (
                <div className="text-xs text-muted-foreground">
                  السقف الحالي: {dailyCap.callCountThreshold.toLocaleString("ar-SA")} ·
                  تنبيه عند {dailyCap.warningPct}%
                </div>
              )}
            </div>
            {/* Monthly cap */}
            <div className="border rounded p-3 space-y-2">
              <div className="text-xs text-muted-foreground">سقف شهري (آخر 30 يوم)</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  placeholder={monthlyCap ? String(monthlyCap.callCountThreshold) : "مثال: 25000"}
                  value={editMonthly}
                  onChange={(e) => setEditMonthly(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const n = Number(editMonthly);
                    if (!n || n < 1) return;
                    upsertMut.mutate(
                      { period: "monthly", callCountThreshold: n },
                      { onSuccess: () => { setEditMonthly(""); refetchThr(); } },
                    );
                  }}
                  disabled={upsertMut.isPending || !editMonthly}
                >
                  حفظ
                </Button>
              </div>
              {monthlyCap && (
                <div className="text-xs text-muted-foreground">
                  السقف الحالي: {monthlyCap.callCountThreshold.toLocaleString("ar-SA")} ·
                  تنبيه عند {monthlyCap.warningPct}%
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily breakdown */}
      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs">
                <tr>
                  <th className="text-start p-2 font-medium">التاريخ</th>
                  <th className="text-start p-2 font-medium">المزوّد</th>
                  <th className="text-start p-2 font-medium">الواجهة</th>
                  <th className="text-end p-2 font-medium">عدد الاتصالات</th>
                  <th className="text-end p-2 font-medium">الفاشلة</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      <Activity className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      لا توجد بيانات استهلاك خلال هذه النافذة. سيظهر العدّاد بعد أول
                      اتصال فعلي بمزوّد الخرائط (Google Maps).
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={`${r.callDate}-${r.provider}-${r.apiSurface}`}
                    className="border-t hover:bg-muted/20"
                  >
                    <td className="p-2 font-mono text-xs">{r.callDate}</td>
                    <td className="p-2">{r.provider}</td>
                    <td className="p-2 text-muted-foreground">{r.apiSurface}</td>
                    <td className="p-2 text-end font-mono">{Number(r.callCount).toLocaleString("ar-SA")}</td>
                    <td className="p-2 text-end font-mono">
                      {r.errorCount > 0 ? (
                        <span className="text-rose-600">{Number(r.errorCount).toLocaleString("ar-SA")}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
