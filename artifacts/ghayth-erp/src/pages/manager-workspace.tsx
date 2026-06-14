/**
 * /manager-workspace — Manager operational view.
 *
 * Sits beside /manager-board (which is approvals-heavy). This shows
 * team pulse: who's present today, who has overdue tasks, week KPIs,
 * pending approvals snapshot, message volumes by channel.
 */
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import {
  Users, UserCheck, ListChecks, MessageSquare,
  Phone, Mail, MessageCircle, FileText, ArrowUpRight,
  TrendingUp, AlertTriangle,
} from "lucide-react";

type TeamFeed = {
  today: string;
  attendanceToday: { present: number; late: number; absent: number; on_leave: number };
  teamOpenTasks: Array<{ employeeId: number; employeeName: string; openCount: number; overdueCount: number }>;
  teamMessagesToday: {
    inbound: number; outbound: number;
    inboundEmail: number; inboundWhatsapp: number; inboundSms: number;
  };
  pendingApprovalsSummary: {
    leaveRequests: number; overtimeRequests: number;
    advanceRequests: number; exitRequests: number;
  };
  weekKpis: {
    tasksClosedWeek: number; messagesWeek: number;
    callsWeek: number; invoicesWeek: number;
  };
};

export default function ManagerWorkspace() {
  const { selectedRoleLabel } = useAppContext();
  const { data, isLoading, isError, refetch } = useApiQuery<TeamFeed>(
    ["workspace-team"],
    "/workspace/team",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  const totalApprovals =
    Number(data.pendingApprovalsSummary.leaveRequests) +
    Number(data.pendingApprovalsSummary.overtimeRequests) +
    Number(data.pendingApprovalsSummary.advanceRequests) +
    Number(data.pendingApprovalsSummary.exitRequests);

  return (
    <PageShell
      title="مساحة المدير"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مساحة المدير" },
      ]}
      subtitle={`نبض الفريق اليوم — ${selectedRoleLabel}`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2"><Link href="/manager-board">
              <ListChecks className="w-3 h-3" />
              الاعتمادات
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="gap-2"><Link href="/workspace">
              <ArrowUpRight className="w-3 h-3" />
              مساحتي
            </Link></Button>
        </div>
      }
    >
      {/* Attendance summary */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            حضور الفريق اليوم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatPill label="حاضر" value={Number(data.attendanceToday.present)} color="emerald" />
            <StatPill label="متأخر" value={Number(data.attendanceToday.late)} color="amber" />
            <StatPill label="غائب" value={Number(data.attendanceToday.absent)} color="red" />
            <StatPill label="إجازة" value={Number(data.attendanceToday.on_leave)} color="blue" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Pending approvals snapshot */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-blue-500" />
                اعتمادات بانتظارك
              </span>
              <Badge variant="outline">{totalApprovals}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ApprovalRow label="طلبات إجازة" value={Number(data.pendingApprovalsSummary.leaveRequests)} href="/manager-board" />
            <ApprovalRow label="إضافي" value={Number(data.pendingApprovalsSummary.overtimeRequests)} href="/manager-board" />
            <ApprovalRow label="سلف الرواتب" value={Number(data.pendingApprovalsSummary.advanceRequests)} href="/manager-board" />
            <ApprovalRow label="طلبات استقالة" value={Number(data.pendingApprovalsSummary.exitRequests)} href="/manager-board" />
            {totalApprovals === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد اعتمادات معلقة</p>
            )}
          </CardContent>
        </Card>

        {/* Messages today by channel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              رسائل اليوم
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-border/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">واردة</p>
                <p className="text-2xl font-bold text-emerald-600">{Number(data.teamMessagesToday.inbound)}</p>
              </div>
              <div className="rounded border border-border/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">صادرة</p>
                <p className="text-2xl font-bold text-blue-600">{Number(data.teamMessagesToday.outbound)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
              <ChannelMini icon={<Mail className="w-3 h-3" />} label="بريد" value={Number(data.teamMessagesToday.inboundEmail)} />
              <ChannelMini icon={<MessageCircle className="w-3 h-3" />} label="واتساب" value={Number(data.teamMessagesToday.inboundWhatsapp)} />
              <ChannelMini icon={<MessageSquare className="w-3 h-3" />} label="SMS" value={Number(data.teamMessagesToday.inboundSms)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team open tasks — who needs help */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            مهام الفريق المفتوحة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.teamOpenTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد مهام مفتوحة</p>
          ) : (
            <div className="space-y-1">
              {data.teamOpenTasks.map((row) => (
                <Link key={row.employeeId} href={`/tasks?assignee=${row.employeeId}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-accent/40 cursor-pointer">
                    <span className="text-sm font-medium">{row.employeeName}</span>
                    <div className="flex items-center gap-2">
                      {Number(row.overdueCount) > 0 && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {Number(row.overdueCount)} متأخرة
                        </Badge>
                      )}
                      <Badge variant="outline">{Number(row.openCount)}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Week KPIs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            أداء الأسبوع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiBox label="مهام منجزة" value={Number(data.weekKpis.tasksClosedWeek)} icon={<ListChecks className="w-4 h-4" />} />
            <KpiBox label="رسائل" value={Number(data.weekKpis.messagesWeek)} icon={<MessageSquare className="w-4 h-4" />} />
            <KpiBox label="مكالمات" value={Number(data.weekKpis.callsWeek)} icon={<Phone className="w-4 h-4" />} />
            <KpiBox label="فواتير" value={Number(data.weekKpis.invoicesWeek)} icon={<FileText className="w-4 h-4" />} />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: "emerald" | "amber" | "red" | "blue" }) {
  const palette = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  }[color];
  return (
    <div className={`rounded border p-3 text-center ${palette}`}>
      <p className="text-xs mb-1 opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ApprovalRow({ label, value, href }: { label: string; value: number; href: string }) {
  if (value === 0) return null;
  return (
    <Link href={href}>
      <div className="flex items-center justify-between p-2 rounded hover:bg-accent/40 cursor-pointer">
        <span className="text-sm">{label}</span>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{value}</Badge>
      </div>
    </Link>
  );
}

function ChannelMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      <span>{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function KpiBox({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded border border-border/40 p-3">
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
