import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart, Package, Clock, CheckCircle, Eye, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionHistory, NotesDisplay, ApprovalActions } from "@/components/approval-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, useAdvancedFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function PurchaseOrdersPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["purchase-orders", scopeQueryString], `/finance/purchase-orders${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const advFilters = useAdvancedFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "supplierName"],
    statusField: "",
    dateField: "",
  });

  const totalAmount = items.reduce((s: number, po: any) => s + Number(po.totalAmount || 0), 0);
  const pendingCount = items.filter((po: any) => ["draft", "pending"].includes(po.status)).length;
  const receivedCount = items.filter((po: any) => po.status === "received").length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "الرقم",
      sortable: true,
      render: (po) => <span className="font-mono text-blue-600">{po.ref || `#${formatNumber(po.id)}`}</span>,
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
      render: (po) => <span className="text-gray-500">{po.expectedDelivery ? formatDateAr(po.expectedDelivery) : "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (po) => <StatusBadge status={po.status} />,
    },
    {
      key: "notes",
      header: "ملاحظات",
      render: (po) => <NotesDisplay status={po.status} notes={po.notes} rejectionReason={po.notes} />,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (po) => (
        <div className="flex items-center gap-1">
          <Link href={`/finance/purchase-orders/${po.id}`}>
            <Button variant="ghost" size="sm"><Eye className="h-4 w-4 me-1" />عرض</Button>
          </Link>
          <Link href={`/finance/purchase-orders/create?copyFrom=${po.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-500" title="نسخ طلب الشراء">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button onClick={() => setExpandedId(expandedId === po.id ? null : po.id)} className="text-gray-400 hover:text-gray-600 p-1">
            {expandedId === po.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">طلبات الشراء</h1>
        <Link href="/finance/purchase-orders/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />طلب جديد</Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><ShoppingCart className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي الطلبات</p><p className="text-xl font-bold">{formatNumber(items.length)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><Package className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي المبالغ</p><p className="text-xl font-bold">{formatCurrency(totalAmount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg"><Clock className="h-5 w-5 text-yellow-600" /></div>
          <div><p className="text-xs text-gray-500">معلقة</p><p className="text-xl font-bold text-yellow-600">{formatNumber(pendingCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
          <div><p className="text-xs text-gray-500">مستلمة</p><p className="text-xl font-bold text-emerald-600">{formatNumber(receivedCount)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الطلب أو المورد...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "pending", label: "معلق" },
            { value: "approved", label: "موافق" },
            { value: "confirmed", label: "مؤكد" },
            { value: "received", label: "مستلم" },
            { value: "invoice_matched", label: "مطابق" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "الرقم" },
          { key: "supplierName", label: "المورد" },
          { key: "totalAmount", label: "المبلغ" },
          { key: "expectedDelivery", label: "التسليم المتوقع" },
          { key: "status", label: "الحالة" },
        ], "طلبات_الشراء")}
        resultCount={filtered?.length}
      />

      <AdvancedFilters
        dateFrom={advFilters.dateFrom}
        dateTo={advFilters.dateTo}
        onDateFromChange={advFilters.setDateFrom}
        onDateToChange={advFilters.setDateTo}
        onReset={advFilters.reset}
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
        noToolbar
        renderRowExtras={(po) => {
          if (expandedId !== po.id) return null;
          return (
            <div className="p-3 bg-gray-50/50 space-y-4">
              {po.status === "pending" && (
                <div className="bg-white p-4 rounded-lg border border-yellow-200">
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
    </div>
  );
}
