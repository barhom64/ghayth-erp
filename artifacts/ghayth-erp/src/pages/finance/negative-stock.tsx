import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, AlertTriangle, ShieldAlert } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * Negative stock outliers — consumes #1035's
 * /reports/negative-stock. Lot.quantity < 0 should NEVER happen;
 * when it does, ops needs to investigate + correct before the
 * period-end valuation report misrepresents the inventory asset.
 */

interface NegRow {
  lotId: number;
  productId: number;
  sku: string | null;
  productName: string | null;
  warehouseId: number;
  warehouseName: string | null;
  warehouseCode: string | null;
  lotNumber: string;
  quantity: number;
  originalQuantity: number;
  unitCost: number;
  receivedDate: string;
  status: string;
  deficitValue: number;
  latestMovementAt: string | null;
  latestMovementType: string | null;
  latestJournalEntryId: number | null;
}

interface NegResponse {
  filters: { warehouseId?: string; productId?: string };
  summary: { lotCount: number; totalDeficitValue: number };
  byWarehouse: Array<{
    warehouseId: number; warehouseName: string | null; warehouseCode: string | null;
    lotCount: number; deficitValue: number;
  }>;
  data: NegRow[];
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: NegRow[], filename: string) {
  const headers = [
    "تشغيلة", "الرمز", "المنتج", "المستودع",
    "كمية حالية", "كمية أصلية", "تكلفة الوحدة", "قيمة العجز",
    "تاريخ آخر حركة", "نوع آخر حركة", "قيد آخر حركة",
  ];
  const out = rows.map((r) => [
    csvEscape(r.lotNumber),
    csvEscape(r.sku ?? ""),
    csvEscape(r.productName ?? ""),
    csvEscape(r.warehouseName ?? ""),
    r.quantity.toString(),
    r.originalQuantity.toString(),
    r.unitCost.toFixed(2),
    r.deficitValue.toFixed(2),
    csvEscape(r.latestMovementAt ?? ""),
    csvEscape(r.latestMovementType ?? ""),
    csvEscape(String(r.latestJournalEntryId ?? "")),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_negative_stock",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function NegativeStockPage() {
  const { data, isLoading, isError } = useApiQuery<NegResponse>(
    ["negative-stock"],
    `/finance/reports/negative-stock`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, byWarehouse, data: rows } = data;
  const isClean = summary.lotCount === 0;

  const columns: DataTableColumn<NegRow>[] = [
    {
      key: "quantity", header: "كمية حالية", sortable: true,
      render: (r) => (
        <Badge className="bg-destructive text-destructive-foreground font-mono">
          {formatNumber(r.quantity)}
        </Badge>
      ),
    },
    {
      key: "sku", header: "المنتج", searchable: true,
      render: (r) => (
        <div>
          <p className="font-mono text-xs text-status-info-foreground">{r.sku ?? "—"}</p>
          <p className="font-medium text-sm">{r.productName ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "lotNumber", header: "التشغيلة", searchable: true,
      render: (r) => <span className="font-mono text-xs">{r.lotNumber}</span>,
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
      key: "originalQuantity", header: "كمية أصلية",
      render: (r) => <span className="font-mono text-muted-foreground">{formatNumber(r.originalQuantity)}</span>,
    },
    {
      key: "unitCost", header: "تكلفة الوحدة",
      render: (r) => <span className="font-mono text-sm">{formatCurrency(r.unitCost)}</span>,
    },
    {
      key: "deficitValue", header: "قيمة العجز", sortable: true,
      className: "font-bold",
      render: (r) => <span className="text-destructive">{formatCurrency(r.deficitValue)}</span>,
    },
    {
      key: "latestMovementType", header: "آخر حركة",
      render: (r) => (
        <div className="text-xs">
          {r.latestMovementType && <Badge variant="outline">{r.latestMovementType}</Badge>}
          {r.latestMovementAt && (
            <p className="text-muted-foreground mt-1">{r.latestMovementAt.slice(0, 10)}</p>
          )}
        </div>
      ),
    },
    {
      key: "latestJournalEntryId", header: "القيد",
      render: (r) =>
        r.latestJournalEntryId
          ? (
            <Link
              href={`/finance/journal/${r.latestJournalEntryId}`}
              className="font-mono text-xs text-status-info-foreground hover:underline"
            >
              #{r.latestJournalEntryId}
            </Link>
          )
          : <span className="text-muted-foreground text-xs">—</span>,
    },
  ];

  const warehouseColumns: DataTableColumn<NegResponse["byWarehouse"][number]>[] = [
    { key: "warehouseName", header: "المستودع",
      render: (w) => (
        <div>
          <p className="font-medium text-sm">{w.warehouseName ?? "—"}</p>
          {w.warehouseCode && <p className="text-xs text-muted-foreground font-mono">{w.warehouseCode}</p>}
        </div>
      )},
    { key: "lotCount", header: "تشغيلات سالبة", sortable: true,
      render: (w) => <Badge variant="destructive">{w.lotCount}</Badge> },
    { key: "deficitValue", header: "قيمة العجز", sortable: true, className: "font-bold text-destructive",
      render: (w) => formatCurrency(w.deficitValue) },
  ];

  return (
    <PageShell
      title="تشغيلات بمخزون سالب"
      subtitle="كميات مخزون سالبة — لا يجب أن تحدث أبداً؛ وجودها يعني خطأ يحتاج فحصاً وتصحيحاً قبل تقرير الميزانية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "مخزون سالب" },
      ]}
      actions={
        rows.length > 0 ? (
          <>
            <GuardedButton
              perm="finance:export" variant="outline" size="sm"
              onClick={() => exportCSV(rows, `negative-stock-${todayLocal()}.csv`)}
            >
              <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
            </GuardedButton>
            <PrintButton
              entityType="report_negative_stock"
              entityId={todayLocal()}
              payload={{
                entity: { title: "تنبيهات المخزون السالب", asOfDate: todayLocal(), count: rows.length },
                items: rows,
              }}
            />
          </>
        ) : null
      }
    >
      <FinanceTabsNav />
      {/* Hero state — green vs red */}
      <Card className={isClean ? "border-emerald-300 bg-emerald-50/40" : "border-destructive/40 bg-destructive/5"}>
        <CardContent className="p-4 flex items-start gap-3">
          {isClean
            ? <ShieldAlert className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className={`font-bold ${isClean ? "text-emerald-700" : "text-destructive"}`}>
              {isClean
                ? "لا توجد تشغيلات بمخزون سالب — المخزون نظيف"
                : `يوجد ${summary.lotCount} تشغيلة بمخزون سالب — قيمة العجز ${formatCurrency(summary.totalDeficitValue)}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isClean
                ? "lot.quantity ≥ 0 لكل التشغيلات النشطة."
                : "lot.quantity < 0 يعني أن البيع تم بدون حصة كافية أو أن تسوية مخزون خصمت أكثر من المتوفر، أو تكرار حركة بسبب replay. يُنصح بفحص آخر قيد لكل تشغيلة."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {!isClean && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 mt-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">تشغيلات سالبة</p>
              <p className="text-xl font-bold text-destructive mt-1">{formatNumber(summary.lotCount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">قيمة العجز (مبالغة في رصيد الميزانية)</p>
              <p className="text-xl font-bold text-destructive mt-1">{formatCurrency(summary.totalDeficitValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">عدد المستودعات المتأثرة</p>
              <p className="text-xl font-bold mt-1">{formatNumber(byWarehouse.length)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* By Warehouse */}
      {!isClean && (
        <div className="mt-6">
          <h3 className="text-base font-semibold mb-3">حسب المستودع</h3>
          <DataTable
            columns={warehouseColumns} data={byWarehouse}
            emptyMessage="—"
            noToolbar
          />
        </div>
      )}

      {/* Detail */}
      {!isClean && (
        <div className="mt-6">
          <h3 className="text-base font-semibold mb-3">تفصيل التشغيلات السالبة ({rows.length})</h3>
          <DataTable
            columns={columns} data={rows}
            searchPlaceholder="بحث بالرمز أو رقم التشغيلة…"
            emptyMessage="—"
            pageSize={50}
          />
        </div>
      )}
    </PageShell>
  );
}
