import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Badge } from "@/components/ui/badge";
import { GitBranch, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { APPROVAL_ROLES, APPROVAL_CHAIN_STATUS } from "@/lib/hr-type-maps";

const STATUS_OPTIONS = Object.entries(APPROVAL_CHAIN_STATUS).map(([value, { label }]) => ({ value, label }));


export default function ApprovalChainsPage() {
  const [filters, setFilters] = useFilters();
  const { data, isLoading, isError } = useApiQuery<any>(["approval-chains"], "/hr/approval-chains");
  const items = data?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "leaveTypeName"],
    statusField: "status",
    dateField: "createdAt",
  });

  const kpis = [
    { label: "إجمالي المراحل", value: items.length, icon: GitBranch, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "معلقة", value: items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "تصعيد", value: items.filter((i: any) => i.status === "escalated").length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "requestId",
      header: "الطلب",
      sortable: true,
      render: (v) => (
        <div>
          <span className="font-mono text-xs font-semibold text-status-info-foreground bg-status-info-surface px-2 py-1 rounded">
            #{v.requestId}
          </span>
          <span className="block text-xs text-muted-foreground mt-1">
            {v.leaveTypeName} — {v.days} أيام
          </span>
        </div>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="blue" />
          <span className="font-medium text-sm">{v.employeeName}</span>
        </div>
      ),
    },
    {
      key: "stage",
      header: "المرحلة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className="text-xs">المرحلة {v.stage}</Badge>
      ),
    },
    {
      key: "requiredRole",
      header: "الدور المطلوب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{APPROVAL_ROLES[v.requiredRole] || v.requiredRole}</span>
      ),
    },
    {
      key: "decision",
      header: "القرار",
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.decision || "-"}</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = APPROVAL_CHAIN_STATUS[v.status] || APPROVAL_CHAIN_STATUS.pending;
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
      title="سلاسل الموافقات"
      subtitle="إعداد مسارات الاعتماد ومراحل الموافقة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو نوع الإجازة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد سلاسل موافقات"
        pageSize={20}
      />
    </PageShell>
  );
}
