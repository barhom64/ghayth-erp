import { useState, Fragment } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Plus, Receipt, DollarSign, AlertTriangle, CheckCircle, Eye, ExternalLink, ChevronDown, ChevronUp, Copy, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { CollectionStages } from "@/components/shared/entity-timeline";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useSortedData } from "@/hooks/use-sorted-data";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["invoices", scopeQueryString], `/finance/invoices${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["finance-stats", scopeQueryString], `/finance/stats${scopeSuffix}`);
  const items = data?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("invoice");
  const preFiltered = applyFilters(items, filters, {
    searchFields: ["ref", "clientName"],
    statusField: "",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((i: any) => tagFilteredIds.has(i.id)) : preFiltered;
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const previewFields: PreviewField[] = [
    { label: "رقم الفاتورة", key: "ref" },
    { label: "العميل", key: "clientName" },
    { label: "الإجمالي", key: "total", type: "currency" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الفواتير</h1>
        <Link href="/finance/invoices/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />فاتورة جديدة</Button>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50"><DollarSign className="w-6 h-6 text-blue-600" /></div>
          <div><p className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</p><p className="text-xs text-gray-500">إجمالي الإيرادات</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50"><CheckCircle className="w-6 h-6 text-green-600" /></div>
          <div><p className="text-2xl font-bold">{formatCurrency(stats?.paidThisMonth || 0)}</p><p className="text-xs text-gray-500">المدفوع هذا الشهر</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-50"><Receipt className="w-6 h-6 text-amber-600" /></div>
          <div><p className="text-2xl font-bold text-amber-600">{formatCurrency(stats?.pendingAmount || 0)}</p><p className="text-xs text-gray-500">المعلقة</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-50"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
          <div><p className="text-2xl font-bold text-red-600">{formatCurrency(stats?.overdueAmount || 0)}</p><p className="text-xs text-gray-500">المتأخرة</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الفاتورة أو العميل...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "pending", label: "معلق" },
            { value: "partial", label: "جزئي" },
            { value: "paid", label: "مدفوعة" },
            { value: "overdue", label: "متأخرة" },
            { value: "cancelled", label: "ملغاة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "dueDate", label: "الاستحقاق" },
          { key: "status", label: "الحالة" },
        ], "الفواتير")}
        resultCount={sortedData?.length}
      />
      <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />

      <BulkActionsBar
        entityType="invoice"
        items={sortedData || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((sortedData || []).map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["invoices"]]}
        csvColumns={[
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الفواتير"
        actions={["approve", "reject", "export", "delete"]}
      />

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><BulkCheckbox checked={selectedIds.size === (sortedData || []).length && (sortedData || []).length > 0} indeterminate={selectedIds.size > 0 && selectedIds.size < (sortedData || []).length} onChange={() => toggleAll((sortedData || []).map((i: any) => i.id))} /></TableHead>
              <SortableTableHead column="ref" label="الرقم" sortState={sortState} onSort={handleSort} />
              <TableHead className="text-start">الوسوم</TableHead>
              <SortableTableHead column="clientName" label="العميل" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="total" label="الإجمالي" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="paidAmount" label="المدفوع" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="dueDate" label="الاستحقاق" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              <TableHead className="text-start">ZATCA</TableHead>
              <TableHead className="text-start">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={sortedData}
            colCount={10}
            emptyMessage="لا توجد فواتير"
            emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
          >
            {(paginatedData || []).map((inv: any) => (
              <Fragment key={inv.id}>
                <TableRow className={`hover:bg-muted/20 ${selectedIds.has(inv.id) ? "bg-blue-50/50" : ""}`}>
                  <TableCell><BulkCheckbox checked={selectedIds.has(inv.id)} onChange={() => toggleSelect(inv.id)} /></TableCell>
                  <TableCell className="font-mono text-blue-600">{inv.ref || `#${inv.id}`}</TableCell>
                  <TableCell><EntityTags entityType="invoice" entityId={inv.id} inline /></TableCell>
                  <TableCell className="font-medium">{inv.clientName || "-"}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(Number(inv.total))}</TableCell>
                  <TableCell className="text-emerald-600">{formatCurrency(Number(inv.paidAmount || 0))}</TableCell>
                  <TableCell className="text-gray-500">{inv.dueDate ? formatDateAr(inv.dueDate) : "-"}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                  <TableCell>
                    {inv.isTaxLinked ? (
                      <Badge className={`text-xs gap-1 ${inv.zatcaStatus === "accepted" ? "bg-green-100 text-green-700" : (inv.zatcaStatus === "rejected" || inv.zatcaStatus === "error") ? "bg-red-100 text-red-700" : inv.zatcaStatus === "submitted" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
                        <Zap className="h-3 w-3" />
                        {inv.zatcaStatus === "accepted" ? "مقبولة" : inv.zatcaStatus === "rejected" ? "مرفوضة" : inv.zatcaStatus === "error" ? "خطأ" : inv.zatcaStatus === "submitted" ? "مرسلة" : "معلقة"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewItem(inv)}><Eye className="h-4 w-4" /></Button>
                      <Link href={`/finance/invoices/${inv.id}`}>
                        <Button variant="ghost" size="sm" title="عرض التفاصيل"><ExternalLink className="h-4 w-4 me-1" />عرض</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/finance/invoices/create?copy=${encodeURIComponent(JSON.stringify({ clientId: inv.clientId, description: inv.description, subtotal: inv.subtotal, vatRate: inv.vatRate, paymentTerms: inv.paymentTerms, notes: inv.notes }))}`)}
                        title="نسخ الفاتورة"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Link href={`/finance/invoices/create?copyFrom=${inv.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-500" title="نسخ الفاتورة">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <button onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)} className="text-gray-400 hover:text-gray-600 p-1">
                        {expandedId === inv.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === inv.id && (
                  <TableRow>
                    <TableCell colSpan={10} className="bg-gray-50/50">
                      <div className="space-y-3">
                        {inv.status === "pending" && (
                          <ApprovalActions
                            entityType="invoice"
                            entityId={inv.id}
                            approveEndpoint={`/finance/invoices/${inv.id}/approve`}
                            rejectEndpoint={`/finance/invoices/${inv.id}/approve`}
                            returnEndpoint={`/finance/invoices/${inv.id}/approve`}
                            approveMethod="PATCH"
                            rejectMethod="PATCH"
                            returnMethod="PATCH"
                            approveBody={() => ({ approved: true })}
                            rejectBody={(r) => ({ approved: false, notes: r })}
                            returnBody={(r) => ({ approved: "returned", notes: r })}
                            invalidateKeys={[["invoices"]]}
                          />
                        )}
                        <EntityTags entityType="invoice" entityId={inv.id} />
                        <EntityComments entityType="invoice" entityId={inv.id} />
                        <ActionHistory entityType="invoice" entityId={inv.id} defaultOpen />
                        {["overdue", "sent", "partial"].includes(inv.status) && (
                          <CollectionStages invoiceId={inv.id} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الفاتورة" data={previewItem} fields={previewFields} />
    </div>
  );
}
