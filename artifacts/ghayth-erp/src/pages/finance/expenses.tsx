import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// P4.8 — Finance expenses: shared header + status chips from P1.
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  useAdvancedFilters,
} from "@workspace/ui-core";
import { Plus, Wallet, TrendingDown, PieChart, Calendar, ChevronDown, ChevronUp, Paperclip, ExternalLink, Link2, CheckSquare, BarChart3 } from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber, periodRiyadh, currentPeriodRiyadh } from "@/lib/formatters";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { EntityComments } from "@workspace/entity-kit";
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
import { mapJournalStatus, DOCUMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, POSTING_STATUS_LABELS } from "@/lib/finance/status-model";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";


export default function ExpensesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["expenses", scopeQueryString], `/finance/expenses${scopeSuffix}`);
  const items = data?.data || [];
  // Seed status from ?status=... so deep-links from CFO Cockpit land
  // pre-filtered (e.g. /finance/expenses?status=pending).
  const initialStatus = new URLSearchParams(window.location.search).get("status") || "";
  const [filters, setFilters] = useFilters({ status: initialStatus });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const advFilters = useAdvancedFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const [, navigate] = useLocation();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("expense");

  const preFiltered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "accountName", "ref", "operationType", "costCenter"],
    statusField: "status",
    dateField: "",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((i: any) => tagFilteredIds.has(i.id)) : preFiltered;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


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
      key: "costCenter",
      header: "مركز التكلفة",
      sortable: true,
      // Returned by the expenses API but only ever shown in the CSV — a core
      // control dimension that belongs in the list.
      render: (e) => <span className="text-muted-foreground text-xs">{e.costCenter || "—"}</span>,
    },
    {
      key: "relatedEntity",
      header: "الكيان المرتبط",
      // relatedEntityType / relatedEntityId are returned by the API and link
      // the expense to its subject (supplier, vehicle, property, …).
      render: (e) => {
        const labels: Record<string, string> = { supplier: "مورد", client: "عميل", employee: "موظف", vehicle: "مركبة", property: "عقار", project: "مشروع", contract: "عقد" };
        return e.relatedEntityType
          ? <span className="text-muted-foreground text-xs">{(labels[e.relatedEntityType] ?? e.relatedEntityType)}{e.relatedEntityId ? ` #${e.relatedEntityId}` : ""}</span>
          : <span className="text-xs text-gray-300">—</span>;
      },
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
      key: "paymentMethod",
      header: "طريقة الدفع",
      sortable: true,
      // Returned by the expenses API and already in the CSV export, but the
      // table never showed it.
      render: (e) => {
        const labels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", card: "بطاقة", credit: "آجل", cheque: "شيك" };
        return <span className="text-muted-foreground text-xs">{e.paymentMethod ? (labels[e.paymentMethod] ?? e.paymentMethod) : "—"}</span>;
      },
    },
    {
      key: "isPaid",
      header: "حالة السداد",
      sortable: true,
      // isPaid is returned by the API but was hidden everywhere — yet whether
      // an expense is settled is one of the most important things to see.
      render: (e) =>
        e.isPaid ? (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-status-success-surface text-status-success-foreground">مدفوع</span>
        ) : (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-status-warning-surface text-status-warning-foreground">غير مدفوع</span>
        ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      // FIN-CORRECTION (A3): keep the legacy document badge, and surface the
      // truthful posting axis (from /finance/expenses, migration-311 trigger)
      // in the list so a directly-posted expense (status='draft' +
      // balancesApplied=true) reads «مرحّل» here, not just in the expanded row.
      render: (e) => (
        <span className="inline-flex items-center gap-1">
          <PageStatusBadge status={e.status || "draft"} />
          {e.postingStatus && (
            <span className={`text-[10px] ${e.postingStatus === "posted" ? "text-status-success-foreground" : "text-muted-foreground"}`}>
              {POSTING_STATUS_LABELS[e.postingStatus as keyof typeof POSTING_STATUS_LABELS]}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (e) => <span className="text-muted-foreground text-xs">{e.createdAt ? formatDateAr(e.createdAt) : "-"}</span>,
    },
    {
      key: "createdByName",
      header: "المنشئ",
      sortable: true,
      // Resolved server-side from journal_entries.createdBy via the proven
      // employee_assignments → employees join — control data for the audit.
      render: (e) => <span className="text-muted-foreground text-xs">{e.createdByName || "—"}</span>,
    },
    {
      key: "approvedByName",
      header: "المعتمِد",
      sortable: true,
      // Resolved from the latest approval_actions 'approved' row (actionBy →
      // user → employee); the expense approve path records the approver there,
      // not on journal_entries.approvedBy.
      render: (e) => <span className="text-muted-foreground text-xs">{e.approvedByName || "—"}</span>,
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
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/expense-bulk-approvals">
              <CheckSquare className="h-4 w-4 me-2" />الاعتماد بالجملة
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/expense-burn-rate">
              <BarChart3 className="h-4 w-4 me-2" />معدل الحرق
            </Link></Button>
          <Link href="/finance/documents/create">
            <GuardedButton perm="finance:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة مصروف</GuardedButton>
          </Link>
          <PrintButton
            entityType="report_finance_expenses"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "المصروفات", total: printRows.length },
              items: printRows.map((e: any) => ({
                "المرجع": e.ref || e.id,
                "التاريخ": e.expenseDate || e.date || "—",
                "الفئة": e.category || "—",
                "البيان": e.description || "—",
                "المبلغ": e.amount ?? 0,
                "مركز التكلفة": e.costCenterName || e.costCenter || "—",
                "الحالة": e.status || "—",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />
      <KpiGrid items={[
        { label: "إجمالي المصروفات", value: formatCurrency(totalExpenses), icon: TrendingDown, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "عدد المصروفات", value: formatNumber(items.length), icon: Wallet, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "المتوسط", value: items.length > 0 ? formatCurrency(Math.round(totalExpenses / items.length)) : formatCurrency(0), icon: PieChart, color: "text-purple-600 bg-purple-50" },
        { label: "هذا الشهر", value: formatNumber(items.filter((e: any) => {
          return periodRiyadh(e.createdAt) === currentPeriodRiyadh();
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
          { key: "isPaid", label: "حالة السداد" },
          { key: "costCenter", label: "مركز التكلفة" },
          { key: "relatedEntityType", label: "نوع الكيان المرتبط" },
          { key: "createdAt", label: "التاريخ" },
          { key: "createdByName", label: "المنشئ" },
          { key: "approvedByName", label: "المعتمِد" },
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
        onSortedDataChange={setPrintRows}
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
                  {/* #1945 — الحالة على ثلاثة محاور منفصلة (مستند/دفع/ترحيل).
                      FIN-CORRECTION (A3): تُقرأ الآن من محاور الـAPI (محاور
                      trigger 311 عبر /finance/expenses، مُتاحة منذ #2150) بدل
                      اشتقاقها محليًا عبر mapJournalStatus(e.status) — الذي كان
                      يُضلِّل في حالة المصروف المُرحَّل مباشرةً (status='draft'
                      مع balancesApplied=true → يظهر «غير مرحّل» خطأً). fallback
                      دفاعي للاشتقاق المحلي إن غاب الحقل عن صف قديم. */}
                  <div>
                    <span className="text-muted-foreground">حالة المستند:</span>
                    <span className="block font-medium">{DOCUMENT_STATUS_LABELS[(e.documentStatus ?? mapJournalStatus(e.status).documentStatus) as keyof typeof DOCUMENT_STATUS_LABELS]}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">حالة الدفع:</span>
                    <span className={`block font-medium ${(e.paymentStatus ?? (e.isPaid ? "paid" : "unpaid")) === "paid" ? "text-status-success-foreground" : "text-orange-600"}`}>
                      {PAYMENT_STATUS_LABELS[(e.paymentStatus ?? (e.isPaid ? "paid" : "unpaid")) as keyof typeof PAYMENT_STATUS_LABELS]}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">حالة الترحيل:</span>
                    <span className="block font-medium">{POSTING_STATUS_LABELS[(e.postingStatus ?? mapJournalStatus(e.status).postingStatus) as keyof typeof POSTING_STATUS_LABELS]}</span>
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
                <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href={`/finance/expenses/${e.id}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    عرض الصفحة الكاملة
                  </Link></Button>
              </div>
            </div>
          );
        }}
      />
    </PageShell>
  );
}
