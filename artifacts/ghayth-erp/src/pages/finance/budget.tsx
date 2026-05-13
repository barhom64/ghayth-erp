import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Plus, FileBarChart, TrendingUp, CheckCircle, PieChart } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

export default function BudgetPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, error, refetch } = useApiQuery<any>(["budget", scopeQueryString], `/finance/budget${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["accountName", "accountCode", "period"],
  });

  const totalAllocated = items.reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
  const totalUsed = items.reduce((s: number, b: any) => s + Number(b.used || 0), 0);
  const overBudget = items.filter((b: any) => Number(b.used || 0) > Number(b.amount || 0)).length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      sortable: true,
      render: (b) => (
        <>
          <span className="font-mono text-status-info-foreground text-sm">{b.accountCode}</span>
          <span className="text-muted-foreground ms-2 text-sm">{b.accountName || ""}</span>
        </>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (b) => <span className="text-sm">{b.period || "-"}</span>,
    },
    {
      key: "amount",
      header: "المخصص",
      sortable: true,
      render: (b) => <span className="font-medium">{formatCurrency(Number(b.amount || 0))}</span>,
    },
    {
      key: "used",
      header: "المنفق",
      sortable: true,
      render: (b) => <span className="text-status-error-foreground">{formatCurrency(Number(b.used || 0))}</span>,
    },
    {
      key: "remaining",
      header: "المتبقي",
      render: (b) => {
        const alloc = Number(b.amount || 0);
        const used = Number(b.used || 0);
        const remaining = alloc - used;
        return (
          <span className="font-semibold" style={{ color: remaining >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(remaining)}
          </span>
        );
      },
    },
    {
      key: "usage",
      header: "الاستخدام",
      width: "160px",
      render: (b) => {
        const alloc = Number(b.amount || 0);
        const used = Number(b.used || 0);
        const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0;
        const barColor = pct > 100 ? "bg-status-error-surface0" : pct > 80 ? "bg-orange-500" : "bg-status-success-surface0";
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-start">{formatNumber(pct)}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell
      title="الميزانية"
      subtitle="متابعة المخصصات والمنصرف والمتبقي لكل حساب في كل فترة مالية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الميزانية" }]}
      loading={isLoading}
      actions={
        <Button size="sm" asChild>
          <Link href="/finance/budget/create">
            <Plus className="h-4 w-4 me-1" />إضافة بند
          </Link>
        </Button>
      }
    >
      <FinanceTabsNav />
      <KpiGrid items={[
        { label: "إجمالي البنود", value: formatNumber(items.length), icon: FileBarChart, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "المخصص", value: formatCurrency(totalAllocated), icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "المنفق", value: formatCurrency(totalUsed), icon: TrendingUp, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "نسبة الاستخدام", value: totalAllocated > 0 ? `${formatNumber(Math.round((totalUsed / totalAllocated) * 100))}%` : "0%", icon: PieChart, color: "text-purple-600 bg-purple-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالحساب أو الفترة...",
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "accountCode", label: "رمز الحساب" },
          { key: "accountName", label: "اسم الحساب" },
          { key: "period", label: "الفترة" },
          { key: "amount", label: "المخصص" },
          { key: "used", label: "المنفق" },
        ], "الميزانية")}
        resultCount={filtered?.length}
      />

      <PageStateWrapper
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
      >
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="لا توجد بنود ميزانية"
          emptyIcon={<FileBarChart className="h-6 w-6 text-slate-400" />}
          noToolbar
          onRowClick={(row) => navigate(`/finance/budget/${row.id}`)}
        />
      </PageStateWrapper>
    </PageShell>
  );
}
