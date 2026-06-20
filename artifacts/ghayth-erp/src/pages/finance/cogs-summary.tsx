import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, TrendingUp, Boxes, Users, BarChart3 } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { InlineSparkline } from "@/components/shared/inline-sparkline";
/**
 * COGS / Margin summary report — consumes #1034's
 * /reports/cogs-summary endpoint.
 *
 * Period revenue, cogs (net of returns), profit and gross-margin
 * percentage rolled up by product / client / period. The "byProduct"
 * cut surfaces dead-stock candidates and best-sellers; "byClient"
 * surfaces the high-margin accounts to retain.
 */

interface CogsRow {
  invoiceLineId: number;
  invoiceId: number;
  invoiceRef: string;
  clientId: number | null;
  clientName: string | null;
  productId: number | null;
  productSku: string | null;
  productName: string | null;
  cogsPostedAt: string | null;
  period: string | null;
  quantity: number;
  revenue: number;
  cogsGross: number;
  cogsReversed: number;
  cogsNet: number;
  profit: number;
}

interface CogsResponse {
  filters: { startDate?: string; endDate?: string; productId?: string; clientId?: string };
  summary: {
    totalRevenue: number;
    totalCogsGross: number;
    totalCogsReversed: number;
    totalCogsNet: number;
    totalProfit: number;
    marginPct: number;
    rowCount: number;
  };
  byProduct: Array<{
    productId: number; sku: string | null; name: string | null;
    quantity: number; revenue: number; cogsNet: number;
    profit: number; marginPct: number; rows: number;
  }>;
  byClient: Array<{
    clientId: number; clientName: string | null;
    revenue: number; cogsNet: number;
    profit: number; marginPct: number; rows: number;
  }>;
  byPeriod: Array<{
    period: string; revenue: number; cogsNet: number;
    profit: number; marginPct: number; rows: number;
  }>;
  data: CogsRow[];
}

function startOfMonthLocal() {
  const t = todayLocal();
  return `${t.slice(0, 8)}01`;
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: CogsRow[], filename: string) {
  const headers = [
    "تاريخ", "فاتورة", "العميل", "الرمز", "المنتج",
    "كمية", "الإيراد", "COGS صافي", "الربح",
  ];
  const out = rows.map((r) => [
    csvEscape(r.cogsPostedAt ?? ""),
    csvEscape(r.invoiceRef),
    csvEscape(r.clientName ?? ""),
    csvEscape(r.productSku ?? ""),
    csvEscape(r.productName ?? ""),
    r.quantity.toString(),
    r.revenue.toFixed(2),
    r.cogsNet.toFixed(2),
    r.profit.toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_cogs_summary",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: out.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

const marginColor = (pct: number) =>
  pct >= 30 ? "text-emerald-700"
  : pct >= 15 ? "text-status-warning-foreground"
  : pct >= 0 ? "text-orange-600"
  : "text-destructive";

export default function CogsSummaryPage() {
  const [startDate, setStartDate] = useState(startOfMonthLocal());
  const [endDate, setEndDate] = useState(todayLocal());

  const { data, isLoading, isError } = useApiQuery<CogsResponse>(
    ["cogs-summary", startDate, endDate],
    `/finance/reports/cogs-summary?startDate=${startDate}&endDate=${endDate}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, byProduct, byClient, byPeriod, data: rows } = data;

  const productColumns: DataTableColumn<CogsResponse["byProduct"][number]>[] = [
    { key: "sku", header: "الرمز",
      render: (p) => <span className="font-mono text-xs">{p.sku ?? "—"}</span> },
    { key: "name", header: "المنتج",
      render: (p) => <span className="font-medium text-sm">{p.name ?? "—"}</span> },
    { key: "quantity", header: "كمية", sortable: true,
      render: (p) => <span className="font-mono">{formatNumber(p.quantity)}</span> },
    { key: "revenue", header: "إيراد", sortable: true,
      render: (p) => <span className="text-status-info-foreground">{formatCurrency(p.revenue)}</span> },
    { key: "cogsNet", header: "تكلفة صافية", sortable: true,
      render: (p) => <span className="text-orange-700">{formatCurrency(p.cogsNet)}</span> },
    { key: "profit", header: "الربح", sortable: true, className: "font-bold",
      render: (p) => <span className="text-emerald-700">{formatCurrency(p.profit)}</span> },
    { key: "marginPct", header: "هامش %", sortable: true,
      render: (p) => <span className={`font-bold ${marginColor(p.marginPct)}`}>{p.marginPct.toFixed(2)}%</span> },
  ];

  const clientColumns: DataTableColumn<CogsResponse["byClient"][number]>[] = [
    { key: "clientName", header: "العميل",
      render: (c) => <span className="font-medium text-sm">{c.clientName ?? "—"}</span> },
    { key: "rows", header: "بنود", sortable: true, render: (c) => c.rows },
    { key: "revenue", header: "إيراد", sortable: true,
      render: (c) => <span className="text-status-info-foreground">{formatCurrency(c.revenue)}</span> },
    { key: "cogsNet", header: "تكلفة", sortable: true,
      render: (c) => <span className="text-orange-700">{formatCurrency(c.cogsNet)}</span> },
    { key: "profit", header: "الربح", sortable: true, className: "font-bold",
      render: (c) => <span className="text-emerald-700">{formatCurrency(c.profit)}</span> },
    { key: "marginPct", header: "هامش %", sortable: true,
      render: (c) => <span className={`font-bold ${marginColor(c.marginPct)}`}>{c.marginPct.toFixed(2)}%</span> },
  ];

  const periodColumns: DataTableColumn<CogsResponse["byPeriod"][number]>[] = [
    { key: "period", header: "الشهر",
      render: (p) => <span className="font-mono font-medium">{p.period}</span> },
    { key: "rows", header: "بنود", sortable: true, render: (p) => p.rows },
    { key: "revenue", header: "إيراد", sortable: true,
      render: (p) => <span className="text-status-info-foreground">{formatCurrency(p.revenue)}</span> },
    { key: "cogsNet", header: "تكلفة", sortable: true,
      render: (p) => <span className="text-orange-700">{formatCurrency(p.cogsNet)}</span> },
    { key: "profit", header: "الربح", sortable: true, className: "font-bold",
      render: (p) => <span className="text-emerald-700">{formatCurrency(p.profit)}</span> },
    { key: "marginPct", header: "هامش %", sortable: true,
      render: (p) => <span className={`font-bold ${marginColor(p.marginPct)}`}>{p.marginPct.toFixed(2)}%</span> },
  ];

  const detailColumns: DataTableColumn<CogsRow>[] = [
    { key: "cogsPostedAt", header: "تاريخ",
      render: (r) => <span className="text-xs text-muted-foreground">{r.cogsPostedAt?.slice(0, 10) ?? "—"}</span> },
    { key: "invoiceRef", header: "فاتورة",
      render: (r) => <span className="font-mono text-xs text-status-info-foreground">{r.invoiceRef}</span> },
    { key: "clientName", header: "العميل",
      render: (r) => r.clientName ?? "—" },
    { key: "productSku", header: "المنتج",
      render: (r) => (
        <div className="text-xs">
          <p className="font-mono">{r.productSku ?? "—"}</p>
          <p className="text-muted-foreground">{r.productName ?? "—"}</p>
        </div>
      )},
    { key: "quantity", header: "كمية",
      render: (r) => <span className="font-mono">{formatNumber(r.quantity)}</span> },
    { key: "revenue", header: "إيراد",
      render: (r) => formatCurrency(r.revenue) },
    { key: "cogsNet", header: "تكلفة صافية",
      render: (r) => (
        <span className="text-orange-700">
          {formatCurrency(r.cogsNet)}
          {r.cogsReversed > 0 && (
            <span className="text-xs text-muted-foreground ms-1">
              (مرتجع {formatCurrency(r.cogsReversed)})
            </span>
          )}
        </span>
      ),
    },
    { key: "profit", header: "ربح", className: "font-bold",
      render: (r) => <span className="text-emerald-700">{formatCurrency(r.profit)}</span> },
  ];

  return (
    <PageShell
      title="ملخص التكلفة وهامش الربح"
      subtitle="إيراد − تكلفة المباع (صافي المرتجعات) = الربح. مع تقسيم حسب المنتج / العميل / الشهر."
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "ملخص التكلفة وهامش الربح" },
      ]}
      actions={
        <>
          <DatePicker value={startDate} onChange={setStartDate} className="w-44" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-44" placeholder="إلى" />
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(rows, `cogs-summary-${startDate}-${endDate}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_cogs_summary"
            entityId={`${startDate}..${endDate}`}
            payload={{
              entity: {
                title: "ملخص تكلفة البضاعة المباعة (COGS)",
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
            <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
            <p className="text-xl font-bold text-status-info-foreground mt-1">
              {formatCurrency(summary.totalRevenue)}
            </p>
            <InlineSparkline
              values={byPeriod.map((p) => p.revenue)}
              tone="neutral"
              testid="cogs-summary-revenue-spark"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Boxes className="h-5 w-5 text-orange-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي COGS (إجمالي)</p>
            <p className="text-xl font-bold text-orange-700 mt-1">
              {formatCurrency(summary.totalCogsGross)}
            </p>
            <InlineSparkline
              values={byPeriod.map((p) => p.cogsNet)}
              tone="warning"
              testid="cogs-summary-cogs-spark"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">المرتجعات (عكس COGS)</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.totalCogsReversed)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">إجمالي الربح</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.totalProfit)}
            </p>
            <InlineSparkline
              values={byPeriod.map((p) => p.profit)}
              tone={summary.totalProfit >= 0 ? "success" : "warning"}
              testid="cogs-summary-profit-spark"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 text-status-warning-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">هامش الربح %</p>
            <p className={`text-xl font-bold mt-1 ${marginColor(summary.marginPct)}`}>
              {summary.marginPct.toFixed(2)}%
            </p>
            <InlineSparkline
              values={byPeriod.map((p) => p.marginPct)}
              tone={summary.marginPct >= 0 ? "success" : "warning"}
              testid="cogs-summary-margin-spark"
            />
          </CardContent>
        </Card>
      </div>

      {/* By Period (chronological for trends) */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">حسب الشهر</h3>
        <DataTable
          columns={periodColumns} data={byPeriod}
          emptyMessage="لا توجد بيانات في هذه الفترة"
          noToolbar
        />
      </div>

      {/* By Product (DESC by profit) */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-status-info-foreground" />
          أفضل المنتجات (مرتبة بالربح)
        </h3>
        <DataTable
          columns={productColumns} data={byProduct}
          emptyMessage="لا توجد منتجات"
          pageSize={20}
          noToolbar
        />
      </div>

      {/* By Client (DESC by profit) */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-status-info-foreground" />
          أفضل العملاء (مرتبة بالربح)
        </h3>
        <DataTable
          columns={clientColumns} data={byClient}
          emptyMessage="لا يوجد عملاء"
          pageSize={20}
          noToolbar
        />
      </div>

      {/* Detail */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">تفصيل البنود ({rows.length})</h3>
        <DataTable
          columns={detailColumns} data={rows}
          emptyMessage="لا توجد بنود في هذه الفترة"
          pageSize={50}
        />
      </div>
    </PageShell>
  );
}
