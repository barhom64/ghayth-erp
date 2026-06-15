import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh, todayLocal } from "@/lib/formatters";
import { Download, Receipt } from "lucide-react";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
interface DetailRow {
  allocationId: number;
  journalEntryId: number;
  journalRef: string | null;
  postingDate: string | null;
  obligationType: string;
  obligationId: number;
  amount: number | string;
  whtAmount: number | string;
  whtRate: number | string | null;
  whtCategory: string | null;
  whtCategoryName: string | null;
  whtCategoryAppliesTo: string | null;
  supplierId: number | null;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  supplierResidencyStatus: string | null;
  supplierTaxResidenceCountry: string | null;
}

interface ByCategoryRow {
  category: string;
  categoryName: string | null;
  appliesTo: string | null;
  wht: number;
  gross: number;
  net: number;
  rows: number;
}

interface BySupplierRow {
  supplierId: number;
  supplierName: string | null;
  taxNumber: string | null;
  residencyStatus: string | null;
  taxResidenceCountry: string | null;
  wht: number;
  gross: number;
  net: number;
  rows: number;
}

interface WhtSummaryResponse {
  filters: { startDate?: string; endDate?: string; supplierId?: string; category?: string };
  summary: { totalWht: number; totalNet: number; totalGross: number; rowCount: number };
  byCategory: ByCategoryRow[];
  bySupplier: BySupplierRow[];
  data: DetailRow[];
}

const RESIDENCY_LABEL: Record<string, string> = {
  resident: "مقيم",
  non_resident_gcc: "غير مقيم — خليج",
  non_resident_treaty: "غير مقيم — معاهدة",
  non_resident_other: "غير مقيم — أخرى",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportDetailCSV(rows: DetailRow[], filename: string) {
  const headers = [
    "معرف", "قيد", "تاريخ القيد", "المورد", "بلد الإقامة", "حالة الإقامة",
    "الفئة", "النسبة", "الإجمالي", "المُستقطع", "الصافي للمورد",
  ];
  const out = rows.map((r) => [
    String(r.allocationId),
    csvEscape(r.journalRef ?? ""),
    csvEscape((r.postingDate ?? "").slice(0, 10)),
    csvEscape(r.supplierName ?? ""),
    csvEscape(r.supplierTaxResidenceCountry ?? ""),
    csvEscape(r.supplierResidencyStatus ?? ""),
    csvEscape(r.whtCategoryName ?? r.whtCategory ?? ""),
    (Number(r.whtRate ?? 0)).toFixed(2),
    (Number(r.amount ?? 0) + Number(r.whtAmount ?? 0)).toFixed(2),
    Number(r.whtAmount ?? 0).toFixed(2),
    Number(r.amount ?? 0).toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_wht_summary",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function WhtSummaryPage() {
  const [startDate, setStartDate] = useState(
    () => `${currentYearRiyadh()}-${currentMonthPaddedRiyadh()}-01`,
  );
  const [endDate, setEndDate] = useState(todayLocal());

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  const { data, isLoading, isError, refetch } = useApiQuery<WhtSummaryResponse>(
    ["wht-summary", startDate, endDate],
    `/finance/reports/wht-summary${dateParams ? `?${dateParams}` : ""}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, byCategory, bySupplier, data: rows } = data;

  const categoryCols: DataTableColumn<ByCategoryRow>[] = [
    { key: "category", header: "الرمز", render: (r) => <span className="font-mono text-xs">{r.category}</span> },
    { key: "categoryName", header: "الاسم",
      render: (r) => r.categoryName ?? <span className="italic text-muted-foreground">— غير مصنف —</span> },
    { key: "rows", header: "عدد السطور", render: (r) => <span className="font-mono">{r.rows}</span> },
    { key: "net", header: "الصافي للمورد",
      render: (r) => <span className="font-mono">{formatCurrency(r.net)}</span> },
    { key: "wht", header: "المُستقطع",
      render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(r.wht)}</span> },
    { key: "gross", header: "الإجمالي قبل الاستقطاع",
      render: (r) => <span className="font-mono">{formatCurrency(r.gross)}</span> },
  ];

  const supplierCols: DataTableColumn<BySupplierRow>[] = [
    { key: "supplierName", header: "المورد",
      render: (r) => r.supplierName ?? <span className="italic text-muted-foreground">— غير محدد —</span> },
    { key: "taxNumber", header: "الرقم الضريبي",
      render: (r) => <span className="font-mono text-xs">{r.taxNumber ?? "—"}</span> },
    { key: "taxResidenceCountry", header: "بلد الإقامة",
      render: (r) => <span className="font-mono text-xs">{r.taxResidenceCountry ?? "—"}</span> },
    { key: "residencyStatus", header: "الحالة",
      render: (r) => <Badge variant="outline" className="text-xs">{RESIDENCY_LABEL[r.residencyStatus ?? ""] ?? r.residencyStatus ?? "—"}</Badge> },
    { key: "rows", header: "دفعات", render: (r) => <span className="font-mono">{r.rows}</span> },
    { key: "wht", header: "المُستقطع",
      render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(r.wht)}</span> },
    { key: "net", header: "الصافي",
      render: (r) => <span className="font-mono">{formatCurrency(r.net)}</span> },
  ];

  const detailCols: DataTableColumn<DetailRow>[] = [
    { key: "postingDate", header: "تاريخ القيد",
      render: (r) => <span className="text-xs">{r.postingDate?.slice(0, 10) ?? "—"}</span> },
    { key: "journalRef", header: "القيد",
      render: (r) => <span className="font-mono text-xs">{r.journalRef ?? `#${r.journalEntryId}`}</span> },
    { key: "supplierName", header: "المورد",
      render: (r) => r.supplierName ?? <span className="italic text-muted-foreground">—</span> },
    { key: "whtCategory", header: "الفئة",
      render: (r) => <span className="font-mono text-xs">{r.whtCategory ?? "—"}</span> },
    { key: "whtRate", header: "النسبة %",
      render: (r) => <span className="font-mono text-xs">{Number(r.whtRate ?? 0).toFixed(2)}%</span> },
    { key: "amount", header: "الصافي للمورد",
      render: (r) => <span className="font-mono">{formatCurrency(Number(r.amount))}</span> },
    { key: "whtAmount", header: "المُستقطع",
      render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(Number(r.whtAmount))}</span> },
  ];

  return (
    <PageShell
      title="ملخص استقطاع ضريبة الدخل (WHT)"
      subtitle={`الفترة: ${startDate} → ${endDate} — لاستخدامه في إقرار زاتكا الشهري`}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "ملخص الاستقطاع" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportDetailCSV(rows, `wht-summary-${startDate}-to-${endDate}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_wht_summary"
            entityId={`${startDate ?? ""}..${endDate ?? ""}`}
           
          />
        </div>
      }
    >
      <FinanceTabsNav />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-3 flex flex-col gap-2">
          <DateRangePresets
            value={{ from: startDate, to: endDate }}
            onChange={(r) => { setStartDate(r.from); setEndDate(r.to); }}
            testidPrefix="wht-summary-preset"
            hideAllTime
          />
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Receipt className="h-3 w-3" /> إجمالي المُستقطع
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatCurrency(summary.totalWht)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">لإقرار زاتكا</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المدفوع للموردين</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(summary.totalNet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">الإجمالي قبل الاستقطاع</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(summary.totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد الدفعات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(summary.rowCount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تقسيم حسب فئة الاستقطاع</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={categoryCols} data={byCategory}
            pageSize={25} noToolbar searchPlaceholder={null}
            emptyMessage="لا توجد فئات استقطاع في الفترة"
          />
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تقسيم حسب المورد</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={supplierCols} data={bySupplier}
            pageSize={25} noToolbar searchPlaceholder={null}
            emptyMessage="لا توجد دفعات في الفترة"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل الدفعات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={detailCols} data={rows}
            pageSize={50}
            emptyMessage="لا توجد دفعات استقطاع في الفترة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
