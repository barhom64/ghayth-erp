import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import {
  Plus, Clock, CheckCircle, XCircle, DollarSign,
  AlertTriangle, TrendingUp, FileText, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { OVERTIME_STATUS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const STATUS_OPTIONS = Object.entries(OVERTIME_STATUS).map(([value, { label }]) => ({ value, label }));
const STATUS_MAP = OVERTIME_STATUS;

export default function OvertimePage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useApiQuery<{ data: any[]; stats: any; total: number }>(
    ["hr-overtime"],
    "/hr/overtime",
  );
  const items = data?.data || [];
  const stats = data?.stats || {};
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const approveMut = useApiMutation(null as any, "PATCH", [["hr-overtime"]], {
    successMessage: "تم اعتماد الطلب",
  });
  const rejectMut = useApiMutation(null as any, "PATCH", [["hr-overtime"]], {
    successMessage: "تم رفض الطلب",
  });

  const handleApprove = async (id: number) => {
    await approveMut.mutateAsync({ __url: `/hr/overtime/${id}/approve` } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-overtime"] });
  };
  const handleReject = async (id: number) => {
    const reason = window.prompt("سبب الرفض (اختياري):");
    await rejectMut.mutateAsync({ __url: `/hr/overtime/${id}/reject`, reason } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-overtime"] });
  };

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "requestNumber"],
    statusField: "status",
    dateField: "overtimeDate",
  });

  const kpis = [
    {
      label: "إجمالي الطلبات",
      value: stats.total ?? items.length,
      icon: FileText,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "بانتظار الموافقة",
      value: stats.pending ?? 0,
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "إجمالي الساعات",
      value: `${Number(stats.totalHours ?? 0).toFixed(1)} ساعة`,
      icon: Timer,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "إجمالي المبالغ",
      value: formatCurrency(Number(stats.totalAmount ?? 0)),
      icon: DollarSign,
      color: "text-green-600 bg-green-50",
    },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    {
      key: "requestNumber",
      header: "رقم الطلب",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded">
          {v.requestNumber}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="purple" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.empNumber && (
              <span className="text-xs text-gray-400">#{v.empNumber}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "overtimeDate",
      header: "التاريخ",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">
          {formatDateAr(v.overtimeDate)}
        </span>
      ),
    },
    {
      key: "startTime",
      header: "الوقت",
      render: (v) => (
        <span className="text-sm text-gray-600 font-mono">
          {v.startTime?.slice(0, 5)} — {v.endTime?.slice(0, 5)}
        </span>
      ),
    },
    {
      key: "hours",
      header: "الساعات",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className="text-xs">
          {Number(v.hours).toFixed(1)} ساعة
        </Badge>
      ),
    },
    {
      key: "multiplier",
      header: "المعامل",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">×{Number(v.multiplier || 1.5).toFixed(2)}</span>
      ),
    },
    {
      key: "totalAmount",
      header: "المبلغ",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-semibold text-green-700">
          {formatCurrency(Number(v.totalAmount || 0))}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = STATUS_MAP[v.status] || { label: v.status, color: "bg-gray-100 text-gray-600" };
        return (
          <Badge variant="outline" className={cn("text-xs", st.color)}>
            {st.label}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (v) => {
        if (v.status !== "pending") return null;
        return (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-green-700 hover:bg-green-50"
              onClick={() => handleApprove(v.id)}
              disabled={approveMut.isPending}
            >
              <CheckCircle className="h-3.5 w-3.5 ml-1" />
              اعتماد
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-red-700 hover:bg-red-50"
              onClick={() => handleReject(v.id)}
              disabled={rejectMut.isPending}
            >
              <XCircle className="h-3.5 w-3.5 ml-1" />
              رفض
            </Button>
          </div>
        );
      },
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الوقت الإضافي"
      subtitle="إدارة طلبات العمل الإضافي — مرتبطة بالرواتب تلقائياً"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/overtime/create">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            طلب وقت إضافي
          </Button>
        </Link>
      }
    >
      <KpiGrid items={kpis} />

      {Number(stats.pending) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{stats.pending}</strong> طلب وقت إضافي بانتظار الموافقة
          </span>
        </div>
      )}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم الطلب...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <BulkActionsBar
        entityType="overtime"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["hr-overtime"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "requestNumber", label: "رقم الطلب" },
          { key: "employeeName", label: "الموظف" },
          { key: "overtimeDate", label: "التاريخ" },
          { key: "hours", label: "الساعات" },
          { key: "multiplier", label: "المعامل" },
          { key: "totalAmount", label: "المبلغ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الوقت_الإضافي"
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد طلبات وقت إضافي — سجّل طلب جديد للبدء"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/overtime/${item.id}`)}
      />
    </PageShell>
  );
}
