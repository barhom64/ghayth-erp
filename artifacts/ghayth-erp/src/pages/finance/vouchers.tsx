import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  PageShell,
} from "@workspace/ui-core";
import { Plus, FileText, ArrowDownCircle, ArrowUpCircle, Wallet, ChevronDown, ChevronUp, ExternalLink, Paperclip, Calendar } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

import { PAYMENT_METHODS, VOUCHER_OPERATIONS } from "@/lib/finance-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";


export default function VouchersPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["vouchers", scopeQueryString], `/finance/vouchers${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref", "operationType"],
    dateField: "",
    extraFields: { type: "type" },
  });

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
      header: "المرجع",
      sortable: true,
      render: (v) => <span className="font-mono text-status-info-foreground text-xs">{v.ref || `#${v.id}`}</span>,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (v) => <span className="text-muted-foreground text-xs">{v.date ? formatDateAr(v.date) : "-"}</span>,
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (v) => (
        <Badge className={v.type === "receipt" ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
          {v.type === "receipt" ? "سند قبض" : "سند صرف"}
        </Badge>
      ),
    },
    {
      key: "operationType",
      header: "العملية",
      sortable: true,
      render: (v) =>
        v.operationType ? (
          <span className="px-2 py-0.5 rounded bg-status-info-surface text-status-info-foreground text-xs">
            {VOUCHER_OPERATIONS[v.operationType] || v.operationType}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (v) => (
        <span className={`font-semibold ${v.type === "receipt" ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
          {formatCurrency(v.amount)}
        </span>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (v) => <span className="text-muted-foreground line-clamp-1 max-w-[220px]">{v.description || "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => <PageStatusBadge status={v.status || "posted"} domain="journal" />,
    },
    {
      key: "_expand",
      header: "",
      width: "40px",
      render: (v) => (
        <button className="text-muted-foreground hover:text-muted-foreground p-1">
          {expandedId === v.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ),
    },
  ];

  const receipts = items.filter((v: any) => v.type === "receipt");
  const payments = items.filter((v: any) => v.type === "payment");
  const totalReceipts = receipts.reduce((s: number, v: any) => s + Number(v.amount || 0), 0);
  const totalPayments = payments.reduce((s: number, v: any) => s + Number(v.amount || 0), 0);

  return (
    <PageShell
      title="السندات"
      subtitle="توثيق حركات النقد (قبض وصرف) — السندات تختلف عن المصروفات المرتبطة بالميزانية"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "السندات" }]}
      loading={isLoading}
      actions={
        <Link href="/finance/vouchers/create">
          <GuardedButton perm="finance:create" size="sm">
            <Plus className="h-4 w-4 me-1" />سند جديد
          </GuardedButton>
        </Link>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي السندات", value: formatNumber(items.length), icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "هذا الشهر", value: formatNumber(items.filter((v: any) => { const d = new Date(v.date); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length), icon: Calendar, color: "text-orange-600 bg-orange-50" },
        { label: "سندات القبض", value: formatCurrency(totalReceipts), icon: ArrowDownCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "سندات الصرف", value: formatCurrency(totalPayments), icon: ArrowUpCircle, color: "text-status-error-foreground bg-status-error-surface" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو المرجع أو نوع العملية...",
          extraFilters: [
            {
              key: "type",
              label: "النوع",
              options: [
                { value: "receipt", label: "سند قبض" },
                { value: "payment", label: "سند صرف" },
              ],
            },
          ],
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "posted", label: "مسجل" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((filtered || []) as any[], [
          { key: "ref", label: "المرجع" },
          { key: "type", label: "النوع" },
          { key: "amount", label: "المبلغ" },
          { key: "description", label: "الوصف" },
          { key: "operationType", label: "نوع العملية" },
          { key: "paymentMethod", label: "طريقة الدفع" },
          { key: "date", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "السندات")}
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="voucher"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["vouchers"]]}
        actions={["export"]}
        csvColumns={[
          { key: "ref", label: "المرجع" },
          { key: "type", label: "النوع" },
          { key: "amount", label: "المبلغ" },
          { key: "description", label: "الوصف" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="السندات"
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد سندات"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
        onRowClick={(v) => navigate(`/finance/vouchers/${v.id}`)}
        noToolbar
        renderRowExtras={(v) => {
          if (expandedId !== v.id) return null;
          return (
            <div className="p-4 bg-surface-subtle/50">
              <div className="bg-white p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">تفاصيل السند</h4>
                  <ExportButton endpoint={`/export/pdf/voucher/${v.id}`} filename={`voucher-${v.id}.pdf`} type="pdf" label="تصدير PDF" size="sm" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">التاريخ:</span>
                    <span className="block font-medium">{v.date ? formatDateAr(v.date) : "-"}</span>
                  </div>
                  {v.operationType && (
                    <div>
                      <span className="text-muted-foreground">نوع العملية:</span>
                      <span className="block font-medium">{VOUCHER_OPERATIONS[v.operationType] || v.operationType}</span>
                    </div>
                  )}
                  {v.paymentMethod && (
                    <div>
                      <span className="text-muted-foreground">طريقة الدفع:</span>
                      <span className="block font-medium">{PAYMENT_METHODS[v.paymentMethod] || v.paymentMethod}</span>
                    </div>
                  )}
                  {v.reference && (
                    <div>
                      <span className="text-muted-foreground">رقم المرجع:</span>
                      <span className="block font-medium">{v.reference}</span>
                    </div>
                  )}
                  {v.relatedEntityType && (
                    <div>
                      <span className="text-muted-foreground">الجهة المرتبطة:</span>
                      <span className="block font-medium">{v.relatedEntityType} #{v.relatedEntityId}</span>
                    </div>
                  )}
                  {v.attachmentUrl && (
                    <div>
                      <span className="text-muted-foreground">المرفق:</span>
                      <a href={v.attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-status-info-foreground hover:underline mt-0.5">
                        <Paperclip className="h-3 w-3" />
                        {v.attachmentType || "عرض المرفق"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">المبلغ:</span>
                    <span className="block font-medium">{formatCurrency(v.amount)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      />
    </PageShell>
  );
}
