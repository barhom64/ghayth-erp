import { formatDateAr } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Phone, Calendar, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ACTIVITY_TYPES, ACTIVITY_STATUS } from "@/lib/crm-type-maps";

const TYPE_OPTIONS = Object.entries(ACTIVITY_TYPES).map(([value, label]) => ({ value, label }));

const STATUS_OPTIONS = [
  { value: "completed", label: "مكتمل" },
  { value: "scheduled", label: "مجدول" },
];

export default function CrmActivities() {
  const [filters, setFilters] = useFilters();
  const { data: oppsResp } = useApiQuery<any>(["crm-opportunities"], "/crm/opportunities");
  const opportunities = asList<any>(oppsResp);

  const allActivities = opportunities.flatMap((opp: any) =>
    (opp.activities || []).map((a: any) => ({
      ...a,
      client: opp.title || opp.contactName || "-",
      contact: opp.contactName || "-",
      _status: a.completedAt ? "completed" : "scheduled",
    }))
  );

  const filtered = applyFilters(allActivities, filters, {
    searchFields: ["client", "description", "contact"],
    statusField: "_status",
    dateField: "scheduledAt",
    extraFields: { type: "type" },
  });

  const kpis = [
    { label: "إجمالي الأنشطة", value: allActivities.length, icon: Calendar, color: "text-blue-600 bg-blue-50" },
    { label: "مكالمات", value: allActivities.filter((a: any) => a.type === "call").length, icon: Phone, color: "text-green-600 bg-green-50" },
    { label: "مجدولة", value: allActivities.filter((a: any) => !a.completedAt).length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "مكتملة", value: allActivities.filter((a: any) => a.completedAt).length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (row) => <span className="font-medium">{row.description || "-"}</span>,
    },
    {
      key: "client",
      header: "الفرصة",
      sortable: true,
      render: (row) => <span className="text-gray-500">{row.client}</span>,
    },
    {
      key: "contact",
      header: "جهة الاتصال",
      sortable: true,
      render: (row) => <span className="text-gray-500">{row.contact}</span>,
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (row) => (
        <Badge variant="outline">{ACTIVITY_TYPES[row.type] || row.type}</Badge>
      ),
    },
    {
      key: "scheduledAt",
      header: "التاريخ",
      sortable: true,
      render: (row) => (
        <span className="text-gray-500">
          {row.scheduledAt ? formatDateAr(row.scheduledAt) : "-"}
        </span>
      ),
    },
    {
      key: "_status",
      header: "الحالة",
      sortable: true,
      render: (row) => {
        const st = row.completedAt
          ? ACTIVITY_STATUS.completed
          : ACTIVITY_STATUS.scheduled;
        return (
          <Badge variant="outline" className={cn("text-xs", st.color)}>
            {st.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <PageShell
      title="أنشطة إدارة العملاء"
      breadcrumbs={[{ href: "/crm", label: "إدارة العلاقات" }]}
    >
      <KpiGrid items={kpis} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في الأنشطة...",
          statuses: STATUS_OPTIONS,
          showDateRange: true,
          extraFilters: [
            { key: "type", label: "النوع", options: TYPE_OPTIONS },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد أنشطة"
        pageSize={20}
      />
    </PageShell>
  );
}
