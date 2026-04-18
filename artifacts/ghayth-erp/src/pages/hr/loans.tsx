import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import {
  Plus, Banknote, Clock, CheckCircle, XCircle, DollarSign,
  AlertTriangle, TrendingUp, Wallet, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LOAN_TYPES, LOAN_STATUS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const STATUS_OPTIONS = Object.entries(LOAN_STATUS).map(([value, { label }]) => ({ value, label }));

export default function LoansPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useApiQuery<{ data: any[]; stats: any; total: number }>(
    ["hr-loans"],
    "/hr/loans",
  );
  const items = data?.data || [];
  const stats = data?.stats || {};
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const approveMut = useApiMutation(null as any, "PATCH", [["hr-loans"]], {
    successMessage: "تم اعتماد السلفة بنجاح",
  });
  const rejectMut = useApiMutation(null as any, "PATCH", [["hr-loans"]], {
    successMessage: "تم رفض السلفة",
  });

  const handleApprove = async (id: number) => {
    await approveMut.mutateAsync({ __url: `/hr/loans/${id}/approve` } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-loans"] });
  };
  const handleReject = async (id: number) => {
    const reason = window.prompt("سبب الرفض (اختياري):");
    await rejectMut.mutateAsync({ __url: `/hr/loans/${id}/reject`, reason } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-loans"] });
  };

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "loanNumber"],
    statusField: "status",
    dateField: "createdAt",
  });

  const kpis = [
    {
      label: "إجمالي السلف",
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
      label: "إجمالي المبالغ",
      value: formatCurrency(Number(stats.totalAmount ?? 0)),
      icon: DollarSign,
      color: "text-red-600 bg-red-50",
    },
    {
      label: "المسدّد",
      value: formatCurrency(Number(stats.totalPaid ?? 0)),
      icon: CheckCircle,
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
      key: "loanNumber",
      header: "رقم السلفة",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {v.loanNumber}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="emerald" />
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
      key: "loanType",
      header: "النوع",
      sortable: true,
      render: (v) => (
        <span className="text-sm">{LOAN_TYPES[v.loanType] || v.loanType || "سلفة راتب"}</span>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-semibold text-blue-700">
          {formatCurrency(Number(v.amount || 0))}
        </span>
      ),
    },
    {
      key: "installmentCount",
      header: "الأقساط",
      sortable: true,
      render: (v) => (
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            {v.installmentCount} قسط
          </Badge>
          <div className="text-xs text-gray-400 mt-0.5">
            {formatCurrency(Number(v.installmentAmount || 0))} / شهر
          </div>
        </div>
      ),
    },
    {
      key: "remainingAmount",
      header: "المتبقي",
      sortable: true,
      render: (v) => {
        const remaining = Number(v.remainingAmount || 0);
        const total = Number(v.amount || 1);
        const pct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
        return (
          <div>
            <span className={cn("text-sm font-semibold", remaining > 0 ? "text-red-600" : "text-green-600")}>
              {formatCurrency(remaining)}
            </span>
            {v.status === "active" && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "startDeductionPeriod",
      header: "بدء الخصم",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">
          {v.startDeductionPeriod || "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = LOAN_STATUS[v.status] || { label: v.status, color: "bg-gray-100 text-gray-600" };
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
      title="سلف الموظفين"
      subtitle="إدارة طلبات السلف والأقساط — مرتبطة بالرواتب تلقائياً"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/loans/create">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            طلب سلفة
          </Button>
        </Link>
      }
    >
      <KpiGrid items={kpis} />

      {/* Pending alert */}
      {Number(stats.pending) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{stats.pending}</strong> طلب سلفة بانتظار الموافقة
          </span>
        </div>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم السلفة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <BulkActionsBar
        entityType="loan"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["hr-loans"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "loanNumber", label: "رقم السلفة" },
          { key: "employeeName", label: "الموظف" },
          { key: "loanType", label: "النوع" },
          { key: "amount", label: "المبلغ" },
          { key: "installmentCount", label: "عدد الأقساط" },
          { key: "remainingAmount", label: "المتبقي" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="سلف_الموظفين"
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد سلف — قدّم طلب سلفة جديدة للبدء"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/loans/${item.id}`)}
      />
    </PageShell>
  );
}
