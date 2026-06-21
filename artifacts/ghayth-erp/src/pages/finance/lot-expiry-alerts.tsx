import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, AlertTriangle, Clock, Calendar } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * Lot expiry alerts — consumes #1042's /reports/lot-expiry-alerts.
 *
 * Lists active qc-approved lots whose expiryDate falls inside the
 * look-ahead window, bucketed by warehouse threshold (default
 * [30, 60, 90]). Pre-write-off planning surface for perishable
 * inventory (pharma / food / chemicals).
 */

interface ExpiryRow {
  lotId: number;
  productId: number;
  sku: string | null;
  productName: string;
  warehouseId: number;
  warehouseName: string | null;
  warehouseCode: string | null;
  lotNumber: string;
  quantity: number;
  unitCost: number;
  exposureValue: number;
  expiryDate: string;
  daysUntil: number;
  alertBucket: number | "overdue";
  status: string;
  expiryAlertDays: number[] | null;
}

interface ExpiryResponse {
  filters: { warehouseId?: string; productId?: string; daysAhead: number; includeExpired: boolean };
  summary: { lotCount: number; totalExposureValue: number; windowDays: number };
  byBucket: Array<{
    threshold: number | "overdue"; lotCount: number; exposureValue: number;
  }>;
  data: ExpiryRow[];
}

const bucketBadge = (b: number | "overdue") =>
  b === "overdue"
    ? "bg-destructive text-destructive-foreground"
    : b === 30
      ? "bg-status-error-surface text-status-error-foreground"
      : b === 60
        ? "bg-status-warning-surface text-status-warning-foreground"
        : "bg-status-info-surface text-status-info-foreground";

const bucketLabel = (b: number | "overdue") =>
  b === "overdue" ? "متأخر ⚠" : `${b} يوم`;

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: ExpiryRow[], filename: string) {
  const headers = [
    "تشغيلة", "الرمز", "المنتج", "المستودع",
    "كمية", "تكلفة الوحدة", "قيمة التعرض",
    "تاريخ انتهاء", "أيام متبقية", "تنبيه",
  ];
  const out = rows.map((r) => [
    csvEscape(r.lotNumber),
    csvEscape(r.sku ?? ""),
    csvEscape(r.productName),
    csvEscape(r.warehouseName ?? ""),
    r.quantity.toString(),
    r.unitCost.toFixed(2),
    r.exposureValue.toFixed(2),
    r.expiryDate,
    r.daysUntil.toString(),
    String(r.alertBucket),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_lot_expiry_alerts",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function LotExpiryAlertsPage() {
  const [daysAhead, setDaysAhead] = useState(90);
  const [includeExpired, setIncludeExpired] = useState(false);

  const qs = `?daysAhead=${daysAhead}${includeExpired ? "&includeExpired=true" : ""}`;
  const { data, isLoading, isError } = useApiQuery<ExpiryResponse>(
    ["lot-expiry-alerts", String(daysAhead), String(includeExpired)],
    `/finance/reports/lot-expiry-alerts${qs}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, byBucket, data: rows } = data;

  const columns: DataTableColumn<ExpiryRow>[] = [
    {
      key: "alertBucket", header: "التنبيه",
      render: (r) => <Badge className={bucketBadge(r.alertBucket)}>{bucketLabel(r.alertBucket)}</Badge>,
    },
    {
      key: "daysUntil", header: "أيام متبقية", sortable: true,
      render: (r) => (
        <span className={`font-mono font-bold ${r.daysUntil < 0 ? "text-destructive" : r.daysUntil < 30 ? "text-status-warning-foreground" : ""}`}>
          {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}- ` : r.daysUntil}
        </span>
      ),
    },
    {
      key: "expiryDate", header: "تاريخ الانتهاء", sortable: true,
      render: (r) => <span className="font-mono text-xs">{r.expiryDate}</span>,
    },
    {
      key: "sku", header: "المنتج",
      render: (r) => (
        <div>
          <p className="font-mono text-xs text-status-info-foreground">{r.sku ?? "—"}</p>
          <p className="font-medium text-sm">{r.productName}</p>
        </div>
      ),
    },
    {
      key: "lotNumber", header: "التشغيلة",
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
      key: "quantity", header: "كمية", sortable: true,
      render: (r) => <span className="font-mono">{formatNumber(r.quantity)}</span>,
    },
    {
      key: "unitCost", header: "تكلفة الوحدة",
      render: (r) => <span className="font-mono text-sm">{formatCurrency(r.unitCost)}</span>,
    },
    {
      key: "exposureValue", header: "قيمة التعرض", sortable: true, className: "font-bold",
      render: (r) => <span className="text-status-warning-foreground">{formatCurrency(r.exposureValue)}</span>,
    },
  ];

  return (
    <PageShell
      title="تنبيهات صلاحية الدفعات"
      subtitle="تشغيلات المخزون المتجهة للانتهاء — تخطيط FIFO ومنع الخسائر"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "تنبيهات الصلاحية" },
      ]}
      actions={
        <>
          <div className="flex items-center gap-2 me-2">
            <Label className="text-xs text-muted-foreground">نافذة:</Label>
            <input
              type="number" min={1} max={365}
              value={daysAhead}
              onChange={(e) => setDaysAhead(Number(e.target.value))}
              className="flex h-9 w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
              dir="ltr"
            />
            <span className="text-xs text-muted-foreground">يوم</span>
          </div>
          <div className="flex items-center gap-2 me-2">
            <Switch
              id="includeExpired" checked={includeExpired}
              onCheckedChange={setIncludeExpired}
            />
            <Label htmlFor="includeExpired" className="text-xs">شامل المنتهي</Label>
          </div>
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(rows, `lot-expiry-${todayLocal()}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_lot_expiry_alerts"
            entityId={todayLocal()}
            payload={{
              entity: { title: "تنبيهات انتهاء صلاحية الدفعات", asOfDate: todayLocal(), count: rows.length },
              items: rows,
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />
      {/* Hero alert when there are overdue lots */}
      {(() => {
        const overdueBucket = byBucket.find((b) => b.threshold === "overdue");
        return overdueBucket && overdueBucket.lotCount > 0 ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-destructive">
                  يوجد {overdueBucket.lotCount} تشغيلة منتهية — قيمة التعرض {formatCurrency(overdueBucket.exposureValue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  هذه التشغيلات تجاوزت تاريخ انتهاء صلاحيتها ومازالت في حالة "نشطة" — تحتاج إلى إعدام / شطب فوراً.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mt-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-status-warning-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">تشغيلات قيد التنبيه</p>
            <p className="text-xl font-bold mt-1">{formatNumber(summary.lotCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي قيمة التعرض</p>
            <p className="text-xl font-bold text-status-warning-foreground mt-1">
              {formatCurrency(summary.totalExposureValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 text-status-info-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">نافذة التنبيه</p>
            <p className="text-xl font-bold mt-1">{formatNumber(summary.windowDays)} يوم</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">عدد المجموعات</p>
            <p className="text-xl font-bold mt-1">{byBucket.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Buckets */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">حسب مدى التنبيه</h3>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {byBucket.map((b) => (
            <Card key={String(b.threshold)} className={b.threshold === "overdue" ? "border-destructive/40" : ""}>
              <CardContent className="p-4">
                <Badge className={bucketBadge(b.threshold)}>{bucketLabel(b.threshold)}</Badge>
                <p className="text-xs text-muted-foreground mt-2">عدد التشغيلات</p>
                <p className="text-lg font-bold">{formatNumber(b.lotCount)}</p>
                <p className="text-xs text-muted-foreground mt-1">قيمة التعرض</p>
                <p className="text-sm font-semibold text-status-warning-foreground">{formatCurrency(b.exposureValue)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">تفصيل التشغيلات ({rows.length})</h3>
        <DataTable
          columns={columns} data={rows}
          emptyMessage="لا توجد تشغيلات قيد التنبيه — جميع المخزون بصلاحية كافية"
          pageSize={50}
        />
      </div>
    </PageShell>
  );
}
