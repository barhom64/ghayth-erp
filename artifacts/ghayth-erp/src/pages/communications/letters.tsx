import { formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Mail, Send, Inbox, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound: { label: "وارد", color: "bg-blue-100 text-blue-700" },
  outbound: { label: "صادر", color: "bg-green-100 text-green-700" },
};

const letterColumns: DataTableColumn<any>[] = [
  {
    key: "subject",
    header: "الموضوع",
    sortable: true,
    searchable: true,
    render: (l) => <span className="font-medium">{l.subject || "-"}</span>,
  },
  {
    key: "direction",
    header: "الاتجاه",
    sortable: true,
    render: (l) => (
      <Badge className={DIRECTION_MAP[l.direction]?.color}>
        {DIRECTION_MAP[l.direction]?.label || l.direction}
      </Badge>
    ),
  },
  {
    key: "toNumber",
    header: "المرسل/المستلم",
    searchable: true,
    render: (l) => <span className="text-gray-500">{l.toNumber || l.fromNumber || "-"}</span>,
  },
  {
    key: "createdAt",
    header: "التاريخ",
    sortable: true,
    render: (l) => <span className="text-gray-500">{l.createdAt ? formatDateAr(l.createdAt) : "-"}</span>,
  },
  {
    key: "status",
    header: "الحالة",
    render: (l) => <PageStatusBadge status={l.status} />,
  },
];

const directionStatusOptions = [
  { value: "inbound", label: "واردة" },
  { value: "outbound", label: "صادرة" },
];

export default function CommunicationsLetters() {
  const { data: logResp, isLoading, isError } = useApiQuery<any>(["comm-log-letters"], "/communications/log?channel=email");
  const letters = asList<any>(logResp);

  const incoming = letters.filter((l: any) => l.direction === "inbound").length;
  const outgoing = letters.filter((l: any) => l.direction === "outbound").length;

  const statCards = [
    { label: "إجمالي المراسلات", value: letters.length, icon: Mail, color: "text-blue-600 bg-blue-50" },
    { label: "صادرة", value: outgoing, icon: Send, color: "text-green-600 bg-green-50" },
    { label: "واردة", value: incoming, icon: Inbox, color: "text-purple-600 bg-purple-50" },
    { label: "في الانتظار", value: letters.filter((l: any) => l.status === "queued").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">المراسلات</h1>
        <Link href="/communications/letters/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مراسلة جديدة</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={letterColumns}
        data={letters}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => window.location.reload()}
        searchPlaceholder="بحث في المراسلات..."
        statusOptions={directionStatusOptions}
        statusField="direction"
        emptyMessage="لا توجد مراسلات"
        pageSize={20}
      />
    </div>
  );
}
