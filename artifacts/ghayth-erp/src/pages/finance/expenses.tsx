import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// P4.8 — Finance expenses: shared header + status chips from P1.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, Wallet, TrendingDown, PieChart, Calendar, ChevronDown, ChevronUp, Paperclip, ExternalLink, Link2 } from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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

import { PAYMENT_METHODS } from "@/lib/finance-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";


export default function ExpensesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["expenses", scopeQueryString], `/finance/expenses${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const advFilters = useAdvancedFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const [, navigate] = useLocation();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("expense");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const preFiltered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "accountName", "ref", "operationType", "costCenter"],
    statusField: "status",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((i: any) => tagFilteredIds.has(i.id)) : preFiltered;

  const totalExpenses = items.reduce((s: number, e: any) => {
    if (e.amount) return s + Number(e.amount);
    const lines = e.lines || [];
    const debitTotal = Array.isArray(lines)
      ? lines.reduce((ls: number, l: any) => ls + Number(l?.debit || 0), 0)
      : 0;
    return s + debitTotal;
  }, 0);

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (e) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} />
        </span>
      ),
    },
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-1 font-mono text-status-info-foreground text-xs">
          {e.ref || `#${e.id}`}
          {e.govSyncEnabled && (
            <span title="مرتبط بنظام حكومي" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-status-success-surface text-status-success-foreground shrink-0">
              <Link2 className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: "tags",
      header: "الوسوم",
      render: (e) => <EntityTags entityType="expense" entityId={e.id} inline />,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (e) => <div className="font-medium max-w-[200px] truncate">{e.description || "-"}</div>,
    },
    {
      key: "operationType",
      header: "النوع",
      sortable: true,
      render: (e) => (
        <div className="text-xs">
          {e.operationType ? (
            <span className="px-2 py-0.5 rounded bg-status-info-surface text-status-info-foreground">{OPERATION_LABELS[e.operationType] || e.operationType}</span>
          ) : "-"}
        </div>
      ),
    },
    {
      key: "accountName",
      header: "الحساب",
      sortable: true,
      render: (e) => <span className="text-muted-foreground text-xs">{e.accountName || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (e) => (
        <span className="font-semibold text-status-error-foreground">
          {e.amount ? formatCurrency(Number(e.amount)) : (() => {
            const lines = e.lines || [];
            const total = Array.isArray(lines) ? lines.reduce((s: number, l: any) => s + Number(l?.debit || 0), 0) : 0;
            return total > 0 ? formatCurrency(total) : "-";
          })()}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (e) => <PageStatusBadge status={e.status || "draft"} />,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (e) => <span className="text-muted-foreground text-xs">{e.createdAt ? formatDateAr(e.createdAt) : "-"}</span>,
    },
    {
      key: "expand",
      header: "",
      render: (e) => (
        <button
          className="text-muted-foreground hover:text-muted-foreground p-1"
          onClick={(ev) => { ev.stopPropagation(); setExpandedId(expandedId === e.id ? null : e.id); }}
        >
          {expandedId === e.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ),
    },
  ];

  return (
    <PageShell
      title="المصروفات"
      subtitle="مصروفات مرتبطة بالميزانية — لحركات النقد الحرة راجع السندات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }]}
      actions={
        <Link href="/finance/expenses/create">
          <GuardedButton perm="finance:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة مصروف</GuardedButton>
        </Link>
      }
    >
      <FinanceTabsNav />
      <KpiGrid items={[
        { label: "إجمالي المصروفات", value: formatCurrency(totalExpenses), icon: TrendingDown, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "عدد المصروفات", value: formatNumber(items.length), icon: Wallet, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "المتوسط", value: items.length > 0 ? formatCurrency(Math.round(totalExpenses / items.length)) : formatCurrency(0), icon: PieChart, color: "text-purple-600 bg-purple-50" },
        { label: "هذا الشهر", value: formatNumber(items.filter((e: any) => {
          const d = new Date(e.createdAt);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length), icon: Calendar, color: "text-orange-600 bg-orange-50" },
      ]} />

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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
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
        resultCount={filtered?.length}
      />

      <div className="flex items-center gap-4 flex-wrap">
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
      </div>

      <BulkActionsBar
        entityType="expense"
        items={filtered || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((filtered || []).map((e: any) => e.id))}
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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مصروفات"
        emptyIcon={<Wallet className="h-6 w-6 text-slate-400" />}
        rowClassName={(e) => selectedIds.has(e.id) ? "bg-status-info-surface" : undefined}
        onRowClick={(e) => navigate(`/finance/expenses/${e.id}`)}
        noToolbar
        renderRowExtras={(e) => {
          if (expandedId !== e.id) return null;
          return (
            <div className="p-4 bg-surface-subtle/50 space-y-4">
              {/* Extended details */}
              <div className="bg-white p-4 rounded-lg border">
                <h4 className="font-semibold mb-3 text-sm">تفاصيل المصروف</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {e.operationType && (
                    <div>
                      <span className="text-muted-foreground">نوع العملية:</span>
                      <span className="block font-medium">{OPERATION_LABELS[e.operationType] || e.operationType}</span>
                    </div>
                  )}
                  {e.expenseType && (
                    <div>
                      <span className="text-muted-foreground">التصنيف:</span>
                      <span className="block font-medium">{e.expenseType}</span>
                    </div>
                  )}
                  {e.paymentMethod && (
                    <div>
                      <span className="text-muted-foreground">طريقة الدفع:</span>
                      <span className="block font-medium">{PAYMENT_METHODS[e.paymentMethod] || e.paymentMethod}</span>
                    </div>
                  )}
                  {e.costCenter && (
                    <div>
                      <span className="text-muted-foreground">مركز التكلفة:</span>
                      <span className="block font-medium">{e.costCenter}</span>
                    </div>
                  )}
                  {e.reference && (
                    <div>
                      <span className="text-muted-foreground">رقم المرجع:</span>
                      <span className="block font-medium">{e.reference}</span>
                    </div>
                  )}
                  {e.relatedEntityType && (
                    <div>
                      <span className="text-muted-foreground">الجهة المرتبطة:</span>
                      <span className="block font-medium">{e.relatedEntityType} #{e.relatedEntityId}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">حالة الدفع:</span>
                    <span className={`block font-medium ${e.isPaid ? "text-status-success-foreground" : "text-orange-600"}`}>
                      {e.isPaid ? "مدفوع" : "غير مدفوع"}
                    </span>
                  </div>
                  {e.attachmentUrl && (
                    <div>
                      <span className="text-muted-foreground">المرفق:</span>
                      <a href={e.attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-status-info-foreground hover:underline mt-0.5">
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
                    approveEndpoint={`/finance/expenses/${e.id}/approve`}
                    rejectEndpoint={`/finance/expenses/${e.id}/approve`}
                    returnEndpoint={`/finance/expenses/${e.id}/approve`}
                    approveMethod="PATCH"
                    rejectMethod="PATCH"
                    returnMethod="PATCH"
                    approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                    rejectBody={(notes) => ({ approved: false, notes })}
                    returnBody={(notes) => ({ approved: "returned", notes })}
                    pendingStatuses={["draft", "pending_approval", "returned"]}
                    onDone={() => setExpandedId(null)}
                    invalidateKeys={[["expenses"]]}
                  />
                </div>
              )}
              <EntityTags entityType="expense" entityId={e.id} />
              <EntityComments entityType="expense" entityId={e.id} />
              <ActionHistory entityType="expense" entityId={e.id} defaultOpen />
              <div className="flex justify-end pt-2 border-t">
                <Link href={`/finance/expenses/${e.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    عرض الصفحة الكاملة
                  </Button>
                </Link>
              </div>
            </div>
          );
        }}
      />
    </PageShell>
  );
}
