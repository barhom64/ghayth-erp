import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, ArrowDownCircle, ArrowUpCircle, Wallet, ChevronDown, ChevronUp, ExternalLink, Paperclip } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  bank: "تحويل بنكي",
  check: "شيك",
  credit_card: "بطاقة ائتمان",
};

const OPERATION_LABELS: Record<string, string> = {
  receipt: "قبض إيراد",
  rent: "تحصيل إيجار",
  invoice_payment: "سداد فاتورة عميل",
  deposit: "إيداع ضمان",
  refund: "استرداد",
  payment: "صرف مبلغ",
  vendor_invoice: "سداد فاتورة مورد",
  salary: "صرف راتب",
  advance: "سلفة موظف",
  legal_fee: "أتعاب قانونية",
  purchase: "مشتريات",
  custody: "صرف عهدة",
  insurance: "سداد تأمين",
  maintenance: "دفع صيانة",
};

export default function VouchersPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["vouchers", scopeQueryString], `/finance/vouchers${scopeSuffix}`);
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref", "operationType"],
    dateField: "",
    extraFields: { type: "type" },
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (v) => <span className="font-mono text-blue-600 text-xs">{v.ref || `#${v.id}`}</span>,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (v) => <span className="text-gray-500 text-xs">{v.date ? formatDateAr(v.date) : "-"}</span>,
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (v) => (
        <Badge className={v.type === "receipt" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
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
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
            {OPERATION_LABELS[v.operationType] || v.operationType}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (v) => (
        <span className={`font-semibold ${v.type === "receipt" ? "text-green-600" : "text-red-600"}`}>
          {formatCurrency(v.amount)}
        </span>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (v) => <span className="text-gray-600 line-clamp-1 max-w-[220px]">{v.description || "-"}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className="bg-green-50 text-green-700">
          {v.status === "posted" ? "مسجل" : v.status || "مسجل"}
        </Badge>
      ),
    },
    {
      key: "_expand",
      header: "",
      width: "40px",
      render: (v) => (
        <button className="text-gray-400 hover:text-gray-600 p-1">
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
          <Button size="sm">
            <Plus className="h-4 w-4 me-1" />سند جديد
          </Button>
        </Link>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">إجمالي السندات</p><p className="text-xl font-bold">{formatNumber(items.length)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg"><ArrowDownCircle className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">سندات القبض</p><p className="text-xl font-bold text-green-600">{formatCurrency(totalReceipts)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg"><ArrowUpCircle className="h-5 w-5 text-red-600" /></div>
          <div><p className="text-xs text-gray-500">سندات الصرف</p><p className="text-xl font-bold text-red-600">{formatCurrency(totalPayments)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg"><Wallet className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-xs text-gray-500">الصافي</p><p className="text-xl font-bold">{formatCurrency(totalReceipts - totalPayments)}</p></div>
        </CardContent></Card>
      </div>

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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد سندات"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
        onRowClick={(v) => setExpandedId(expandedId === v.id ? null : v.id)}
        noToolbar
        renderRowExtras={(v) => {
          if (expandedId !== v.id) return null;
          return (
            <div className="p-4 bg-gray-50/50">
              <div className="bg-white p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">تفاصيل السند</h4>
                  <ExportButton endpoint={`/export/pdf/voucher/${v.id}`} filename={`voucher-${v.id}.pdf`} type="pdf" label="تصدير PDF" size="sm" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">التاريخ:</span>
                    <span className="block font-medium">{v.date ? formatDateAr(v.date) : "-"}</span>
                  </div>
                  {v.operationType && (
                    <div>
                      <span className="text-gray-500">نوع العملية:</span>
                      <span className="block font-medium">{OPERATION_LABELS[v.operationType] || v.operationType}</span>
                    </div>
                  )}
                  {v.paymentMethod && (
                    <div>
                      <span className="text-gray-500">طريقة الدفع:</span>
                      <span className="block font-medium">{PAYMENT_METHOD_LABELS[v.paymentMethod] || v.paymentMethod}</span>
                    </div>
                  )}
                  {v.reference && (
                    <div>
                      <span className="text-gray-500">رقم المرجع:</span>
                      <span className="block font-medium">{v.reference}</span>
                    </div>
                  )}
                  {v.relatedEntityType && (
                    <div>
                      <span className="text-gray-500">الجهة المرتبطة:</span>
                      <span className="block font-medium">{v.relatedEntityType} #{v.relatedEntityId}</span>
                    </div>
                  )}
                  {v.attachmentUrl && (
                    <div>
                      <span className="text-gray-500">المرفق:</span>
                      <a href={v.attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline mt-0.5">
                        <Paperclip className="h-3 w-3" />
                        {v.attachmentType || "عرض المرفق"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">المبلغ:</span>
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
