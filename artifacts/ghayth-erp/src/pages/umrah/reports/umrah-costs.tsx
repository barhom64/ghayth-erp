/**
 * Umrah Costs Report — §11 stub conversion (#1870)
 *
 * Aggregates umrah_nusk_invoices into a cost breakdown per
 * dimension (season / group / agent). Each row shows:
 *   ground services, electronic fees, visa fees, insurance,
 *   enrichment, additional services, transport, hotel,
 *   net cost, total.
 *
 * Three dimension tabs share the same endpoint + render shape;
 * dimension-switching just re-queries the API.
 */
import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";

type Dimension = "season" | "group" | "agent";

interface CostRow {
  seasonId?: number;
  groupId?: number;
  agentId?: number;
  nuskGroupNumber?: string | null;
  name: string | null;
  groundServices: number | string;
  electronicFees: number | string;
  visaFees: number | string;
  insuranceFees: number | string;
  enrichmentServices: number | string;
  additionalServices: number | string;
  transportTotal: number | string;
  hotelTotal: number | string;
  netCost: number | string;
  totalAmount: number | string;
  invoiceCount: number;
}

interface CostsResp {
  data: CostRow[];
  dimension: Dimension;
  totals: Record<string, number>;
}

interface SeasonOpt { id: number; title: string }

const DIM_LABEL: Record<Dimension, string> = {
  season: "حسب الموسم",
  group:  "حسب المجموعة",
  agent:  "حسب الوكيل",
};

const COST_COLUMNS: { key: keyof CostRow; label: string }[] = [
  { key: "groundServices",     label: "خدمات أرضية" },
  { key: "electronicFees",     label: "رسوم إلكترونية" },
  { key: "visaFees",           label: "رسوم تأشيرة" },
  { key: "insuranceFees",      label: "تأمين" },
  { key: "enrichmentServices", label: "إثراء" },
  { key: "additionalServices", label: "خدمات إضافية" },
  { key: "transportTotal",     label: "نقل" },
  { key: "hotelTotal",         label: "فنادق" },
];

export default function UmrahCostsReport() {
  const [dimension, setDimension] = useState<Dimension>("group");
  const [seasonFilter, setSeasonFilter] = useState("all");
  const qs = seasonFilter !== "all" ? `&seasonId=${seasonFilter}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<CostsResp>(
    ["umrah-costs-report", dimension, seasonFilter],
    `/umrah/reports/umrah-costs?dimension=${dimension}${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const seasons = seasonsResp?.data ?? [];
  const rows = data?.data ?? [];
  const totals = data?.totals ?? {};

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const dimensionLabel = dimension === "season" ? "الموسم"
                       : dimension === "group" ? "المجموعة"
                       : "الوكيل";
  const subColumnLabel = dimension === "group" ? "رقم نسك"
                       : dimension === "agent" ? null
                       : null;

  return (
    <PageShell
      title="تقرير تكاليف العمرة"
      subtitle="توزيع تكاليف فواتير نُسك على الموسم/المجموعة/الوكيل"
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: "تقرير التكاليف" },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3" data-testid="costs-filters">
          <Tabs value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
            <TabsList>
              <TabsTrigger value="season" data-testid="costs-dim-season">{DIM_LABEL.season}</TabsTrigger>
              <TabsTrigger value="group" data-testid="costs-dim-group">{DIM_LABEL.group}</TabsTrigger>
              <TabsTrigger value="agent" data-testid="costs-dim-agent">{DIM_LABEL.agent}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[200px]" data-testid="costs-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">الإجمالي الكلّي</p>
          <p className="text-3xl font-bold text-status-error-foreground" data-testid="costs-total-amount">
            {formatCurrency(totals.totalAmount ?? 0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            صافي التكلفة: {formatCurrency(totals.netCost ?? 0)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="costs-empty">
              لا فواتير نُسك تطابق الفلاتر.
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="costs-table">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-start sticky right-0 bg-muted/40">{dimensionLabel}</th>
                  {subColumnLabel && <th className="p-2 text-start">{subColumnLabel}</th>}
                  {COST_COLUMNS.map((c) => (
                    <th key={String(c.key)} className="p-2 text-end whitespace-nowrap">{c.label}</th>
                  ))}
                  <th className="p-2 text-end whitespace-nowrap font-bold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowKey = r.seasonId ?? r.groupId ?? r.agentId ?? `${r.name}-${rows.indexOf(r)}`;
                  return (
                    <tr key={rowKey} className="border-t hover:bg-muted/20" data-testid={`costs-row-${rowKey}`}>
                      <td className="p-2 font-medium sticky right-0 bg-background">{r.name ?? "—"}</td>
                      {subColumnLabel && <td className="p-2 text-muted-foreground">{r.nuskGroupNumber ?? "—"}</td>}
                      {COST_COLUMNS.map((c) => (
                        <td key={String(c.key)} className="p-2 text-end font-mono whitespace-nowrap">
                          {formatCurrency(Number(r[c.key]) || 0)}
                        </td>
                      ))}
                      <td className="p-2 text-end font-mono font-bold whitespace-nowrap text-status-error-foreground">
                        {formatCurrency(Number(r.totalAmount) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/60 border-t-2 border-border">
                <tr>
                  <td className="p-2 font-bold sticky right-0 bg-muted/60" colSpan={subColumnLabel ? 2 : 1}>
                    الإجمالي
                  </td>
                  {COST_COLUMNS.map((c) => (
                    <td key={String(c.key)} className="p-2 text-end font-mono font-bold whitespace-nowrap">
                      {formatCurrency(totals[c.key as string] ?? 0)}
                    </td>
                  ))}
                  <td className="p-2 text-end font-mono font-bold whitespace-nowrap text-status-error-foreground">
                    {formatCurrency(totals.totalAmount ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}