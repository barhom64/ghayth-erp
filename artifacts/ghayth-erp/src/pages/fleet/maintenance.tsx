import { useState } from "react";
import { Link } from "wouter";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

export default function FleetMaintenancePage() {
  const { data } = useApiQuery<any>(["fleet-maintenance"], "/fleet/maintenance");
  const items = data?.data || [];
  const [search, setSearch] = useState("");

  const filtered = items.filter((m: any) => {
    if (!search) return true;
    return m.vehiclePlate?.includes(search) || m.type?.includes(search) || m.workshop?.includes(search);
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">صيانة المركبات</h1>
        <Link href="/fleet/maintenance/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة صيانة</Button>
        </Link>
      </div>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input className="ps-9" placeholder="بحث بالمركبة أو النوع أو الورشة..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><SortableTableHead column="vehiclePlate" label="المركبة" sortState={sortState} onSort={handleSort} /><SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} /><SortableTableHead column="cost" label="التكلفة" sortState={sortState} onSort={handleSort} /><SortableTableHead column="workshop" label="الورشة" sortState={sortState} onSort={handleSort} /><SortableTableHead column="date" label="التاريخ" sortState={sortState} onSort={handleSort} /></TableRow></TableHeader>
          <TableBody>
            {(sortedData || []).map((m: any) => (
              <tr key={m.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{m.vehiclePlate}</td>
                <td className="p-3">{m.type || "-"}</td>
                <td className="p-3 font-semibold">{formatCurrency(Number(m.cost))}</td>
                <td className="p-3 text-gray-500">{m.workshop || "-"}</td>
                <td className="p-3 text-gray-500">{m.date || "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد سجلات صيانة</td></tr>}
          </TableBody>
        </Table>
      </div></div>
    </div>
  );
}
