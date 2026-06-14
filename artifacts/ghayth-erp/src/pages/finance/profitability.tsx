/**
 * Shared base for the per-entity profitability views. Re-exported as the
 * default by four 6-7 LoC wrappers in this folder:
 *
 *   profitability-vehicle.tsx     → <ProfitabilityPage entityType="vehicle">
 *   profitability-property.tsx    → <ProfitabilityPage entityType="property">
 *   profitability-project.tsx     → <ProfitabilityPage entityType="project">
 *   profitability-umrah-agent.tsx → <ProfitabilityPage entityType="umrah-agent">
 *
 * This file is NOT registered in any route file because the wrappers
 * are what bind to the four `/finance/profitability/<kind>/:id` paths.
 * `SYSTEM_PAGE_INVENTORY` flagged the absence of a direct route as
 * "dead", while `DEAD_DUPLICATE_PAGE_AUDIT` flagged it as "keep"
 * because the wrappers import it as a sibling — both readings of
 * the matrix are recorded as conflict #1 in
 * `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md`. This JSDoc resolves it:
 * **keep** — removing the file would break four routed wrappers.
 */
import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, todayLocal, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import { Download, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
type ProfitabilityType = "vehicle" | "property" | "project" | "umrah-agent";

interface AccountRow {
  code: string;
  name: string;
  type: "revenue" | "expense" | string;
  revenue: number | string;
  expense: number | string;
}

interface ProfitabilityResponse {
  vehicleId?: number;
  propertyId?: number;
  projectId?: number;
  umrahAgentId?: number;
  accounts: AccountRow[];
  summary: {
    totalRevenue: number;
    totalExpense: number;
    netProfit: number;
  };
}

const TYPE_CONFIG: Record<ProfitabilityType, {
  label: string;
  endpointSegment: string;
  paramKey: string;
  routePattern: string;
  listLabel: string;
  listPath: string;
  entityLabel: (id: string) => string;
}> = {
  vehicle: {
    label: "ربحية المركبة",
    endpointSegment: "vehicle",
    paramKey: "vehicleId",
    routePattern: "/finance/profitability/vehicle/:id",
    listLabel: "المركبات",
    listPath: "/fleet/vehicles",
    entityLabel: (id) => `مركبة #${id}`,
  },
  property: {
    label: "ربحية العقار",
    endpointSegment: "property",
    paramKey: "propertyId",
    routePattern: "/finance/profitability/property/:id",
    listLabel: "العقارات",
    listPath: "/properties",
    entityLabel: (id) => `عقار #${id}`,
  },
  project: {
    label: "ربحية المشروع",
    endpointSegment: "project",
    paramKey: "projectId",
    routePattern: "/finance/profitability/project/:id",
    listLabel: "المشاريع",
    listPath: "/projects",
    entityLabel: (id) => `مشروع #${id}`,
  },
  "umrah-agent": {
    label: "ربحية مرشد العمرة",
    endpointSegment: "umrah-agent",
    paramKey: "umrahAgentId",
    routePattern: "/finance/profitability/umrah-agent/:id",
    listLabel: "مرشدو العمرة",
    listPath: "/umrah/agents",
    entityLabel: (id) => `مرشد #${id}`,
  },
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(label: string, rows: AccountRow[], summary: ProfitabilityResponse["summary"]) {
  const headers = ["الرمز", "اسم الحساب", "النوع", "إيراد", "مصروف"];
  const lines = rows.map((r) => [
    csvEscape(r.code),
    csvEscape(r.name),
    csvEscape(r.type),
    Number(r.revenue).toFixed(2),
    Number(r.expense).toFixed(2),
  ]);
  lines.push(["", "إجمالي الإيرادات", "", summary.totalRevenue.toFixed(2), ""]);
  lines.push(["", "إجمالي المصروفات", "", "", summary.totalExpense.toFixed(2)]);
  lines.push(["", "صافي الربح/الخسارة", "", summary.netProfit.toFixed(2), ""]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_profitability",
    title: String(`${label}-${todayLocal()}.csv`).replace(/\.csv$/i, ""),
    rows: lines.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

interface Props {
  entityType: ProfitabilityType;
}

export default function ProfitabilityPage({ entityType }: Props) {
  const config = TYPE_CONFIG[entityType];
  const [, params] = useRoute<{ id: string }>(config.routePattern);
  const id = params?.id ?? "";

  const [startDate, setStartDate] = useState(
    () => `${currentYearRiyadh() - 1}-${currentMonthPaddedRiyadh()}-${todayLocal().slice(8, 10)}`,
  );
  const [endDate, setEndDate] = useState(todayLocal());

  // Four explicit endpoints — one per entity type. The earlier
  // `/${config.endpointSegment}/${id}` template normalised to
  // `/:param/:param` and the wiring audit could not credit any of the
  // four sibling backend routes from a single dynamic segment. By
  // calling each route literally with `enabled` gating only the active
  // tab, every URL becomes statically visible to the scanner. The
  // disabled queries don't fire — useApiQuery's `enabled` flag short-
  // circuits the fetch — so this stays a one-request-at-a-time page.
  const qs = `startDate=${startDate}&endDate=${endDate}`;
  const enabledFor = (t: ProfitabilityType) => !!id && entityType === t;
  const vehicleQ = useApiQuery<ProfitabilityResponse>(
    ["profitability-vehicle", id, startDate, endDate],
    `/finance/reports/profitability/vehicle/${id}?${qs}`,
    enabledFor("vehicle"),
  );
  const propertyQ = useApiQuery<ProfitabilityResponse>(
    ["profitability-property", id, startDate, endDate],
    `/finance/reports/profitability/property/${id}?${qs}`,
    enabledFor("property"),
  );
  const projectQ = useApiQuery<ProfitabilityResponse>(
    ["profitability-project", id, startDate, endDate],
    `/finance/reports/profitability/project/${id}?${qs}`,
    enabledFor("project"),
  );
  const umrahAgentQ = useApiQuery<ProfitabilityResponse>(
    ["profitability-umrah-agent", id, startDate, endDate],
    `/finance/reports/profitability/umrah-agent/${id}?${qs}`,
    enabledFor("umrah-agent"),
  );

  const activeQ =
    entityType === "vehicle" ? vehicleQ
    : entityType === "property" ? propertyQ
    : entityType === "project" ? projectQ
    : umrahAgentQ;
  const { data, isLoading, isError, refetch } = activeQ;

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const revRows = data.accounts.filter((a) => a.type === "revenue" || Number(a.revenue) > 0);
  const expRows = data.accounts.filter((a) => a.type === "expense" || Number(a.expense) > 0);

  const marginPct = data.summary.totalRevenue > 0
    ? (data.summary.netProfit / data.summary.totalRevenue) * 100
    : 0;
  const marginColor = marginPct >= 30 ? "text-emerald-700"
    : marginPct >= 15 ? "text-yellow-700"
    : marginPct >= 0 ? "text-orange-700"
    : "text-status-error-foreground";

  const revCols: DataTableColumn<AccountRow>[] = [
    { key: "code", header: "الرمز", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "اسم الحساب" },
    { key: "revenue", header: "المبلغ",
      render: (r) => <span className="font-mono text-emerald-700">{formatCurrency(Number(r.revenue))}</span> },
  ];

  const expCols: DataTableColumn<AccountRow>[] = [
    { key: "code", header: "الرمز", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "اسم الحساب" },
    { key: "expense", header: "المبلغ",
      render: (r) => <span className="font-mono text-orange-700">{formatCurrency(Number(r.expense))}</span> },
  ];

  return (
    <PageShell
      title={`${config.label} — ${config.entityLabel(id)}`}
      subtitle={`من ${startDate} إلى ${endDate}`}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: config.label },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline"><Link href={config.listPath}>
              <ArrowLeft className="h-3.5 w-3.5 me-1" /> {config.listLabel}
            </Link></Button>
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(config.label, data.accounts, data.summary)}
          >
            <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_profitability"
            entityId="all"
            payload={{
              entity: { title: `تحليل الربحية — ${config.label}`, summary: data.summary },
              items: data.accounts ?? [],
            }}
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
            testidPrefix="profitability-preset"
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
        <Card className="border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> إجمالي الإيرادات
            </p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatCurrency(data.summary.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> إجمالي المصروفات
            </p>
            <p className="text-lg font-bold font-mono text-orange-700">{formatCurrency(data.summary.totalExpense)}</p>
          </CardContent>
        </Card>
        <Card className={data.summary.netProfit >= 0 ? "border-emerald-300" : "border-status-error-surface"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">صافي الربح / الخسارة</p>
            <p className={`text-lg font-bold font-mono ${data.summary.netProfit >= 0 ? "text-emerald-700" : "text-status-error-foreground"}`}>
              {formatCurrency(data.summary.netProfit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">هامش الربح %</p>
            <p className={`text-lg font-bold font-mono ${marginColor}`}>
              {marginPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>الإيرادات</span>
              <Badge className="bg-emerald-100 text-emerald-800">{revRows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={revCols} data={revRows}
              pageSize={50} noToolbar searchPlaceholder={null}
              emptyMessage="لا توجد إيرادات للفترة"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>المصروفات</span>
              <Badge className="bg-orange-100 text-orange-800">{expRows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={expCols} data={expRows}
              pageSize={50} noToolbar searchPlaceholder={null}
              emptyMessage="لا توجد مصروفات للفترة"
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
