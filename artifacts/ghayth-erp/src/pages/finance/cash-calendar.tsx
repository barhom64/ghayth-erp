import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import {
  Calendar as CalIcon, TrendingUp, TrendingDown, AlertTriangle,
  Wallet, ChevronLeft, ChevronRight, Banknote, Activity,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Cash Calendar — 90-day daily cash position projection
 *
 * Answers: "هل سيولتي ستكفي الأسبوع الجاي؟"
 *
 * Combines:
 *  - Current cash (treasury) as starting balance
 *  - Expected inflows by due date (AR aging due dates)
 *  - Expected outflows by due date (AP / payment run pending)
 *
 * Renders a calendar grid where each day shows:
 *  - Net flow (inflow - outflow) with color
 *  - Cumulative cash position end-of-day
 *  - Click to drill into that day's events
 *
 * Red flag: any day where projected cash drops below zero.
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

interface DayCell {
  date: string;          // YYYY-MM-DD
  dayOfMonth: number;
  inflow: number;
  outflow: number;
  net: number;
  runningBalance: number;
  events: Array<{ kind: "in" | "out"; ref?: string; party?: string; amount: number }>;
  isPast: boolean;
  isToday: boolean;
}

function addDaysIso(base: string, days: number): string {
  // Parse as UTC + use UTC arithmetic — guard rule wants explicit Z suffix
  // so the wall-clock interpretation isn't dependent on the server's TZ.
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getWeekdayAr(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getUTCDay()];
}

function getMonthLabelAr(iso: string): string {
  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const d = new Date(iso + "T00:00:00Z");
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function CashCalendarPage() {
  const today = todayLocal();
  const [startDate, setStartDate] = useState<string>(today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery<CashFlowResp>(
    ["cash-calendar-flows"], `/finance/cash-flow-forecast`,
  );

  const grid = useMemo<DayCell[]>(() => {
    if (!data) return [];
    const startBalance = Number(data.currentBalance ?? 0);

    // Bucket all inflows & outflows by ISO date
    const flowsByDate = new Map<string, { inflow: number; outflow: number; events: DayCell["events"] }>();
    const addFlow = (iso: string, amount: number, kind: "in" | "out", party?: string, ref?: string) => {
      const key = iso.slice(0, 10);
      const cell = flowsByDate.get(key) ?? { inflow: 0, outflow: 0, events: [] };
      if (kind === "in") cell.inflow += amount; else cell.outflow += amount;
      cell.events.push({ kind, amount, party, ref });
      flowsByDate.set(key, cell);
    };

    const allInflows = [
      ...(data.inflows?.next30 ?? []),
      ...(data.inflows?.next60 ?? []),
      ...(data.inflows?.next90 ?? []),
    ];
    const allOutflows = [
      ...(data.outflows?.next30 ?? []),
      ...(data.outflows?.next60 ?? []),
      ...(data.outflows?.next90 ?? []),
    ];
    for (const i of allInflows) {
      if (!i.dueDate) continue;
      addFlow(i.dueDate, Number(i.expected ?? 0), "in", i.clientName, i.ref);
    }
    for (const o of allOutflows) {
      if (!o.dueDate) continue;
      addFlow(o.dueDate, Number(o.expected ?? 0), "out", o.supplierName, o.ref);
    }

    // Generate 90 days from startDate
    const cells: DayCell[] = [];
    let running = startBalance;
    for (let i = 0; i < 90; i++) {
      const iso = addDaysIso(startDate, i);
      const flows = flowsByDate.get(iso) ?? { inflow: 0, outflow: 0, events: [] };
      const net = flows.inflow - flows.outflow;
      running += net;
      const d = new Date(iso + "T00:00:00Z");
      cells.push({
        date: iso,
        dayOfMonth: d.getUTCDate(),
        inflow: flows.inflow,
        outflow: flows.outflow,
        net,
        runningBalance: running,
        events: flows.events,
        isPast: iso < today,
        isToday: iso === today,
      });
    }
    return cells;
  }, [data, startDate, today]);

  const totalInflow = grid.reduce((s, c) => s + c.inflow, 0);
  const totalOutflow = grid.reduce((s, c) => s + c.outflow, 0);
  const endingBalance = grid.length > 0 ? grid[grid.length - 1].runningBalance : Number(data?.currentBalance ?? 0);
  const minBalance = grid.reduce((min, c) => c.runningBalance < min ? c.runningBalance : min, Number(data?.currentBalance ?? 0));
  const minBalanceDay = grid.find((c) => c.runningBalance === minBalance);
  const negativeDays = grid.filter((c) => c.runningBalance < 0).length;

  const selectedCell = selectedDay ? grid.find((c) => c.date === selectedDay) : null;

  // Group cells by week-row (7 columns)
  const weeks = useMemo(() => {
    const result: DayCell[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      result.push(grid.slice(i, i + 7));
    }
    return result;
  }, [grid]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <PageShell
      title="تقويم السيولة (Cash Calendar)"
      subtitle="تنبؤ يومي للسيولة 90 يوم — جواب على «هل ستكفي السيولة للالتزامات القادمة؟»"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "تقويم السيولة" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/finance/cash-position-calculator">
              <Banknote className="h-4 w-4 me-1" />مركز السيولة
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/cash-13week">
              <CalIcon className="h-4 w-4 me-1" />توقع 13 أسبوع
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/cashflow">
              <Activity className="h-4 w-4 me-1" />لوحة التدفقات
            </Link></Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(addDaysIso(startDate, -7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(todayLocal())}>
            اليوم
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStartDate(addDaysIso(startDate, 7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <PrintButton
            entityType="report_finance_cash_calendar"
            entityId={startDate}
            size="icon"
            payload={{
              entity: { title: "تقويم السيولة — 90 يوم", total: grid.length },
              items: grid.map((d) => ({
                "التاريخ": d.date,
                "اليوم": getWeekdayAr(d.date),
                "تدفق داخل": Number(d.inflow || 0),
                "تدفق خارج": Number(d.outflow || 0),
                "صافي": Number(d.net || 0),
                "الرصيد التراكمي": Number(d.runningBalance || 0),
                "عدد الأحداث": d.events.length,
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <CalIcon className="h-4 w-4" /> كيف يعمل التقويم؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            الرصيد الابتدائي = النقد المتاح اليوم (من /finance/treasury). كل يوم
            يضاف عليه الـ inflows المتوقعة (AR بحسب تاريخ الاستحقاق) وينقص منه الـ outflows
            (AP/POs المستحقة). الـ <strong>الرصيد التراكمي</strong> يحدد ما إذا كنت
            ستملك السيولة كل يوم. أي يوم باللون الأحمر = الرصيد سالب = تحذير عاجل.
          </p>
        </CardContent>
      </Card>

      {/* ── Summary KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Wallet className="h-3 w-3" /> رصيد اليوم
            </p>
            <p className="text-base font-bold font-mono mt-1">{formatCurrency(Number(data?.currentBalance ?? 0))}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> تدفقات داخلة 90 يوم
            </p>
            <p className="text-base font-bold font-mono text-emerald-700 mt-1">+{formatCurrency(totalInflow)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> تدفقات خارجة 90 يوم
            </p>
            <p className="text-base font-bold font-mono text-red-700 mt-1">-{formatCurrency(totalOutflow)}</p>
          </CardContent>
        </Card>
        <Card className={endingBalance < 0 ? "border-red-400 bg-red-50/30" : "border-emerald-400"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">رصيد نهاية الـ 90 يوم</p>
            <p className={`text-base font-bold font-mono mt-1 ${endingBalance < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatCurrency(endingBalance)}
            </p>
          </CardContent>
        </Card>
        <Card className={negativeDays > 0 ? "border-red-400 bg-red-50/30" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> أيام بسالب
            </p>
            <p className={`text-base font-bold font-mono mt-1 ${negativeDays > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatNumber(negativeDays)}
            </p>
          </CardContent>
        </Card>
      </div>

      {minBalance < 0 && minBalanceDay && (
        <Card className="mb-4 border-red-400 bg-red-50/30">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5" />
            <span>
              <strong>تنبيه:</strong> أدنى رصيد متوقع = <span className="font-mono font-bold">{formatCurrency(minBalance)}</span>
              {" "}يوم <span className="font-mono">{minBalanceDay.date}</span> ({getWeekdayAr(minBalanceDay.date)}).
              يجب تأمين سيولة إضافية أو تأجيل مدفوعات قبل هذا التاريخ.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── Calendar Grid ─────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalIcon className="h-4 w-4" />
              {grid.length > 0 && `${getMonthLabelAr(grid[0].date)} → ${getMonthLabelAr(grid[grid.length - 1].date)}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[640px]">
              {["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground p-1">{d}</div>
              ))}
              {weeks.map((week, wIdx) =>
                week.map((cell, dIdx) => {
                  const intensity = cell.runningBalance < 0
                    ? "bg-red-100 border-red-300 text-red-900"
                    : cell.runningBalance < (Number(data?.currentBalance ?? 0) * 0.2)
                      ? "bg-amber-50 border-amber-300"
                      : cell.events.length > 0
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-muted/20";
                  const isSelected = selectedDay === cell.date;
                  return (
                    <button
                      key={`${wIdx}-${dIdx}`}
                      onClick={() => setSelectedDay(cell.date)}
                      className={`text-start p-1.5 rounded border min-h-[68px] transition-all ${intensity} ${
                        isSelected ? "ring-2 ring-status-info-foreground" : ""
                      } ${cell.isToday ? "ring-2 ring-blue-400" : ""} ${cell.isPast ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${cell.isToday ? "text-blue-700" : ""}`}>{cell.dayOfMonth}</span>
                        {cell.events.length > 0 && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0">{cell.events.length}</Badge>
                        )}
                      </div>
                      {cell.events.length > 0 && (
                        <>
                          {cell.inflow > 0 && (
                            <p className="text-[9px] font-mono text-emerald-700 mt-0.5">+{formatCurrency(cell.inflow)}</p>
                          )}
                          {cell.outflow > 0 && (
                            <p className="text-[9px] font-mono text-red-700">-{formatCurrency(cell.outflow)}</p>
                          )}
                        </>
                      )}
                      <p className={`text-[9px] font-mono mt-0.5 ${cell.runningBalance < 0 ? "font-bold" : ""}`}>
                        رصيد: {formatCurrency(cell.runningBalance)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Day Detail Panel ───────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedCell ? (
                <>
                  {getWeekdayAr(selectedCell.date)} · {selectedCell.date}
                </>
              ) : "اختر يوماً"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2 max-h-[640px] overflow-y-auto">
            {!selectedCell ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                انقر على أي خلية في التقويم لعرض تفاصيل ذلك اليوم
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <span className="text-xs">الرصيد قبل اليوم</span>
                  <span className="font-mono text-xs font-semibold">
                    {formatCurrency(selectedCell.runningBalance - selectedCell.net)}
                  </span>
                </div>
                {selectedCell.inflow > 0 && (
                  <div className="flex items-center justify-between p-2 bg-emerald-50 rounded text-xs">
                    <span className="text-emerald-700">+ تدفقات داخلة</span>
                    <span className="font-mono font-bold text-emerald-700">+{formatCurrency(selectedCell.inflow)}</span>
                  </div>
                )}
                {selectedCell.outflow > 0 && (
                  <div className="flex items-center justify-between p-2 bg-red-50 rounded text-xs">
                    <span className="text-red-700">- تدفقات خارجة</span>
                    <span className="font-mono font-bold text-red-700">-{formatCurrency(selectedCell.outflow)}</span>
                  </div>
                )}
                <div className={`flex items-center justify-between p-2 rounded text-xs font-bold border ${
                  selectedCell.runningBalance < 0 ? "border-red-400 bg-red-100 text-red-900" : "border-emerald-300 bg-emerald-50"
                }`}>
                  <span>رصيد نهاية اليوم</span>
                  <span className="font-mono">{formatCurrency(selectedCell.runningBalance)}</span>
                </div>

                {selectedCell.events.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-semibold mb-1.5">الأحداث ({selectedCell.events.length})</p>
                    <div className="space-y-1">
                      {selectedCell.events.map((e, i) => (
                        <div key={i} className={`p-1.5 rounded text-xs border ${
                          e.kind === "in" ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                        }`}>
                          <div className="flex items-center justify-between">
                            <Badge className={`text-[9px] ${e.kind === "in" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                              {e.kind === "in" ? "↓ داخل" : "↑ خارج"}
                            </Badge>
                            <span className={`font-mono font-bold ${e.kind === "in" ? "text-emerald-700" : "text-red-700"}`}>
                              {e.kind === "in" ? "+" : "-"}{formatCurrency(e.amount)}
                            </span>
                          </div>
                          {e.party && <p className="text-[10px] text-muted-foreground mt-0.5">{e.party}</p>}
                          {e.ref && <p className="text-[10px] font-mono text-muted-foreground">{e.ref}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCell.events.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    لا توجد تحركات مالية متوقعة في هذا اليوم
                  </p>
                )}

                <div className="pt-2 border-t flex gap-2">
                  <Button asChild variant="outline" size="sm" className="w-full text-xs"><Link href="/finance/receivables" className="flex-1">AR متأخرة</Link></Button>
                  <Button asChild variant="outline" size="sm" className="w-full text-xs"><Link href="/finance/payment-run" className="flex-1">دفع موردين</Link></Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
