import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, RefreshCw, Calendar, Layers } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * Inventory turnover ratio — consumes #1036's
 * /reports/inventory-turnover endpoint.
 *
 *   turnover     = period COGS / inventory value at end of period
 *   daysOnHand   = period days / turnover (DSI proxy)
 *
 * Operators spot dead-stock (turnover < 1) and over-stocked
 * best-sellers (high turnover → frequent reorders).
 */

interface TurnoverRow {
  productId: number;
  sku: string | null;
  name: string;
  warehouseId: number | null;
  warehouseName: string | null;
  onHandQty: number;
  currentValue: number;
  periodCogs: number;
  turnover: number | null;
  daysOnHand: number | null;
}

interface TurnoverResponse {
  filters: { startDate?: string; endDate?: string; productId?: string; warehouseId?: string };
  period: { days: number | null };
  summary: {
    totalCurrentValue: number;
    totalPeriodCogs: number;
    overallTurnover: number | null;
    overallDaysOnHand: number | null;
    productCount: number;
  };
  data: TurnoverRow[];
}

function startOfMonthLocal() {
  const t = todayLocal();
  return `${t.slice(0, 8)}01`;
}

const turnoverColor = (t: number | null) =>
  t == null ? "text-muted-foreground"
  : t >= 4 ? "text-emerald-700"      // أكثر من 4× سنوياً = جيد
  : t >= 2 ? "text-status-warning-foreground"
  : t >= 1 ? "text-orange-600"
  : "text-destructive";              // dead-stock

const turnoverBadge = (t: number | null) => {
  if (t == null) return null;
  if (t >= 4) return <Badge className="bg-status-success-surface text-status-success-foreground">سريع</Badge>;
  if (t >= 2) return <Badge className="bg-status-warning-surface text-status-warning-foreground">متوسط</Badge>;
  if (t >= 1) return <Badge className="bg-orange-100 text-orange-700">بطيء</Badge>;
  return <Badge variant="destructive">جامد</Badge>;
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: TurnoverRow[], filename: string) {
  const headers = [
    "الرمز", "المنتج", "المستودع",
    "كمية حالية", "قيمة حالية", "COGS الفترة",
    "معدل الدوران", "أيام التخزين",
  ];
  const out = rows.map((r) => [
    csvEscape(r.sku ?? ""),
    csvEscape(r.name),
    csvEscape(r.warehouseName ?? ""),
    r.onHandQty.toString(),
    r.currentValue.toFixed(2),
    r.periodCogs.toFixed(2),
    r.turnover == null ? "—" : r.turnover.toFixed(2),
    r.daysOnHand == null ? "—" : r.daysOnHand.toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_inventory_turnover",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function InventoryTurnoverPage() {
  const [startDate, setStartDate] = useState(startOfMonthLocal());
  const [endDate, setEndDate] = useState(todayLocal());

  const { data, isLoading, isError } = useApiQuery<TurnoverResponse>(
    ["inventory-turnover", startDate, endDate],
    `/finance/reports/inventory-turnover?startDate=${startDate}&endDate=${endDate}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { period, summary, data: rows } = data;

  const columns: DataTableColumn<TurnoverRow>[] = [
    {
      key: "sku", header: "الرمز",
      render: (r) => <span className="font-mono text-xs text-status-info-foreground">{r.sku ?? "—"}</span>,
    },
    {
      key: "name", header: "المنتج",
      render: (r) => <span className="font-medium text-sm">{r.name}</span>,
    },
    {
      key: "warehouseName", header: "المستودع",
      render: (r) => <span className="text-xs">{r.warehouseName ?? "—"}</span>,
    },
    {
      key: "onHandQty", header: "كمية حالية", sortable: true,
      render: (r) => <span className="font-mono">{formatNumber(r.onHandQty)}</span>,
    },
    {
      key: "currentValue", header: "قيمة المخزون", sortable: true,
      render: (r) => <span className="text-emerald-700">{formatCurrency(r.currentValue)}</span>,
    },
    {
      key: "periodCogs", header: "تكلفة البضاعة المباعة", sortable: true,
      render: (r) => <span className="text-orange-700">{formatCurrency(r.periodCogs)}</span>,
    },
    {
      key: "turnover", header: "معدل الدوران", sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold ${turnoverColor(r.turnover)}`}>
            {r.turnover == null ? "—" : r.turnover.toFixed(2) + "×"}
          </span>
          {turnoverBadge(r.turnover)}
        </div>
      ),
    },
    {
      key: "daysOnHand", header: "أيام تخزين", sortable: true,
      render: (r) => (
        <span className="font-mono text-sm">
          {r.daysOnHand == null ? "—" : `${r.daysOnHand.toFixed(0)} يوم`}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title="معدل دوران المخزون"
      subtitle="معدل الدوران = تكلفة البضاعة المباعة (COGS) للفترة / قيمة المخزون الحالية — لرصد المنتجات السريعة والمنتجات الجامدة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "معدل الدوران" },
      ]}
      actions={
        <>
          <DatePicker value={startDate} onChange={setStartDate} className="w-44" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-44" placeholder="إلى" />
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(rows, `inventory-turnover-${startDate}-${endDate}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_inventory_turnover"
            entityId={`${startDate}..${endDate}`}
            payload={{
              entity: {
                title: "تقرير معدّل دوران المخزون",
                startDate, endDate,
                count: rows.length,
              },
              items: rows,
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <Layers className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">قيمة المخزون الحالية</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.totalCurrentValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">COGS الفترة</p>
            <p className="text-xl font-bold text-orange-700 mt-1">
              {formatCurrency(summary.totalPeriodCogs)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <RefreshCw className="h-5 w-5 text-status-warning-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">معدل الدوران الإجمالي</p>
            <p className={`text-xl font-bold mt-1 ${turnoverColor(summary.overallTurnover)}`}>
              {summary.overallTurnover == null ? "—" : `${summary.overallTurnover.toFixed(2)}×`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 text-status-info-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">أيام التخزين</p>
            <p className="text-xl font-bold mt-1">
              {summary.overallDaysOnHand == null ? "—" : `${summary.overallDaysOnHand.toFixed(0)} يوم`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">طول الفترة</p>
            <p className="text-xl font-bold mt-1">
              {period.days == null ? "—" : `${formatNumber(period.days)} يوم`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card className="mt-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-4 text-xs">
          <span className="text-muted-foreground">دليل معدل الدوران:</span>
          <span className="flex items-center gap-1">
            <Badge className="bg-status-success-surface text-status-success-foreground">سريع</Badge>
            <span className="text-muted-foreground">≥ 4× سنوياً</span>
          </span>
          <span className="flex items-center gap-1">
            <Badge className="bg-status-warning-surface text-status-warning-foreground">متوسط</Badge>
            <span className="text-muted-foreground">2× — 4×</span>
          </span>
          <span className="flex items-center gap-1">
            <Badge className="bg-orange-100 text-orange-700">بطيء</Badge>
            <span className="text-muted-foreground">1× — 2×</span>
          </span>
          <span className="flex items-center gap-1">
            <Badge variant="destructive">جامد</Badge>
            <span className="text-muted-foreground">&lt; 1× (تخفيض / إيقاف إعادة طلب)</span>
          </span>
        </CardContent>
      </Card>

      {/* Detail */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">المنتجات ({rows.length}) — مرتبة من الأسرع للأبطأ</h3>
        <DataTable
          columns={columns} data={rows}
          emptyMessage="لا توجد منتجات بمخزون نشط"
          pageSize={50}
        />
      </div>
    </PageShell>
  );
}
