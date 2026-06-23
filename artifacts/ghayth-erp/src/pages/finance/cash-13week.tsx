import { useMemo } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";
import {
  Banknote, TrendingUp, TrendingDown, AlertTriangle, Download,
  Calendar, ChevronRight,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";

/**
 * 13-Week Cash Flow — banking-grade liquidity projection
 *
 * The standard tool every bank credit officer asks for when reviewing
 * a company's working capital line. Buckets all expected inflows and
 * outflows into 13 weekly columns starting from this week, with
 * cumulative ending balance per week.
 *
 * Differs from daily Cash Calendar by aggregating to weeks — better
 * for medium-term planning where day-level precision is noise.
 *
 * Endpoint: /finance/cash-flow-forecast
 */

interface CashFlowResp {
  currentBalance: number;
  inflows: {
    next30?: Array<{ ref?: string; clientName?: string; dueDate: string; expected: number }>;
    next60?: Array<{ ref?: string; clientName?: string; dueDate: string; expected: number }>;
    next90?: Array<{ ref?: string; clientName?: string; dueDate: string; expected: number }>;
  };
  outflows: {
    next30?: Array<{ ref?: string; supplierName?: string; dueDate: string; expected: number }>;
    next60?: Array<{ ref?: string; supplierName?: string; dueDate: string; expected: number }>;
    next90?: Array<{ ref?: string; supplierName?: string; dueDate: string; expected: number }>;
  };
}

interface WeekBucket {
  weekIndex: number;       // 1..13
  startDate: string;       // YYYY-MM-DD (Saturday — Saudi week start)
  endDate: string;
  label: string;           // "أسبوع 1 (أبريل 12-18)"
  inflow: number;
  outflow: number;
  net: number;
  openingBalance: number;
  endingBalance: number;
  inflowCount: number;
  outflowCount: number;
}

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekStartSat(iso: string): string {
  // Saudi work week: Saturday → Friday. getUTCDay(): Sun=0..Sat=6
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay();           // 0..6
  const daysSinceSat = (dow + 1) % 7;  // Sat=6 → 0, Sun=0 → 1, ... Fri=5 → 6
  d.setUTCDate(d.getUTCDate() - daysSinceSat);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function monthDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export default function Cash13WeekPage() {
  const today = todayLocal();
  const { data, isLoading } = useApiQuery<CashFlowResp>(
    ["cash-13week"], `/finance/cash-flow-forecast`,
  );

  const weeks = useMemo<WeekBucket[]>(() => {
    if (!data) return [];

    // Bucket inflows/outflows by date
    const inflowMap = new Map<string, { amount: number; count: number }>();
    const outflowMap = new Map<string, { amount: number; count: number }>();

    const pushIn = (iso: string, amt: number) => {
      const key = iso.slice(0, 10);
      const cur = inflowMap.get(key) ?? { amount: 0, count: 0 };
      cur.amount += amt; cur.count += 1;
      inflowMap.set(key, cur);
    };
    const pushOut = (iso: string, amt: number) => {
      const key = iso.slice(0, 10);
      const cur = outflowMap.get(key) ?? { amount: 0, count: 0 };
      cur.amount += amt; cur.count += 1;
      outflowMap.set(key, cur);
    };

    for (const i of [...(data.inflows?.next30 ?? []), ...(data.inflows?.next60 ?? []), ...(data.inflows?.next90 ?? [])]) {
      if (!i.dueDate) continue;
      pushIn(i.dueDate, Number(i.expected ?? 0));
    }
    for (const o of [...(data.outflows?.next30 ?? []), ...(data.outflows?.next60 ?? []), ...(data.outflows?.next90 ?? [])]) {
      if (!o.dueDate) continue;
      pushOut(o.dueDate, Number(o.expected ?? 0));
    }

    // Build 13 weekly buckets starting from this Saturday
    const firstWeekStart = weekStartSat(today);
    let running = Number(data.currentBalance ?? 0);
    const result: WeekBucket[] = [];
    for (let w = 0; w < 13; w++) {
      const start = addDaysUtc(firstWeekStart, w * 7);
      const end = addDaysUtc(start, 6);

      let inflow = 0, outflow = 0, inCount = 0, outCount = 0;
      // iterate all 7 days
      for (let d = 0; d < 7; d++) {
        const day = addDaysUtc(start, d);
        const i = inflowMap.get(day);
        const o = outflowMap.get(day);
        if (i) { inflow += i.amount; inCount += i.count; }
        if (o) { outflow += o.amount; outCount += o.count; }
      }
      const net = inflow - outflow;
      const opening = running;
      const ending = opening + net;
      result.push({
        weekIndex: w + 1,
        startDate: start,
        endDate: end,
        label: `${monthDay(start)} → ${monthDay(end)}`,
        inflow, outflow, net,
        openingBalance: opening,
        endingBalance: ending,
        inflowCount: inCount,
        outflowCount: outCount,
      });
      running = ending;
    }
    return result;
  }, [data, today]);

  if (isLoading) return <LoadingSpinner />;

  const startBalance = Number(data?.currentBalance ?? 0);
  const totalInflow = weeks.reduce((s, w) => s + w.inflow, 0);
  const totalOutflow = weeks.reduce((s, w) => s + w.outflow, 0);
  const endingBalance = weeks.length > 0 ? weeks[weeks.length - 1].endingBalance : startBalance;
  const minWeek = weeks.reduce((min, w) => w.endingBalance < min.endingBalance ? w : min, weeks[0] ?? { endingBalance: startBalance } as WeekBucket);
  const minBalance = minWeek?.endingBalance ?? startBalance;
  const negativeWeeks = weeks.filter((w) => w.endingBalance < 0).length;

  const exportCsv = () => {
    const headers = ["أسبوع", "البداية", "النهاية", "تدفقات داخلة", "تدفقات خارجة", "صافي", "رصيد افتتاحي", "رصيد ختامي"];
    const lines = [
      headers.join(","),
      ...weeks.map((w) => [
        w.weekIndex, w.startDate, w.endDate,
        w.inflow.toFixed(2), w.outflow.toFixed(2), w.net.toFixed(2),
        w.openingBalance.toFixed(2), w.endingBalance.toFixed(2),
      ].join(",")),
    ];
    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_cash_13week",
        title: String(`13-week-cash-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  // Max absolute amount for bar scaling
  const maxAbs = Math.max(
    ...weeks.map((w) => Math.max(Math.abs(w.inflow), Math.abs(w.outflow))),
    1,
  );

  return (
    <PageShell
      title="تدفق نقدي 13 أسبوع"
      subtitle="الأداة المعيارية للبنوك لتقييم خط الائتمان — تنبؤ السيولة الأسبوعي مع نظرة 3 أشهر للأمام"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/cash-flow-forecast", label: "التدفق النقدي" },
        { label: "13 أسبوع" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={weeks.length === 0}>
            <Download className="h-4 w-4 me-1" /> CSV
          </Button>
          <PrintButton
            entityType="report_cash_13week"
            entityId={todayLocal()}
            payload={{
              entity: {
                title: "تدفق نقدي — 13 أسبوع قادم",
                asOfDate: todayLocal(),
                weekCount: weeks.length,
              },
              items: weeks.map((w: any) => ({
                "الأسبوع": w.label ?? w.startDate,
                "الوارد": Number(w.inflow ?? 0),
                "الصادر": Number(w.outflow ?? 0),
                "الصافي": Number((w.inflow ?? 0) - (w.outflow ?? 0)),
                "الرصيد التراكمي": Number(w.endingBalance ?? 0),
              })),
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Banknote className="h-4 w-4" /> لماذا 13 أسبوع؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            13 أسبوع = ربع سنة. هذا الأفق المعياري الذي يطلبه ضباط الائتمان
            في البنوك عند مراجعة خطوط التمويل. أوسع من الـ Cash Calendar اليومي
            (نوع آخر من البصرية) وأقل ضجيجاً من تقرير 3 أشهر إجمالي. كل أسبوع
            عمود مع: تدفقات داخلة + خارجة + صافي + الرصيد الختامي التراكمي.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Banknote className="h-3 w-3" /> رصيد البداية
            </p>
            <p className="text-base font-bold font-mono mt-1">{formatCurrency(startBalance)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> تدفقات داخلة 13أ
            </p>
            <p className="text-base font-bold font-mono text-emerald-700 mt-1">+{formatCurrency(totalInflow)}</p>
            <InlineSparkline
              values={weeks.map((w) => w.inflow)}
              tone="success"
              testid="cash-13week-inflow-spark"
            />
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> تدفقات خارجة 13أ
            </p>
            <p className="text-base font-bold font-mono text-red-700 mt-1">-{formatCurrency(totalOutflow)}</p>
            <InlineSparkline
              values={weeks.map((w) => w.outflow)}
              tone="warning"
              testid="cash-13week-outflow-spark"
            />
          </CardContent>
        </Card>
        <Card className={endingBalance < 0 ? "border-red-400 bg-red-50/30" : "border-emerald-400"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">رصيد نهاية الـ 13أ</p>
            <p className={`text-base font-bold font-mono mt-1 ${endingBalance < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatCurrency(endingBalance)}
            </p>
            <InlineSparkline
              values={weeks.map((w) => w.endingBalance)}
              tone={endingBalance < 0 ? "warning" : "success"}
              testid="cash-13week-balance-spark"
            />
          </CardContent>
        </Card>
        <Card className={negativeWeeks > 0 ? "border-red-400 bg-red-50/30" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> أسابيع بسالب
            </p>
            <p className={`text-base font-bold font-mono mt-1 ${negativeWeeks > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatNumber(negativeWeeks)}
            </p>
          </CardContent>
        </Card>
      </div>

      {minBalance < 0 && (
        <Card className="mb-4 border-red-400 bg-red-50/30">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5" />
            <span>
              <strong>تحذير سيولة:</strong> أدنى رصيد متوقع = <span className="font-mono font-bold">{formatCurrency(minBalance)}</span>
              {" "}نهاية الأسبوع {minWeek.weekIndex} ({minWeek.label}). يجب التفاوض مع البنك أو تأخير مدفوعات قبل هذا الموعد.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Weekly Grid ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> الجدول الأسبوعي
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            noToolbar
            pageSize={0}
            data={weeks}
            rowKey={(w) => w.weekIndex}
            className="text-xs"
            rowClassName={(w) =>
              cn(
                "hover:bg-muted/30",
                w.endingBalance < 0
                  ? "border-l-4 border-l-red-500 bg-red-50/40"
                  : w.endingBalance < startBalance * 0.2
                    ? "border-l-4 border-l-amber-400 bg-amber-50/30"
                    : "",
              )
            }
            columns={[
              {
                key: "weekIndex", header: "الأسبوع", className: "sticky right-0 bg-background font-semibold",
                render: (w) => (
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">أسبوع {w.weekIndex}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{w.label}</span>
                  </div>
                ),
              },
              {
                key: "inflow", header: "داخل", align: "end", className: "font-semibold",
                render: (w) =>
                  w.inflow === 0 ? (
                    <span className="text-muted-foreground italic">—</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-xs font-semibold text-emerald-700">
                        +{formatCurrency(w.inflow)}
                      </span>
                      <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${(w.inflow / maxAbs) * 100}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-0.5">{w.inflowCount} حدث</span>
                    </div>
                  ),
              },
              {
                key: "outflow", header: "خارج", align: "end", className: "font-semibold",
                render: (w) =>
                  w.outflow === 0 ? (
                    <span className="text-muted-foreground italic">—</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-xs font-semibold text-red-700">
                        -{formatCurrency(w.outflow)}
                      </span>
                      <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${(w.outflow / maxAbs) * 100}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground mt-0.5">{w.outflowCount} حدث</span>
                    </div>
                  ),
              },
              {
                key: "net", header: "صافي", align: "end", className: "font-mono text-xs font-bold",
                render: (w) => (
                  <span className={w.net > 0 ? "text-emerald-700" : w.net < 0 ? "text-red-700" : "text-muted-foreground"}>
                    {w.net === 0 ? "—" : (w.net > 0 ? "+" : "") + formatCurrency(w.net)}
                  </span>
                ),
              },
              {
                key: "openingBalance", header: "رصيد افتتاح", align: "end",
                className: "font-mono text-xs text-muted-foreground",
                render: (w) => formatCurrency(w.openingBalance),
              },
              {
                key: "endingBalance", header: "رصيد ختامي", align: "end", className: "font-mono text-sm font-bold",
                render: (w) => (
                  <span className={w.endingBalance < 0 ? "text-red-700" : "text-emerald-700"}>
                    {formatCurrency(w.endingBalance)}
                  </span>
                ),
              },
              {
                key: "_nav", header: "", sortable: false,
                render: () => (
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2" title="التالي">
                    <Link href={`/finance/cash-calendar`}>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </Button>
                ),
              },
            ] satisfies DataTableColumn<WeekBucket>[]}
            renderGrandTotal={() => (
              <tr className="bg-status-info-surface/40 font-bold border-t-2 border-status-info-surface">
                <td className="p-2 sticky right-0 bg-status-info-surface/40">الإجمالي 13أ</td>
                <td className="p-2 text-end font-mono text-emerald-700">+{formatCurrency(totalInflow)}</td>
                <td className="p-2 text-end font-mono text-red-700">-{formatCurrency(totalOutflow)}</td>
                <td className={`p-2 text-end font-mono ${(totalInflow - totalOutflow) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {(totalInflow - totalOutflow) > 0 ? "+" : ""}{formatCurrency(totalInflow - totalOutflow)}
                </td>
                <td className="p-2 text-end font-mono text-muted-foreground">{formatCurrency(startBalance)}</td>
                <td className={`p-2 text-end font-mono ${endingBalance < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {formatCurrency(endingBalance)}
                </td>
                <td></td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">قراءة التقرير:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>الأسابيع بـ <strong className="text-red-700">حد أحمر</strong>: رصيد ختامي سالب → تحتاج تمويل قبل ذلك التاريخ</li>
            <li>الأسابيع بـ <strong className="text-amber-700">حد كهرماني</strong>: رصيد منخفض جداً (أقل من 20% من البداية) → موقف هش</li>
            <li>قارن الـ "صافي" بصفر — أكثر من 4 أسابيع متتالية بسالب صافي = هيكل تشغيلي يستهلك السيولة</li>
            <li>هذا التقرير هو ما يطلبه ضابط الائتمان عند طلب زيادة سقف التمويل من البنك</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
