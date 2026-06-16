/**
 * /workspace — Employee operational daily view.
 *
 * Different from /my-space (HR personal: payslips, balances, loans).
 * This is the "day-of-work" command center: today's tasks, unread
 * communications, recent calls, upcoming meetings. Designed to be the
 * first page an employee opens in the morning.
 */
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { ProactiveInsightsCard } from "@/components/shared/proactive-insights-card";
import { formatDateAr } from "@/lib/formatters";
import {
  CheckSquare, MessageSquare, Phone, CalendarDays,
  AlertTriangle, Mail, MessageCircle, ArrowUpRight, Clock,
} from "lucide-react";

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string | null;
  scheduledDate: string | null;
  scheduledStart: string | null;
  clientName: string | null;
};

type Message = {
  id: number;
  channel: "email" | "whatsapp" | "sms";
  fromNumber: string | null;
  toNumber: string | null;
  subject: string | null;
  body_preview: string;
  createdAt: string;
};

type Call = {
  id: number;
  callerNumber: string | null;
  calledNumber: string | null;
  direction: string;
  duration: number | null;
  status: string;
  createdAt: string;
};

type Event = {
  kind: "task" | "obligation";
  id: string;
  title: string;
  date: string;
  priority: string | null;
  status: string;
};

type Feed = {
  today: string;
  todayTasks: Task[];
  overdueTasks: Task[];
  recentMessages: Message[];
  recentCalls: Call[];
  upcomingEvents: Event[];
  counts: { openTasks: number; messagesLast24h: number; callsLast24h: number };
};

const CHANNEL_ICON = { email: Mail, whatsapp: MessageCircle, sms: MessageSquare };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  low: "bg-slate-100 text-slate-600 border-slate-300",
};

export default function Workspace() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useApiQuery<Feed>(
    ["workspace-feed"],
    "/workspace/feed",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  return (
    <PageShell
      title="مساحة العمل"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مساحة العمل" },
      ]}
      subtitle={`صباحك خير ${user?.name || ""} — هذا برنامج يومك`}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-2"><Link href="/manager-board">
            <ArrowUpRight className="w-3 h-3" />
            لوحة المدير
          </Link></Button>
      }
    >
      {/* IGOC-006 — proactive insights surface (shapes itself by active role) */}
      <div className="mb-4">
        <ProactiveInsightsCard />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <CountCard
          icon={<CheckSquare className="w-5 h-5 text-blue-600" />}
          label="مهام مفتوحة"
          value={Number(data.counts.openTasks ?? 0)}
          href="/tasks"
        />
        <CountCard
          icon={<MessageSquare className="w-5 h-5 text-emerald-600" />}
          label="رسائل خلال 24س"
          value={Number(data.counts.messagesLast24h ?? 0)}
          href="/inbox"
        />
        <CountCard
          icon={<Phone className="w-5 h-5 text-violet-600" />}
          label="مكالمات خلال 24س"
          value={Number(data.counts.callsLast24h ?? 0)}
          href="/inbox"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TasksCard title="مهام اليوم" tasks={data.todayTasks} emptyText="لا توجد مهام لليوم" />
        <TasksCard
          title="مهام متأخرة"
          tasks={data.overdueTasks}
          emptyText="لا توجد مهام متأخرة"
          isOverdue
        />
        <MessagesCard messages={data.recentMessages} />
        <CallsCard calls={data.recentCalls} />
        <UpcomingCard events={data.upcomingEvents} />
      </div>
    </PageShell>
  );
}

function CountCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {icon}
        </CardContent>
      </Card>
    </Link>
  );
}

function TasksCard({ title, tasks, emptyText, isOverdue }: { title: string; tasks: Task[]; emptyText: string; isOverdue?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {isOverdue ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckSquare className="w-4 h-4 text-blue-500" />}
          {title}
          <Badge variant="outline" className="ms-auto">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{emptyText}</p>
        ) : (
          tasks.map((t) => (
            <Link key={t.id} href={`/tasks?id=${t.id}`}>
              <div className="flex items-start gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.clientName ? `${t.clientName} • ` : ""}
                    {t.scheduledDate ? formatDateAr(t.scheduledDate) : "بدون موعد"}
                  </p>
                </div>
                {t.priority && (
                  <Badge variant="outline" className={PRIORITY_COLOR[t.priority] || "text-xs"}>
                    {t.priority}
                  </Badge>
                )}
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MessagesCard({ messages }: { messages: Message[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-500" />
          آخر الرسائل الواردة
          <Badge variant="outline" className="ms-auto">{messages.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد رسائل حديثة</p>
        ) : (
          messages.map((m) => {
            const Icon = CHANNEL_ICON[m.channel] ?? MessageSquare;
            return (
              <Link key={m.id} href="/inbox">
                <div className="flex items-start gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer">
                  <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.fromNumber || "غير معروف"}</p>
                    {m.subject && <p className="text-sm font-medium truncate">{m.subject}</p>}
                    <p className="text-xs text-muted-foreground truncate">{m.body_preview}</p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function CallsCard({ calls }: { calls: Call[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="w-4 h-4 text-violet-500" />
          آخر المكالمات
          <Badge variant="outline" className="ms-auto">{calls.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد مكالمات حديثة</p>
        ) : (
          calls.map((c) => (
            <Link key={c.id} href="/inbox">
              <div className="flex items-center gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer">
                <div className={`w-2 h-2 rounded-full ${c.direction === "inbound" ? "bg-emerald-500" : "bg-blue-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.direction === "inbound" ? c.callerNumber : c.calledNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.status} • {c.duration ? `${c.duration}ث` : "—"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateAr(c.createdAt)}</span>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ events }: { events: Event[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-amber-500" />
          القادمة هذا الأسبوع
          <Badge variant="outline" className="ms-auto">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد فعاليات قادمة</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {events.map((e) => (
              <Link key={`${e.kind}-${e.id}`} href={e.kind === "task" ? "/tasks" : "/obligations"}>
                <div className="flex items-start gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer border border-border/40">
                  <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateAr(e.date)} • {e.kind === "task" ? "مهمة" : "التزام"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
