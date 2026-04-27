/**
 * /comms/correspondence — صفحة إدارة المراسلات (صادر/وارد)
 *
 * تعرض جدول المراسلات مع فلاتر الاتجاه والحالة، وإحصائيات ملخصة،
 * وإجراءات سريعة (إرسال، ردّ، عرض التفاصيل).
 */
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { formatDateAr } from "@/lib/formatters";
import {
  Plus,
  MoreHorizontal,
  Send,
  Reply,
  Eye,
  Mail,
  MailOpen,
  FileText,
  Inbox,
  SendHorizonal,
} from "lucide-react";

// ───────────────────────── Types ─────────────────────────

interface Correspondence {
  id: number;
  ref: string;
  direction: "outgoing" | "incoming";
  subject: string;
  senderName?: string;
  senderOrg?: string;
  recipientName?: string;
  recipientOrg?: string;
  status: "draft" | "sent";
  createdAt: string;
}

interface CorrespondenceStats {
  totalOutgoing: number;
  totalIncoming: number;
  totalDraft: number;
  totalSent: number;
  totalPending: number;
}

// ───────────────────────── Helpers ─────────────────────────

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "outgoing") {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">صادر</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">وارد</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "draft") {
    return <Badge variant="secondary" className="bg-gray-100 text-gray-600">مسودة</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">مرسل</Badge>;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "sent", label: "مرسل" },
];

// ───────────────────────── Main Component ─────────────────────────

export default function CorrespondencePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: corrResp, isLoading, isError, refetch } = useApiQuery<{ data: Correspondence[]; total: number }>(
    ["correspondence"],
    "/correspondence",
  );
  const items = corrResp?.data || [];

  const { data: stats } = useApiQuery<CorrespondenceStats>(
    ["correspondence-stats"],
    "/correspondence/stats/summary",
  );

  const sendMut = useApiMutation<unknown, { id: number }>((b) => `/correspondence/${b.id}/send`, "POST", [["correspondence"]]);
  const respondMut = useApiMutation<unknown, { id: number }>((b) => `/correspondence/${b.id}/respond`, "POST", [["correspondence"]]);

  const kpis = useMemo(() => [
    { label: "صادر", value: stats?.totalOutgoing ?? items.filter((i) => i.direction === "outgoing").length, icon: SendHorizonal, color: "text-blue-600 bg-blue-50" },
    { label: "وارد", value: stats?.totalIncoming ?? items.filter((i) => i.direction === "incoming").length, icon: Inbox, color: "text-green-600 bg-green-50" },
    { label: "مسودة", value: stats?.totalDraft ?? items.filter((i) => i.status === "draft").length, icon: FileText, color: "text-gray-600 bg-gray-50" },
    { label: "مرسل", value: stats?.totalSent ?? items.filter((i) => i.status === "sent").length, icon: Send, color: "text-emerald-600 bg-emerald-50" },
    { label: "معلّق", value: stats?.totalPending ?? 0, icon: Mail, color: "text-amber-600 bg-amber-50" },
  ], [stats, items]);

  const handleSend = (id: number) => {
    sendMut.mutate({ id }, {
      onSuccess: () => toast({ title: "تم إرسال المراسلة بنجاح" }),
      onError: (err: any) => toast({ variant: "destructive", title: "حدث خطأ أثناء الإرسال", description: err?.message }),
    });
  };

  const handleRespond = (id: number) => {
    respondMut.mutate({ id }, {
      onSuccess: () => toast({ title: "تم إنشاء الرد بنجاح" }),
      onError: (err: any) => toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الرد", description: err?.message }),
    });
  };

  if (isLoading) return <PageShell title="المراسلات"><LoadingSpinner /></PageShell>;
  if (isError) return <PageShell title="المراسلات"><ErrorState onRetry={() => refetch()} /></PageShell>;

  const columns: DataTableColumn<Correspondence>[] = [
    {
      key: "ref", header: "الرقم المرجعي", sortable: true, searchable: true,
      render: (r: any) => (
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {r.ref || `#${r.id}`}
        </span>
      ),
    },
    { key: "direction", header: "الاتجاه", sortable: true, render: (r: any) => <DirectionBadge direction={r.direction} /> },
    { key: "subject", header: "الموضوع", sortable: true, searchable: true, render: (r: any) => <span className="text-sm font-medium">{r.subject || "-"}</span> },
    {
      key: "senderName", header: "المرسل", sortable: true, searchable: true,
      render: (r: any) => (
        <div className="text-sm">
          <span>{r.senderName || "-"}</span>
          {r.senderOrg && <span className="text-xs text-gray-400 block">{r.senderOrg}</span>}
        </div>
      ),
    },
    {
      key: "recipientName", header: "المستلم", sortable: true, searchable: true,
      render: (r: any) => (
        <div className="text-sm">
          <span>{r.recipientName || "-"}</span>
          {r.recipientOrg && <span className="text-xs text-gray-400 block">{r.recipientOrg}</span>}
        </div>
      ),
    },
    { key: "status", header: "الحالة", sortable: true, render: (r: any) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r: any) => <span className="text-sm text-gray-600">{formatDateAr(r.createdAt)}</span> },
    {
      key: "actions", header: "", width: "60px",
      render: (r: any) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e: any) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); navigate(`/correspondence/${r.id}`); }}>
              <Eye className="h-4 w-4 me-2" /> عرض التفاصيل
            </DropdownMenuItem>
            {r.status === "draft" && (
              <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); handleSend(r.id); }}>
                <Send className="h-4 w-4 me-2" /> إرسال
              </DropdownMenuItem>
            )}
            {r.status === "sent" && (
              <DropdownMenuItem onClick={(e: any) => { e.stopPropagation(); handleRespond(r.id); }}>
                <Reply className="h-4 w-4 me-2" /> رد
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PageShell
      title="المراسلات"
      subtitle="إدارة المراسلات الصادرة والواردة"
      actions={
        <Link href="/correspondence/create">
          <Button className="gap-1.5"><Plus className="h-4 w-4" /> مراسلة جديدة</Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color.split(" ")[1]}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onRowClick={(r) => navigate(`/correspondence/${r.id}`)}
        searchPlaceholder="بحث بالرقم أو الموضوع أو الاسم..."
        statusOptions={STATUS_OPTIONS}
        statusField="status"
        emptyMessage="لا توجد مراسلات"
        emptyIcon={<MailOpen className="h-6 w-6 text-slate-400" />}
      />
    </PageShell>
  );
}
