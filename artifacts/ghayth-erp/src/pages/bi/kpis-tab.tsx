import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { TrendingUp, Plus } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function KPIsTab() {
  const { data: kpisResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-kpis"], "/bi/kpis");
  const allItems = asList(kpisResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(allItems, filters, {
    searchFields: ["name", "module", "description"],
  });

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المؤشر", sortable: true, render: (k) => <span className="font-medium">{k.name}</span> },
    { key: "module", header: "الوحدة", sortable: true, render: (k) => <span className="text-muted-foreground">{k.module || "-"}</span> },
    { key: "target", header: "الهدف", sortable: true, render: (k) => formatNumber(k.target || 0) },
    { key: "currentValue", header: "القيمة الحالية", sortable: true, render: (k) => <span className="font-bold">{formatNumber(k.currentValue || 0)}</span> },
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
        {canWrite && <Link href="/bi/kpis/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مؤشر</Button></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>مؤشرات الأداء</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
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
