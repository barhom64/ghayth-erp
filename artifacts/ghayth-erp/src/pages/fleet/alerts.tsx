import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { useApiQuery, asList } from "@/lib/api";
import { AlertTriangle, Bell, Plus, Search } from "lucide-react";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function FleetAlerts() {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: alertsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-alerts"], "/fleet/alerts"
  );
  const allAlerts = asList(alertsResp);

  const typeLabels: Record<string, string> = {
    insurance_expiry: "انتهاء تأمين",
    registration_expiry: "انتهاء ترخيص",
    oil_change_due: "تغيير زيت",
    tire_replacement_due: "استبدال إطارات",
    inspection_overdue: "فحص دوري متأخر",
    high_fuel_consumption: "استهلاك وقود مرتفع",
    excessive_idle_time: "خمول مفرط",
    maintenance: "صيانة",
    fuel: "وقود",
    violation: "مخالفة",
  };

  const uniqueTypes = [...new Set(allAlerts?.map((a: any) => a.type))];

  const filtered = applyFilters(allAlerts, filters, { searchFields: ["message", "vehicle", "plateNumber"], statusField: "type" });
  const { sortedData: sortedAlerts, sortState, handleSort } = useSortedData(filtered);
  const paginatedAlerts = sortedAlerts?.slice((page - 1) * pageSize, page * pageSize) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">تنبيهات الأسطول</h1>
        <Link href="/fleet/alerts/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة تنبيه</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي التنبيهات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{allAlerts.length}</div></CardContent></Card>
        <Card className="bg-amber-50"><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">تنبيهات معروضة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{filtered.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">أنواع التنبيهات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{uniqueTypes.length}</div></CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في التنبيهات...",
          statuses: uniqueTypes.map((t: string) => ({ value: t, label: typeLabels[t] || t })),
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> التنبيهات</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="vehiclePlate" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="message" label="الرسالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filtered}
            colCount={3}
            emptyMessage="لا توجد تنبيهات حالياً"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
          >
            {paginatedAlerts?.map((a: any, idx: number) => (
              <TableRow key={a.id || idx} className={a.type?.includes('expiry') || a.type?.includes('overdue') ? 'bg-rose-50' : ''}>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    a.type?.includes('expiry') || a.type?.includes('overdue') ? 'bg-rose-100 text-rose-700' :
                    a.type?.includes('fuel') ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {typeLabels[a.type] || a.type}
                  </span>
                </TableCell>
                <TableCell className="font-mono">{a.vehicle || a.plateNumber || "-"}</TableCell>
                <TableCell className="max-w-[400px]">{a.message || "-"}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
