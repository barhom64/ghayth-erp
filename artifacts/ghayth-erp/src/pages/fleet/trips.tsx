import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Table, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus } from "lucide-react";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

export default function TripsPage() {
  const { data, isLoading } = useApiQuery<any>(["trips"], "/fleet/trips");
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["driverName", "vehiclePlate", "origin", "destination"],
    statusField: "status",
    dateField: "tripDate",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الرحلات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">جدول رحلات الأسطول ومتابعتها</p>
        </div>
        <Link href="/fleet/trips/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />رحلة جديدة</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالسائق أو المركبة أو الوجهة...",
          statuses: [
            { value: "planned", label: "مخطط" },
            { value: "in_progress", label: "جاري" },
            { value: "completed", label: "مكتمل" },
            { value: "cancelled", label: "ملغي" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="driverName" label="السائق" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="vehiclePlate" label="المركبة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="origin" label="من / إلى" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="distance" label="المسافة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} data={sortedData} colCount={5} emptyMessage="لا توجد رحلات">
              {(sortedData || []).map((t: any) => (
                <TableRow key={t.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{t.driverName}</TableCell>
                  <TableCell>{t.vehiclePlate || "-"}</TableCell>
                  <TableCell className="text-gray-500">{t.origin} → {t.destination}</TableCell>
                  <TableCell>{t.distance} كم</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </div>
      </div>
    </div>
  );
}
