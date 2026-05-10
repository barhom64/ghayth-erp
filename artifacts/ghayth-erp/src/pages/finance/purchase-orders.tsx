import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Plus,
  ShoppingCart,
  Clock,
  CheckCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
} from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { ActionHistory, NotesDisplay, ApprovalActions } from "@/components/approval-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

/**
 * Purchase orders list — migrated in R.4 iter 4 to the unified
 * template stack.
 *
 * Before: raw <h1>, `StatusBadge` shim import (still worked but was
 * an indirection), a bug where `statusField: ""` silently disabled
 * the status pill filter, and a duplicated `<AdvancedFilters>` call
 * (a leftover from a previous refactor that rendered an empty date
 * row with no visible effect).
 *
 * After:
 *   • PageShell with breadcrumbs + actions
 *   • PageStatusBadge with `purchase` domain drives the chip directly
 *   • `statusField` wired to `status` so the pills actually filter
 *   • Dead `useAdvancedFilters` import + second AdvancedFilters block
 *     removed
 *   • Overdue-style row highlight for pending orders so reviewers
 *     notice rows awaiting their action
 *
 * The approval workflow (ApprovalActions + ActionHistory inline in the
 * row expansion slot) is preserved as-is; those helpers are already
 * unified.
 */

export default function PurchaseOrdersPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["purchase-orders", scopeQueryString],
    `/finance/purchase-orders${scopeSuffix}`,
  );
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "supplierName"],
    statusField: "status",
    dateField: "expectedDelivery",
  });

  const totalAmount = items.reduce((s: number, po: any) => s + Number(po.totalAmount || 0), 0);
  const pendingCount = items.filter((po: any) => ["draft", "pending"].includes(po.status)).length;
  const receivedCount = items.filter((po: any) => po.status === "received").length;

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
      key: "ref",
      header: "الرقم",
      sortable: true,
      render: (po) => (
        <span className="font-mono text-blue-600">{po.ref || `#${formatNumber(po.id)}`}</span>
      ),
    },
    {
      key: "supplierName",
      header: "المورد",
      sortable: true,
      render: (po) => <span className="font-medium">{po.supplierName || "-"}</span>,
    },
    {
      key: "totalAmount",
      header: "المبلغ",
      sortable: true,
      render: (po) => <span className="font-semibold">{formatCurrency(po.totalAmount)}</span>,
    },
    {
      key: "expectedDelivery",
      header: "التسليم المتوقع",
      sortable: true,
      render: (po) => (
        <span className="text-muted-foreground">
          {po.expectedDelivery ? formatDateAr(po.expectedDelivery) : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (po) => <PageStatusBadge status={po.status} domain="purchase" />,
    },
    {
      key: "notes",
      header: "ملاحظات",
      render: (po) => (
        <NotesDisplay status={po.status} notes={po.notes} rejectionReason={po.notes} />
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (po) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/finance/purchase-orders/${po.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4 me-1" />
              عرض
            </Button>
          </Link>
          <Link href={`/finance/purchase-orders/create?copyFrom=${po.id}`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              title="نسخ طلب الشراء"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}
            className="text-muted-foreground hover:text-foreground p-1"
            title="إجراءات الاعتماد"
          >
            {expandedId === po.id ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="طلبات الشراء"
      subtitle="إدارة طلبات الشراء والاعتماد والاستلام والمطابقة مع الفواتير"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "طلبات الشراء" }]}
      loading={isLoading}
      actions={
        <GuardedButton perm="finance:create" size="sm" asChild>
          <Link href="/finance/purchase-orders/create">
            <Plus className="h-4 w-4 me-1" />
            طلب جديد
          </Link>
        </GuardedButton>
      }
    >
      <FinanceTabsNav />
      <KpiGrid items={[
        { label: "إجمالي الطلبات", value: formatNumber(items.length), icon: ShoppingCart, color: "text-blue-600 bg-blue-50" },
        { label: "بانتظار الاعتماد", value: formatNumber(pendingCount), icon: Clock, color: "text-amber-600 bg-amber-50" },
        { label: "معتمدة", value: formatNumber(items.filter((po: any) => po.status === "approved").length), icon: CheckCircle, color: "text-green-600 bg-green-50" },
        { label: "إجمالي المبالغ", value: formatCurrency(totalAmount), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الطلب أو المورد...",
          statuses: [
            { value: "draft",            label: "مسودة" },
            { value: "pending",          label: "معلق" },
            { value: "pending_approval", label: "بانتظار الاعتماد" },
            { value: "approved",         label: "معتمد" },
            { value: "vendor_confirmed", label: "مؤكد من المورد" },
            { value: "received",         label: "مستلم" },
            { value: "partially_received", label: "مستلم جزئياً" },
            { value: "rejected",         label: "مرفوض" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            (filtered || []) as any[],
            [
              { key: "ref", label: "الرقم" },
              { key: "supplierName", label: "المورد" },
              { key: "totalAmount", label: "المبلغ" },
              { key: "expectedDelivery", label: "التسليم المتوقع" },
              { key: "status", label: "الحالة" },
            ],
            "طلبات_الشراء",
          )
        }
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="purchase-order"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["purchase-orders"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "ref", label: "الرقم" },
          { key: "supplierName", label: "المورد" },
          { key: "totalAmount", label: "المبلغ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="طلبات_الشراء"
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات شراء"
        emptyIcon={<ShoppingCart className="h-6 w-6 text-slate-400" />}
        rowClassName={(po) =>
          po.status === "pending" || po.status === "pending_approval"
            ? "bg-amber-50/30"
            : undefined
        }
        noToolbar
        onRowClick={(row) => navigate(`/finance/purchase-orders/${row.id}`)}
        renderRowExtras={(po) => {
          if (expandedId !== po.id) return null;
          return (
            <div className="p-3 bg-gray-50/50 space-y-4">
              {(po.status === "pending" || po.status === "pending_approval") && (
                <div className="bg-white p-4 rounded-lg border border-amber-200">
                  <h4 className="font-semibold mb-3">اتخاذ إجراء</h4>
                  <ApprovalActions
                    entityType="purchase-order"
                    entityId={po.id}
                    currentStatus={po.status}
                    approveEndpoint={`/finance/purchase-orders/${po.id}/approve`}
                    rejectEndpoint={`/finance/purchase-orders/${po.id}/reject`}
                    approveMethod="PATCH"
                    rejectMethod="PATCH"
                    pendingStatuses={["pending", "pending_approval", "draft"]}
                    invalidateKeys={[["purchase-orders"]]}
                  />
                </div>
              )}
              <ActionHistory entityType="purchase-order" entityId={po.id} defaultOpen />
            </div>
          );
        }}
      />
    </PageShell>
  );
}
