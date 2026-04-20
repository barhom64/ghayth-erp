import { useMemo } from "react";
import { formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { CrmTabsNav } from "@/components/shared/crm-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Calendar, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const TYPE_LABELS: Record<string, string> = {
  call: "مكالمة",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة",
};

const columns: DataTableColumn<any>[] = [
  { key: "description", header: "الوصف", searchable: true, sortable: true, className: "font-medium" },
  { key: "client", header: "الفرصة", searchable: true, sortable: true, className: "text-gray-500" },
  { key: "contact", header: "جهة الاتصال", searchable: true, sortable: true, className: "text-gray-500" },
  {
    key: "type",
    header: "النوع",
    sortable: true,
    render: (a) => <Badge variant="outline">{TYPE_LABELS[a.type] || a.type}</Badge>,
  },
  {
    key: "scheduledAt",
    header: "التاريخ",
    sortable: true,
    className: "text-gray-500",
    render: (a) => (a.scheduledAt ? formatDateAr(a.scheduledAt) : "-"),
  },
  {
    key: "completedAt",
    header: "الحالة",
    render: (a) => (
      <Badge className={a.completedAt ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
        {a.completedAt ? "مكتمل" : "مجدول"}
      </Badge>
    ),
  },
];

export default function CrmActivities() {
  const { data: oppsResp, isLoading, isError } = useApiQuery<any>(["crm-opportunities"], "/crm/opportunities");

  const opportunities = asList<any>(oppsResp);

  const allActivities = useMemo(
    () =>
      opportunities.flatMap((opp: any) =>
        (opp.activities || []).map((a: any) => ({
          ...a,
          client: opp.title || opp.contactName || "-",
          contact: opp.contactName || "-",
        }))
      ),
    [opportunities]
  );

  const statCards = [
    { label: "إجمالي الأنشطة", value: allActivities.length, icon: Calendar, color: "text-blue-600 bg-blue-50" },
    { label: "مكالمات", value: allActivities.filter((a: any) => a.type === "call").length, icon: Phone, color: "text-green-600 bg-green-50" },
    { label: "مجدولة", value: allActivities.filter((a: any) => !a.completedAt).length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "مكتملة", value: allActivities.filter((a: any) => a.completedAt).length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <PageShell
      title="أنشطة إدارة العملاء"
      breadcrumbs={[{ href: "/crm", label: "إدارة العملاء" }]}
    >
      <CrmTabsNav />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
                </div>
                <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={allActivities}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => window.location.reload()}
        searchPlaceholder="بحث في الأنشطة..."
        emptyMessage="لا توجد أنشطة"
      />
    </PageShell>
  );
}
