import { useState, Fragment } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, ShoppingCart, Package, Clock, CheckCircle, Eye, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionHistory, NotesDisplay, ApprovalActions } from "@/components/approval-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, useAdvancedFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function PurchaseOrdersPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["purchase-orders", scopeQueryString], `/finance/purchase-orders${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const advFilters = useAdvancedFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["ref", "supplierName"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const totalAmount = items.reduce((s: number, po: any) => s + Number(po.totalAmount || 0), 0);
  const pendingCount = items.filter((po: any) => ["draft", "pending"].includes(po.status)).length;
  const receivedCount = items.filter((po: any) => po.status === "received").length;

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
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "الرقم" },
          { key: "supplierName", label: "المورد" },
          { key: "totalAmount", label: "المبلغ" },
          { key: "expectedDelivery", label: "التسليم المتوقع" },
          { key: "status", label: "الحالة" },
        ], "طلبات_الشراء")}
        resultCount={sortedData?.length}
      />

      <AdvancedFilters
        dateFrom={advFilters.dateFrom}
        dateTo={advFilters.dateTo}
        onDateFromChange={advFilters.setDateFrom}
        onDateToChange={advFilters.setDateTo}
        onReset={advFilters.reset}
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="ref" label="الرقم" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="supplierName" label="المورد" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="totalAmount" label="المبلغ" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="expectedDelivery" label="التسليم المتوقع" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              <TableHead>ملاحظات</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={7} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-12 text-center text-gray-400">
                <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد طلبات شراء</p>
              </td></tr>
            ) : (sortedData || []).map((po: any) => (
              <Fragment key={po.id}>
                <tr className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-blue-600">{po.ref || `#${formatNumber(po.id)}`}</td>
                  <td className="p-3 font-medium">{po.supplierName || "-"}</td>
                  <td className="p-3 font-semibold">{formatCurrency(po.totalAmount)}</td>
                  <td className="p-3 text-gray-500">{po.expectedDelivery ? formatDateAr(po.expectedDelivery) : "-"}</td>
                  <td className="p-3"><StatusBadge status={po.status} /></td>
                  <td className="p-3">
                    <NotesDisplay status={po.status} notes={po.notes} rejectionReason={po.notes} />
                  </td>
                  <td className="p-3">
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
                  </td>
                </tr>
                {expandedId === po.id && (
                  <tr><td colSpan={7} className="p-3 bg-gray-50/50 space-y-4">
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
                  </td></tr>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
