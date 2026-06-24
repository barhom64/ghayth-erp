import { useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  Clock, TrendingUp, TrendingDown, AlertTriangle, Target,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";

/**
 * Days Sales Outstanding (DSO) Trend
 *
 * Key liquidity metric. DSO = (Avg AR × Days in period) / Revenue.
 * Low = customers pay fast → healthy cashflow.
 * High = AR ballooning → liquidity risk.
 *
 * Calls /finance/reports/income-statement N times for the months chosen,
 * combined with /finance/ar-aging snapshots.
 */

interface IncomeStatementResp {
  summary: { totalRevenue: number };
}

interface ArAgingResp {
  totalOpen?: number;
  buckets?: Array<{ bucket: string; total: number | string }>;
  data?: Array<any>;
}

interface MonthDSO {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  revenue: number;
  // AR snapshot is current-time only; we use current AR for last month estimate.
  ar: number;
  daysInPeriod: number;
  dso: number; // (AR × days) / revenue
}

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function lastDayUtc(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function buildMonths(count: number): Array<{ year: number; month: number; key: string; label: string; start: string; end: string }> {
  const cy = currentYearRiyadh();
  const cm = Number(currentMonthPaddedRiyadh());
  const out: Array<{ year: number; month: number; key: string; label: string; start: string; end: string }> = [];
  let y = cy, m = cm;
  for (let i = 0; i < count; i++) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDayUtc(y, m)).padStart(2, "0")}`;
    out.unshift({
      year: y, month: m,
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTHS_AR[m - 1]} ${y}`,
      start, end,
    });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export default function DsoTrendPage() {
  const [monthCount, setMonthCount] = useState<number>(6);
  const [targetDso, setTargetDso] = useState<number>(45);

  // Always build for max 12 months — keeps hooks count constant per Rules of Hooks
  const allMonths = useMemo(() => buildMonths(12), []);
  const months = allMonths.slice(12 - monthCount);

  // Fixed 12 useApiQuery calls — hooks count is constant
  const q0  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[0].key}`],  `/finance/reports/income-statement?startDate=${allMonths[0].start}&endDate=${allMonths[0].end}`);
  const q1  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[1].key}`],  `/finance/reports/income-statement?startDate=${allMonths[1].start}&endDate=${allMonths[1].end}`);
  const q2  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[2].key}`],  `/finance/reports/income-statement?startDate=${allMonths[2].start}&endDate=${allMonths[2].end}`);
  const q3  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[3].key}`],  `/finance/reports/income-statement?startDate=${allMonths[3].start}&endDate=${allMonths[3].end}`);
  const q4  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[4].key}`],  `/finance/reports/income-statement?startDate=${allMonths[4].start}&endDate=${allMonths[4].end}`);
  const q5  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[5].key}`],  `/finance/reports/income-statement?startDate=${allMonths[5].start}&endDate=${allMonths[5].end}`);
  const q6  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[6].key}`],  `/finance/reports/income-statement?startDate=${allMonths[6].start}&endDate=${allMonths[6].end}`);
  const q7  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[7].key}`],  `/finance/reports/income-statement?startDate=${allMonths[7].start}&endDate=${allMonths[7].end}`);
  const q8  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[8].key}`],  `/finance/reports/income-statement?startDate=${allMonths[8].start}&endDate=${allMonths[8].end}`);
  const q9  = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[9].key}`],  `/finance/reports/income-statement?startDate=${allMonths[9].start}&endDate=${allMonths[9].end}`);
  const q10 = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[10].key}`], `/finance/reports/income-statement?startDate=${allMonths[10].start}&endDate=${allMonths[10].end}`);
  const q11 = useApiQuery<IncomeStatementResp>([`dso-is-${allMonths[11].key}`], `/finance/reports/income-statement?startDate=${allMonths[11].start}&endDate=${allMonths[11].end}`);
  const allQueries = [q0, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11];
  const isQueries = allQueries.slice(12 - monthCount);

  const arQ = useApiQuery<ArAgingResp>(["dso-ar"], `/finance/ar-aging`);

  const arSnapshot = useMemo(() => {
    const d: any = arQ.data;
    if (typeof d?.totalOpen === "number") return d.totalOpen;
    if (Array.isArray(d?.buckets)) return d.buckets.reduce((s: number, b: any) => s + Number(b.total ?? 0), 0);
    if (Array.isArray(d?.data)) return d.data.reduce((s: number, r: any) => s + Number(r.outstandingAmount ?? r.total ?? 0), 0);
    return 0;
  }, [arQ.data]);

  const trend: MonthDSO[] = useMemo(() => {
    return months.map((m, i) => {
      const revenue = isQueries[i].data?.summary?.totalRevenue ?? 0;
      const daysIn = lastDayUtc(m.year, m.month);
      const dso = revenue > 0 ? (arSnapshot * daysIn) / revenue : 0;
      return {
        key: m.key,
        label: m.label,
        startDate: m.start,
        endDate: m.end,
        revenue: Number(revenue),
        ar: arSnapshot,
        daysInPeriod: daysIn,
        dso: Math.round(dso),
      };
    });
  }, [months, isQueries.map((q) => q.data).join("|"), arSnapshot]);

  const loading = isQueries.some((q) => q.isLoading) || arQ.isLoading;
  if (loading) return <LoadingSpinner />;

  const latestDso = trend[trend.length - 1]?.dso ?? 0;
  const earliestDso = trend[0]?.dso ?? 0;
  const trendArrow = latestDso > earliestDso ? "up" : "down";
  const avgDso = trend.length > 0 ? Math.round(trend.reduce((s, t) => s + t.dso, 0) / trend.length) : 0;
  const maxDso = trend.reduce((max, t) => Math.max(max, t.dso), 0);
  const maxBar = Math.max(maxDso, targetDso, 60);

  const statusFor = (dso: number): "good" | "warn" | "bad" =>
    dso <= targetDso ? "good"
    : dso <= targetDso * 1.3 ? "warn"
    : "bad";

  return (
    <PageShell
      title="مؤشر أيام التحصيل"
      subtitle="متوسط فترة التحصيل (DSO) — كم يوماً نحتاج لتحويل المبيعات إلى نقد؟ المؤشر الأهم للسيولة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "DSO Trend" },
      ]}
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Clock className="h-4 w-4" /> ما هو DSO؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>DSO = (متوسط AR × عدد أيام الفترة) / الإيرادات</strong>.
            DSO منخفض = العملاء يدفعون بسرعة. DSO مرتفع = AR يتراكم → نقد محبوس
            → ضغط على السيولة. الهدف العام: ≤ شروط الدفع (30-60 يوم في معظم القطاعات).
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-3 flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">عدد الأشهر</Label>
            <Select value={String(monthCount)} onValueChange={(v) => setMonthCount(Number(v))}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الـ DSO المستهدف (يوم)</Label>
            <Select value={String(targetDso)} onValueChange={(v) => setTargetDso(Number(v))}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 45, 60, 90].map((n) => <SelectItem key={n} value={String(n)}>{n} يوم</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Card className={`${statusFor(latestDso) === "good" ? "border-emerald-300 bg-emerald-50/30"
          : statusFor(latestDso) === "warn" ? "border-amber-300 bg-amber-50/30"
          : "border-red-300 bg-red-50/30"}`}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">DSO الحالي</p>
            <p className={`text-3xl font-bold font-mono mt-1 ${
              statusFor(latestDso) === "good" ? "text-emerald-700"
              : statusFor(latestDso) === "warn" ? "text-amber-700"
              : "text-red-700"
            }`}>
              {latestDso} <span className="text-sm text-muted-foreground">يوم</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              vs {trend[0]?.dso ?? 0} قبل {monthCount} شهر
            </p>
            <InlineSparkline
              values={trend.map((t) => t.dso)}
              tone={statusFor(latestDso) === "good" ? "success" : "warning"}
              testid="dso-trend-current-spark"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">متوسط الفترة</p>
            <p className="text-2xl font-bold font-mono mt-1">{avgDso} يوم</p>
            <InlineSparkline
              values={trend.map((t) => t.dso)}
              tone="muted"
              testid="dso-trend-avg-spark"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Target className="h-3 w-3" /> الهدف
            </p>
            <p className="text-2xl font-bold font-mono mt-1 text-status-info-foreground">{targetDso} يوم</p>
          </CardContent>
        </Card>
        <Card className={trendArrow === "up" ? "border-red-300" : "border-emerald-300"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              {trendArrow === "up" ? <TrendingUp className="h-3 w-3 text-red-600" /> : <TrendingDown className="h-3 w-3 text-emerald-600" />}
              الاتجاه
            </p>
            <p className={`text-base font-bold mt-1 ${trendArrow === "up" ? "text-red-700" : "text-emerald-700"}`}>
              {trendArrow === "up" ? "↑ متدهور" : "↓ متحسن"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {Math.abs(latestDso - earliestDso)} يوم {trendArrow === "up" ? "زيادة" : "نقصان"}
            </p>
            <InlineSparkline
              values={trend.map((t) => t.dso)}
              tone={trendArrow === "up" ? "warning" : "success"}
              testid="dso-trend-direction-spark"
            />
          </CardContent>
        </Card>
      </div>

      {/* Visual Chart */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">DSO شهر بشهر</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {trend.map((t) => {
              const status = statusFor(t.dso);
              const barColor = status === "good" ? "bg-emerald-500"
                : status === "warn" ? "bg-amber-500"
                : "bg-red-500";
              const targetLeft = (targetDso / maxBar) * 100;
              return (
                <div key={t.key}>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-medium">{t.label}</span>
                    <span className={`font-mono font-bold ${
                      status === "good" ? "text-emerald-700"
                      : status === "warn" ? "text-amber-700"
                      : "text-red-700"
                    }`}>
                      {t.dso} يوم
                    </span>
                  </div>
                  <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${barColor}`} style={{ width: `${(t.dso / maxBar) * 100}%` }} />
                    {/* Target line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
                      style={{ insetInlineStart: `${targetLeft}%` }}
                      title={`الهدف ${targetDso} يوم`}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    إيرادات: <span className="font-mono">{formatNumber(t.revenue / 1000)}K</span> ·
                    AR: <span className="font-mono">{formatNumber(t.ar / 1000)}K</span>
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 bg-emerald-500 rounded" /> ≤ الهدف
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 bg-amber-500 rounded" /> ≤ 1.3× الهدف
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 bg-red-500 rounded" /> &gt; 1.3× الهدف
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-0.5 h-3 bg-blue-600" /> الخط المستهدف
            </span>
          </div>
        </CardContent>
      </Card>

      {latestDso > targetDso * 1.3 && (
        <Card className="border-red-400 bg-red-50/30">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5" />
            <span>
              <strong>تنبيه:</strong> DSO الحالي ({latestDso} يوم) يتجاوز الهدف ({targetDso}) بأكثر من 30%.
              راجع <strong>/finance/customer-risk</strong> لاكتشاف العملاء المسببين للتأخير،
              و <strong>/finance/collection</strong> لبدء إجراءات التحصيل.
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">قراءة المؤشر:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>DSO 30 يوم = شروط دفع NET 30 محترمة — ممتاز</li>
            <li>DSO 45-60 = شروط NET 30 لكن في بعض التأخير — مقبول</li>
            <li>DSO 60-90 = تأخير شائع — افتح Customer Risk Dashboard</li>
            <li>DSO &gt; 90 = أزمة تحصيل — مطلوب تدخل عاجل</li>
          </ul>
          <p className="mt-1"><strong>ملاحظة:</strong> الـ AR snapshot في هذي النسخة لحظي (الرصيد الحالي). للحصول على DSO تاريخي دقيق، يحتاج النظام snapshot شهري للـ AR — follow-up.</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
