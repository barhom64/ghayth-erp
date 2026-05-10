import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Calendar as CalendarIcon, Calendar, Flag, Clock, FileText, ListTodo, GraduationCap, IdCard, Car, Shield, Users, List, Grid3x3, ChevronRight, ChevronLeft } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  milestone: { label: "معلم", color: "bg-orange-100 text-orange-700", icon: Flag },
  obligation: { label: "التزام", color: "bg-red-100 text-red-700", icon: Clock },
  contract_expiry: { label: "انتهاء عقد", color: "bg-purple-100 text-purple-700", icon: FileText },
  task: { label: "مهمة", color: "bg-blue-100 text-blue-700", icon: ListTodo },
  training: { label: "تدريب", color: "bg-cyan-100 text-cyan-700", icon: GraduationCap },
  document_expiry: { label: "وثيقة", color: "bg-yellow-100 text-yellow-700", icon: IdCard },
  vehicle_expiry: { label: "مركبة", color: "bg-slate-100 text-slate-700", icon: Car },
  vehicle_maintenance: { label: "صيانة", color: "bg-stone-100 text-stone-700", icon: Car },
  insurance_expiry: { label: "تأمين", color: "bg-emerald-100 text-emerald-700", icon: Shield },
  leave: { label: "إجازة", color: "bg-green-100 text-green-700", icon: Calendar },
  interview: { label: "مقابلة", color: "bg-indigo-100 text-indigo-700", icon: Users },
};

function groupByDate(events: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  events.forEach((e) => {
    const d = e.date?.split("T")[0] || "unknown";
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  });
  return groups;
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split("T")[0];
}

function isTomorrow(dateStr: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === tomorrow.toISOString().split("T")[0];
}

function dayLabel(dateStr: string) {
  if (isToday(dateStr)) return "اليوم";
  if (isTomorrow(dateStr)) return "غداً";
  return formatDateAr(dateStr);
}

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    cells.push(date.toISOString().split("T")[0]);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarPage() {
  const [days, setDays] = useState("30");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [view, setView] = useState<"list" | "month">("list");
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["calendar-upcoming", days],
    `/calendar/upcoming?days=${days}`
  );

  const allEvents = data?.events || [];
  const summary = data?.summary || {};
  const filtered = categoryFilter === "all"
    ? allEvents
    : allEvents.filter((e: any) => e.category === categoryFilter);

  const grouped = groupByDate(filtered);
  const sortedDates = Object.keys(grouped).sort();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <PageShell
      title="التقويم الموحد"
      subtitle="جميع المواعيد النهائية القادمة من المشاريع والالتزامات والعقود والمهام"
      breadcrumbs={[{ label: "العمليات" }, { label: "التقويم" }]}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setView("list")}
            >
              <List className="h-3.5 w-3.5" /> قائمة
            </Button>
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setView("month")}
            >
              <Grid3x3 className="h-3.5 w-3.5" /> شهر
            </Button>
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="milestone">المعالم</SelectItem>
              <SelectItem value="obligation">الالتزامات</SelectItem>
              <SelectItem value="contract_expiry">انتهاء العقود</SelectItem>
              <SelectItem value="task">المهام</SelectItem>
              <SelectItem value="training">التدريب</SelectItem>
              <SelectItem value="document_expiry">الوثائق</SelectItem>
              <SelectItem value="vehicle_expiry">المركبات</SelectItem>
              <SelectItem value="insurance_expiry">التأمين</SelectItem>
              <SelectItem value="leave">الإجازات</SelectItem>
              <SelectItem value="interview">المقابلات</SelectItem>
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 أيام</SelectItem>
              <SelectItem value="14">14 يوم</SelectItem>
              <SelectItem value="30">30 يوم</SelectItem>
              <SelectItem value="60">60 يوم</SelectItem>
              <SelectItem value="90">90 يوم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <KpiGrid items={[
        { label: "معالم قادمة", value: summary.milestones || 0, icon: Flag, color: "text-orange-600 bg-orange-50" },
        { label: "التزامات", value: summary.obligations || 0, icon: Clock, color: "text-red-600 bg-red-50" },
        { label: "عقود تنتهي", value: summary.contractExpirations || 0, icon: FileText, color: "text-purple-600 bg-purple-50" },
        { label: "مهام مستحقة", value: summary.tasks || 0, icon: ListTodo, color: "text-blue-600 bg-blue-50" },
        { label: "تدريبات", value: summary.trainings || 0, icon: GraduationCap, color: "text-cyan-600 bg-cyan-50" },
        { label: "وثائق تنتهي", value: summary.documentExpiries || 0, icon: IdCard, color: "text-yellow-600 bg-yellow-50" },
        { label: "أحداث مركبات", value: summary.vehicleExpiries || 0, icon: Car, color: "text-slate-600 bg-slate-50" },
        { label: "تأمينات تنتهي", value: summary.insuranceExpiries || 0, icon: Shield, color: "text-emerald-600 bg-emerald-50" },
        { label: "إجازات", value: summary.leaves || 0, icon: Calendar, color: "text-green-600 bg-green-50" },
        { label: "مقابلات", value: summary.interviews || 0, icon: Users, color: "text-indigo-600 bg-indigo-50" },
      ]} />

      {view === "month" ? (
        <MonthGrid
          year={monthCursor.year}
          month={monthCursor.month}
          events={filtered}
          onPrev={() => setMonthCursor((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
          onNext={() => setMonthCursor((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
          onToday={() => { const d = new Date(); setMonthCursor({ year: d.getFullYear(), month: d.getMonth() }); }}
        />
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarIcon className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>لا توجد أحداث قادمة خلال الفترة المحددة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateStr) => {
            const dayEvents = grouped[dateStr];
            const today = isToday(dateStr);
            return (
              <Card key={dateStr} className={today ? "border-primary/30 bg-primary/5" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className={today ? "text-primary font-bold" : ""}>{dayLabel(dateStr)}</span>
                    <Badge variant="outline" className="text-xs">{dayEvents.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dayEvents.map((event: any) => {
                    const config = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.task;
                    const Icon = config.icon;
                    return (
                      <Link key={event.id} href={event.link || "#"}>
                        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex-none">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{event.title}</span>
                              <Badge className={`text-[10px] ${config.color}`}>{config.label}</Badge>
                            </div>
                            {event.context && (
                              <p className="text-xs text-muted-foreground mt-0.5">{event.context}</p>
                            )}
                          </div>
                          {event.priority && event.priority === "high" && (
                            <Badge className="bg-red-100 text-red-700 text-[10px]">عاجل</Badge>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

interface MonthGridProps {
  year: number;
  month: number;
  events: any[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function MonthGrid({ year, month, events, onPrev, onNext, onToday }: MonthGridProps) {
  const cells = buildMonthGrid(year, month);
  const today = new Date().toISOString().split("T")[0];

  const eventsByDate: Record<string, any[]> = {};
  for (const e of events) {
    const d = e.date?.split("T")[0];
    if (!d) continue;
    if (!eventsByDate[d]) eventsByDate[d] = [];
    eventsByDate[d].push(e);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          {ARABIC_MONTHS[month]} {year}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onPrev}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToday}>اليوم</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onNext}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center" dir="rtl">
          {ARABIC_WEEKDAYS.map((wd) => (
            <div key={wd} className="text-xs font-semibold text-muted-foreground py-1.5">{wd}</div>
          ))}
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} className="min-h-[80px]" />;
            const dayEvents = eventsByDate[date] || [];
            const isCurrentDay = date === today;
            const dayNum = Number(date.split("-")[2]);
            return (
              <div
                key={idx}
                className={`min-h-[80px] border rounded-md p-1 text-start flex flex-col gap-0.5 ${isCurrentDay ? "border-primary bg-primary/5" : "border-gray-100 hover:bg-muted/40"}`}
              >
                <div className={`text-xs font-semibold ${isCurrentDay ? "text-primary" : "text-gray-600"}`}>{dayNum}</div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((e: any) => {
                    const config = CATEGORY_CONFIG[e.category] || CATEGORY_CONFIG.task;
                    return (
                      <Link key={e.id} href={e.link || "#"}>
                        <div className={`text-[10px] truncate rounded px-1 py-0.5 cursor-pointer hover:opacity-80 ${config.color}`}>
                          {e.title}
                        </div>
                      </Link>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} أخرى</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
