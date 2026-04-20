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
import { Calendar as CalendarIcon, Flag, Clock, FileText, ListTodo, GraduationCap, IdCard, Car, Shield } from "lucide-react";
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

export default function CalendarPage() {
  const [days, setDays] = useState("30");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
      ]} />

      {sortedDates.length === 0 ? (
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
