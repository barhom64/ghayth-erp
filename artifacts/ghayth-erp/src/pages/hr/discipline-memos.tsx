import { Link, useLocation } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, FileText, Gavel, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { INCIDENT_LABELS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "pending_employee", label: "بانتظار الموظف" },
  { value: "pending_manager",  label: "بانتظار المدير" },
  { value: "pending_gm",      label: "بانتظار المدير العام" },
  { value: "approved",        label: "معتمد" },
  { value: "rejected",        label: "مرفوض" },
  { value: "cancelled",       label: "ملغي" },
];

export default function DisciplineMemosPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();

  const { data: listData, isLoading, isError } = useApiQuery<{ data: any[]; total: number }>(
    ["discipline-memos"],
    "/hr/discipline/memos",
  );
  const { data: stats } = useApiQuery<any>(
    ["discipline-memos-stats"],
    "/hr/discipline/stats",
  );
  const memos = listData?.data ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filtered = applyFilters(memos, filters, {
    searchFields: ["employeeName", "memoNumber", "empNumber"],
    statusField: "status",
    dateField: "createdAt",
  });

  const kpis = [
    {
      label: "بانتظار الموظف",
      value: stats?.pendingEmployee ?? 0,
      icon: Gavel,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "بانتظار المدير",
      value: stats?.pendingManager ?? 0,
      icon: Gavel,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "بانتظار المدير العام",
      value: stats?.pendingGm ?? 0,
      icon: Gavel,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "معتمدة",
      value: stats?.approved ?? 0,
      icon: Gavel,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "إجمالي الخصومات",
      value: formatCurrency(Number(stats?.totalDeductions ?? 0)),
      icon: Gavel,
      color: "text-red-600 bg-red-50",
    },
  ];

  const pendingTotal = (stats?.pendingEmployee ?? 0) + (stats?.pendingManager ?? 0) + (stats?.pendingGm ?? 0);

  const columns: DataTableColumn<any>[] = [
    {
      key: "memoNumber",
      header: "رقم المحضر",
      sortable: true,
      render: (m) => (
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {m.memoNumber}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (m) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={m.employeeName} color="red" />
          <div>
            <span className="font-medium text-sm block">{m.employeeName}</span>
            {m.empNumber && (
              <span className="text-xs text-gray-400">#{m.empNumber}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "incidentType",
      header: "الواقعة",
      sortable: true,
      render: (m) => (
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="w-fit text-xs">
            {INCIDENT_LABELS[m.incidentType] ?? m.incidentType}
          </Badge>
          <span className="text-xs text-gray-500">
            {m.incidentDate
              ? new Date(m.incidentDate).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })
              : ""}
          </span>
        </div>
      ),
    },
    {
      key: "regArticle",
      header: "المادة",
      render: (m) =>
        m.regArticle ? (
          <span className="text-xs text-gray-600">مادة {m.regArticle}</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "occurrenceCount",
      header: "التكرار",
      sortable: true,
      render: (m) => {
        const count = m.occurrenceCount || 0;
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              count >= 4 ? "border-red-300 text-red-700 bg-red-50" :
              count >= 3 ? "border-orange-300 text-orange-700 bg-orange-50" :
              "border-gray-200",
            )}
          >
            {count}/4
          </Badge>
        );
      },
    },
    {
      key: "appliedPenaltyLabel",
      header: "العقوبة",
      sortable: true,
      render: (m) => {
        if (m.terminationDecided) {
          return <Badge className="bg-red-600 text-white text-xs">فصل</Badge>;
        }
        return (
          <span className="text-sm">
            {m.appliedPenaltyLabel || "-"}
          </span>
        );
      },
    },
    {
      key: "deduction",
      header: "الخصم",
      sortable: true,
      render: (m) => {
        const total = Number(m.appliedDeductionAmount ?? 0) + Number(m.appliedExtraDeduction ?? 0);
        if (!total) return <span className="text-gray-400">-</span>;
        return (
          <span className="text-sm font-semibold text-red-600">
            {formatCurrency(total)}
          </span>
        );
      },
    },
    {
      key: "source",
      header: "المصدر",
      render: (m) => (
        <Badge variant="outline" className="text-xs">
          {m.source === "auto" ? "تلقائي" : m.source === "manual" ? "يدوي" : m.source}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (m) => <PageStatusBadge status={m.status} domain="memo" />,
    },
  ];

  return (
    <PageShell
      title="محاضر الاستفسار"
      subtitle="سير العمل الثلاثي: الموظف → المدير المباشر → المدير العام"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/discipline/regulation">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="h-4 w-4" />
              لائحة الانضباط
            </Button>
          </Link>
          <Link href="/hr/violations/create">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              محضر جديد
            </Button>
          </Link>
        </div>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-5" />

      {/* Pending alert */}
      {pendingTotal > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{pendingTotal}</strong> محضر بانتظار الإجراء
          </span>
        </div>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم المحضر...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
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
        emptyMessage="لا توجد محاضر استفسار بعد"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/discipline/memos/${item.id}`)}
      />
    </PageShell>
  );
}
