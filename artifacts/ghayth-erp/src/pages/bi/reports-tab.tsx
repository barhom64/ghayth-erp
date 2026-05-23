import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { FileBarChart, Plus } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { GuardedButton } from "@/components/shared/permission-gate";

export function ReportsTab() {
  const { data: reportsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-reports"], "/bi/reports");
  const allItems = asList(reportsResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(allItems, filters, {
    searchFields: ["title", "type", "description"],
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "type", header: "النوع", sortable: true, render: (r) => <span className="text-muted-foreground">{r.type || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو النوع...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "title", label: "العنوان" },
              { key: "type", label: "النوع" },
              { key: "createdAt", label: "التاريخ" },
            ], "التقارير")}
            resultCount={filtered.length}
          />
        </div>
        {canWrite && <Link href="/bi/reports/create"><GuardedButton perm="bi:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة تقرير</GuardedButton></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>التقارير</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد تقارير"
            emptyIcon={<FileBarChart className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
