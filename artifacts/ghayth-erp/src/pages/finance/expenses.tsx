import { useState, Fragment } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Wallet, TrendingDown, PieChart, Calendar, ChevronDown, ChevronUp, Paperclip, ExternalLink, Link2 } from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV, useAdvancedFilters } from "@/components/shared/advanced-filters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useAppContext } from "@/contexts/app-context";

const OPERATION_LABELS: Record<string, string> = {
  expense: "مصروف عام",
  salary: "راتب",
  advance: "سلفة",
  fuel: "وقود",
  maintenance: "صيانة",
  insurance: "تأمين",
  rent: "إيجار",
  vendor_invoice: "فاتورة مورد",
  purchase: "مشتريات",
  legal_fee: "أتعاب قانونية",
  custody: "عهدة",
  custody_settlement: "تسوية عهدة",
  advance_claim: "مطالبة سلفة",
  iqama_renewal: "تجديد إقامة",
  vehicle_registration: "تجديد استمارة مركبة",
  vehicle_inspection: "فحص دوري مركبة",
  work_permit_renewal: "تجديد رخصة عمل",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
  credit_card: "بطاقة ائتمان",
  custody: "من العهدة",
};


export default function ExpensesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["expenses", scopeQueryString], `/finance/expenses${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const advFilters = useAdvancedFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("expense");

  const preFiltered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "accountName", "ref", "operationType", "costCenter"],
    statusField: "",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((i: any) => tagFilteredIds.has(i.id)) : preFiltered;
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const totalExpenses = items.reduce((s: number, e: any) => {
    if (e.amount) return s + Number(e.amount);
    const lines = e.lines || [];
    const debitTotal = Array.isArray(lines)
      ? lines.reduce((ls: number, l: any) => ls + Number(l?.debit || 0), 0)
      : 0;
    return s + debitTotal;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المصروفات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">مصروفات مرتبطة بالميزانية — لحركات النقد الحرة راجع <a href="/finance/vouchers" className="text-primary underline underline-offset-2">السندات</a></p>
        </div>
        <Link href="/finance/expenses/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة مصروف</Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><TrendingDown className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي المصروفات</p><p className="text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><Wallet className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">عدد المصروفات</p><p className="text-xl font-bold">{formatNumber(items.length)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><PieChart className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-gray-500">المتوسط</p><p className="text-xl font-bold">{items.length > 0 ? formatCurrency(Math.round(totalExpenses / items.length)) : formatCurrency(0)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg"><Calendar className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-xs text-gray-500">هذا الشهر</p><p className="text-xl font-bold">{formatNumber(items.filter((e: any) => {
            const d = new Date(e.createdAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو الحساب أو المرجع أو مركز التكلفة...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "pending_approval", label: "بانتظار الموافقة" },
            { value: "approved", label: "معتمد" },
            { value: "posted", label: "مرحّل" },
            { value: "rejected", label: "مرفوض" },
            { value: "returned", label: "مُعاد" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedData || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "accountName", label: "الحساب" },
          { key: "amount", label: "المبلغ" },
          { key: "operationType", label: "نوع العملية" },
          { key: "paymentMethod", label: "طريقة الدفع" },
          { key: "costCenter", label: "مركز التكلفة" },
          { key: "createdAt", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "المصروفات")}
        resultCount={sortedData?.length}
      />

      <div className="flex items-center gap-4 flex-wrap">
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
      </div>

      <BulkActionsBar
        entityType="expense"
        items={sortedData || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((sortedData || []).map((e: any) => e.id))}
        onClear={clearSelection}
        invalidateKeys={[["expenses"]]}
        csvColumns={[
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "amount", label: "المبلغ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="المصروفات"
        actions={["approve", "reject", "export", "delete"]}
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"><BulkCheckbox checked={selectedIds.size === (sortedData || []).length && (sortedData || []).length > 0} indeterminate={selectedIds.size > 0 && selectedIds.size < (sortedData || []).length} onChange={() => toggleAll((sortedData || []).map((e: any) => e.id))} /></TableHead>
              <SortableTableHead column="ref" label="المرجع" sortState={sortState} onSort={handleSort} />
              <TableHead>الوسوم</TableHead>
              <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="operationType" label="النوع" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="accountName" label="الحساب" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="amount" label="المبلغ" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b"><td colSpan={10} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="p-12 text-center text-gray-400">
                <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد مصروفات</p>
              </td></tr>
            ) : (sortedData || []).map((e: any) => (
              <Fragment key={e.id}>
                <tr className={`border-b hover:bg-gray-50 cursor-pointer ${selectedIds.has(e.id) ? "bg-blue-50/50" : ""}`} onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                  <td className="p-3" onClick={(ev) => ev.stopPropagation()}><BulkCheckbox checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} /></td>
                  <td className="p-3 font-mono text-blue-600 text-xs">
                    <div className="flex items-center gap-1">
                      {e.ref || `#${e.id}`}
                      {e.govSyncEnabled && (
                        <span title="مرتبط بنظام حكومي" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 shrink-0">
                          <Link2 className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3"><EntityTags entityType="expense" entityId={e.id} inline /></td>
                  <td className="p-3 font-medium max-w-[200px] truncate">{e.description || "-"}</td>
                  <td className="p-3 text-xs">
                    {e.operationType ? (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">{OPERATION_LABELS[e.operationType] || e.operationType}</span>
                    ) : "-"}
                  </td>
                  <td className="p-3 text-gray-500 text-xs">{e.accountName || "-"}</td>
                  <td className="p-3 font-semibold text-red-600">
                    {e.amount ? formatCurrency(Number(e.amount)) : (() => {
                      const lines = e.lines || [];
                      const total = Array.isArray(lines) ? lines.reduce((s: number, l: any) => s + Number(l?.debit || 0), 0) : 0;
                      return total > 0 ? formatCurrency(total) : "-";
                    })()}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={e.status || "draft"} />
                  </td>
                  <td className="p-3 text-gray-500 text-xs">{e.createdAt ? formatDateAr(e.createdAt) : "-"}</td>
                  <td className="p-3">
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      {expandedId === e.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
                {expandedId === e.id && (
                  <tr><td colSpan={10} className="p-4 bg-gray-50/50 space-y-4">
                    {/* Extended details */}
                    <div className="bg-white p-4 rounded-lg border">
                      <h4 className="font-semibold mb-3 text-sm">تفاصيل المصروف</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {e.operationType && (
                          <div>
                            <span className="text-gray-500">نوع العملية:</span>
                            <span className="block font-medium">{OPERATION_LABELS[e.operationType] || e.operationType}</span>
                          </div>
                        )}
                        {e.expenseType && (
                          <div>
                            <span className="text-gray-500">التصنيف:</span>
                            <span className="block font-medium">{e.expenseType}</span>
                          </div>
                        )}
                        {e.paymentMethod && (
                          <div>
                            <span className="text-gray-500">طريقة الدفع:</span>
                            <span className="block font-medium">{PAYMENT_METHOD_LABELS[e.paymentMethod] || e.paymentMethod}</span>
                          </div>
                        )}
                        {e.costCenter && (
                          <div>
                            <span className="text-gray-500">مركز التكلفة:</span>
                            <span className="block font-medium">{e.costCenter}</span>
                          </div>
                        )}
                        {e.reference && (
                          <div>
                            <span className="text-gray-500">رقم المرجع:</span>
                            <span className="block font-medium">{e.reference}</span>
                          </div>
                        )}
                        {e.relatedEntityType && (
                          <div>
                            <span className="text-gray-500">الجهة المرتبطة:</span>
                            <span className="block font-medium">{e.relatedEntityType} #{e.relatedEntityId}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">حالة الدفع:</span>
                          <span className={`block font-medium ${e.isPaid ? "text-green-600" : "text-orange-600"}`}>
                            {e.isPaid ? "مدفوع" : "غير مدفوع"}
                          </span>
                        </div>
                        {e.attachmentUrl && (
                          <div>
                            <span className="text-gray-500">المرفق:</span>
                            <a href={e.attachmentUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline mt-0.5">
                              <Paperclip className="h-3 w-3" />
                              {e.attachmentType || "عرض المرفق"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Approval */}
                    {(e.status === "draft" || e.status === "returned" || e.status === "pending_approval") && (
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-semibold mb-3 text-sm">إجراءات الاعتماد</h4>
                        <ApprovalActions
                          entityType="expense"
                          entityId={e.id}
                          currentStatus={e.status}
                          onDone={() => setExpandedId(null)}
                          invalidateKeys={[["expenses"]]}
                        />
                      </div>
                    )}
                    <EntityTags entityType="expense" entityId={e.id} />
                    <EntityComments entityType="expense" entityId={e.id} />
                    <ActionHistory entityType="expense" entityId={e.id} defaultOpen />
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
