import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ShoppingCart,
  Package,
  Clock,
  CheckCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { ActionHistory, NotesDisplay, ApprovalActions } from "@/components/approval-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";

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
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["purchase-orders", scopeQueryString],
    `/finance/purchase-orders${scopeSuffix}`,
  );
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        <Button size="sm" asChild>
          <Link href="/finance/purchase-orders/create">
            <Plus className="h-4 w-4 me-1" />
            طلب جديد
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50 border border-blue-100">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
              <p className="text-xl font-bold">{formatNumber(items.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Package className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المبالغ</p>
              <p className="text-xl font-bold">{formatCurrency(totalAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">معلقة</p>
              <p className="text-xl font-bold text-amber-700">{formatNumber(pendingCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
              <CheckCircle className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مستلمة</p>
              <p className="text-xl font-bold text-violet-700">{formatNumber(receivedCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
        renderRowExtras={(po) => {
          if (expandedId !== po.id) return null;
          return (
            <div className="p-3 bg-gray-50/50 space-y-4">
              {(po.status === "pending" || po.status === "pending_approval") && (
                <div className="bg-white p-4 rounded-lg border border-amber-200">
                  <h4 className="font-semibold mb-3">اتخاذ إجراء</h4>
                  <ApprovalActions
                    entityType="purchase_order"
                    entityId={po.id}
                    currentStatus={po.status}
                    invalidateKeys={[["purchase-orders"]]}
                  />
                </div>
              )}
              <ActionHistory entityType="purchase_order" entityId={po.id} defaultOpen />
            </div>
          );
        }}
      />
    </PageShell>
  );
}
