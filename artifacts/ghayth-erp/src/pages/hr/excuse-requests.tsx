import { Link, useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Plus, Clock, CheckCircle, XCircle, LogOut } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ApprovalActions } from "@/components/approval-actions";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useQueryClient } from "@tanstack/react-query";

const EXCUSE_TYPES: Record<string, string> = {
  early_leave: "خروج مبكر",
  late_arrival: "تأخر",
  personal: "استئذان شخصي",
};

export default function ExcuseRequestsPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const [filters, setFilters] = useFilters();
  const qc = useQueryClient();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { data, isLoading, isError } = useApiQuery<any>(["excuse-requests", scopeQueryString], `/hr/excuse-requests?${scopeSuffix}`);
  const items = asList(data);

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName"],
    statusField: "status",
    dateField: "excuseDate",
  });

  const handleDone = () => {
    qc.invalidateQueries({ queryKey: ["excuse-requests"] });
  };

  const kpis = [
    { label: "إجمالي الطلبات", value: items.length, icon: LogOut, color: "text-blue-600 bg-blue-50" },
    { label: "بانتظار الموافقة", value: items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-amber-600 bg-amber-50" },
    { label: "موافق عليها", value: items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "مرفوضة", value: items.filter((i: any) => i.status === "rejected").length, icon: XCircle, color: "text-red-600 bg-red-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (r) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={r.employeeName} color="purple" />
          <div>
            <span className="font-medium text-sm block">{r.employeeName}</span>
            {r.empNumber && <span className="text-xs text-gray-400">#{r.empNumber}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "excuseDate",
      header: "التاريخ",
      sortable: true,
      render: (r) => (
        <span className="text-sm text-gray-600">
          {formatDateAr(r.excuseDate)}
        </span>
      ),
    },
    {
      key: "excuseType",
      header: "النوع",
      sortable: true,
      render: (r) => EXCUSE_TYPES[r.excuseType] || r.excuseType,
    },
    {
      key: "estimatedMinutes",
      header: "المدة",
      render: (r) => r.estimatedMinutes ? `${r.estimatedMinutes} دقيقة` : "-",
    },
    {
      key: "reason",
      header: "السبب",
      render: (r) => <span className="text-sm text-gray-500 max-w-32 truncate block">{r.reason || "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => <PageStatusBadge status={r.status} />,
    },
    {
      key: "approval",
      header: "إجراءات",
      render: (r) => (
        <ApprovalActions
          entityType="excuse_request"
          entityId={r.id}
          currentStatus={r.status}
          approveEndpoint={`/hr/excuse-requests/${r.id}/approve`}
          rejectEndpoint={`/hr/excuse-requests/${r.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          approveBody={() => ({ approved: true })}
          rejectBody={(notes) => ({ approved: false, rejectionReason: notes })}
          pendingStatuses={["pending"]}
          onDone={handleDone}
        />
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="طلبات الاستئذان"
      subtitle="إدارة طلبات الخروج المبكر والتأخر والاستئذان الشخصي"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/excuse-requests/create">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              طلب استئذان
            </Button>
          </Link>
        </div>
      }
      filters={
        <AdvancedFilters
          config={{
            searchPlaceholder: "بحث بالاسم...",
            statuses: [
              { value: "pending", label: "بانتظار" },
              { value: "approved", label: "موافق عليه" },
              { value: "rejected", label: "مرفوض" },
            ],
            showDateRange: true,
          }}
          values={filters}
          onChange={setFilters}
          resultCount={filtered.length}
        />
      }
    >
      <KpiGrid items={kpis} />

      <BulkActionsBar
        entityType="excuse_request"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["excuse-requests"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "employeeName", label: "الموظف" },
          { key: "excuseDate", label: "التاريخ" },
          { key: "excuseType", label: "النوع" },
          { key: "estimatedMinutes", label: "المدة" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="طلبات_الاستئذان"
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد طلبات استئذان"
        emptyIcon={<LogOut className="h-6 w-6 text-slate-400" />}
        pageSize={20}
        onRowClick={(row) => navigate(`/hr/excuse-requests/${row.id}`)}
      />
    </PageShell>
  );
}
