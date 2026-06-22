import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { Download, CheckCircle2, AlertTriangle, FileSearch } from "lucide-react";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
interface UnmappedRow {
  id: number;
  invoiceId?: number;
  orderId?: number;
  grnId?: number;
  description?: string;
  itemName?: string;
  lineTotal: number | string;
  invoiceRef?: string;
  orderRef?: string;
  grnRef?: string;
  status?: string;
  allocationStatus: string;
  createdAt: string | null;
}

interface UnmappedResponse {
  sections: Array<{ source: string; rows: UnmappedRow[] }>;
  summary: { totalCount: number };
}

const SECTION_LABEL: Record<string, string> = {
  invoice_lines: "بنود فواتير",
  purchase_order_items: "بنود أوامر شراء",
  goods_receipt_items: "بنود إيصالات استلام",
};

const SECTION_HINT: Record<string, string> = {
  invoice_lines:
    "بنود فواتير لم يتم توجيهها إلى حساب إيرادات / تكلفة محدد. تظل خارج تحليل الإيرادات حتى الـ allocation.",
  purchase_order_items:
    "بنود أوامر شراء لم يتم توجيهها إلى حساب مصروف / أصل. تأثيرها على الـ commitments و AP report محدود حتى الـ allocation.",
  goods_receipt_items:
    "بنود إيصالات استلام لم يتم توجيهها — قد تظل القيمة في GR/IR holding بدون نقلها لحساب المخزون / المصروف المستهدف.",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(sections: UnmappedResponse["sections"], filename: string) {
  const headers = ["القسم", "معرف البند", "المرجع", "البيان", "المبلغ", "حالة المصدر", "تاريخ الإنشاء"];
  const rows: string[][] = [];
  for (const sec of sections) {
    for (const r of sec.rows) {
      rows.push([
        csvEscape(SECTION_LABEL[sec.source] ?? sec.source),
        String(r.id),
        csvEscape(r.invoiceRef ?? r.orderRef ?? r.grnRef ?? ""),
        csvEscape(r.description ?? r.itemName ?? ""),
        Number(r.lineTotal).toFixed(2),
        csvEscape(r.status ?? ""),
        csvEscape(r.createdAt ?? ""),
      ]);
    }
  }
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_unmapped_lines",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: rows.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

function entityLink(source: string, row: UnmappedRow) {
  if (source === "invoice_lines" && row.invoiceId) {
    return (
      <Link href={`/finance/invoices/${row.invoiceId}`}
        className="font-mono text-xs text-status-info-foreground hover:underline">
        {row.invoiceRef || `#${row.invoiceId}`}
      </Link>
    );
  }
  if (source === "purchase_order_items" && row.orderId) {
    return (
      <Link href={`/finance/purchase-orders/${row.orderId}`}
        className="font-mono text-xs text-status-info-foreground hover:underline">
        {row.orderRef || `#${row.orderId}`}
      </Link>
    );
  }
  return (
    <span className="font-mono text-xs">
      {row.grnRef || `#${row.id}`}
    </span>
  );
}

export default function UnmappedLinesPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<UnmappedResponse>(
    ["unmapped-lines"], "/finance/reports/unmapped-lines",
  );

  // Search filters the PRIMARY (first non-empty) section's rows. Hook runs
  // before the early returns below.
  const [filters, setFilters] = useFilters();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const nonEmptySections = data.sections.filter((s) => s.rows.length > 0);
  const isClean = data.summary.totalCount === 0;
  const primarySource = nonEmptySections[0]?.source ?? null;

  const renderSection = (section: { source: string; rows: UnmappedRow[] }) => {
    const isPrimary = primarySource !== null && section.source === primarySource;
    // The primary section is searchable; its table renders the filtered set.
    const tableRows = isPrimary
      ? applyFilters(section.rows, filters, {
          searchFields: ["invoiceRef", "orderRef", "grnRef", "description", "itemName"],
        })
      : section.rows;
    const cols: DataTableColumn<UnmappedRow>[] = [
      { key: "ref", header: "المرجع", render: (r) => entityLink(section.source, r) },
      { key: "description", header: "البيان",
        render: (r) => <span className="text-xs">{r.description ?? r.itemName ?? "—"}</span> },
      { key: "lineTotal", header: "المبلغ",
        render: (r) => <span className="font-mono">{formatCurrency(Number(r.lineTotal))}</span> },
      { key: "status", header: "حالة المصدر",
        render: (r) => <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge> },
      { key: "createdAt", header: "تاريخ الإنشاء",
        render: (r) => <span className="text-xs text-muted-foreground">{r.createdAt?.slice(0, 10) ?? "—"}</span> },
    ];

    return (
      <Card key={section.source} className="border-status-warning-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-status-warning-foreground" />
              {SECTION_LABEL[section.source] ?? section.source}
            </span>
            <Badge className="bg-amber-100 text-status-warning-foreground">{section.rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground bg-status-warning-surface/50 border border-status-warning-surface rounded p-2">
            ⓘ {SECTION_HINT[section.source] ?? ""}
          </p>
          {isPrimary && (
            <AdvancedFilters
              config={{ searchPlaceholder: "بحث بالمرجع أو البيان…", showDateRange: false }}
              values={filters}
              onChange={setFilters}
              resultCount={tableRows.length}
            />
          )}
          <DataTable columns={cols} data={tableRows}
            emptyMessage="—" pageSize={50} noToolbar />
        </CardContent>
      </Card>
    );
  };

  return (
    <PageShell
      title="البنود غير المُوجَّهة (قبل الإقفال)"
      subtitle="كل سطر مفتوح بحاجة إلى توجيه (allocation) قبل إغلاق الفترة المالية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "البنود غير المُوجَّهة" },
      ]}
      actions={
        nonEmptySections.length > 0 ? (
          <>
            <GuardedButton
              perm="finance:export" variant="outline" size="sm"
              onClick={() => exportCSV(data.sections, `unmapped-lines-${todayLocal()}.csv`)}
            >
              <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
            </GuardedButton>
            <PrintButton
              entityType="report_unmapped_lines"
              entityId={todayLocal()}
              payload={{
                entity: {
                  title: "البنود غير المُوجَّهة (بدون GL mapping)",
                  asOfDate: todayLocal(),
                  sectionCount: nonEmptySections.length,
                },
                items: data.sections.flatMap((s: any) => (s.rows ?? []).map((r: any) => ({
                  "القسم": s.label ?? s.key,
                  ...r,
                }))),
              }}
            />
          </>
        ) : null
      }
    >
      <FinanceTabsNav />
      <Card className={isClean
        ? "border-emerald-300 bg-emerald-50/40"
        : "border-amber-400 bg-status-warning-surface/40"}>
        <CardContent className="p-4 flex items-start gap-3">
          {isClean
            ? <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-status-warning-foreground mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className={`font-bold ${isClean ? "text-emerald-700" : "text-status-warning-foreground"}`}>
              {isClean
                ? "كل البنود مُوجَّهة — تقدر تقفل الفترة بأمان."
                : `يوجد ${formatNumber(data.summary.totalCount)} بند غير مُوجَّه عبر ${nonEmptySections.length} مصدر`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isClean
                ? "كل بنود الفواتير + أوامر الشراء + إيصالات الاستلام لها allocation محدد لحساب GL."
                : "اضغط على رابط المرجع للذهاب لكيان المصدر وتوجيه البنود فيه. أعد فتح الصفحة بعد كل إصلاح."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button onClick={() => refetch()} variant="outline" size="sm" rateLimitAware>
          إعادة الفحص
        </Button>
      </div>

      {!isClean && (
        <div className="mt-6 space-y-4">
          {nonEmptySections.map(renderSection)}
        </div>
      )}
    </PageShell>
  );
}
