import { formatDateAr } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Phone, Calendar, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ACTIVITY_TYPES, ACTIVITY_STATUS } from "@/lib/crm-type-maps";

import { CrmTabsNav } from "@/components/shared/crm-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
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
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const kpis = [
    { label: "إجمالي الأنشطة", value: allActivities.length, icon: Calendar, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "مكالمات", value: allActivities.filter((a: any) => a.type === "call").length, icon: Phone, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مجدولة", value: allActivities.filter((a: any) => !a.completedAt).length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
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
      render: (row) => <span className="text-muted-foreground">{row.client}</span>,
    },
    {
      key: "contact",
      header: "جهة الاتصال",
      sortable: true,
      render: (row) => <span className="text-muted-foreground">{row.contact}</span>,
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
        <span className="text-muted-foreground">
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
      actions={
        <PrintButton
          entityType="report_crm_activities"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: {
              title: "أنشطة CRM",
              total: printRows.length,
            },
            items: printRows.map((a: any) => ({
              "النوع": a.type || a.activityType || "—",
              "الموضوع": a.subject || a.title || "—",
              "العميل": a.clientName || "—",
              "المسؤول": a.userName || a.assigneeName || "—",
              "التاريخ": a.scheduledAt || a.dueDate || a.createdAt || "—",
              "الحالة": a.status || "—",
            })),
          })}
        />
      }
    >
      <CrmTabsNav />
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
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "subject", label: "الموضوع" },
              { key: "type", label: "النوع" },
              { key: "clientName", label: "العميل" },
              { key: "assigneeName", label: "المسؤول" },
              { key: "dueDate", label: "تاريخ الاستحقاق" },
              { key: "status", label: "الحالة" },
              { key: "outcome", label: "النتيجة" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ],
            "أنشطة-العملاء",
          )
        }
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد أنشطة"
        pageSize={20}
      />
    </PageShell>
  );
}
