/**
 * Operational Umrah Calendar — §4 of #1870 (Phase 1)
 *
 * The Charter calls this "the heart of operations". Phase 1 delivers
 * the foundation: a monthly grid that aggregates six event layers
 * from existing date columns + a day-detail side panel for drill-down.
 *
 * Six layers (toggleable):
 *   • وصول معتمرين          (umrah_pilgrims.arrivalDate)        — أخضر
 *   • مغادرة معتمرين        (umrah_pilgrims.departureDate)      — أزرق
 *   • تأشيرات تنتهي          (umrah_pilgrims.visaExpiry)         — أصفر
 *   • متأخرون عن المغادرة   (status = 'overstayed')             — أحمر
 *   • رحلات نقل              (umrah_transport.tripDate)          — بنفسجي
 *   • فواتير نسك تنتهي      (umrah_nusk_invoices.expiryDate)    — أصفر
 *
 * The API endpoint `/umrah/calendar/events` returns events flattened
 * to `[{ date, layer, count, color, label, sampleIds }]` so the grid
 * can render with one round-trip per month.
 *
 * Phase 2 (follow-up): yearly/seasonal views, calendar-driven actions
 * (open pilgrim, send alert, update arrival), pricing/commission layers,
 * real-time refresh via the §10 event stream.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw } from "lucide-react";

type CalendarLayer =
  | "pilgrim_arrival"
  | "pilgrim_departure"
  | "visa_expiring"
  | "overstay"
  | "transport_trip"
  | "nusk_expiring"
  // §4 Phase 2 of #1870.
  | "nusk_invoice_issued"
  | "penalty_created"
  // U-02b M5b (#2080) — unified-contract transport requests (reads
  // from transport_bookings, written via POST /umrah/groups/:id/
  // transport-requests). Sits next to `transport_trip` (which still
  // reads from the legacy umrah_transport table). Both layers stay
  // enabled by default so historic + contract activity surface
  // together.
  | "transport_request";

type ViewMode = "month" | "year";

interface CalendarEvent {
  date: string;
  layer: CalendarLayer;
  count: number;
  color: "green" | "yellow" | "red" | "gray" | "blue" | "purple";
  label: string;
  entityType: string;
  sampleIds: number[];
}

interface CalendarResp {
  data: CalendarEvent[];
  layers: Record<CalendarLayer, { label: string; color: string; entityType: string }>;
  window: { from: string; to: string };
}

const COLOR_CLASSES: Record<CalendarEvent["color"], string> = {
  green:  "bg-emerald-100 text-emerald-700 border-emerald-300",
  blue:   "bg-sky-100 text-sky-700 border-sky-300",
  yellow: "bg-amber-100 text-amber-800 border-amber-300",
  red:    "bg-rose-100 text-rose-700 border-rose-300",
  purple: "bg-violet-100 text-violet-700 border-violet-300",
  gray:   "bg-slate-100 text-slate-700 border-slate-300",
};

// Drill-down URL per layer's entity type. Keeps the calendar focused
// on display; the destination pages own the row-by-row UI.
const LAYER_HREF: Record<CalendarLayer, (ids: number[], date: string) => string> = {
  pilgrim_arrival:     (_ids, date) => `/umrah/pilgrims?arrivalDate=${date}`,
  pilgrim_departure:   (_ids, date) => `/umrah/pilgrims?departureDate=${date}`,
  visa_expiring:       ()           => `/umrah/pilgrims?visaExpiringWithin=7`,
  overstay:            ()           => `/umrah/pilgrims?status=overstayed`,
  transport_trip:      (ids)        => ids[0] ? `/umrah/transport/${ids[0]}` : `/umrah/transport`,
  nusk_expiring:       ()           => `/umrah/nusk-invoices`,
  nusk_invoice_issued: ()           => `/umrah/nusk-invoices`,
  penalty_created:     ()           => `/umrah/penalties`,
  // U-02b M5b — the M4 page (PR #2126) is group-scoped, not row-scoped,
  // so the drilldown opens the page index. The operator picks the
  // group from the page's selector. Intentionally NOT `/umrah/transport/...`
  // because those IDs belong to a different table.
  transport_request:   ()           => `/umrah/transport-requests`,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
// Saturday-first to match the Arabic operator's mental model.
const WEEKDAYS_AR = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export default function UmrahCalendar() {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // §4 Phase 3 — auto-refresh state. Off by default so the calendar
  // doesn't burn bandwidth on quiet days. Operator toggles ON when
  // running the daily ops desk (arrivals/departures rolling in).
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [enabledLayers, setEnabledLayers] = useState<Set<CalendarLayer>>(
    new Set([
      "pilgrim_arrival", "pilgrim_departure", "visa_expiring",
      "overstay", "transport_trip", "nusk_expiring",
      // §4 Phase 2 — enabled by default so the operator immediately
      // sees finance flow alongside the operational signals.
      "nusk_invoice_issued", "penalty_created",
      // U-02b M5b — contract-transport requests on by default so the
      // operator sees the unified path on the calendar from day one.
      "transport_request",
    ]),
  );

  // Window depends on the view. Monthly: just the visible month.
  // Yearly: the calendar year of the cursor. One round-trip per
  // view change (cap is 366 days on the API side).
  const from = useMemo(
    () => view === "month"
      ? fmtDate(firstOfMonth(cursor))
      : fmtDate(new Date(cursor.getFullYear(), 0, 1)),
    [cursor, view],
  );
  const to = useMemo(
    () => view === "month"
      ? fmtDate(lastOfMonth(cursor))
      : fmtDate(new Date(cursor.getFullYear(), 11, 31)),
    [cursor, view],
  );
  const layersQs = useMemo(
    () => Array.from(enabledLayers).join(","),
    [enabledLayers],
  );

  const eventsQ = useApiQuery<CalendarResp>(
    ["umrah-calendar", from, to, layersQs],
    `/umrah/calendar/events?from=${from}&to=${to}&layers=${layersQs}`,
    {
      enabled: enabledLayers.size > 0,
      // §4 Phase 3 — 60-second poll when autoRefresh is on. Matches the
      // operational rhythm (arrivals refresh ~minute via the nusk feed)
      // without being noisy enough to spike server load when 5 operators
      // have the page open. Set to false to disable.
      refetchInterval: autoRefresh ? 60_000 : false,
    },
  );

  // Bucket events by date for cheap per-day lookup. Also keep the
  // raw event list for the side panel.
  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of eventsQ.data?.data ?? []) {
      const arr = m.get(ev.date) ?? [];
      arr.push(ev);
      m.set(ev.date, arr);
    }
    return m;
  }, [eventsQ.data]);

  const gridDays = useMemo(() => {
    const first = firstOfMonth(cursor);
    const last  = lastOfMonth(cursor);
    // Saturday-first day-of-week index. JS getDay() returns 0=Sun..6=Sat.
    // Convert to 0=Sat..6=Fri so the grid leftmost column is Saturday.
    const leading = (first.getDay() + 1) % 7;
    const total = leading + last.getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < leading; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= last.getDate(); d++) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date: fmtDate(dt), day: d });
    }
    // Pad to a whole number of weeks.
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [cursor]);

  const todayStr = fmtDate(new Date());

  const layerEntries = (eventsQ.data?.layers
    ? (Object.entries(eventsQ.data.layers) as [CalendarLayer, { label: string; color: string }][])
    : []);

  const toggleLayer = (key: CalendarLayer) => {
    const next = new Set(enabledLayers);
    if (next.has(key)) next.delete(key); else next.add(key);
    setEnabledLayers(next);
  };

  const detailEvents = selectedDay ? eventsByDate.get(selectedDay) ?? [] : [];

  return (
    <PageShell
      title="تقويم العمرة التشغيلي"
      subtitle="نظرة يومية على الوصول، المغادرة، التأشيرات، النقل، والاستحقاقات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "التقويم" }]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setCursor(view === "month" ? addMonths(cursor, -1) : addMonths(cursor, -12))}
              data-testid="calendar-prev"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold min-w-[160px] text-center" data-testid="calendar-month-label">
              {view === "month"
                ? `${MONTH_NAMES_AR[cursor.getMonth()]} ${cursor.getFullYear()}`
                : `سنة ${cursor.getFullYear()}`}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => setCursor(view === "month" ? addMonths(cursor, 1) : addMonths(cursor, 12))}
              data-testid="calendar-next"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date()); setSelectedDay(todayStr); }}>
              <CalendarDays className="h-4 w-4 me-1" />
              اليوم
            </Button>
            {/* §4 Phase 2 — view-mode toggle. Yearly summarises the
                whole year at once via a heat-map; clicking a day in
                the yearly grid drops the operator back into the
                monthly view focused on that day. */}
            <div className="flex items-center gap-1 ms-2 border-s ps-2">
              <Button
                variant={view === "month" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("month")}
                data-testid="calendar-view-month"
              >
                شهري
              </Button>
              <Button
                variant={view === "year" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("year")}
                data-testid="calendar-view-year"
              >
                سنوي
              </Button>
            </div>
            {/* §4 Phase 3 — auto-refresh toggle. Polls /calendar/events
                every 60s when ON so the daily ops desk sees new
                arrivals/penalties/nusk events without manual reload.
                Off by default — saves bandwidth on quiet days. */}
            <div className="flex items-center gap-1 ms-2 border-s ps-2">
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh((v) => !v)}
                data-testid="calendar-auto-refresh-toggle"
                title={autoRefresh ? "تحديث تلقائي كل دقيقة — اضغط للإيقاف" : "اضغط لتفعيل التحديث التلقائي"}
              >
                <RefreshCw className={`h-4 w-4 me-1 ${autoRefresh && eventsQ.isFetching ? "animate-spin" : ""}`} />
                {autoRefresh ? "تحديث تلقائي · 60ث" : "تحديث تلقائي"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {layerEntries.map(([key, meta]) => {
              const checked = enabledLayers.has(key);
              const colorCls = COLOR_CLASSES[meta.color as CalendarEvent["color"]] ?? COLOR_CLASSES.gray;
              return (
                <label key={key} className="flex items-center gap-1 text-xs cursor-pointer" data-testid={`calendar-layer-${key}`}>
                  <Checkbox checked={checked} onCheckedChange={() => toggleLayer(key)} />
                  <span className={`px-2 py-0.5 rounded border ${colorCls}`}>{meta.label}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3">
        <Card>
          <CardContent className="p-3">
            {view === "year" ? (
              <YearGrid
                year={cursor.getFullYear()}
                eventsByDate={eventsByDate}
                selectedDay={selectedDay}
                todayStr={todayStr}
                onPickDay={(date) => {
                  setSelectedDay(date);
                  const [y, m, d] = date.split("-").map(Number);
                  setCursor(new Date(y, m - 1, d));
                  setView("month");
                }}
              />
            ) : (
            <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-1">
              {WEEKDAYS_AR.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
              {gridDays.map((cell, i) => {
                if (!cell.date) {
                  return <div key={`empty-${i}`} className="aspect-square rounded border border-transparent" />;
                }
                const dayEvents = eventsByDate.get(cell.date) ?? [];
                const isToday = cell.date === todayStr;
                const isSelected = cell.date === selectedDay;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedDay(cell.date)}
                    data-testid={`calendar-day-${cell.date}`}
                    className={`aspect-square rounded border text-start p-1 hover:bg-muted/50 ${
                      isSelected ? "ring-2 ring-primary border-primary" :
                      isToday ? "border-primary" : "border-border"
                    }`}
                  >
                    <div className={`text-xs font-medium ${isToday ? "text-primary" : ""}`}>{cell.day}</div>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const colorCls = COLOR_CLASSES[ev.color];
                        return (
                          <div
                            key={ev.layer}
                            className={`text-[10px] px-1 rounded border truncate ${colorCls}`}
                            title={`${ev.label}: ${ev.count}`}
                          >
                            {ev.label}: {ev.count}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold" data-testid="calendar-day-detail-title">
              {selectedDay ? `أحداث ${selectedDay}` : "اختر يوماً لعرض تفاصيله"}
            </div>
            {detailEvents.length === 0 && selectedDay && (
              <p className="text-xs text-muted-foreground">لا أحداث في هذا اليوم.</p>
            )}
            {detailEvents.map((ev) => {
              const colorCls = COLOR_CLASSES[ev.color];
              const href = LAYER_HREF[ev.layer](ev.sampleIds, ev.date);
              return (
                <Link
                  key={ev.layer}
                  href={href}
                  className={`block p-2 rounded border text-xs hover:opacity-90 ${colorCls}`}
                  data-testid={`calendar-day-event-${ev.layer}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{ev.label}</span>
                    <span className="font-bold">{ev.count}</span>
                  </div>
                  {ev.sampleIds.length > 0 && (
                    <div className="mt-1 text-[10px] opacity-75">
                      أرقام عينة: {ev.sampleIds.slice(0, 5).join("، ")}
                      {ev.sampleIds.length > 5 ? "..." : ""}
                    </div>
                  )}
                </Link>
              );
            })}
            {/* §4 Phase 2 — quick actions from the calendar. The
                Charter calls for "إجراءات مباشرة من التقويم": this
                short row of links pivots the operator into the most
                common follow-up actions without making them remember
                the URL. */}
            {selectedDay && (
              <div className="pt-2 border-t" data-testid="calendar-day-actions">
                <p className="text-[10px] text-muted-foreground mb-1">إجراءات سريعة</p>
                <div className="flex flex-wrap gap-1">
                  <Link
                    href="/umrah/pilgrims/create"
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted/50"
                    data-testid="calendar-action-create-pilgrim"
                  >
                    إضافة معتمر
                  </Link>
                  <Link
                    href={`/umrah/daily-runsheet?date=${selectedDay}`}
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted/50"
                    data-testid="calendar-action-runsheet"
                  >
                    كشف اليوم
                  </Link>
                  <Link
                    href="/umrah/groups"
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted/50"
                    data-testid="calendar-action-groups"
                  >
                    المجموعات
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

/**
 * §4 Phase 2 — Yearly view component.
 *
 * Renders 12 mini-month grids with a heat-color per day driven by
 * the count of events. Clicking a day pivots back to the monthly
 * view focused on that day, so the operator can switch granularity
 * mid-flow without losing context.
 *
 * Calls no API directly — consumes the already-fetched eventsByDate
 * map from the parent. The parent's API window is the full year, so
 * one round-trip serves the whole yearly render.
 */
function YearGrid({
  year, eventsByDate, selectedDay, todayStr, onPickDay,
}: {
  year: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: string | null;
  todayStr: string;
  onPickDay: (date: string) => void;
}) {
  // Heat intensity per day = sum of event counts across all enabled
  // layers. Bucketed so the FE can render 5 discrete tones instead
  // of a continuous gradient — easier to visually compare months.
  function heatTone(date: string): string {
    const total = (eventsByDate.get(date) ?? []).reduce((acc, ev) => acc + ev.count, 0);
    if (total === 0) return "bg-muted/30 border-transparent";
    if (total <= 2)  return "bg-emerald-100 border-emerald-200";
    if (total <= 5)  return "bg-sky-100 border-sky-200";
    if (total <= 10) return "bg-amber-100 border-amber-200";
    return "bg-rose-100 border-rose-200";
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="calendar-year-grid">
      {Array.from({ length: 12 }, (_, monthIdx) => {
        const first = new Date(year, monthIdx, 1);
        const last  = new Date(year, monthIdx + 1, 0);
        const leading = (first.getDay() + 1) % 7;
        const cells: Array<{ date: string | null; day: number | null }> = [];
        for (let i = 0; i < leading; i++) cells.push({ date: null, day: null });
        for (let d = 1; d <= last.getDate(); d++) {
          const dt = new Date(year, monthIdx, d);
          cells.push({ date: fmtDate(dt), day: d });
        }
        while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

        return (
          <div key={monthIdx} className="space-y-1" data-testid={`calendar-mini-month-${monthIdx + 1}`}>
            <div className="text-xs font-semibold text-center">{MONTH_NAMES_AR[monthIdx]}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS_AR.map((d) => (
                <div key={d} className="text-[8px] text-muted-foreground text-center">
                  {d.slice(0, 1)}
                </div>
              ))}
              {cells.map((cell, i) => {
                if (!cell.date) return <div key={`e-${i}`} className="w-3 h-3" />;
                const tone = heatTone(cell.date);
                const isToday = cell.date === todayStr;
                const isSelected = cell.date === selectedDay;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => onPickDay(cell.date!)}
                    data-testid={`calendar-mini-day-${cell.date}`}
                    title={cell.date}
                    className={`w-3 h-3 rounded-sm border ${tone} ${
                      isSelected ? "ring-1 ring-primary" :
                      isToday ? "ring-1 ring-primary/50" : ""
                    } hover:opacity-80`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
