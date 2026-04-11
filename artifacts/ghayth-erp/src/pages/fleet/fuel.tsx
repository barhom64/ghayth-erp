import { useState } from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { useAppContext } from "@/contexts/app-context";

export default function FuelPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading } = useApiQuery<any>(["fuel", scopeQueryString], `/fleet/fuel-logs${scopeSuffix}`);
  const items = asList(data);
  const [search, setSearch] = useState("");

  const filtered = items.filter((f: any) => {
    if (!search) return true;
    return f.vehiclePlate?.includes(search) || f.workshop?.includes(search);
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">استهلاك الوقود</h1>
          <p className="text-sm text-muted-foreground mt-0.5">سجلات تعبئة وقود المركبات</p>
        </div>
        <Link href="/fleet/fuel/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تسجيل تعبئة</Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input className="ps-9" placeholder="بحث بالمركبة..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="vehiclePlate" label="المركبة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="liters" label="اللترات" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="cost" label="التكلفة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="odometer" label="العداد" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="date" label="التاريخ" sortState={sortState} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} data={sortedData} colCount={5} emptyMessage="لا توجد سجلات وقود">
              {(sortedData || []).map((f: any) => (
                <TableRow key={f.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{f.vehiclePlate}</TableCell>
                  <TableCell>{f.liters} لتر</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(Number(f.cost))}</TableCell>
                  <TableCell className="text-gray-500">{f.mileage} كم</TableCell>
                  <TableCell className="text-gray-500">{f.date || "-"}</TableCell>
                </TableRow>
              ))}
            </DataTableWrapper>
          </Table>
        </div>
      </div>
    </div>
  );
}
