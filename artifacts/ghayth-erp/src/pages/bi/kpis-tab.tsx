import { Link } from "wouter";
import { useState } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { TrendingUp, Plus, RefreshCw } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

export function KPIsTab() {
  const { data: kpisResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-kpis"], "/bi/kpis");
  const allItems = asList(kpisResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const { toast } = useToast();
  // المؤشّرات الحقيقية المتاحة للحساب الآلي — زر التحديث يظهر فقط لمن صيغته منها.
  const { data: metricsResp } = useApiQuery<any>(["bi-kpi-metrics"], "/bi/kpis/metrics");
  const computableKeys = new Set<string>(asList(metricsResp).map((m: any) => m.key));
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const refreshKpi = async (k: any) => {
    setRefreshingId(k.id);
    try {
      const r: any = await apiFetch(`/bi/kpis/${k.id}/refresh`, { method: "POST" });
      toast({ title: "تم تحديث المؤشّر", description: `${k.name}: ${formatNumber(Number(r?.currentValue ?? 0))}` });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر التحديث", description: e?.message || "خطأ غير متوقع" });
    } finally {
      setRefreshingId(null);
    }
  };
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(allItems, filters, {
    searchFields: ["name", "module", "description"],
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المؤشر", sortable: true, render: (k) => <span className="font-medium">{k.name}</span> },
    { key: "module", header: "الوحدة", sortable: true, render: (k) => <span className="text-muted-foreground">{k.module || "-"}</span> },
    { key: "target", header: "الهدف", sortable: true, render: (k) => formatNumber(k.target || 0) },
    { key: "currentValue", header: "القيمة الحالية", sortable: true, render: (k) => <span className="font-bold">{formatNumber(k.currentValue || 0)}</span> },
    ...(canWrite ? [{
      key: "__refresh" as const, header: "", render: (k: any) => computableKeys.has(k.formula) ? (
        <Button variant="ghost" size="sm" className="gap-1" disabled={refreshingId === k.id} onClick={() => refreshKpi(k)} title="حساب القيمة من البيانات الفعلية">
          <RefreshCw className={`h-4 w-4 ${refreshingId === k.id ? "animate-spin" : ""}`} /> تحديث
        </Button>
      ) : <span className="text-xs text-muted-foreground" title="مؤشّر يدوي — صيغته ليست مؤشّرًا محسوبًا معروفًا">يدوي</span>,
    }] : []),
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم أو الوحدة...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "name", label: "المؤشر" },
              { key: "module", label: "الوحدة" },
              { key: "target", label: "الهدف" },
              { key: "currentValue", label: "القيمة الحالية" },
            ], "مؤشرات_الأداء")}
            resultCount={filtered.length}
          />
        </div>
        <PrintButton
          entityType="report_bi_kpis"
          entityId="list"
          size="icon"
          label="طباعة مؤشرات الأداء"
          payload={() => ({
            entity: { title: "مؤشرات الأداء (KPIs)", total: printRows.length },
            items: printRows.map((k: any) => ({
              "المؤشر": k.name || "—",
              "الوحدة": k.module || "—",
              "الهدف": Number(k.target || 0),
              "القيمة الحالية": Number(k.currentValue || 0),
              "% الإنجاز": k.target ? `${Math.round((Number(k.currentValue || 0) / Number(k.target)) * 100)}%` : "—",
            })),
          })}
        />
        {canWrite && <Link href="/bi/kpis/create"><GuardedButton perm="bi:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة مؤشر</GuardedButton></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>مؤشرات الأداء</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مؤشرات"
            emptyIcon={<TrendingUp className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
