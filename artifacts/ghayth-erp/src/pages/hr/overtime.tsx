import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import {
  Plus, Clock, CheckCircle, XCircle, DollarSign,
  AlertTriangle, TrendingUp, FileText, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { OVERTIME_STATUS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { useState } from "react";

const STATUS_OPTIONS = Object.entries(OVERTIME_STATUS).map(([value, { label }]) => ({ value, label }));
const STATUS_MAP = OVERTIME_STATUS;

export default function OvertimePage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useApiQuery<{ data: any[]; stats: any; total: number }>(
    ["hr-overtime"],
    "/hr/overtime",
  );
  const items = data?.data || [];
  const stats = data?.stats || {};
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const approveMut = useApiMutation((body: any) => body.__url, "PATCH", [["hr-overtime"]], {
    successMessage: "تم اعتماد الطلب",
  });
  const rejectMut = useApiMutation((body: any) => body.__url, "PATCH", [["hr-overtime"]], {
    successMessage: "تم رفض الطلب",
  });

  const handleApprove = async (id: number) => {
    await approveMut.mutateAsync({ __url: `/hr/overtime/${id}/approve` } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-overtime"] });
  };
  const handleReject = (id: number) => setRejectingId(id);

  const submitRejection = async (reason: string) => {
    if (rejectingId === null) return;
    const id = rejectingId;
    setRejectingId(null);
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
      color: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "بانتظار الموافقة",
      value: stats.pending ?? 0,
      icon: Clock,
      color: "text-status-warning-foreground bg-status-warning-surface",
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
      color: "text-status-success-foreground bg-status-success-surface",
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
              <span className="text-xs text-muted-foreground">#{v.empNumber}</span>
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
        <span className="text-sm text-muted-foreground">
          {formatDateAr(v.overtimeDate)}
        </span>
      ),
    },
    {
      key: "startTime",
      header: "الوقت",
      render: (v) => (
        <span className="text-sm text-muted-foreground font-mono">
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
        <span className="text-sm text-muted-foreground">×{Number(v.multiplier || 1.5).toFixed(2)}</span>
      ),
    },
    {
      key: "totalAmount",
      header: "المبلغ",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-semibold text-status-success-foreground">
          {formatCurrency(Number(v.totalAmount || 0))}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = STATUS_MAP[v.status] || { label: v.status, color: "bg-surface-subtle text-muted-foreground" };
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
            <GuardedButton
              perm="hr:approve"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-status-success-foreground hover:bg-status-success-surface"
              onClick={() => handleApprove(v.id)}
              disabled={approveMut.isPending}
            >
              <CheckCircle className="h-3.5 w-3.5 ml-1" />
              اعتماد
            </GuardedButton>
            <GuardedButton
              perm="hr:approve"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-status-error-foreground hover:bg-status-error-surface"
              onClick={() => handleReject(v.id)}
              disabled={rejectMut.isPending}
            >
              <XCircle className="h-3.5 w-3.5 ml-1" />
              رفض
            </GuardedButton>
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
          <GuardedButton perm="hr:create" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            طلب وقت إضافي
          </GuardedButton>
        </Link>
      }
    >
      <KpiGrid items={kpis} />

      {Number(stats.pending) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-status-warning-surface border border-status-warning-surface rounded-lg text-sm text-status-warning-foreground">
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
        onExportCSV={() =>
          exportToCSV(filtered, [
            { key: "requestNumber", label: "رقم الطلب" },
            { key: "employeeName", label: "الموظف" },
            { key: "overtimeDate", label: "التاريخ" },
            { key: "hours", label: "الساعات" },
            { key: "multiplier", label: "المعامل" },
            { key: "totalAmount", label: "المبلغ" },
            { key: "status", label: "الحالة" },
          ], "العمل_الإضافي")
        }
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
      <PromptDialog
        open={rejectingId !== null}
        title="رفض طلب الوقت الإضافي"
        description="يمكنك إضافة سبب الرفض (اختياري)."
        optional
        confirmLabel="تأكيد الرفض"
        onSubmit={submitRejection}
        onClose={() => setRejectingId(null)}
      />
    </PageShell>
  );
}
