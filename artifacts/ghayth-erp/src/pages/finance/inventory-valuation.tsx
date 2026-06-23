import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, Boxes, Warehouse, Tags } from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * Inventory valuation report page — consumes #1033's
 * /reports/inventory-valuation endpoint.
 *
 * Σ (lot.quantity × lot.unitCost) over every ACTIVE qc-APPROVED lot,
 * with per-warehouse and per-category rollups. The number the
 * period-end balance-sheet Inventory line should match.
 */

interface ValuationRow {
  productId: number;
  sku: string | null;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  costingMethod: string | null;
  lastWaCost: number | null;
  onHandQty: number;
  lotCount: number;
  valuation: number;
  weightedAvgCost: number;
}

interface ValuationResponse {
  filters: { warehouseId?: string; categoryId?: string; productId?: string; includeZeroStock?: boolean };
  summary: {
    totalValuation: number;
    totalOnHandQty: number;
    totalLots: number;
    productRows: number;
  };
  byWarehouse: Array<{
    warehouseId: number; warehouseName: string | null; warehouseCode: string | null;
    valuation: number; onHandQty: number; productCount: number; lotCount: number;
  }>;
  byCategory: Array<{
    categoryId: number | null; categoryName: string | null;
    valuation: number; onHandQty: number; productCount: number;
  }>;
  data: ValuationRow[];
}

const COSTING_METHOD_LABELS: Record<string, string> = {
  fifo: "FIFO (الوارد أولاً)",
  lifo: "LIFO (الوارد أخيراً)",
  average: "متوسط مرجح",
  weighted_average: "متوسط مرجح",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: ValuationRow[], filename: string) {
  const headers = [
    "الرمز", "المنتج", "التصنيف", "المستودع",
    "كمية", "متوسط التكلفة", "آخر متوسط مرجح",
    "عدد التشغيلات", "القيمة الإجمالية",
  ];
  const out = rows.map((r) => [
    csvEscape(r.sku ?? ""),
    csvEscape(r.name),
    csvEscape(r.categoryName ?? ""),
    csvEscape(r.warehouseName ?? ""),
    r.onHandQty.toString(),
    r.weightedAvgCost.toFixed(2),
    (r.lastWaCost ?? 0).toFixed(2),
    r.lotCount.toString(),
    r.valuation.toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_inventory_valuation",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function InventoryValuationPage() {
  const [includeZeroStock, setIncludeZeroStock] = useState(false);

  const qs = includeZeroStock ? "?includeZeroStock=true" : "";
  const { data, isLoading, isError } = useApiQuery<ValuationResponse>(
    ["inventory-valuation", String(includeZeroStock)],
    `/finance/reports/inventory-valuation${qs}`,
  );

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<typeof rows[number]>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError || !data) return <ErrorState />;

  const { summary, byWarehouse, byCategory } = data;


  const productColumns: DataTableColumn<ValuationRow>[] = [
    {
      key: "sku", header: "الرمز", sortable: true, searchable: true,
      render: (r) => <span className="font-mono text-xs text-status-info-foreground">{r.sku ?? "—"}</span>,
    },
    {
      key: "name", header: "المنتج", sortable: true, searchable: true,
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "categoryName", header: "التصنيف",
      render: (r) => r.categoryName ? <Badge variant="outline">{r.categoryName}</Badge> : "—",
    },
    {
      key: "warehouseName", header: "المستودع",
      render: (r) => (
        <div className="text-xs">
          <p>{r.warehouseName ?? "—"}</p>
          {r.warehouseCode && <p className="text-muted-foreground font-mono">{r.warehouseCode}</p>}
        </div>
      ),
    },
    {
      key: "onHandQty", header: "الكمية", sortable: true,
      render: (r) => <span className="font-mono">{formatNumber(r.onHandQty)}</span>,
    },
    {
      key: "weightedAvgCost", header: "متوسط التكلفة", sortable: true,
      render: (r) => <span className="font-mono text-sm">{formatCurrency(r.weightedAvgCost)}</span>,
    },
    {
      key: "lotCount", header: "تشغيلات", sortable: true,
      render: (r) => r.lotCount,
    },
    {
      key: "valuation", header: "القيمة الإجمالية", sortable: true,
      className: "font-bold",
      render: (r) => <span className="text-emerald-700">{formatCurrency(r.valuation)}</span>,
    },
  ];

  const warehouseColumns: DataTableColumn<ValuationResponse["byWarehouse"][number]>[] = [
    { key: "warehouseName", header: "المستودع", sortable: true,
      render: (w) => (
        <div>
          <p className="font-medium text-sm">{w.warehouseName ?? "—"}</p>
          {w.warehouseCode && <p className="text-xs text-muted-foreground font-mono">{w.warehouseCode}</p>}
        </div>
      )},
    { key: "productCount", header: "أصناف", sortable: true, render: (w) => w.productCount },
    { key: "lotCount", header: "تشغيلات", sortable: true, render: (w) => w.lotCount },
    { key: "onHandQty", header: "إجمالي كمية", sortable: true,
      render: (w) => <span className="font-mono">{formatNumber(w.onHandQty)}</span> },
    { key: "valuation", header: "القيمة", sortable: true, className: "font-bold text-emerald-700",
      render: (w) => formatCurrency(w.valuation) },
  ];

  const categoryColumns: DataTableColumn<ValuationResponse["byCategory"][number]>[] = [
    { key: "categoryName", header: "التصنيف",
      render: (c) => c.categoryName ?? <span className="text-muted-foreground">بدون تصنيف</span> },
    { key: "productCount", header: "أصناف", sortable: true, render: (c) => c.productCount },
    { key: "onHandQty", header: "إجمالي كمية", sortable: true,
      render: (c) => <span className="font-mono">{formatNumber(c.onHandQty)}</span> },
    { key: "valuation", header: "القيمة", sortable: true, className: "font-bold text-emerald-700",
      render: (c) => formatCurrency(c.valuation) },
  ];

  return (
    <PageShell
      title="تقييم المخزون"
      subtitle="القيمة الحالية للمخزون المتوفر = Σ (الكمية × تكلفة الوحدة) — رقم بند المخزون في الميزانية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "تقييم المخزون" },
      ]}
      actions={
        <>
          <div className="flex items-center gap-2 me-2">
            <Switch
              id="includeZero"
              checked={includeZeroStock}
              onCheckedChange={setIncludeZeroStock}
            />
            <Label htmlFor="includeZero" className="text-xs">تضمين أصفار المخزون</Label>
          </div>
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(rows, `inventory-valuation-${todayLocal()}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_inventory_valuation"
            entityId={todayLocal()}
            payload={() => ({
              entity: {
                title: "تقييم المخزون",
                asOfDate: todayLocal(),
                totalValuation: printRows.reduce((s, r) => s + Number(r.valuation ?? 0), 0),
                productCount: printRows.length,
                includeZeroStock,
              },
              items: printRows.map((r) => ({
                "المنتج": r.name,
                "SKU": r.sku ?? "",
                "المستودع": r.warehouseName ?? "",
                "الكمية": Number(r.onHandQty ?? 0),
                "متوسط التكلفة": Number(r.weightedAvgCost ?? 0),
                "القيمة": Number(r.valuation ?? 0),
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Boxes className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي قيمة المخزون</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.totalValuation)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الكمية</p>
            <p className="text-xl font-bold mt-1">
              {formatNumber(summary.totalOnHandQty)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">عدد التشغيلات النشطة</p>
            <p className="text-xl font-bold mt-1">{formatNumber(summary.totalLots)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Tags className="h-5 w-5 text-status-info-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">عدد الأصناف</p>
            <p className="text-xl font-bold mt-1">{formatNumber(summary.productRows)}</p>
          </CardContent>
        </Card>
      </div>

      {/* By Warehouse */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-status-info-foreground" />
          حسب المستودع
        </h3>
        <DataTable
          columns={warehouseColumns} data={byWarehouse}
          emptyMessage="لا توجد مستودعات مرتبطة بمخزون نشط"
          noToolbar
        />
      </div>

      {/* By Category */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Tags className="h-4 w-4 text-status-info-foreground" />
          حسب التصنيف
        </h3>
        <DataTable
          columns={categoryColumns} data={byCategory}
          emptyMessage="لا توجد تصنيفات"
          noToolbar
        />
      </div>

      {/* Detail */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">
          تفصيل الأصناف ({rows.length})
        </h3>
        <DataTable
          columns={productColumns} data={rows}
          onSortedDataChange={setPrintRows}
          searchPlaceholder="بحث بالرمز أو اسم المنتج…"
          emptyMessage="لا يوجد مخزون نشط"
          pageSize={50}
        />
      </div>
    </PageShell>
  );
}
