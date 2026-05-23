import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@workspace/ui-core";
import { PageStatusBadge } from "@workspace/ui-core";
import {
  Plus, Banknote, Clock, CheckCircle, XCircle, DollarSign,
  AlertTriangle, TrendingUp, Wallet, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@workspace/ui-core";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LOAN_TYPES, LOAN_STATUS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { useState } from "react";

const STATUS_OPTIONS = Object.entries(LOAN_STATUS).map(([value, { label }]) => ({ value, label }));

export default function LoansPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useApiQuery<{ data: any[]; stats: any; total: number }>(
    ["hr-loans"],
    "/hr/loans",
  );
  const items = data?.data || [];
  const stats = data?.stats || {};
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const approveMut = useApiMutation((body: any) => body.__url, "PATCH", [["hr-loans"]], {
    successMessage: "تم اعتماد السلفة بنجاح",
  });
  const rejectMut = useApiMutation((body: any) => body.__url, "PATCH", [["hr-loans"]], {
    successMessage: "تم رفض السلفة",
  });

  const handleApprove = async (id: number) => {
    await approveMut.mutateAsync({ __url: `/hr/loans/${id}/approve` } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-loans"] });
  };
  const handleReject = (id: number) => setRejectingId(id);

  const submitRejection = async (reason: string) => {
    if (rejectingId === null) return;
    const id = rejectingId;
    setRejectingId(null);
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
      color: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "بانتظار الموافقة",
      value: stats.pending ?? 0,
      icon: Clock,
      color: "text-status-warning-foreground bg-status-warning-surface",
    },
    {
      label: "إجمالي المبالغ",
      value: formatCurrency(Number(stats.totalAmount ?? 0)),
      icon: DollarSign,
      color: "text-status-error-foreground bg-status-error-surface",
    },
    {
      label: "المسدّد",
      value: formatCurrency(Number(stats.totalPaid ?? 0)),
      icon: CheckCircle,
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
      key: "loanNumber",
      header: "رقم السلفة",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-status-info-foreground bg-status-info-surface px-2 py-1 rounded">
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
              <span className="text-xs text-muted-foreground">#{v.empNumber}</span>
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
        <span className="text-sm font-semibold text-status-info-foreground">
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
          <div className="text-xs text-muted-foreground mt-0.5">
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
            <span className={cn("text-sm font-semibold", remaining > 0 ? "text-status-error-foreground" : "text-status-success-foreground")}>
              {formatCurrency(remaining)}
            </span>
            {v.status === "active" && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="bg-status-success-surface0 h-1.5 rounded-full transition-all"
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
        <span className="text-sm text-muted-foreground">
          {v.startDeductionPeriod || "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = LOAN_STATUS[v.status] || { label: v.status, color: "bg-surface-subtle text-muted-foreground" };
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
      title="سلف الموظفين"
      subtitle="إدارة طلبات السلف والأقساط — مرتبطة بالرواتب تلقائياً"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/loans/create">
          <GuardedButton perm="hr:create" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            طلب سلفة
          </GuardedButton>
        </Link>
      }
    >
      <KpiGrid items={kpis} />

      {/* Pending alert */}
      {Number(stats.pending) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-status-warning-surface border border-status-warning-surface rounded-lg text-sm text-status-warning-foreground">
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
        onExportCSV={() =>
          exportToCSV(filtered, [
            { key: "loanNumber", label: "رقم السلفة" },
            { key: "employeeName", label: "الموظف" },
            { key: "loanType", label: "النوع" },
            { key: "amount", label: "المبلغ" },
            { key: "installmentCount", label: "الأقساط" },
            { key: "remainingAmount", label: "المتبقي" },
            { key: "status", label: "الحالة" },
          ], "السلف")
        }
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
      <PromptDialog
        open={rejectingId !== null}
        title="رفض طلب السلفة"
        description="يمكنك إضافة سبب الرفض (اختياري)."
        optional
        confirmLabel="تأكيد الرفض"
        onSubmit={submitRejection}
        onClose={() => setRejectingId(null)}
      />
    </PageShell>
  );
}
