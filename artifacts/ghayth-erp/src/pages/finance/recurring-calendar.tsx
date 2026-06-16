import { useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import {
  Calendar, Repeat, AlertTriangle, ChevronRight, Plus, Clock,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Recurring JE Schedule Calendar
 *
 * Visualizes the next 30 days of automatic journal entries:
 *  - Monthly recurring journals
 *  - Quarterly recurring journals
 *  - Annual recurring journals
 *
 * Helps CFO answer: "ما الذي سيُرحَّل تلقائياً الشهر القادم وما قيمته؟"
 */

interface RecurringJournal {
  id: number;
  name: string;
  description: string | null;
  operationType: string | null;
  frequency: "monthly" | "quarterly" | "annual" | string;
  nextRunDate: string | null;
  lastRunDate: string | null;
  isActive: boolean;
  totalAmount?: number | string;
  templateId?: number | null;
  costCenter?: string | null;
}

interface CalendarDay {
  date: string;
  dayOfMonth: number;
  weekdayAr: string;
  events: RecurringJournal[];
  isPast: boolean;
  isToday: boolean;
}

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekdayAr(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][d.getUTCDay()];
}

function monthDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

const FREQ_LABEL: Record<string, string> = {
  monthly:   "شهري",
  quarterly: "ربع سنوي",
  annual:    "سنوي",
  weekly:    "أسبوعي",
  daily:     "يومي",
};

const FREQ_COLOR: Record<string, string> = {
  monthly:   "bg-blue-100 text-blue-800",
  quarterly: "bg-purple-100 text-purple-800",
  annual:    "bg-amber-100 text-amber-800",
  weekly:    "bg-emerald-100 text-emerald-800",
  daily:     "bg-cyan-100 text-cyan-800",
};

export default function RecurringCalendarPage() {
  const today = todayLocal();
  const { data, isLoading } = useApiQuery<{ data: RecurringJournal[] }>(
    ["recurring-calendar"], `/finance/recurring-journals`,
  );

  const recurring = (data?.data ?? []).filter((r) => r.isActive);
  const activeWithNext = recurring.filter((r) => r.nextRunDate);
  const inactive = (data?.data ?? []).filter((r) => !r.isActive).length;

  // Group by nextRunDate
  const eventsByDate = useMemo(() => {
    const m = new Map<string, RecurringJournal[]>();
    for (const r of activeWithNext) {
      if (!r.nextRunDate) continue;
      const key = r.nextRunDate.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return m;
  }, [activeWithNext]);

  // Build 30-day grid starting from today
  const grid: CalendarDay[] = useMemo(() => {
    const result: CalendarDay[] = [];
    for (let i = 0; i < 30; i++) {
      const iso = addDaysUtc(today, i);
      const events = eventsByDate.get(iso) ?? [];
      // utc-ok: comparing YYYY-MM-DD strings
      const d = new Date(iso + "T00:00:00Z");
      result.push({
        date: iso,
        dayOfMonth: d.getUTCDate(),
        weekdayAr: weekdayAr(iso),
        events,
        isPast: iso < today,
        isToday: iso === today,
      });
    }
    return result;
  }, [today, eventsByDate]);

  if (isLoading) return <LoadingSpinner />;

  const next30Events = grid.flatMap((d) => d.events);
  const next30Amount = next30Events.reduce((s, e) => s + Number(e.totalAmount ?? 0), 0);

  // Without nextRunDate (probably need configuration)
  const noNextDate = recurring.filter((r) => !r.nextRunDate);

  // Group days into weeks for grid (Sat-start Saudi week)
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }

  return (
    <PageShell
      title="تقويم القيود المتكررة"
      subtitle="ماذا سيُرحَّل تلقائياً خلال الـ 30 يوم القادم؟ — للمراقبة الاستباقية والتخطيط"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/recurring-journals", label: "القيود المتكررة" },
        { label: "التقويم" },
      ]}
      actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/recurring-journals/create">
              <Plus className="h-4 w-4 me-1" /> قيد متكرر جديد
            </Link></Button>
          <PrintButton
            entityType="report_finance_recurring_calendar"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "تقويم القيود المتكررة — 30 يوم", total: next30Events.length },
              items: next30Events.map((e) => ({
                "الاسم": e.name,
                "الوصف": e.description || "—",
                "التكرار": FREQ_LABEL[e.frequency] || e.frequency,
                "تاريخ التشغيل القادم": e.nextRunDate || "—",
                "المبلغ": Number(e.totalAmount || 0),
                "مركز التكلفة": e.costCenter || "—",
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
            <Repeat className="h-4 w-4" /> ما الذي تعرضه الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            كل القيود المتكررة المفعّلة (إيجار شهري، استهلاك، رواتب) ومتى ستفعل
            تلقائياً خلال الـ 30 يوم القادم. صفحة /finance/recurring-journals
            تعرض القائمة. هذه الصفحة تعرض <strong>التوقيت</strong> — نقطة عمياء
            مهمة للتخطيط النقدي (e.g. "هل عندي رواتب 100K مستحقة الإثنين؟").
          </p>
        </CardContent>
      </Card>

      {/* ── KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Repeat className="h-3 w-3" /> قيود مفعّلة
            </p>
            <p className="text-lg font-bold font-mono mt-1">{formatNumber(recurring.length)}</p>
            {inactive > 0 && <p className="text-[10px] text-muted-foreground">+ {inactive} معطّلة</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عمليات خلال 30أ</p>
            <p className="text-lg font-bold font-mono mt-1 text-status-info-foreground">{formatNumber(next30Events.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي مالي متوقع</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(next30Amount)}</p>
          </CardContent>
        </Card>
        <Card className={noNextDate.length > 0 ? "border-amber-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> بدون nextRunDate
            </p>
            <p className={`text-lg font-bold font-mono mt-1 ${noNextDate.length > 0 ? "text-amber-700" : ""}`}>
              {formatNumber(noNextDate.length)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Calendar Grid ─────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> الـ 30 يوم القادمة من {monthDay(today)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 overflow-x-auto">
          <div className="grid grid-cols-7 gap-1 min-w-[640px]">
            {["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground p-1">{d}</div>
            ))}
            {weeks.map((week, wIdx) =>
              week.map((cell) => {
                const hasEvents = cell.events.length > 0;
                const cls = hasEvents
                  ? "bg-status-info-surface/40 border-status-info-surface"
                  : "bg-muted/20 border-muted";
                return (
                  <div key={`${wIdx}-${cell.date}`}
                    className={`p-1.5 rounded border min-h-[80px] ${cls} ${
                      cell.isToday ? "ring-2 ring-blue-400" : ""
                    } ${cell.isPast ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${cell.isToday ? "text-blue-700" : ""}`}>
                        {cell.dayOfMonth}
                      </span>
                      {hasEvents && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {cell.events.length}
                        </Badge>
                      )}
                    </div>
                    {hasEvents && (
                      <div className="space-y-0.5">
                        {cell.events.slice(0, 3).map((e) => (
                          <div key={e.id} className="text-[9px] truncate">
                            <span className="font-medium">{e.name}</span>
                          </div>
                        ))}
                        {cell.events.length > 3 && (
                          <p className="text-[8px] text-muted-foreground">+{cell.events.length - 3}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Event Detail List ─────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">القيود المجدولة ({next30Events.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {next30Events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              ما في قيود متكررة مجدولة خلال الـ 30 يوم القادمة
            </p>
          ) : (
            next30Events
              .sort((a, b) => (a.nextRunDate ?? "").localeCompare(b.nextRunDate ?? ""))
              .map((r) => {
                const freq = r.frequency ?? "monthly";
                const daysAhead = r.nextRunDate
                  ? Math.max(0, Math.floor((new Date(r.nextRunDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000))
                  : 0;
                return (
                  <Link key={r.id} href={`/finance/recurring-journals/${r.id}`}>
                    <div className="flex items-center justify-between p-2.5 rounded border hover:bg-muted/40 cursor-pointer">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="text-center w-12 shrink-0">
                          <p className="text-[10px] text-muted-foreground">{r.nextRunDate?.slice(8, 10)}</p>
                          <p className="text-[10px] font-mono">{r.nextRunDate ? weekdayAr(r.nextRunDate) : "—"}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{r.name}</span>
                            <Badge className={`text-[10px] ${FREQ_COLOR[freq] ?? "bg-muted"}`}>
                              {FREQ_LABEL[freq] ?? freq}
                            </Badge>
                            {daysAhead === 0 && (
                              <Badge className="bg-red-100 text-red-800 text-[10px]">اليوم</Badge>
                            )}
                            {daysAhead === 1 && (
                              <Badge className="bg-amber-100 text-amber-800 text-[10px]">غداً</Badge>
                            )}
                            {daysAhead > 1 && daysAhead <= 7 && (
                              <Badge variant="outline" className="text-[10px]">بعد {daysAhead} يوم</Badge>
                            )}
                          </div>
                          {r.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{r.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.totalAmount != null && Number(r.totalAmount) > 0 && (
                          <span className="font-mono text-xs font-semibold">{formatCurrency(Number(r.totalAmount))}</span>
                        )}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                );
              })
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      {noNextDate.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/30">
          <CardContent className="p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">{noNextDate.length} قيد بدون nextRunDate</p>
              <p>هذي القيود مفعّلة لكن ليس لديها تاريخ تشغيل قادم محدد. افتح <Link href="/finance/recurring-journals" className="text-status-info-foreground hover:underline">القيود المتكررة</Link> وضع لها تاريخ بدء.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
          <Clock className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            القيود تُرحَّل تلقائياً عبر cron الـ recurring scheduler. يمكن "تشغيل الآن"
            من /finance/recurring-journals/:id لتقديم الترحيل. التقويم يعرض الـ
            nextRunDate المخزّن في قاعدة البيانات.
          </span>
        </CardContent>
      </Card>
    </PageShell>
  );
}
