import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { LayoutDashboard, Plus } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function DashboardsTab() {
  const { data: dashResp, isLoading, isError, refetch } = useApiQuery<any>(["bi-dashboards"], "/bi/dashboards");
  const items = asList(dashResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, {
    searchFields: ["title", "description"],
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو الوصف...",
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "title", label: "العنوان" },
              { key: "description", label: "الوصف" },
              { key: "createdAt", label: "التاريخ" },
            ], "لوحات_المعلومات")}
            resultCount={filtered.length}
          />
        </div>
        {canWrite && <Link href="/bi/dashboards/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة لوحة</Button></Link>}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-6"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)}
        </div>
      ) : isError ? (
        <Card><CardContent className="p-8 text-center text-rose-600">حدث خطأ أثناء تحميل لوحات المعلومات <Button variant="outline" size="sm" onClick={() => refetch()} className="ms-2">إعادة المحاولة</Button></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <LayoutDashboard className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-muted-foreground">لا توجد لوحات معلومات</p>
          {canWrite && <Link href="/bi/dashboards/create"><Button size="sm" className="mt-3">إضافة لوحة</Button></Link>}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item: any) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2"><CardTitle className="text-base">{item.title}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">{item.description || "بدون وصف"}</p>
                <p className="text-xs text-muted-foreground mt-2">{formatDateAr(item.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
