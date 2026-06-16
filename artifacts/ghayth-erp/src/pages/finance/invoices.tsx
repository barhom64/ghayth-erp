import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// P4.8 — Finance invoices: shared header + status chips from P1.
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { Plus, Receipt, DollarSign, AlertTriangle, CheckCircle, Eye, ExternalLink, ChevronDown, ChevronUp, Copy, Zap, Send, Clock } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import {
  CollectionStages,
  EntityComments,
} from "@workspace/entity-kit";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  // Seed status from ?status=… so deep-links land pre-filtered
  // (e.g. /finance/invoices?status=draft from VAT readiness checklist).
  const initialStatus = new URLSearchParams(window.location.search).get("status") || "";
  const [filters, setFilters] = useFilters({ status: initialStatus });
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["invoices", scopeQueryString], `/finance/invoices${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["finance-stats", scopeQueryString], `/finance/stats${scopeSuffix}`);
  const items = data?.data || [];
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("invoice");
  // R.3 — statusField was empty string so the AdvancedFilters status
  // pills never actually filtered the list. The pills still rendered
  // in the toolbar but clicking them had no effect. Fixing it here so
  // the status filter is honoured and matches the custodies +
  // bank-guarantees pages migrated in the same iteration.
  const preFiltered = applyFilters(items, filters, {
    searchFields: ["ref", "clientName"],
    statusField: "status",
    dateField: "dueDate",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((i: any) => tagFilteredIds.has(i.id)) : preFiltered;
  // Derive `outstanding` (total − paid) onto each row so the "المتبقّي"
  // column can sort on it (DataTable sorts by row[key]) and the CSV export
  // can reference it by key — both previously read a non-existent field.
  const filteredWithBalance = (filtered || []).map((i: any) => ({ ...i, outstanding: Number(i.total ?? 0) - Number(i.paidAmount ?? 0) }));
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const previewFields: PreviewField[] = [
    { label: "رقم الفاتورة", key: "ref" },
    { label: "العميل", key: "clientName" },
    { label: "الإجمالي", key: "total", type: "currency" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (inv) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
        </span>
      ),
    },
    {
      key: "ref",
      header: "الرقم",
      sortable: true,
      render: (inv) => <span className="font-mono text-status-info-foreground">{inv.ref || `#${inv.id}`}</span>,
    },
    {
      key: "tags",
      header: "الوسوم",
      render: (inv) => <EntityTags entityType="invoice" entityId={inv.id} inline />,
    },
    {
      key: "clientName",
      header: "العميل",
      sortable: true,
      render: (inv) => <span className="font-medium">{inv.clientName || "-"}</span>,
    },
    {
      key: "total",
      header: "الإجمالي",
      sortable: true,
      render: (inv) => <span className="font-semibold">{formatCurrency(Number(inv.total))}</span>,
    },
    {
      key: "vatAmount",
      header: "الضريبة",
      sortable: true,
      render: (inv) =>
        inv.vatAmount != null ? (
          <span className="text-muted-foreground tabular-nums">{formatCurrency(Number(inv.vatAmount))}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        ),
    },
    {
      key: "paidAmount",
      header: "المدفوع",
      sortable: true,
      render: (inv) => <span className="text-emerald-600">{formatCurrency(Number(inv.paidAmount || 0))}</span>,
    },
    {
      key: "outstanding",
      header: "المتبقّي",
      sortable: true,
      // Backend already returns total + paidAmount; the remaining balance
      // is the single most useful AR number and was previously hidden.
      render: (inv) => {
        const remaining = Number(inv.total || 0) - Number(inv.paidAmount || 0);
        return (
          <span className={remaining > 0 ? "text-status-warning-foreground font-medium tabular-nums" : "text-emerald-600 tabular-nums"}>
            {formatCurrency(remaining)}
          </span>
        );
      },
    },
    {
      key: "issueDate",
      header: "تاريخ الإصدار",
      sortable: true,
      render: (inv) => <span className="text-muted-foreground">{inv.issueDate ? formatDateAr(inv.issueDate) : "-"}</span>,
    },
    {
      key: "dueDate",
      header: "الاستحقاق",
      sortable: true,
      render: (inv) => <span className="text-muted-foreground">{inv.dueDate ? formatDateAr(inv.dueDate) : "-"}</span>,
    },
    {
      key: "createdByName",
      header: "المنشئ",
      sortable: true,
      // Resolved server-side from invoices.createdBy (an assignment id) via the
      // employee_assignments → employees join — control data for the audit.
      render: (inv) => <span className="text-muted-foreground text-xs">{inv.createdByName || "—"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (inv) => <PageStatusBadge status={inv.status} domain="invoice" />,
    },
    {
      key: "zatca",
      header: "هيئة الزكاة",
      // R.3 — zatca chip previously used a hand-rolled ternary ladder
      // of tailwind classes. Now sourced from STATUS_MAP.zatca via the
      // canonical PageStatusBadge; the lightning icon sits next to the
      // badge as a visual marker that this is the ZATCA column.
      render: (inv) =>
        inv.isTaxLinked ? (
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <PageStatusBadge status={inv.zatcaStatus || "pending"} domain="zatca" />
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (inv) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPreviewItem(inv); }}><Eye className="h-4 w-4" /></Button>
          <Button asChild variant="ghost" size="sm" title="عرض التفاصيل"><Link href={`/finance/invoices/${inv.id}`}><ExternalLink className="h-4 w-4 me-1" />عرض</Link></Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/finance/invoices/create?copy=${encodeURIComponent(JSON.stringify({ clientId: inv.clientId, description: inv.description, subtotal: inv.subtotal, vatRate: inv.vatRate, paymentTerms: inv.paymentTerms, notes: inv.notes }))}`);
            }}
            title="نسخ الفاتورة"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" title="نسخ الفاتورة"><Link href={`/finance/invoices/create?copyFrom=${inv.id}`}>
              <Copy className="h-3.5 w-3.5" />
            </Link></Button>
          <button onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === inv.id ? null : inv.id); }} className="text-muted-foreground hover:text-muted-foreground p-1">
            {expandedId === inv.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الفواتير"
      subtitle="إدارة فواتير العملاء، المتابعة، الاعتماد، والتكامل مع هيئة الزكاة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الفواتير" }]}
      loading={isLoading}
      actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/invoice-send-queue">
              <Send className="h-4 w-4 me-2" />قائمة الإرسال
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/ar-aging">
              <Clock className="h-4 w-4 me-2" />تقادم الذمم
            </Link></Button>
          <Link href="/finance/invoices/create">
            <GuardedButton perm="finance:create" size="sm"><Plus className="h-4 w-4 me-1" />فاتورة جديدة</GuardedButton>
          </Link>
          <PrintButton
            entityType="report_finance_invoices"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: {
                title: "قائمة الفواتير",
                total: printRows.length,
                totalRevenue: stats?.totalRevenue ?? 0,
                paidThisMonth: stats?.paidThisMonth ?? 0,
                pending: stats?.pendingAmount ?? 0,
                overdue: stats?.overdueAmount ?? 0,
              },
              items: printRows.map((i: any) => ({
                "رقم الفاتورة": i.invoiceNumber || i.ref || i.id,
                "العميل": i.clientName || "—",
                "تاريخ الإصدار": i.issueDate || "—",
                "تاريخ الاستحقاق": i.dueDate || "—",
                "الإجمالي": i.total ?? i.amount ?? 0,
                "الضريبة": i.vatAmount ?? 0,
                "المدفوع": i.paidAmount ?? 0,
                "المتبقي": Number(i.total ?? 0) - Number(i.paidAmount ?? 0),
                "الحالة": i.status || "—",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />
      <KpiGrid items={[
        { label: "إجمالي الإيرادات", value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "المدفوع هذا الشهر", value: formatCurrency(stats?.paidThisMonth || 0), icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "المعلقة", value: formatCurrency(stats?.pendingAmount || 0), icon: Receipt, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "المتأخرة", value: formatCurrency(stats?.overdueAmount || 0), icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الفاتورة أو العميل...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "pending_approval", label: "بانتظار الاعتماد" },
            { value: "partial", label: "جزئي" },
            { value: "paid", label: "مدفوعة" },
            { value: "overdue", label: "متأخرة" },
            { value: "cancelled", label: "ملغاة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(
          filteredWithBalance as any[],
          [
            { key: "ref", label: "رقم الفاتورة" },
            { key: "clientName", label: "العميل" },
            { key: "issueDate", label: "تاريخ الإصدار" },
            { key: "total", label: "الإجمالي" },
            { key: "vatAmount", label: "الضريبة" },
            { key: "paidAmount", label: "المدفوع" },
            { key: "outstanding", label: "المتبقّي" },
            { key: "dueDate", label: "الاستحقاق" },
            { key: "createdByName", label: "المنشئ" },
            { key: "status", label: "الحالة" },
          ], "الفواتير")}
        resultCount={filtered?.length}
      />
      <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />

      <BulkActionsBar
        entityType="invoice"
        items={filtered || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((filtered || []).map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["invoices"]]}
        csvColumns={[
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "createdByName", label: "المنشئ" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الفواتير"
        actions={["approve", "reject", "export", "delete"]}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filteredWithBalance}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير"
        emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
        rowClassName={(inv) => {
          if (selectedIds.has(inv.id)) return "bg-status-info-surface";
          if (inv.status === "overdue") return "bg-status-error-surface";
          return undefined;
        }}
        noToolbar
        onRowClick={(row) => navigate(`/finance/invoices/${row.id}`)}
        renderRowExtras={(inv) => {
          if (expandedId !== inv.id) return null;
          return (
            <div className="bg-surface-subtle/50 p-3">
              <div className="space-y-3">
                {inv.status === "draft" && (
                  <ApprovalActions
                    entityType="invoice"
                    entityId={inv.id}
                    approveEndpoint={`/finance/invoices/${inv.id}/approve`}
                    rejectEndpoint={`/finance/invoices/${inv.id}/reject`}
                    returnEndpoint={`/finance/invoices/${inv.id}/return`}
                    approveMethod="POST"
                    rejectMethod="PATCH"
                    returnMethod="PATCH"
                    approveBody={() => ({})}
                    rejectBody={(r) => ({ notes: r })}
                    returnBody={(r) => ({ notes: r })}
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
            </div>
          );
        }}
      />
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الفاتورة" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
