import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Receipt, DollarSign, AlertTriangle, CheckCircle, Eye, ExternalLink, ChevronDown, ChevronUp, Copy, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { CollectionStages } from "@/components/shared/entity-timeline";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

export default function InvoicesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [filters, setFilters] = useFilters();
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
      render: (inv) => <span className="font-mono text-blue-600">{inv.ref || `#${inv.id}`}</span>,
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
      key: "paidAmount",
      header: "المدفوع",
      sortable: true,
      render: (inv) => <span className="text-emerald-600">{formatCurrency(Number(inv.paidAmount || 0))}</span>,
    },
    {
      key: "dueDate",
      header: "الاستحقاق",
      sortable: true,
      render: (inv) => <span className="text-gray-500">{inv.dueDate ? formatDateAr(inv.dueDate) : "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (inv) => <StatusBadge status={inv.status} />,
    },
    {
      key: "zatca",
      header: "هيئة الزكاة",
      render: (inv) => inv.isTaxLinked ? (
        <Badge className={`text-xs gap-1 ${inv.zatcaStatus === "accepted" ? "bg-green-100 text-green-700" : (inv.zatcaStatus === "rejected" || inv.zatcaStatus === "error") ? "bg-red-100 text-red-700" : inv.zatcaStatus === "submitted" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>
          <Zap className="h-3 w-3" />
          {inv.zatcaStatus === "accepted" ? "مقبولة" : inv.zatcaStatus === "rejected" ? "مرفوضة" : inv.zatcaStatus === "error" ? "خطأ" : inv.zatcaStatus === "submitted" ? "مرسلة" : "معلقة"}
        </Badge>
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
          <Link href={`/finance/invoices/${inv.id}`}>
            <Button variant="ghost" size="sm" title="عرض التفاصيل"><ExternalLink className="h-4 w-4 me-1" />عرض</Button>
          </Link>
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
          <Link href={`/finance/invoices/create?copyFrom=${inv.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-500" title="نسخ الفاتورة">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === inv.id ? null : inv.id); }} className="text-gray-400 hover:text-gray-600 p-1">
            {expandedId === inv.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
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
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "رقم الفاتورة" },
          { key: "clientName", label: "العميل" },
          { key: "total", label: "الإجمالي" },
          { key: "paidAmount", label: "المدفوع" },
          { key: "dueDate", label: "الاستحقاق" },
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
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الفواتير"
        actions={["approve", "reject", "export", "delete"]}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد فواتير"
        emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
        rowClassName={(inv) => selectedIds.has(inv.id) ? "bg-blue-50/50" : undefined}
        noToolbar
        renderRowExtras={(inv) => {
          if (expandedId !== inv.id) return null;
          return (
            <div className="bg-gray-50/50 p-3">
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
            </div>
          );
        }}
      />
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الفاتورة" data={previewItem} fields={previewFields} />
    </div>
  );
}
