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
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

type CalendarLayer =
  | "pilgrim_arrival"
  | "pilgrim_departure"
  | "visa_expiring"
  | "overstay"
  | "transport_trip"
  | "nusk_expiring";

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
  pilgrim_arrival:   (_ids, date) => `/umrah/pilgrims?arrivalDate=${date}`,
  pilgrim_departure: (_ids, date) => `/umrah/pilgrims?departureDate=${date}`,
  visa_expiring:     ()           => `/umrah/pilgrims?visaExpiringWithin=7`,
  overstay:          ()           => `/umrah/pilgrims?status=overstayed`,
  transport_trip:    (ids)        => ids[0] ? `/umrah/transport/${ids[0]}` : `/umrah/transport`,
  nusk_expiring:     ()           => `/umrah/nusk-invoices`,
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [enabledLayers, setEnabledLayers] = useState<Set<CalendarLayer>>(
    new Set([
      "pilgrim_arrival", "pilgrim_departure", "visa_expiring",
      "overstay", "transport_trip", "nusk_expiring",
    ]),
  );

  const from = useMemo(() => fmtDate(firstOfMonth(cursor)), [cursor]);
  const to   = useMemo(() => fmtDate(lastOfMonth(cursor)), [cursor]);
  const layersQs = useMemo(
    () => Array.from(enabledLayers).join(","),
    [enabledLayers],
  );

  const eventsQ = useApiQuery<CalendarResp>(
    ["umrah-calendar", from, to, layersQs],
    `/umrah/calendar/events?from=${from}&to=${to}&layers=${layersQs}`,
    enabledLayers.size > 0,
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
            <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, -1))} data-testid="calendar-prev">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold min-w-[160px] text-center" data-testid="calendar-month-label">
              {MONTH_NAMES_AR[cursor.getMonth()]} {cursor.getFullYear()}
            </div>
            <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))} data-testid="calendar-next">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date()); setSelectedDay(todayStr); }}>
              <CalendarDays className="h-4 w-4 me-1" />
              اليوم
            </Button>
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
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
