import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { MessageSquare, Clock, CheckCircle2, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

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

const columns: DataTableColumn<Reply>[] = [
  { key: "ticketId", header: "رقم التذكرة", searchable: true, sortable: true, ltr: true, className: "font-mono text-xs" },
  { key: "ticketTitle", header: "عنوان التذكرة", searchable: true, sortable: true, className: "font-medium" },
  { key: "reply", header: "الرد", searchable: true, className: "text-gray-600 max-w-xs truncate" },
  { key: "agent", header: "الوكيل", searchable: true, sortable: true, className: "text-gray-500" },
  { key: "date", header: "التاريخ", sortable: true, className: "text-gray-500 whitespace-nowrap" },
  {
    key: "status",
    header: "الحالة",
    render: (r) => <PageStatusBadge status={r.status} domain="ticket" />,
  },
];

export default function SupportReplies() {
  const { data, isLoading, isError } = useApiQuery<RepliesResponse>(["support-replies"], "/support/replies");

  const replies: Reply[] = data?.data || [];

  const statCards: StatCard[] = [
    { label: "إجمالي الردود", value: data?.total || 0, icon: MessageSquare, color: "text-blue-600 bg-blue-50" },
    { label: "تم الحل", value: data?.resolved || 0, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "بانتظار الرد", value: data?.pending || 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "وكلاء نشطون", value: data?.activeAgents || 0, icon: User, color: "text-purple-600 bg-purple-50" },
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
                <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
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
        onRetry={() => window.location.reload()}
        searchPlaceholder="بحث في الردود..."
        emptyMessage="لا توجد ردود"
        statusOptions={[
          { value: "resolved", label: "تم الحل" },
          { value: "pending", label: "بانتظار الرد" },
        ]}
      />
    </PageShell>
  );
}
