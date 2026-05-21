import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import {
  Plus, Clock, CheckCircle, XCircle, DollarSign,
  AlertTriangle, UserMinus, FileText, LogOut, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { EXIT_TYPES, EXIT_REQUEST_STATUS } from "@/lib/hr-type-maps";

const STATUS_OPTIONS = Object.entries(EXIT_REQUEST_STATUS).map(([value, { label }]) => ({ value, label }));

export default function ExitRequestsPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useApiQuery<{ data: any[]; stats: any; total: number }>(
    ["hr-exit"],
    "/hr/exit",
  );
  const items = data?.data || [];
  const stats = data?.stats || {};

  const approveMut = useApiMutation((body: any) => body.__url, "PATCH", [["hr-exit"]], {
    successMessage: "تم اعتماد الطلب",
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleApprove = async (id: number) => {
    await approveMut.mutateAsync({ __url: `/hr/exit/${id}/approve` } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-exit"] });
  };

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "exitNumber"],
    statusField: "status",
    dateField: "createdAt",
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
      label: "مكتملة",
      value: stats.completed ?? 0,
      icon: CheckCircle,
      color: "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "إجمالي المستحقات",
      value: formatCurrency(Number(stats.totalSettlement ?? 0)),
      icon: DollarSign,
      color: "text-status-error-foreground bg-status-error-surface",
    },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "exitNumber",
      header: "رقم الطلب",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-status-error-foreground bg-status-error-surface px-2 py-1 rounded">
          {v.exitNumber}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="red" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.jobTitle && (
              <span className="text-xs text-muted-foreground">{v.jobTitle}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "exitType",
      header: "النوع",
      sortable: true,
      render: (v) => (
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            v.exitType === "termination" ? "border-status-error-surface text-status-error-foreground bg-status-error-surface" :
            v.exitType === "resignation" ? "border-status-warning-surface text-status-warning-foreground bg-status-warning-surface" :
            "border-border",
          )}
        >
          {EXIT_TYPES[v.exitType] || v.exitType}
        </Badge>
      ),
    },
    {
      key: "lastWorkingDay",
      header: "آخر يوم عمل",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {formatDateAr(v.lastWorkingDay)}
        </span>
      ),
    },
    {
      key: "gratuityAmount",
      header: "مكافأة نهاية الخدمة",
      sortable: true,
      render: (v) => (
        <span className="text-sm font-semibold text-status-success-foreground">
          {formatCurrency(Number(v.gratuityAmount || 0))}
        </span>
      ),
    },
    {
      key: "netSettlement",
      header: "صافي التصفية",
      sortable: true,
      render: (v) => (
        <span className={cn(
          "text-sm font-bold",
          Number(v.netSettlement || 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"
        )}>
          {formatCurrency(Number(v.netSettlement || 0))}
        </span>
      ),
    },
    {
      key: "clearanceCompleted",
      header: "إخلاء الطرف",
      render: (v) => (
        v.clearanceCompleted
          ? <Badge className="bg-status-success-surface text-status-success-foreground text-xs">مكتمل</Badge>
          : <Badge variant="outline" className="text-xs border-status-warning-surface text-status-warning-foreground">غير مكتمل</Badge>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = EXIT_REQUEST_STATUS[v.status] || { label: v.status, color: "bg-surface-subtle text-muted-foreground" };
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
        );
      },
    },
  ];

  return (
    <PageShell
      title="نهاية الخدمة"
      subtitle="سير عمل الاستقالة والفصل — إخلاء طرف وتصفية مستحقات"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/exit/create">
          <GuardedButton perm="hr:create" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            طلب نهاية خدمة
          </GuardedButton>
        </Link>
      }
    >
      <KpiGrid items={kpis} />

      {Number(stats.pending) > 0 && (
        <div className="flex items-center gap-2 p-3 bg-status-warning-surface border border-status-warning-surface rounded-lg text-sm text-status-warning-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{stats.pending}</strong> طلب نهاية خدمة بانتظار الموافقة
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
            { key: "exitNumber", label: "رقم الطلب" },
            { key: "employeeName", label: "الموظف" },
            { key: "exitType", label: "النوع" },
            { key: "lastWorkingDay", label: "آخر يوم عمل" },
            { key: "gratuityAmount", label: "مكافأة نهاية الخدمة" },
            { key: "netSettlement", label: "صافي التصفية" },
            { key: "status", label: "الحالة" },
          ], "طلبات_إخلاء_الطرف")
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد طلبات نهاية خدمة"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/exit/${item.id}`)}
      />
    </PageShell>
  );
}
