import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Flag, Clock, FileText, ListTodo, GraduationCap, IdCard, Car, Shield, ChevronLeft } from "lucide-react";
import { formatDateAr, todayLocal } from "@/lib/formatters";

const CATEGORY_ICON: Record<string, any> = {
  milestone: Flag,
  obligation: Clock,
  contract_expiry: FileText,
  task: ListTodo,
  training: GraduationCap,
  document_expiry: IdCard,
  vehicle_expiry: Car,
  vehicle_maintenance: Car,
  insurance_expiry: Shield,
};

const CATEGORY_COLOR: Record<string, string> = {
  milestone: "text-orange-600",
  obligation: "text-status-error-foreground",
  contract_expiry: "text-purple-600",
  task: "text-status-info-foreground",
  training: "text-cyan-600",
  document_expiry: "text-yellow-600",
  vehicle_expiry: "text-slate-600",
  vehicle_maintenance: "text-stone-600",
  insurance_expiry: "text-emerald-600",
};

function dayLabel(dateStr: string) {
  const today = todayLocal();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const d = dateStr?.split("T")[0];
  if (d === today) return "اليوم";
  if (d === tomorrowStr) return "غداً";
  return formatDateAr(d);
}

interface Props {
  days?: number;
  limit?: number;
  title?: string;
}

export function UpcomingEventsWidget({ days = 14, limit = 6, title = "الأحداث القادمة" }: Props) {
  const { data, isLoading } = useApiQuery<any>(
    ["upcoming-events-widget", String(days)],
    `/calendar/upcoming?days=${days}`
  );

  const events = (data?.events || []).slice(0, limit);
  const total = data?.summary?.total || 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <Link href="/calendar">
          <Button variant="ghost" size="sm" className="text-xs h-7">
            عرض الكل {total > 0 && <Badge variant="secondary" className="ms-1 h-4 px-1.5 text-[10px]">{total}</Badge>}
            <ChevronLeft className="h-3 w-3 ms-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">جاري التحميل...</div>
        ) : events.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">لا توجد أحداث خلال {days} يوم القادم</div>
        ) : (
          events.map((event: any) => {
            const Icon = CATEGORY_ICON[event.category] || Calendar;
            const color = CATEGORY_COLOR[event.category] || "text-muted-foreground";
            return (
              <Link key={event.id} href={event.link || "#"}>
                <div className="flex items-center gap-2.5 p-2 rounded-md hover:bg-muted/60 cursor-pointer transition-colors border border-transparent hover:border-border">
                  <Icon className={`h-4 w-4 flex-none ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{event.title}</p>
                    {event.context && (
                      <p className="text-[11px] text-muted-foreground truncate">{event.context}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 flex-none">
                    {dayLabel(event.date)}
                  </Badge>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
