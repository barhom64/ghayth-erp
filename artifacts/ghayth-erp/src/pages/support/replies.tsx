import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { MessageSquare, Clock, CheckCircle2, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

interface Reply {
  id: number;
  ticketId: string;
  ticketTitle: string;
  reply: string;
  agent: string;
  date: string;
  status: string;
}

interface RepliesResponse {
  data: Reply[];
  total: number;
  resolved: number;
  pending: number;
  activeAgents: number;
}

interface StatCard {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

export default function SupportReplies() {
  const { data, isLoading, isError } = useApiQuery<RepliesResponse>(["support-replies"], "/support/replies");

  const replies: Reply[] = data?.data || [];

  const statCards: StatCard[] = [
    { label: "إجمالي الردود", value: data?.total || 0, icon: MessageSquare, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "تم الحل", value: data?.resolved || 0, icon: CheckCircle2, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "بانتظار الرد", value: data?.pending || 0, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "وكلاء نشطون", value: data?.activeAgents || 0, icon: User, color: "text-purple-600 bg-purple-50" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const columns: DataTableColumn<any>[] = [
    { key: "ticketId", header: "رقم التذكرة", sortable: true, searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.ticketId}</span> },
    { key: "ticketTitle", header: "عنوان التذكرة", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.ticketTitle}</span> },
    { key: "reply", header: "الرد", searchable: true, render: (r: any) => <span className="text-muted-foreground max-w-xs truncate inline-block">{r.reply}</span> },
    { key: "agent", header: "الوكيل", sortable: true, searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.agent}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (r: any) => <span className="text-muted-foreground whitespace-nowrap">{r.date ? formatDateAr(r.date) : "-"}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (r: any) => <PageStatusBadge status={r.status} domain="ticket" /> },
  ];

  return (
    <PageShell
      title="ردود الدعم الفني"
      breadcrumbs={[{ href: "/support", label: "الدعم" }, { label: "ردود الدعم الفني" }]}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
                </div>
                <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={replies}
        isLoading={isLoading}
        isError={isError}
        searchPlaceholder="بحث في الردود..."
        emptyMessage="لا توجد ردود"
        emptyIcon={<MessageSquare className="h-6 w-6 text-slate-400" />}
      />
    </PageShell>
  );
}
